import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { CornerUpLeft, FileCode2, Folder, RefreshCw, Trash2, X } from "lucide-react";
import { decodeDeviceText, type HardwareDeviceFile, type HardwareDeviceSnapshot } from "./hardwareDeviceApi";
import { describeHardwareDevice, devicePathJoin, formatDeviceBytes } from "./hardwareDeviceLog";
import type { HardwareDeviceController } from "./useHardwareDevice";

const CodeEditor = lazy(() => import("@monaco-editor/react"));

/**
 * 底部面板「设备」页签：设备文件列表与只读预览。
 *
 * 设备输出已经转发到「输出」页签，所以这里只放文件，避免第二套日志视图。
 */
export type HardwareDeviceFilesViewProps = {
  device: HardwareDeviceSnapshot | null;
  files: HardwareDeviceFile[];
  filesPath: string;
  /** 设备正在执行上传/运行等操作时，文件操作先禁用。 */
  busy: boolean;
  preview: { path: string; content: string } | null;
  /** 与右侧代码编辑器一致的 Monaco 主题；默认暗色。 */
  editorTheme?: "vs" | "vs-dark" | "hc-black";
  onRefreshFiles: () => void;
  onOpenDirectory: (path: string) => void;
  onParentDirectory: () => void;
  onReadFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onClosePreview: () => void;
};

export function HardwareDeviceFilesView(props: HardwareDeviceFilesViewProps) {
  const { device, files, filesPath, busy, preview, editorTheme = "vs-dark" } = props;
  const connected = Boolean(device);
  const pathOf = (name: string) => devicePathJoin(filesPath, name);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [listHeight, setListHeight] = useState<number | null>(null);
  const codeBackground = editorTheme === "vs" ? "#fffffe" : editorTheme === "hc-black" ? "#000000" : "#1e1e1e";

  // 设备页打开时就预热 Monaco：第一次点“读取”不再先闪一个纯文本兜底。
  useEffect(() => {
    void import("@monaco-editor/react");
  }, []);

  const startPreviewResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = listRef.current?.clientHeight ?? 120;
    const availableMaximum = Math.max(60, (rootRef.current?.clientHeight ?? 420) - 180);
    document.body.classList.add("resizing-hardware-preview");
    const move = (moveEvent: PointerEvent) => {
      setListHeight(Math.min(availableMaximum, Math.max(60, startHeight + moveEvent.clientY - startY)));
    };
    const stop = () => {
      document.body.classList.remove("resizing-hardware-preview");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return <div className={`hardware-files ${preview ? "has-preview" : ""}`} ref={rootRef}>
    <header className="hardware-files-bar">
      <span className={`hardware-files-device ${connected ? "connected" : ""}`}>{connected ? describeHardwareDevice(device).title : "未连接开发板"}</span>
      <span className="hardware-files-path">{connected ? filesPath : ""}</span>
      <button type="button" title="上级目录" aria-label="上级目录" disabled={!connected || busy || filesPath === "/"} onClick={props.onParentDirectory}><CornerUpLeft size={14}/></button>
      <button type="button" title="刷新文件" aria-label="刷新文件" disabled={!connected || busy} onClick={props.onRefreshFiles}><RefreshCw size={14}/></button>
    </header>
    {!connected
      ? <p className="hardware-files-empty">在顶部选择串口并点「连接」后，这里会列出设备上的文件。</p>
      : files.length === 0
        ? <p className="hardware-files-empty">这个目录里没有文件。</p>
        : <ul ref={listRef} className="hardware-files-list" style={listHeight === null ? undefined : { height: listHeight, flex: "0 0 auto", maxHeight: "none" }}>
          {files.map((file) => <li key={file.name}>
            <span className="hardware-files-name">
              {file.isDirectory ? <Folder size={13}/> : <FileCode2 size={13}/>}
              {file.isDirectory
                ? <button type="button" className="link" disabled={busy} onClick={() => props.onOpenDirectory(pathOf(file.name))}>{file.name}</button>
                : <span title={file.name}>{file.name}</span>}
            </span>
            <span className="hardware-files-size">{file.isDirectory ? "" : formatDeviceBytes(file.size)}</span>
            {!file.isDirectory && <>
              <button type="button" disabled={busy} onClick={() => props.onReadFile(pathOf(file.name))}>读取</button>
              <button type="button" title={`删除 ${file.name}`} aria-label={`删除 ${file.name}`} disabled={busy} onClick={() => props.onDeleteFile(pathOf(file.name))}><Trash2 size={13}/></button>
            </>}
          </li>)}
        </ul>}
    {preview && <section className="hardware-files-preview">
      <div className="hardware-files-preview-resizer" role="separator" aria-label="调整文件列表高度" aria-orientation="horizontal" title="拖动调整文件列表与代码区域的比例" onPointerDown={startPreviewResize}/>
      <header><span>{preview.path}</span><button type="button" title="关闭" aria-label="关闭文件内容" onClick={props.onClosePreview}><X size={13}/></button></header>
      <div className="hardware-files-code" style={{ background: codeBackground }}>
        <Suspense fallback={<div className="hardware-files-code-loading" style={{ background: codeBackground }}/>}>
          <CodeEditor
            path={preview.path}
            value={preview.content}
            language="python"
            theme={editorTheme}
            height="100%"
            loading={<div className="hardware-files-code-loading" style={{ background: codeBackground }}/>}
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: false },
              fontFamily: '"Cascadia Code", Consolas, monospace',
              fontSize: 12,
              lineHeight: 19,
              scrollBeyondLastLine: false,
              wordWrap: "off",
              automaticLayout: true,
              renderLineHighlight: "none",
              contextmenu: false,
              folding: false,
              glyphMargin: false,
              lineNumbers: "on",
              padding: { top: 8 },
              scrollbar: { vertical: "auto", horizontal: "auto" },
            }}
          />
        </Suspense>
      </div>
    </section>}
  </div>;
}

export type HardwareDeviceFilesProps = {
  /** 控制器由 `App` 持有：工具栏、底部页签和 AI 工具共用同一份设备状态。 */
  controller: HardwareDeviceController;
  /** 删除设备文件前的确认；返回 false 表示用户取消。 */
  confirmDelete?: (path: string) => Promise<boolean>;
  editorTheme?: "vs" | "vs-dark" | "hc-black";
};

export function HardwareDeviceFiles({ controller, confirmDelete, editorTheme }: HardwareDeviceFilesProps) {
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  return <HardwareDeviceFilesView
    device={controller.snapshot}
    files={controller.files}
    filesPath={controller.filesPath}
    busy={controller.phase !== "idle"}
    preview={preview}
    editorTheme={editorTheme}
    onRefreshFiles={() => void controller.refreshFiles()}
    onOpenDirectory={(path) => void controller.openDirectory(path)}
    onParentDirectory={() => void controller.goToParentDirectory()}
    onReadFile={(path) => void (async () => {
      const result = await controller.readFile(path);
      if (result) setPreview({ path, content: decodeDeviceText(result.base64) });
    })()}
    onDeleteFile={(path) => void (async () => {
      if (confirmDelete && !(await confirmDelete(path))) return;
      if (await controller.deleteFile(path)) setPreview((current) => (current?.path === path ? null : current));
    })()}
    onClosePreview={() => setPreview(null)}
  />;
}
