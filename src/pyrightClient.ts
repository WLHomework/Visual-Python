import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type JsonRpcId = number | string;
type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type PyrightStatus = "idle" | "starting" | "ready" | "error";

export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };
export type LspTextEdit = { range: LspRange; newText: string };
export type LspLocation = { uri: string; range: LspRange };
export type LspLocationLink = {
  originSelectionRange?: LspRange;
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange: LspRange;
};

export type LspMarkupContent = { kind: "markdown" | "plaintext"; value: string };
export type LspMarkedString = string | { language: string; value: string };
export type LspHover = {
  contents: LspMarkupContent | LspMarkedString | LspMarkedString[];
  range?: LspRange;
};

export type LspPrepareRenameResult = LspRange | { range: LspRange; placeholder: string };
export type LspTextDocumentEdit = {
  textDocument: { uri: string; version?: number | null };
  edits: Array<LspTextEdit & { annotationId?: string }>;
};
export type LspWorkspaceEdit = {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<LspTextDocumentEdit | { kind: string }>;
};

export type LspDiagnostic = {
  range: LspRange;
  severity?: 1 | 2 | 3 | 4;
  code?: number | string | { value: number | string; target: string };
  source?: string;
  message: string;
  tags?: Array<1 | 2>;
  data?: unknown;
};

export type LspPublishDiagnosticsParams = {
  uri: string;
  version?: number;
  diagnostics: LspDiagnostic[];
};

export type LspCompletionItem = {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: "markdown" | "plaintext"; value: string };
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: 1 | 2;
  textEdit?: LspTextEdit | { insert: LspRange; replace: LspRange; newText: string };
  additionalTextEdits?: LspTextEdit[];
  commitCharacters?: string[];
  data?: unknown;
};

export type LspCompletionList = { isIncomplete?: boolean; items: LspCompletionItem[] };

export type LspParameterInformation = {
  label: string | [number, number];
  documentation?: string | { kind: "markdown" | "plaintext"; value: string };
};

export type LspSignatureInformation = {
  label: string;
  documentation?: string | { kind: "markdown" | "plaintext"; value: string };
  parameters?: LspParameterInformation[];
  activeParameter?: number;
};

export type LspSignatureHelp = {
  signatures: LspSignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
};

type PyrightStartInfo = { sessionId: number; rootUri: string; documentUri: string };
type PyrightMessageEvent = { sessionId: number; message: JsonRpcMessage };
type PyrightStatusEvent = { sessionId: number; state: string; message?: string | null };

const requestTimeoutMs = 12_000;

export class PyrightClient {
  private nextId = 1;
  private pending = new Map<JsonRpcId, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: number }>();
  private unlistenMessage: UnlistenFn | null = null;
  private unlistenStatus: UnlistenFn | null = null;
  private sendChain: Promise<unknown> = Promise.resolve();
  private rootUri = "";
  private documentUri = "";
  private sessionId = 0;
  private documentVersion = 1;
  private documentOpen = false;
  private currentSource = "";
  private ready = false;
  private disposed = false;
  private readonly pythonPath: string;
  private readonly projectPath: string | null;
  private readonly onStatus: (status: PyrightStatus, message?: string) => void;
  private readonly onDiagnostics: (diagnostics: LspDiagnostic[]) => void;

  constructor(
    pythonPath: string,
    projectPath: string | null,
    onStatus: (status: PyrightStatus, message?: string) => void,
    onDiagnostics: (diagnostics: LspDiagnostic[]) => void = () => undefined,
  ) {
    this.pythonPath = pythonPath;
    this.projectPath = projectPath;
    this.onStatus = onStatus;
    this.onDiagnostics = onDiagnostics;
  }

  async start(initialSource: string) {
    this.onStatus("starting");
    this.currentSource = initialSource;
    this.unlistenMessage = await listen<PyrightMessageEvent>("pyright-message", ({ payload }) => {
      if (payload.sessionId === this.sessionId) this.handleMessage(payload.message);
    });
    this.unlistenStatus = await listen<PyrightStatusEvent>("pyright-status", ({ payload }) => {
      if (payload.sessionId === this.sessionId && payload.state === "error") this.onStatus("error", payload.message || "Pyright 运行异常");
    });
    try {
      const info = await invoke<PyrightStartInfo>("start_pyright_language_server", { projectPath: this.projectPath });
      this.sessionId = info.sessionId;
      this.rootUri = info.rootUri;
      this.documentUri = info.documentUri;
      await this.request("initialize", {
        processId: null,
        rootUri: this.rootUri,
        workspaceFolders: [{ uri: this.rootUri, name: "Visual Python" }],
        capabilities: {
          workspace: { configuration: true, workspaceFolders: true },
          textDocument: {
            synchronization: { dynamicRegistration: false, didSave: false, willSave: false },
            completion: {
              dynamicRegistration: false,
              contextSupport: true,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ["markdown", "plaintext"],
                resolveSupport: { properties: ["documentation", "detail", "additionalTextEdits"] },
              },
            },
            signatureHelp: {
              dynamicRegistration: false,
              contextSupport: true,
              signatureInformation: {
                documentationFormat: ["markdown", "plaintext"],
                activeParameterSupport: true,
                parameterInformation: { labelOffsetSupport: true },
              },
            },
            hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
            definition: { dynamicRegistration: false, linkSupport: true },
            references: { dynamicRegistration: false },
            rename: { dynamicRegistration: false, prepareSupport: true },
          },
        },
        initializationOptions: {},
      });
      await this.notify("initialized", {});
      await this.notify("workspace/didChangeConfiguration", { settings: this.configuration() });
      await this.openDocument(this.currentSource);
      this.ready = true;
      this.onStatus("ready");
    } catch (error) {
      this.onStatus("error", String(error));
      throw error;
    }
  }

  isReady() {
    return this.ready && !this.disposed;
  }

  getDocumentUri() {
    return this.documentUri;
  }

  async updateDocument(source: string) {
    this.currentSource = source;
    if (!this.ready || !this.documentOpen || this.disposed) return;
    this.documentVersion += 1;
    await this.notify("textDocument/didChange", {
      textDocument: { uri: this.documentUri, version: this.documentVersion },
      contentChanges: [{ text: source }],
    });
  }

  async complete(source: string, line: number, character: number): Promise<LspCompletionList | null> {
    if (!this.isReady()) return null;
    if (source !== this.currentSource) await this.updateDocument(source);
    const result = await this.request("textDocument/completion", {
      textDocument: { uri: this.documentUri },
      position: { line, character },
      context: { triggerKind: 1 },
    });
    if (result === null || result === undefined) return { items: [], isIncomplete: false };
    if (Array.isArray(result)) return { items: result as LspCompletionItem[], isIncomplete: false };
    const list = result as LspCompletionList;
    return { items: Array.isArray(list.items) ? list.items : [], isIncomplete: Boolean(list.isIncomplete) };
  }

  async resolveCompletion(item: LspCompletionItem): Promise<LspCompletionItem> {
    if (!this.isReady() || item.data === undefined) return item;
    return await this.request("completionItem/resolve", item) as LspCompletionItem;
  }

  async signatureHelp(
    source: string,
    line: number,
    character: number,
    context?: { triggerKind: number; triggerCharacter?: string; isRetrigger?: boolean },
  ): Promise<LspSignatureHelp | null> {
    if (!this.isReady()) return null;
    if (source !== this.currentSource) await this.updateDocument(source);
    const result = await this.request("textDocument/signatureHelp", {
      textDocument: { uri: this.documentUri },
      position: { line, character },
      context: context ?? { triggerKind: 1, isRetrigger: false },
    });
    if (!result || typeof result !== "object") return null;
    const help = result as LspSignatureHelp;
    return Array.isArray(help.signatures) ? help : null;
  }

  async hover(source: string, line: number, character: number): Promise<LspHover | null> {
    const result = await this.documentRequest("textDocument/hover", source, line, character);
    return result && typeof result === "object" ? result as LspHover : null;
  }

  async definition(source: string, line: number, character: number): Promise<LspLocation | LspLocationLink | Array<LspLocation | LspLocationLink> | null> {
    const result = await this.documentRequest("textDocument/definition", source, line, character);
    if (!result) return null;
    return result as LspLocation | LspLocationLink | Array<LspLocation | LspLocationLink>;
  }

  async references(source: string, line: number, character: number, includeDeclaration: boolean): Promise<LspLocation[] | null> {
    const result = await this.documentRequest("textDocument/references", source, line, character, {
      context: { includeDeclaration },
    });
    return Array.isArray(result) ? result as LspLocation[] : null;
  }

  async prepareRename(source: string, line: number, character: number): Promise<LspPrepareRenameResult | null> {
    const result = await this.documentRequest("textDocument/prepareRename", source, line, character);
    return result && typeof result === "object" ? result as LspPrepareRenameResult : null;
  }

  async rename(source: string, line: number, character: number, newName: string): Promise<LspWorkspaceEdit | null> {
    const result = await this.documentRequest("textDocument/rename", source, line, character, { newName });
    return result && typeof result === "object" ? result as LspWorkspaceEdit : null;
  }

  async dispose() {
    if (this.disposed) return;
    try {
      if (this.ready) {
        await this.request("shutdown", null, 1_500);
        await this.notify("exit", null);
      }
    } catch {
      // The backend stop command below is the final cleanup path.
    }
    this.disposed = true;
    this.ready = false;
    this.rejectPending(new Error("Pyright 已停止"));
    this.unlistenMessage?.();
    this.unlistenStatus?.();
    this.unlistenMessage = null;
    this.unlistenStatus = null;
    if (this.sessionId) await invoke("stop_pyright_language_server", { sessionId: this.sessionId }).catch(() => undefined);
    this.onStatus("idle");
  }

  private configuration() {
    return {
      python: {
        pythonPath: this.pythonPath,
        analysis: {
          autoImportCompletions: true,
          autoSearchPaths: true,
          diagnosticMode: "openFilesOnly",
          typeCheckingMode: "basic",
          useLibraryCodeForTypes: true,
        },
      },
      pyright: {
        autoImportCompletions: true,
        indexing: true,
        openFilesOnly: true,
        useLibraryCodeForTypes: true,
      },
    };
  }

  private async openDocument(source: string) {
    this.currentSource = source;
    this.documentVersion = 1;
    await this.notify("textDocument/didOpen", {
      textDocument: { uri: this.documentUri, languageId: "python", version: this.documentVersion, text: source },
    });
    this.documentOpen = true;
  }

  private async documentRequest(method: string, source: string, line: number, character: number, params?: Record<string, unknown>) {
    if (!this.isReady()) return null;
    if (source !== this.currentSource) await this.updateDocument(source);
    return await this.request(method, {
      textDocument: { uri: this.documentUri },
      position: { line, character },
      ...params,
    });
  }

  private send(message: JsonRpcMessage) {
    this.sendChain = this.sendChain.then(() => invoke("send_pyright_message", { sessionId: this.sessionId, message }));
    return this.sendChain;
  }

  private notify(method: string, params: unknown) {
    return this.send({ jsonrpc: "2.0", method, params });
  }

  private request(method: string, params: unknown, timeoutMs = requestTimeoutMs): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("Pyright 已停止"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pyright 请求超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      void this.send({ jsonrpc: "2.0", id, method, params }).catch((error) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        globalThis.clearTimeout(pending.timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private handleMessage(message: JsonRpcMessage) {
    if (message.method && message.id !== undefined) {
      void this.handleServerRequest(message);
      return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as LspPublishDiagnosticsParams | undefined;
      if (
        params?.uri === this.documentUri
        && Array.isArray(params.diagnostics)
        && (params.version === undefined || params.version === this.documentVersion)
      ) this.onDiagnostics(params.diagnostics);
      return;
    }
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    globalThis.clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  private async handleServerRequest(message: JsonRpcMessage) {
    let result: unknown = null;
    if (message.method === "workspace/configuration") {
      const items = (message.params as { items?: Array<{ section?: string }> } | undefined)?.items ?? [];
      const configuration = this.configuration();
      result = items.map((item) => {
        if (item.section === "python") return configuration.python;
        if (item.section === "python.analysis") return configuration.python.analysis;
        if (item.section === "pyright") return configuration.pyright;
        return null;
      });
    } else if (message.method === "workspace/workspaceFolders") {
      result = [{ uri: this.rootUri, name: "Visual Python" }];
    } else if (message.method === "workspace/applyEdit") {
      result = { applied: false, failureReason: "暂不支持由语言服务器直接修改多个文件" };
    }
    await this.send({ jsonrpc: "2.0", id: message.id, result });
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      globalThis.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
