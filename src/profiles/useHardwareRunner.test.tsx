import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HardwareDeviceController } from "../hardware/useHardwareDevice";
import { useHardwareRunner, type HardwareRunnerOptions } from "./useHardwareRunner";

type Runner = ReturnType<typeof useHardwareRunner>;

function createRunner(overrides: { device?: Partial<HardwareDeviceController>; prepare?: () => boolean; getCode?: () => string } = {}) {
  const device = {
    busy: false,
    running: false,
    connected: true,
    phase: "idle",
    error: null,
    snapshot: { portName: "COM3" },
    run: vi.fn(async () => ({ runId: 7 })),
    runAndWait: vi.fn(async () => ({ accepted: { runId: 7 }, outcome: null })),
    uploadFile: vi.fn(async () => ({ path: "/lib/ssd1306.py", size: 100, sha256: "a".repeat(64), verifiedSize: true, verifiedHash: true })),
    stop: vi.fn(async () => undefined),
    ...overrides.device,
  } as unknown as HardwareDeviceController;
  const options: HardwareRunnerOptions = {
    device,
    getCode: overrides.getCode ?? (() => "print('hi')"),
    prepare: overrides.prepare ?? (() => true),
  };
  let runner!: Runner;
  const Probe = () => { runner = useHardwareRunner(options); return null; };
  renderToStaticMarkup(<Probe/>);
  return { runner, device };
}

describe("useHardwareRunner", () => {
  it("uploads the generated code to main.py after the UI is prepared", async () => {
    const prepare = vi.fn(() => true);
    const { runner, device } = createRunner({ prepare, getCode: () => "led.on()" });
    await expect(runner.run()).resolves.toEqual({ runId: 7 });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(device.run).toHaveBeenCalledWith("led.on()", "/main.py");
  });

  it("uploads required device libraries before running code that imports them", async () => {
    const { runner, device } = createRunner({ getCode: () => "import ssd1306\n" });
    await expect(runner.run()).resolves.toEqual({ runId: 7 });
    expect(device.uploadFile).toHaveBeenCalledTimes(1);
    expect(device.uploadFile).toHaveBeenCalledWith("/lib/ssd1306.py", expect.any(Uint8Array));
    expect(device.run).toHaveBeenCalledWith("import ssd1306\n", "/main.py");
  });

  it("uploads every required library before running code that imports more than one", async () => {
    const { runner, device } = createRunner({ getCode: () => "from bh1750 import BH1750\nimport ssd1306\n" });
    await expect(runner.run()).resolves.toEqual({ runId: 7 });
    expect(device.uploadFile).toHaveBeenCalledTimes(2);
    expect(device.uploadFile).toHaveBeenCalledWith("/lib/bh1750.py", expect.any(Uint8Array));
    expect(device.uploadFile).toHaveBeenCalledWith("/lib/ssd1306.py", expect.any(Uint8Array));
    expect(device.run).toHaveBeenCalledWith("from bh1750 import BH1750\nimport ssd1306\n", "/main.py");
  });

  it("uploads the LCD1602 and BH1750 drivers for H2 display and sensor code", async () => {
    const { runner, device } = createRunner({ getCode: () => "import lcd1602\nfrom bh1750 import BH1750\n" });
    await expect(runner.run()).resolves.toEqual({ runId: 7 });
    expect(device.uploadFile).toHaveBeenCalledTimes(2);
    expect(device.uploadFile).toHaveBeenCalledWith("/lib/lcd1602.py", expect.any(Uint8Array));
    expect(device.uploadFile).toHaveBeenCalledWith("/lib/bh1750.py", expect.any(Uint8Array));
    expect(device.run).toHaveBeenCalledWith("import lcd1602\nfrom bh1750 import BH1750\n", "/main.py");
  });

  it("uploads the H5 sensor, display and driver libraries before running", async () => {
    const { runner, device } = createRunner({ getCode: () => "import bmp280\nimport sht30\nimport mpu6050\nimport tm1637\n" });
    await expect(runner.run()).resolves.toEqual({ runId: 7 });
    expect(device.uploadFile).toHaveBeenCalledTimes(4);
    for (const name of ["bmp280", "sht30", "mpu6050", "tm1637"]) {
      expect(device.uploadFile).toHaveBeenCalledWith(`/lib/${name}.py`, expect.any(Uint8Array));
    }
  });

  it("uploads the DS3231, VL53L0X and RC522 drivers before running P2 code", async () => {
    const { runner, device } = createRunner({ getCode: () => "import ds3231\nfrom vl53l0x import VL53L0X\nimport rc522\n" });
    await expect(runner.run()).resolves.toEqual({ runId: 7 });
    expect(device.uploadFile).toHaveBeenCalledTimes(3);
    for (const name of ["ds3231", "vl53l0x", "rc522"]) {
      expect(device.uploadFile).toHaveBeenCalledWith(`/lib/${name}.py`, expect.any(Uint8Array));
    }
  });

  it("does not run when a required device library upload fails", async () => {
    const { runner, device } = createRunner({
      getCode: () => "import ssd1306\n",
      device: { uploadFile: vi.fn(async () => null) },
    });
    await expect(runner.run()).resolves.toBeNull();
    expect(device.uploadFile).toHaveBeenCalledTimes(1);
    expect(device.run).not.toHaveBeenCalled();
  });

  it("does not touch the device when validation fails", async () => {
    const { runner, device } = createRunner({ prepare: () => false });
    await expect(runner.run()).resolves.toBeNull();
    expect(device.run).not.toHaveBeenCalled();
  });

  it("stops without restarting and reports the busy state", async () => {
    const { runner, device } = createRunner({ device: { busy: true } });
    expect(runner.isBusy()).toBe(true);
    await runner.stop();
    expect(device.stop).toHaveBeenCalledTimes(1);
  });

  it("reports an agent run that is still going as started", async () => {
    const { runner, device } = createRunner({ getCode: () => "while True: pass" });
    const result = await runner.runForAgent();
    expect(device.runAndWait).toHaveBeenCalledWith("while True: pass");
    expect(result).toMatchObject({ started: true, target: "device", runId: 7 });
    expect(result.message).toContain("仍在运行");
  });

  it("reports an agent run that finished with the device error tail", async () => {
    const { runner } = createRunner({
      device: { runAndWait: vi.fn(async () => ({ accepted: { runId: 3 }, outcome: { runId: 3, status: "exception" as const, streamedBytes: 12, tail: "NameError: x" } })) },
    });
    const result = await runner.runForAgent();
    expect(result).toMatchObject({ started: true, runId: 3 });
    expect(result.message).toContain("出错");
    expect(result.message).toContain("NameError: x");
  });

  it("reports an agent run the device never accepted", async () => {
    const { runner } = createRunner({ device: { runAndWait: vi.fn(async () => ({ accepted: null, outcome: null })), error: "串口已断开" } });
    await expect(runner.runForAgent()).resolves.toEqual({ started: false, target: "device", message: "串口已断开" });

    const fallback = createRunner({ device: { runAndWait: vi.fn(async () => ({ accepted: null, outcome: null })) } });
    expect((await fallback.runner.runForAgent()).message).toContain("检查连接");
  });

  it("exposes the device execution state for agent tools", () => {
    const { runner } = createRunner({ device: { running: true, phase: "running", connected: true } });
    expect(runner.executionState()).toEqual({ deviceRunning: true, devicePhase: "running", devicePort: "COM3", deviceConnected: true });

    const disconnected = createRunner({ device: { snapshot: null, connected: false } });
    expect(disconnected.runner.executionState().devicePort).toBeNull();
  });
});
