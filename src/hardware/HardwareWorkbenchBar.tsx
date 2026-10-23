import { Play, Square, Unplug } from "lucide-react";
import type { HardwareSerialPort } from "./hardwareApi";
import type { HardwareDeviceSnapshot } from "./hardwareDeviceApi";

/**
 * 硬件工作台顶部操作条：选串口、连接、运行/停止、重置。
 *
 * 开发板型号是工程属性（新建工程时已选，状态栏也会显示），不再在操作条里重复放一个下拉框；
 * 需要换板卡时从顶部「设备」菜单切换。纯展示组件：状态全部来自 `useHardwareDevice`。
 */
export type HardwareWorkbenchBarProps = {
  ports: HardwareSerialPort[];
  portName: string;
  device: HardwareDeviceSnapshot | null;
  /** 有设备操作正在进行（连接/上传/运行/重置/停止）。 */
  busy: boolean;
  onSelectPort: (portName: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRun: () => void;
  onStop: () => void;
};

export function HardwareWorkbenchBar(props: HardwareWorkbenchBarProps) {
  const { ports, portName, device, busy } = props;
  const connected = Boolean(device);
  const locked = busy || connected;
  const selectedPort = ports.find((port) => port.portName === portName);

  return <div className="hardware-bar" role="group" aria-label="硬件工作台">
    <select className="hardware-bar-port" value={portName} disabled={locked} aria-label="串口" title={selectedPort ? `${selectedPort.portName} · ${selectedPort.label}` : portName ? `串口 ${portName}` : "选择串口"} onChange={(event) => props.onSelectPort(event.currentTarget.value)}>
      <option value="">选择串口</option>
      {ports.map((port) => <option key={port.portName} value={port.portName}>{port.portName}</option>)}
    </select>
    {connected
      ? <button type="button" className="hardware-bar-button secondary" title={`断开 ${device?.portName}（设备上的程序会继续运行）`} disabled={busy} onClick={props.onDisconnect}><Unplug size={14}/>断开</button>
      : <button type="button" className="hardware-bar-button" title={portName ? "连接开发板" : "请先选择串口"} disabled={busy || !portName} onClick={props.onConnect}><Unplug size={14}/>{busy ? "连接中" : "连接"}</button>}
    <button type="button" className={`run-button hardware-bar-run ${busy ? "stopping" : ""}`} disabled={!connected} title={busy ? "停止设备上的程序（只中断，不重启）" : "上传程序到开发板并运行"} onClick={busy ? props.onStop : props.onRun}>
      {busy ? <Square size={13} fill="currentColor"/> : <Play size={13} fill="currentColor"/>}
      {busy ? "停止" : "运行"}
    </button>
  </div>;
}
