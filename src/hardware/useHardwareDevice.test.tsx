// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceLogStream } from "./hardwareDeviceLog";
import { useHardwareDevice } from "./useHardwareDevice";

type HandlerSet = {
  onOutput?: (payload: { runId: number; stream: string; text: string }) => void;
  onRunFinished?: (payload: { runId: number; status: string; streamedBytes: number; tail: string }) => void;
};

const mocks = vi.hoisted(() => ({ handlers: [] as HandlerSet[] }));

vi.mock("./hardwareDeviceApi", () => ({
  getHardwareDeviceState: vi.fn(async () => null),
  listHardwareSerialPorts: vi.fn(async () => []),
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

function Probe({ onOutput }: { onOutput: (stream: DeviceLogStream, text: string) => void }) {
  useHardwareDevice({ boardId: "esp32-s3", onOutput });
  return null;
}

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
