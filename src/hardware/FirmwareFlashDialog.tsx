import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, CheckCircle2, Cpu, X } from "lucide-react";
import { downloadFirmware, flashFirmware, getFirmwareCatalog, type FirmwareFlashProgress } from "./hardwareApi";
import { hardwareErrorMessage } from "./hardwareDeviceApi";
import type { FirmwareCatalog, HardwareBoardId } from "./firmwareCatalog";
import { getWorkbenchProfile } from "../profiles/workbenchProfile";

/**
 * 「设备 → 固件刷写」的极简流程：
 * 确认 → 自动下载当前板卡最新的 MicroPython → 直接刷写 → 显示进度。
 *
 * 端口选择、固件卡片、手动“准备固件”等低频步骤都收掉了；板卡来自当前工程，串口来自工作台。
 */
type FirmwareFlashPhase = "loading" | "confirm" | "downloading" | "flashing" | "success" | "error";

export type FirmwareFlashDialogProps = {
  boardId: HardwareBoardId;
  portName: string;
  connected: boolean;
  /** 刷写前断开占用串口的设备连接。 */
  onDisconnect: () => Promise<void>;
  /** 刷写完成后刷新工作台共用的串口列表。 */
  onRefreshPorts: () => void;
  onClose: () => void;
};

export function FirmwareFlashDialog({ boardId, portName, connected, onDisconnect, onRefreshPorts, onClose }: FirmwareFlashDialogProps) {
  const [phase, setPhase] = useState<FirmwareFlashPhase>("loading");
  const [catalog, setCatalog] = useState<FirmwareCatalog | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const image = catalog?.images.find((candidate) => candidate.boardId === boardId);
  const boardLabel = getWorkbenchProfile(boardId).label;
  const busy = phase === "downloading" || phase === "flashing";

  useEffect(() => {
    let disposed = false;
    void getFirmwareCatalog()
      .then((next) => {
        if (disposed) return;
        setCatalog(next);
        setPhase((current) => (current === "loading" ? "confirm" : current));
      })
      .catch((error) => {
        if (disposed) return;
        setPhase("error");
        setMessage(hardwareErrorMessage(error));
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisten = listen<FirmwareFlashProgress>("hardware:flash-progress", ({ payload }) => {
      if (disposed) return;
      setPhase("flashing");
      setProgress(payload.progress);
      setMessage(payload.stage || "正在刷写…");
    });
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, []);

  const start = async () => {
    if (!image || !portName || busy) return;
    setProgress(0);
    try {
      if (connected) await onDisconnect();
      setPhase("downloading");
      setMessage("正在准备最新固件…");
      await downloadFirmware(boardId);
      setPhase("flashing");
      setMessage("正在刷写固件…");
      const result = await flashFirmware(boardId, portName, true);
      onRefreshPorts();
      setProgress(100);
      setPhase("success");
      setMessage(`已刷入 MicroPython ${result.version}。关闭后点顶部「连接」即可使用。`);
    } catch (error) {
      setPhase("error");
      setMessage(hardwareErrorMessage(error));
    }
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="settings-dialog firmware-flash-dialog" role="dialog" aria-modal="true" aria-labelledby="firmware-flash-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
      <header><div><span className="settings-icon"><Cpu size={18}/></span><div><h2 id="firmware-flash-title">刷写开发板固件</h2><p>为 {boardLabel} 自动下载并刷写最新 MicroPython。</p></div></div><button type="button" className="dialog-close" aria-label="关闭固件刷写" title={busy ? "刷写进行中，无法关闭" : "关闭"} onClick={close} disabled={busy}><X size={16}/></button></header>
      <div className="firmware-flash-body">
        {phase === "loading" && <div className="hardware-loading" role="status">正在读取固件信息…</div>}

        {(phase === "confirm" || phase === "downloading" || phase === "flashing") && <>
          <p className="firmware-flash-summary">将把 <strong>MicroPython {image?.version ?? ""}</strong> 刷写到 <code>{portName || "未选择串口"}</code>。刷写会覆盖设备 Flash，设备上的现有程序会丢失。</p>
          {image && <p className="firmware-flash-file"><span>固件文件</span><code title={image.sha256}>{image.filename}</code><small>SHA-256 {image.sha256.slice(0, 12)}…</small></p>}
          {connected && <p className="hardware-inline-notice">当前设备连接占用着串口，开始刷写前会自动断开。</p>}
          {!portName && <p className="hardware-error" role="alert"><AlertCircle size={16}/><span>请先在顶部选择串口。</span></p>}
          {phase === "downloading" && <div className="hardware-progress" role="status"><div><span>{message}</span></div><progress max={100}/></div>}
          {phase === "flashing" && <div className="hardware-progress" role="status"><div><span>{message || "正在刷写"}</span><strong>{progress}%</strong></div><progress max={100} value={progress}/></div>}
        </>}

        {phase === "success" && <div className="hardware-success" role="status"><CheckCircle2 size={18}/><span>{message}</span></div>}
        {phase === "error" && <div className="hardware-error" role="alert"><AlertCircle size={18}/><span>{message}</span></div>}
      </div>
      <footer className="firmware-flash-actions">
        {phase === "confirm" && <><button type="button" onClick={close}>取消</button><button type="button" className="primary" disabled={!image || !portName} onClick={() => void start()}>开始刷写</button></>}
        {phase === "error" && <><button type="button" onClick={close}>关闭</button><button type="button" className="primary" disabled={!image || !portName} onClick={() => void start()}>重试</button></>}
        {phase === "success" && <button type="button" className="primary" onClick={close} autoFocus>完成</button>}
        {(phase === "downloading" || phase === "flashing") && <button type="button" disabled>正在刷写，请勿断开…</button>}
      </footer>
    </section>
  </div>;
}
