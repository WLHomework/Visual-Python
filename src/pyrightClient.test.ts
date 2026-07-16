import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  sent: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(event, handler);
    return () => mocks.listeners.delete(event);
  }),
}));

import { PyrightClient } from "./pyrightClient";

describe("Pyright client", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listeners.clear();
    mocks.sent.length = 0;
    mocks.invoke.mockImplementation(async (command: string, args?: { message?: Record<string, unknown> }) => {
      if (command === "start_pyright_language_server") return { sessionId: 3, rootUri: "file:///workspace/", documentUri: "file:///workspace/main.py" };
      if (command === "send_pyright_message" && args?.message) {
        const message = args.message;
        mocks.sent.push(message);
        if (message.id !== undefined) {
          const result = message.method === "textDocument/completion"
            ? { isIncomplete: false, items: [{ label: "Circle", kind: 7 }] }
            : message.method === "textDocument/signatureHelp"
              ? { signatures: [{ label: "Circle(radius: float = 1.0)", parameters: [{ label: "radius: float = 1.0" }] }], activeSignature: 0, activeParameter: 0 }
              : message.method === "textDocument/hover"
                ? { contents: { kind: "markdown", value: "```python\nclass Circle\n```" }, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } }
                : message.method === "textDocument/definition"
                  ? [{ uri: "file:///workspace/main.py", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } } }]
                  : message.method === "textDocument/references"
                    ? [{ uri: "file:///workspace/main.py", range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } } }]
                    : message.method === "textDocument/prepareRename"
                      ? { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } }, placeholder: "circle" }
                      : message.method === "textDocument/rename"
                        ? { changes: { "file:///workspace/main.py": [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } }, newText: "shape" }] } }
                        : null;
          queueMicrotask(() => mocks.listeners.get("pyright-message")?.({ payload: { sessionId: 3, message: { jsonrpc: "2.0", id: message.id, result } } }));
        }
      }
      return null;
    });
  });

  it("initializes, synchronizes source, and requests semantic completions", async () => {
    const statuses: string[] = [];
    const diagnostics: string[] = [];
    const client = new PyrightClient(
      "C:/Python/python.exe",
      null,
      (status) => statuses.push(status),
      (items) => diagnostics.push(...items.map((item) => item.message)),
    );
    await client.start("ci");
    const completion = await client.complete("circle.", 0, 7);
    const signature = await client.signatureHelp("Circle(", 0, 7);
    const hover = await client.hover("Circle", 0, 2);
    const definition = await client.definition("Circle", 0, 2);
    const references = await client.references("circle", 2, 2, true);
    const prepareRename = await client.prepareRename("circle", 2, 2);
    const rename = await client.rename("circle", 2, 2, "shape");
    mocks.listeners.get("pyright-message")?.({
      payload: {
        sessionId: 3,
        message: {
          jsonrpc: "2.0",
          method: "textDocument/publishDiagnostics",
          params: {
            uri: "file:///workspace/main.py",
            diagnostics: [{
              range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } },
              severity: 1,
              code: "reportUndefinedVariable",
              message: '"circle" is not defined',
            }],
          },
        },
      },
    });

    expect(statuses).toContain("ready");
    expect(completion?.items[0].label).toBe("Circle");
    expect(signature?.signatures[0].label).toContain("radius");
    expect(hover?.contents).toMatchObject({ kind: "markdown" });
    expect(Array.isArray(definition) ? definition[0] : definition).toMatchObject({ uri: "file:///workspace/main.py" });
    expect(references?.[0].range.start.line).toBe(2);
    expect(prepareRename).toMatchObject({ placeholder: "circle" });
    expect(rename?.changes?.["file:///workspace/main.py"]?.[0].newText).toBe("shape");
    expect(diagnostics).toEqual(['"circle" is not defined']);
    expect(mocks.sent.map((message) => message.method)).toEqual(expect.arrayContaining([
      "initialize",
      "initialized",
      "workspace/didChangeConfiguration",
      "textDocument/didOpen",
      "textDocument/didChange",
      "textDocument/completion",
      "textDocument/signatureHelp",
      "textDocument/hover",
      "textDocument/definition",
      "textDocument/references",
      "textDocument/prepareRename",
      "textDocument/rename",
    ]));
    expect(mocks.sent.find((message) => message.method === "textDocument/references")?.params).toMatchObject({ context: { includeDeclaration: true } });
    expect(mocks.sent.find((message) => message.method === "textDocument/rename")?.params).toMatchObject({ newName: "shape" });

    await client.dispose();
    expect(mocks.invoke).toHaveBeenCalledWith("stop_pyright_language_server", { sessionId: 3 });
  });
});
