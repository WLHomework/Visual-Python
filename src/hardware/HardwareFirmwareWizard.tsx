import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, CheckCircle2, Cpu, Download, RefreshCw, Usb, X } from "lucide-react";
import { downloadFirmware, flashFirmware, getFirmwareCatalog, type FirmwareFlashProgress, type HardwareSerialPort } from "./hardwareApi";
import { hardwareErrorMessage } from "./hardwareDeviceApi";
import type { FirmwareCatalog, HardwareBoardId } from "./firmwareCatalog";
import { getWorkbenchProfile } from "../profiles/workbenchProfile";

export type FirmwareWizardStatus = "loading" | "ready" | "downloading" | "flashing" | "success" | "error";

export type FirmwareWizardSnapshot = {
  catalog: FirmwareCatalog | null;
  ports: HardwareSerialPort[];
  selectedBoard: HardwareBoardId;
  selectedPort: string;
  status: FirmwareWizardStatus;
  progress: number;
  confirmed: boolean;
  message: string | null;
};

type FirmwareFlashWizardViewProps = {
  snapshot: FirmwareWizardSnapshot;
  onPortChange: (portName: string) => void;
  /** 刷新串口列表：与工作台共用同一份列表。 */
  onRefreshPorts: () => void;
  /** 重新读取固件目录（出错后重试用）。 */
  onRetry: () => void;
  onDownload: () => void;
  onFlash: () => void;
  onConfirmChange: (confirmed: boolean) => void;
};

const busyStatuses: FirmwareWizardStatus[] = ["loading", "downloading", "flashing"];

export function FirmwareFlashWizardView({ snapshot, onPortChange, onRefreshPorts, onRetry, onDownload, onFlash, onConfirmChange }: FirmwareFlashWizardViewProps) {
  const image = snapshot.catalog?.images.find((candidate) => candidate.boardId === snapshot.selectedBoard);
  const boardLabel = getWorkbenchProfile(snapshot.selectedBoard).label;
  const busy = busyStatuses.includes(snapshot.status);
  const canFlash = Boolean(image && snapshot.selectedPort && snapshot.confirmed) && !busy;

  return <section className="hardware-firmware-wizard" aria-labelledby="hardware-firmware-title">
    <div className="settings-pane-header">
      <h3 id="hardware-firmware-title">MicroPython 固件</h3>
      <p>为 {boardLabel} 准备运行环境。刷写会覆盖设备 Flash。</p>
    </div>
    {snapshot.status === "loading" && <div className="hardware-loading" role="status">正在读取固件信息…</div>}
    {snapshot.status !== "loading" && <>
      <div className="hardware-form-grid">
        <label><span>USB 串口</span><select value={snapshot.selectedPort} onChange={(event) => onPortChange(event.currentTarget.value)} disabled={busy}><option value="">选择串口</option>{snapshot.ports.map((port) => <option value={port.portName} key={port.portName}>{port.label}</option>)}</select></label>
      </div>
      {image ? <div className="hardware-firmware-meta"><div><Cpu size={16}/><span>MicroPython {image.version}</span></div><code title={image.sha256}>SHA-256 {image.sha256.slice(0, 12)}…</code><small>{image.filename}</small></div> : <div className="hardware-empty" role="status">没有可用的固件镜像。</div>}
      {snapshot.ports.length === 0 && <div className="hardware-inline-notice"><Usb size={16}/>未发现串口设备，请连接开发板后刷新。</div>}
      {snapshot.message && snapshot.status === "error" && <div className="hardware-error" role="alert"><AlertCircle size={16}/><span>{snapshot.message}</span></div>}
      {snapshot.message && snapshot.status === "success" && <div className="hardware-success" role="status"><CheckCircle2 size={16}/><span>{snapshot.message}</span></div>}
      {snapshot.status === "flashing" && <div className="hardware-progress" role="status"><div><span>{snapshot.message || "正在刷写"}</span><strong>{snapshot.progress}%</strong></div><progress max={100} value={snapshot.progress}/></div>}
      <label className="hardware-confirmation"><input type="checkbox" checked={snapshot.confirmed} onChange={(event) => onConfirmChange(event.currentTarget.checked)} disabled={busy}/><span>我确认刷写会覆盖设备 Flash</span></label>
      <div className="hardware-actions"><button type="button" onClick={onRefreshPorts} disabled={busy}><RefreshCw size={15}/>刷新串口</button><button type="button" onClick={onDownload} disabled={!image || busy}><Download size={15}/>{snapshot.status === "downloading" ? "下载中" : "准备固件"}</button><button type="button" onClick={onFlash} disabled={!canFlash}><Cpu size={15}/>{snapshot.status === "flashing" ? "刷写中" : "刷写固件"}</button>{snapshot.status === "error" && <button type="button" className="secondary" onClick={onRetry}><X size={15}/>重试</button>}</div>
    </>}
  </section>;
}

/** 向导自己的状态：板卡由工程的界面决定、串口由工作台传入，这里只留固件目录、进度与提示。 */
type FirmwareWizardState = {
  /** 这份状态属于哪块板卡：工作台的板卡换了就重置。 */
  boardId: HardwareBoardId;
  catalog: FirmwareCatalog | null;
  status: FirmwareWizardStatus;
  progress: number;
  confirmed: boolean;
  message: string | null;
};

export type HardwareFirmwareWizardProps = {
  /** 当前工程的板卡：向导锁定它，不提供切换。 */
  boardId: HardwareBoardId;
  /** 串口列表与当前串口来自工作台（`useHardwareDevice`），向导不再自己枚举串口。 */
  ports: HardwareSerialPort[];
  portName: string;
  /** 设备是否已连接：连接独占串口，刷写前必须先断开。 */
  connected: boolean;
  onSelectPort: (portName: string) => void;
  onRefreshPorts: () => void;
  /** 断开设备连接（刷写前调用）。 */
  onDisconnect: () => Promise<void>;
  /** 询问用户是否可以断开：对话框由 App 提供，返回 false 表示用户取消。 */
  onConfirmDisconnect: () => Promise<boolean>;
};

export function HardwareFirmwareWizard({ boardId, ports, portName, connected, onSelectPort, onRefreshPorts, onDisconnect, onConfirmDisconnect }: HardwareFirmwareWizardProps) {
  const [state, setState] = useState<FirmwareWizardState>(() => ({ boardId, catalog: null, status: "loading", progress: 0, confirmed: false, message: null }));
  const selectedImage = useMemo(() => state.catalog?.images.find((image) => image.boardId === boardId), [state.catalog, boardId]);

  // 打开别的板卡的工程时清掉上一块板卡的确认与提示。
  useEffect(() => {
    setState((current) => current.boardId === boardId ? current : { ...current, boardId, status: "ready", progress: 0, confirmed: false, message: null });
  }, [boardId]);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", message: null, progress: 0 }));
    try {
      const catalog = await getFirmwareCatalog();
      setState((current) => ({ ...current, catalog, status: "ready", message: null }));
    } catch (error) {
      setState((current) => ({ ...current, status: "error", message: hardwareErrorMessage(error) }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    const unlisten = listen<FirmwareFlashProgress>("hardware:flash-progress", ({ payload }) => {
      if (disposed) return;
      setState((current) => ({ ...current, status: "flashing", progress: payload.progress, message: payload.stage }));
    });
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, [refresh]);

  const handleDownload = useCallback(async () => {
    if (!selectedImage) return;
    setState((current) => ({ ...current, status: "downloading", message: "正在准备固件…" }));
    try {
      const result = await downloadFirmware(selectedImage.boardId);
      setState((current) => ({ ...current, status: "ready", message: result.cached ? "已使用本地缓存固件。" : "固件下载完成。" }));
    } catch (error) {
      setState((current) => ({ ...current, status: "error", message: hardwareErrorMessage(error) }));
    }
  }, [selectedImage]);

  const handleFlash = useCallback(async () => {
    if (!selectedImage || !portName || !state.confirmed) return;
    // 设备连接独占串口：esptool 再打开只会得到系统层错误，所以先让用户确认断开。
    if (connected) {
      if (!(await onConfirmDisconnect())) return;
      await onDisconnect();
    }
    setState((current) => ({ ...current, status: "flashing", progress: 0, message: "正在准备刷写…" }));
    try {
      const result = await flashFirmware(selectedImage.boardId, portName, true);
      // 刷写会让设备重新枚举，刷新工作台共用的串口列表，但不自动占用或连接设备。
      onRefreshPorts();
      setState((current) => ({ ...current, status: "success", progress: 100, message: `${result.portName} 已刷入 MicroPython ${result.version}。现在可以关闭此页，点击顶部『连接』。` }));
    } catch (error) {
      setState((current) => ({ ...current, status: "error", message: hardwareErrorMessage(error) }));
    }
  }, [connected, onConfirmDisconnect, onDisconnect, onRefreshPorts, portName, selectedImage, state.confirmed]);

  const snapshot: FirmwareWizardSnapshot = { catalog: state.catalog, ports, selectedBoard: boardId, selectedPort: portName, status: state.status, progress: state.progress, confirmed: state.confirmed, message: state.message };

  return <FirmwareFlashWizardView
    snapshot={snapshot}
    onPortChange={onSelectPort}
    onRefreshPorts={onRefreshPorts}
    onRetry={() => { onRefreshPorts(); void refresh(); }}
    onDownload={() => void handleDownload()}
    onFlash={() => void handleFlash()}
    onConfirmChange={(confirmed) => setState((current) => ({ ...current, confirmed }))}
  />;
}
