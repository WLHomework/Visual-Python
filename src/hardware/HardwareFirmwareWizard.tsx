import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, CheckCircle2, Cpu, Download, RefreshCw, Usb, X } from "lucide-react";
import { downloadFirmware, flashFirmware, getFirmwareCatalog, listHardwareSerialPorts, type FirmwareFlashProgress, type HardwareSerialPort } from "./hardwareApi";
import type { FirmwareCatalog, HardwareBoardId } from "./firmwareCatalog";

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
  onBoardChange: (boardId: HardwareBoardId) => void;
  onPortChange: (portName: string) => void;
  onRefresh: () => void;
  onDownload: () => void;
  onFlash: () => void;
  onConfirmChange: (confirmed: boolean) => void;
};

const boardLabels: Record<HardwareBoardId, string> = {
  "esp32-wroom": "ESP32 WROOM / 常见 DevKit",
  "esp8266-esp12e": "ESP8266 ESP-12E / NodeMCU",
};

const busyStatuses: FirmwareWizardStatus[] = ["loading", "downloading", "flashing"];

export function FirmwareFlashWizardView({ snapshot, onBoardChange, onPortChange, onRefresh, onDownload, onFlash, onConfirmChange }: FirmwareFlashWizardViewProps) {
  const image = snapshot.catalog?.images.find((candidate) => candidate.boardId === snapshot.selectedBoard);
  const busy = busyStatuses.includes(snapshot.status);
  const canFlash = Boolean(image && snapshot.selectedPort && snapshot.confirmed) && !busy;

  return <section className="hardware-firmware-wizard" aria-labelledby="hardware-firmware-title">
    <div className="settings-pane-header">
      <h3 id="hardware-firmware-title">MicroPython 固件</h3>
      <p>为经典 ESP32 或 ESP8266 准备 MicroPython 运行环境。</p>
    </div>
    {snapshot.status === "loading" && <div className="hardware-loading" role="status">正在读取设备和固件信息…</div>}
    {snapshot.status !== "loading" && <>
      <div className="hardware-form-grid">
        <label><span>板卡系列</span><select value={snapshot.selectedBoard} onChange={(event) => onBoardChange(event.currentTarget.value as HardwareBoardId)} disabled={busy}>{(snapshot.catalog?.images ?? []).map((candidate) => <option value={candidate.boardId} key={candidate.boardId}>{boardLabels[candidate.boardId]}</option>)}</select></label>
        <label><span>USB 串口</span><select value={snapshot.selectedPort} onChange={(event) => onPortChange(event.currentTarget.value)} disabled={busy}><option value="">选择串口</option>{snapshot.ports.map((port) => <option value={port.portName} key={port.portName}>{port.label}</option>)}</select></label>
      </div>
      {image ? <div className="hardware-firmware-meta"><div><Cpu size={16}/><span>MicroPython {image.version}</span></div><code title={image.sha256}>SHA-256 {image.sha256.slice(0, 12)}…</code><small>{image.filename}</small></div> : <div className="hardware-empty" role="status">没有可用的固件镜像。</div>}
      {snapshot.ports.length === 0 && <div className="hardware-inline-notice"><Usb size={16}/>未发现串口设备，请连接开发板后刷新。</div>}
      {snapshot.message && snapshot.status === "error" && <div className="hardware-error" role="alert"><AlertCircle size={16}/><span>{snapshot.message}</span></div>}
      {snapshot.message && snapshot.status === "success" && <div className="hardware-success" role="status"><CheckCircle2 size={16}/><span>{snapshot.message}</span></div>}
      {snapshot.status === "flashing" && <div className="hardware-progress" role="status"><div><span>{snapshot.message || "正在刷写"}</span><strong>{snapshot.progress}%</strong></div><progress max={100} value={snapshot.progress}/></div>}
      <label className="hardware-confirmation"><input type="checkbox" checked={snapshot.confirmed} onChange={(event) => onConfirmChange(event.currentTarget.checked)} disabled={busy}/><span>我确认刷写会覆盖设备 Flash</span></label>
      <div className="hardware-actions"><button type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={15}/>刷新串口</button><button type="button" onClick={onDownload} disabled={!image || busy}><Download size={15}/>{snapshot.status === "downloading" ? "下载中" : "准备固件"}</button><button type="button" onClick={onFlash} disabled={!canFlash}><Cpu size={15}/>{snapshot.status === "flashing" ? "刷写中" : "刷写固件"}</button>{snapshot.status === "error" && <button type="button" className="secondary" onClick={onRefresh}><X size={15}/>重试</button>}</div>
    </>}
  </section>;
}

const initialSnapshot: FirmwareWizardSnapshot = {
  catalog: null,
  ports: [],
  selectedBoard: "esp32-wroom",
  selectedPort: "",
  status: "loading",
  progress: 0,
  confirmed: false,
  message: null,
};

export function HardwareFirmwareWizard() {
  const [snapshot, setSnapshot] = useState<FirmwareWizardSnapshot>(initialSnapshot);
  const selectedImage = useMemo(() => snapshot.catalog?.images.find((image) => image.boardId === snapshot.selectedBoard), [snapshot.catalog, snapshot.selectedBoard]);

  const refresh = useCallback(async () => {
    setSnapshot((current) => ({ ...current, status: "loading", message: null, progress: 0 }));
    try {
      const [catalog, ports] = await Promise.all([getFirmwareCatalog(), listHardwareSerialPorts()]);
      setSnapshot((current) => {
        const selectedPort = ports.some((port) => port.portName === current.selectedPort) ? current.selectedPort : ports[0]?.portName ?? "";
        const selectedBoard = catalog.images.some((image) => image.boardId === current.selectedBoard) ? current.selectedBoard : catalog.images[0]?.boardId ?? "esp32-wroom";
        return { ...current, catalog, ports, selectedPort, selectedBoard, status: "ready", message: null };
      });
    } catch (error) {
      setSnapshot((current) => ({ ...current, status: "error", message: String(error) }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    const unlisten = listen<FirmwareFlashProgress>("hardware:flash-progress", ({ payload }) => {
      if (disposed) return;
      setSnapshot((current) => ({ ...current, status: "flashing", progress: payload.progress, message: payload.stage }));
    });
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, [refresh]);

  const handleDownload = useCallback(async () => {
    if (!selectedImage) return;
    setSnapshot((current) => ({ ...current, status: "downloading", message: "正在准备固件…" }));
    try {
      const result = await downloadFirmware(selectedImage.boardId);
      setSnapshot((current) => ({ ...current, status: "ready", message: result.cached ? "已使用本地缓存固件。" : "固件下载完成。" }));
    } catch (error) {
      setSnapshot((current) => ({ ...current, status: "error", message: String(error) }));
    }
  }, [selectedImage]);

  const handleFlash = useCallback(async () => {
    if (!selectedImage || !snapshot.selectedPort || !snapshot.confirmed) return;
    setSnapshot((current) => ({ ...current, status: "flashing", progress: 0, message: "正在准备刷写…" }));
    try {
      const result = await flashFirmware(selectedImage.boardId, snapshot.selectedPort, true);
      setSnapshot((current) => ({ ...current, status: "success", progress: 100, message: `${result.portName} 已刷入 MicroPython ${result.version}。` }));
    } catch (error) {
      setSnapshot((current) => ({ ...current, status: "error", message: String(error) }));
    }
  }, [selectedImage, snapshot.confirmed, snapshot.selectedPort]);

  return <FirmwareFlashWizardView
    snapshot={snapshot}
    onBoardChange={(selectedBoard) => setSnapshot((current) => ({ ...current, selectedBoard, status: "ready", message: null, confirmed: false }))}
    onPortChange={(selectedPort) => setSnapshot((current) => ({ ...current, selectedPort, status: "ready", message: null }))}
    onRefresh={() => void refresh()}
    onDownload={() => void handleDownload()}
    onFlash={() => void handleFlash()}
    onConfirmChange={(confirmed) => setSnapshot((current) => ({ ...current, confirmed }))}
  />;
}
