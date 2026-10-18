import { Play, RefreshCw, RotateCcw, Square, Unplug } from "lucide-react";
import type { HardwareSerialPort } from "./hardwareApi";
import type { HardwareDeviceSnapshot } from "./hardwareDeviceApi";
import { isHardwareWorkbench, listWorkbenchProfiles } from "../profiles/workbenchProfile";
import type { HardwareBoardId } from "./firmwareCatalog";

/**
 * 硬件工作台顶部操作条：选板卡、选串口、连接、运行/停止、重置。
 *
 * 纯展示组件：状态全部来自 `useHardwareDevice`，运行进度与阶段显示在底部「输出」面板里，
 * 这里只保留可直接点的控件，不做文字说明。
 */
export type HardwareWorkbenchBarProps = {
  boardId: HardwareBoardId | undefined;
  ports: HardwareSerialPort[];
  portName: string;
  device: HardwareDeviceSnapshot | null;
  /** 有设备操作正在进行（连接/上传/运行/重置/停止）。 */
  busy: boolean;
  onSelectBoard: (boardId: HardwareBoardId) => void;
  onSelectPort: (portName: string) => void;
  onRefreshPorts: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRun: () => void;
  onStop: () => void;
  onReset: () => void;
};

export function HardwareWorkbenchBar(props: HardwareWorkbenchBarProps) {
  const { boardId, ports, portName, device, busy } = props;
  const connected = Boolean(device);
  const locked = busy || connected;

  return <div className="hardware-bar" role="group" aria-label="硬件工作台">
    <select className="hardware-bar-board" value={boardId ?? ""} disabled={locked} aria-label="开发板型号" title="开发板型号" onChange={(event) => { const next = event.currentTarget.value; if (next) props.onSelectBoard(next as HardwareBoardId); }}>
      {listWorkbenchProfiles().filter(isHardwareWorkbench).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    <select className="hardware-bar-port" value={portName} disabled={locked} aria-label="串口" title={portName ? `串口 ${portName}` : "选择串口"} onChange={(event) => props.onSelectPort(event.currentTarget.value)}>
      <option value="">选择串口</option>
      {ports.map((port) => <option key={port.portName} value={port.portName}>{port.label}</option>)}
    </select>
    <button type="button" className="icon-button hardware-bar-icon" title="刷新串口" aria-label="刷新串口" disabled={busy} onClick={props.onRefreshPorts}><RefreshCw size={15}/></button>
    {connected
      ? <button type="button" className="hardware-bar-button secondary" title={`断开 ${device?.portName}（设备上的程序会继续运行）`} disabled={busy} onClick={props.onDisconnect}><Unplug size={14}/>断开</button>
      : <button type="button" className="hardware-bar-button" title={portName ? "连接开发板" : "请先选择串口"} disabled={busy || !portName} onClick={props.onConnect}><Unplug size={14}/>{busy ? "连接中" : "连接"}</button>}
    <button type="button" className={`run-button hardware-bar-run ${busy ? "stopping" : ""}`} disabled={!connected} title={busy ? "停止设备上的程序（只中断，不重启）" : "上传程序到开发板并运行"} onClick={busy ? props.onStop : props.onRun}>
      {busy ? <Square size={13} fill="currentColor"/> : <Play size={13} fill="currentColor"/>}
      {busy ? "停止" : "运行"}
    </button>
    <button type="button" className="icon-button hardware-bar-icon" title="重置：让设备重新运行设备上的 main.py" aria-label="重置设备" disabled={!connected || busy} onClick={props.onReset}><RotateCcw size={15}/></button>
  </div>;
}
