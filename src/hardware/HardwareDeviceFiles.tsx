import { useState } from "react";
import { CornerUpLeft, FileCode2, Folder, RefreshCw, Trash2, X } from "lucide-react";
import { decodeDeviceText, type HardwareDeviceFile, type HardwareDeviceSnapshot } from "./hardwareDeviceApi";
import { describeHardwareDevice, devicePathJoin, formatDeviceBytes } from "./hardwareDeviceLog";
import type { HardwareDeviceController } from "./useHardwareDevice";

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
  onRefreshFiles: () => void;
  onOpenDirectory: (path: string) => void;
  onParentDirectory: () => void;
  onReadFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onClosePreview: () => void;
};

export function HardwareDeviceFilesView(props: HardwareDeviceFilesViewProps) {
  const { device, files, filesPath, busy, preview } = props;
  const connected = Boolean(device);
  const pathOf = (name: string) => devicePathJoin(filesPath, name);

  return <div className="hardware-files">
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
        : <ul className="hardware-files-list">
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
      <header><span>{preview.path}</span><button type="button" title="关闭" aria-label="关闭文件内容" onClick={props.onClosePreview}><X size={13}/></button></header>
      <pre>{preview.content}</pre>
    </section>}
  </div>;
}

export type HardwareDeviceFilesProps = {
  /** 控制器由 `App` 持有：工具栏、底部页签和 AI 工具共用同一份设备状态。 */
  controller: HardwareDeviceController;
  /** 删除设备文件前的确认；返回 false 表示用户取消。 */
  confirmDelete?: (path: string) => Promise<boolean>;
};

export function HardwareDeviceFiles({ controller, confirmDelete }: HardwareDeviceFilesProps) {
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  return <HardwareDeviceFilesView
    device={controller.snapshot}
    files={controller.files}
    filesPath={controller.filesPath}
    busy={controller.phase !== "idle"}
    preview={preview}
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
