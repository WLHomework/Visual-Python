// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceLogStream } from "./hardwareDeviceLog";
import { useHardwareDevice } from "./useHardwareDevice";

// React 19 的 act 需要显式标记测试环境；jsdom + fake timers 下不会被自动设置。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HandlerSet = {
  onOutput?: (payload: { runId: number; stream: string; text: string }) => void;
  onRunFinished?: (payload: { runId: number; status: string; streamedBytes: number; tail: string }) => void;
};

const mocks = vi.hoisted(() => ({ handlers: [] as HandlerSet[] }));

vi.mock("./hardwareApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hardwareApi")>();
  return {
    ...actual,
    listHardwareSerialPorts: vi.fn(async () => []),
    sendHardwareSerial: vi.fn(async () => null),
  };
});

vi.mock("./hardwareDeviceApi", () => ({
  getHardwareDeviceState: vi.fn(async () => null),
  hardwareErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  isHardwareDisconnectedError: () => false,
  listenHardwareDeviceEvents: vi.fn(async (handlers: HandlerSet) => {
    mocks.handlers.push(handlers);
    return [
      () => {
        const index = mocks.handlers.indexOf(handlers);
        if (index >= 0) mocks.handlers.splice(index, 1);
      },
    ];
  }),
  unlistenHardwareDeviceEvents: (listeners: Array<() => void>) => {
    for (const unlisten of listeners) unlisten();
  },
}));

function Probe({ onOutput }: { onOutput: (stream: DeviceLogStream | "input", text: string) => void }) {
  useHardwareDevice({ boardId: "esp32-s3", onOutput });
  return null;
}

describe("useHardwareDevice 的串口自动刷新", () => {
  it("未连接时轮询串口，热插拔后更新列表", async () => {
    vi.useFakeTimers();
    try {
      const api = await import("./hardwareApi");
      const list = vi.mocked(api.listHardwareSerialPorts);
      list.mockReset();
      list.mockResolvedValue([
        { portName: "COM1", label: "通信端口 (COM1)", portType: "serial" },
        { portName: "COM3", label: "USB-SERIAL CH340 (COM3)", portType: "usb" },
      ]);

      let controller: ReturnType<typeof useHardwareDevice> | undefined;
      function Probe() {
        controller = useHardwareDevice({ boardId: "esp32-s3" });
        return null;
      }
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => {
        root.render(<Probe/>);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(controller?.ports.map((port) => port.portName)).toEqual(["COM1", "COM3"]);
      // 默认选中 USB 串口，而不是主板自带的 COM1。
      expect(controller?.portName).toBe("COM3");

      list.mockResolvedValue([{ portName: "COM4", label: "USB-SERIAL CH340 (COM4)", portType: "usb" }]);
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(controller?.ports.map((port) => port.portName)).toEqual(["COM4"]);
      expect(controller?.portName).toBe("COM4");

      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      mocks.handlers.length = 0;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useHardwareDevice 的串口发送", () => {
  it("直接回显用户发送的内容，空闲命令的输出也进入控制台", async () => {
    const api = await import("./hardwareApi");
    const send = vi.mocked(api.sendHardwareSerial);
    send.mockReset();
    send.mockResolvedValue("42");

    const output: string[] = [];
    let controller: ReturnType<typeof useHardwareDevice> | undefined;
    function SendProbe() {
      controller = useHardwareDevice({ boardId: "esp32-s3", onOutput: (stream, text) => output.push(`${stream}:${text.trim()}`) });
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<SendProbe/>);
      await Promise.resolve();
    });

    await act(async () => {
      await controller?.sendSerial("print(1)");
    });
    expect(output).toEqual(["input:print(1)", "stdout:42"]);

    // 运行中发送只有回显，没有命令返回值；设备程序自己读 stdin。
    send.mockResolvedValue(null);
    output.length = 0;
    await act(async () => {
      await controller?.sendSerial("hello");
    });
    expect(output).toEqual(["input:hello"]);

    await act(async () => {
      root.unmount();
    });
  });
});

describe("useHardwareDevice 的事件订阅", () => {
  afterEach(() => {
    mocks.handlers.length = 0;
  });

  it("严格模式下只保留一份订阅，每个设备事件只处理一次", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const output: string[] = [];

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe onOutput={(stream, text) => output.push(`${stream}:${text.trim()}`)} />
        </StrictMode>,
      );
    });
    // 严格模式会「挂载 → 清理 → 再挂载」，订阅是异步建立的：等微任务跑完再断言。
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.handlers).toHaveLength(1);

    await act(async () => {
      for (const handlers of mocks.handlers) {
        handlers.onRunFinished?.({ runId: 3, status: "interrupted", streamedBytes: 0, tail: "" });
      }
    });

    expect(output).toEqual(["system:已停止程序：设备已中断运行，但没有重启。"]);

    await act(async () => {
      root.unmount();
    });
    expect(mocks.handlers).toHaveLength(0);
  });
});
