//! MicroPython 运行时适配器（阶段 5）。
//!
//! 只用官方 Raw REPL / Raw Paste 协议与设备通信，不把交互式命令行暴露给用户。
//! 协议细节来自两个 MIT 许可的上游实现，本项目按需重写为 Rust：
//! - `tools/pyboard.py`：主机侧握手顺序（进入 Raw REPL、分块发送、读取提示符）
//! - `shared/runtime/pyexec.c`：设备侧字节级应答（`OK`、两个 `0x04`、窗口流控）
//!
//! 统一的“运行”语义在这里落地：`upload_and_run` 先分块上传并校验，成功后才软复位执行；
//! 校验失败直接返回错误，绝不让设备跑起旧程序。

use crate::hardware::errors::{HardwareError, HardwareErrorKind};
use crate::hardware::transport::{
    drain_input, read_exact, read_until, ReadUntil, ReadUntilOptions, Transport,
};
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, VecDeque};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const CTRL_A: u8 = 0x01;
const CTRL_B: u8 = 0x02;
const CTRL_C: u8 = 0x03;
const CTRL_D: u8 = 0x04;
const CTRL_E: u8 = 0x05;

/// 进入 Raw REPL 后设备打印的横幅，末尾带提示符。
const RAW_REPL_READY: &[u8] = b"raw REPL; CTRL-B to exit\r\n>";
/// 软复位横幅（Raw REPL 与友好 REPL 通用）。
const SOFT_REBOOT_MARKER: &[u8] = b"soft reboot\r\n";
/// 友好 REPL 提示符：main.py 结束后一定会再次出现。
const FRIENDLY_PROMPT: &[u8] = b">>> ";
const PASTE_NEGOTIATION: &[u8] = b"\x05A\x01";
const PASTE_ACCEPTED: &[u8] = b"R\x01";
const WRITE_SLICE: usize = 256;
const WRITE_SLICE_DELAY: Duration = Duration::from_millis(10);
const TRACEBACK_MARKER: &[u8] = b"Traceback (most recent call last)";
/// 读取文件与计算校验值时每次从设备取的字节数（ESP8266 内存小，保持保守）。
const DEVICE_READ_CHUNK: usize = 256;
const HOST_TAIL_LIMIT: usize = 4096;

/// ESP32 上传分块大小（数据字节数）。
pub const ESP32_UPLOAD_CHUNK_SIZE: usize = 1024;
/// ESP8266 上传分块大小：Raw REPL 单行缓冲更小，必须用更小的块。
pub const ESP8266_UPLOAD_CHUNK_SIZE: usize = 256;

/// 按板卡选择上传分块大小。板卡档案扩展时只需保证板卡 ID 能看出芯片系列。
pub fn default_upload_chunk_size(board_id: &str) -> usize {
    if board_id.contains("esp8266") {
        ESP8266_UPLOAD_CHUNK_SIZE
    } else {
        ESP32_UPLOAD_CHUNK_SIZE
    }
}

/// 协议层超时。真机上是保守值；测试用 `ReplTimeouts::fast()` 缩短。
#[derive(Clone, Copy, Debug)]
pub struct ReplTimeouts {
    /// 单次等待横幅/提示符的字节间超时。
    pub banner: Duration,
    /// 单次协议操作的总体上限。
    pub overall: Duration,
    /// 等待一次 `exec` 输出结束的字节间超时。
    pub exec_char: Duration,
    /// 等待提示符的字节间超时。
    pub prompt: Duration,
}

impl Default for ReplTimeouts {
    fn default() -> Self {
        Self {
            banner: Duration::from_secs(2),
            overall: Duration::from_secs(10),
            exec_char: Duration::from_secs(5),
            prompt: Duration::from_secs(1),
        }
    }
}

impl ReplTimeouts {
    /// 单元测试用：把等待压缩到毫秒级，不改变协议顺序。
    pub fn fast() -> Self {
        Self {
            banner: Duration::from_millis(200),
            overall: Duration::from_millis(300),
            exec_char: Duration::from_millis(200),
            prompt: Duration::from_millis(100),
        }
    }
}

/// 设备信息，用于界面上显示“当前连接的固件是什么”。
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub implementation: String,
    pub version: String,
    pub mpy_version: String,
    pub platform: String,
    pub machine: String,
    pub release: String,
}

impl DeviceInfo {
    fn from_key_values(text: &str) -> Self {
        let mut values = BTreeMap::new();
        for line in text.lines() {
            let line = line.trim();
            if let Some((key, value)) = line.split_once('=') {
                values.insert(key.trim().to_string(), value.trim().to_string());
            }
        }
        let get = |key: &str| values.get(key).cloned().unwrap_or_default();
        Self {
            implementation: get("implementation"),
            version: get("version"),
            mpy_version: get("mpy"),
            platform: get("platform"),
            machine: get("machine"),
            release: get("release"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFile {
    pub name: String,
    pub size: u64,
    pub is_directory: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecOutcome {
    pub stdout: String,
    pub stderr: String,
    /// 设备端抛出了 KeyboardInterrupt（用户停止或 Ctrl-C）。
    pub interrupted: bool,
}

/// 运行结果。`StillRunning` 表示观察窗口内程序没有结束——硬件程序常见的 `while True:` 就属于这种情况，
/// 不是错误；真正判断“是否异常”要看是否出现 traceback。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Finished,
    Exception,
    Interrupted,
    StillRunning,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcome {
    pub status: RunStatus,
    /// 从设备读到的输出字节数（用于界面显示）。
    pub streamed_bytes: u64,
    /// 输出的结尾片段（最多 4KB），异常时用于显示回溯。
    pub tail: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WriteFileOptions {
    /// 每次 `exec` 携带的数据字节数。
    pub chunk_size: usize,
    /// 是否用设备端 SHA-256 复核（固件缺少 hashlib 时自动退回只校验大小）。
    pub verify_hash: bool,
}

impl Default for WriteFileOptions {
    fn default() -> Self {
        Self {
            chunk_size: ESP32_UPLOAD_CHUNK_SIZE,
            verify_hash: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadReport {
    pub path: String,
    pub size: u64,
    /// 主机侧算出的 SHA-256，供界面显示与后续比对。
    pub sha256: String,
    pub verified_size: bool,
    pub verified_hash: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProgramRunReport {
    pub upload: UploadReport,
    pub run: RunOutcome,
}

/// 运行参数。`timeout` 是“观察窗口”而不是运行上限：`None` 表示一直等到程序结束或用户停止。
#[derive(Clone, Debug, Default)]
pub struct RunOptions {
    pub timeout: Option<Duration>,
    pub cancel: Option<Arc<AtomicBool>>,
    /// 运行期间由界面写入、再转给设备 stdin 的字节。
    pub stdin: Option<Arc<Mutex<VecDeque<u8>>>>,
}

impl RunOptions {
    /// 一直运行，直到程序结束或用户停止（硬件程序的默认语义）。
    pub fn until_stopped() -> Self {
        Self {
            timeout: None,
            cancel: None,
            stdin: None,
        }
    }

    /// 只观察一段时间，用于脚本化的等待或测试。
    pub fn observing(timeout: Duration) -> Self {
        Self {
            timeout: Some(timeout),
            cancel: None,
            stdin: None,
        }
    }

    pub fn with_cancel(mut self, cancel: Arc<AtomicBool>) -> Self {
        self.cancel = Some(cancel);
        self
    }

    pub fn with_stdin(mut self, stdin: Arc<Mutex<VecDeque<u8>>>) -> Self {
        self.stdin = Some(stdin);
        self
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RawPasteSupport {
    Unknown,
    Supported,
    Unsupported,
}

pub struct MicroPythonDevice<T: Transport> {
    transport: T,
    /// 已经读进来但还没被协议消费的字节（设备常把两次应答粘在一起）。
    pending: VecDeque<u8>,
    timeouts: ReplTimeouts,
    in_raw_repl: bool,
    raw_paste: RawPasteSupport,
    /// 运行期间由界面写入、转给设备 stdin 的字节。
    stdin: Option<Arc<Mutex<VecDeque<u8>>>>,
}

impl<T: Transport> MicroPythonDevice<T> {
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            pending: VecDeque::new(),
            timeouts: ReplTimeouts::default(),
            in_raw_repl: false,
            raw_paste: RawPasteSupport::Unknown,
            stdin: None,
        }
    }

    pub fn set_timeouts(&mut self, timeouts: ReplTimeouts) {
        self.timeouts = timeouts;
    }

    pub fn timeouts(&self) -> ReplTimeouts {
        self.timeouts
    }

    pub fn label(&self) -> String {
        self.transport.label()
    }

    /// 当前是否处于 Raw REPL（界面用它判断“已连接且空闲”）。
    pub fn in_raw_repl(&self) -> bool {
        self.in_raw_repl
    }

    pub fn into_transport(self) -> T {
        self.transport
    }

    pub fn transport_mut(&mut self) -> &mut T {
        &mut self.transport
    }

    // ---- 协议基础 ----

    /// 进入 Raw REPL。`soft_reset` 为 true 时先软复位，确保设备处于干净状态
    /// （也会顺带中断正在运行的程序）。
    pub fn enter_raw_repl(&mut self, soft_reset: bool) -> Result<(), HardwareError> {
        // CTRL-C 先打断可能正在运行的程序，再清掉回显、启动日志和残留提示符。
        self.transport.write_all(&[b'\r', CTRL_C])?;
        self.drain_pending()?;
        self.transport.write_all(&[b'\r', CTRL_A])?;
        let ready = self.read_marker(
            RAW_REPL_READY,
            Some(self.timeouts.banner),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        if !ready.matched {
            self.in_raw_repl = false;
            return Err(HardwareError::protocol(
                "设备没有进入 Raw REPL，请确认已刷写 MicroPython 固件、串口未被其他程序占用",
            ));
        }
        self.in_raw_repl = true;

        if soft_reset {
            // Raw REPL 里的空行 + CTRL-D = 软复位。
            self.transport.write_all(&[CTRL_D])?;
            let reboot = self.read_marker(
                SOFT_REBOOT_MARKER,
                Some(self.timeouts.banner),
                Some(self.timeouts.overall),
                None,
                true,
                |_| {},
            )?;
            if !reboot.matched {
                return Err(HardwareError::timeout("等待设备软复位超时"));
            }
            self.consume_prompt(b">")?;
        }
        Ok(())
    }

    /// 回到友好 REPL。软复位（`reset`）与 `run_main` 都要求设备处于友好 REPL。
    pub fn exit_raw_repl(&mut self) -> Result<(), HardwareError> {
        if !self.in_raw_repl {
            return Ok(());
        }
        self.transport.write_all(&[b'\r', CTRL_B])?;
        self.in_raw_repl = false;
        // 设备会打印横幅和提示符；读掉它们，保证后续读取的位置确定。
        let _ = self.read_marker(
            FRIENDLY_PROMPT,
            Some(self.timeouts.prompt),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        Ok(())
    }

    /// 中断当前程序，不做软复位（对应“停止”）。
    pub fn interrupt(&mut self) -> Result<(), HardwareError> {
        self.transport.write_all(&[CTRL_C])?;
        let ending: &[u8] = if self.in_raw_repl {
            b">"
        } else {
            FRIENDLY_PROMPT
        };
        // 中断后设备会打印 KeyboardInterrupt 回溯和提示符；读不到也算成功。
        let _ = self.read_marker(
            ending,
            Some(self.timeouts.prompt),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        // 停止是一次“把流位置归零”的操作：剩下的回溯文本不再需要，直接丢掉。
        self.drain_pending()?;
        Ok(())
    }

    /// 软复位并重跑设备上的 `main.py`（对应“重置”）。输出由调用方用 `run_main` 读取。
    pub fn reset(&mut self) -> Result<(), HardwareError> {
        self.exit_raw_repl()?;
        // 软复位会清空设备状态，残留的未读字节也不再有意义。
        self.drain_pending()?;
        // 只发 CTRL-D：友好 REPL 里空行上的 CTRL-D 就是软复位。
        // 前面不能补 `\r` —— 空行会让设备回显一个新的 “>>> ”（pyexec.c 回到 input_restart
        // 重新打印提示符），而 `run_main` 正是用 “>>> ” 判断“程序结束”，
        // 多出来的这个回车会把整段运行输出当成“程序已结束”直接丢掉。
        self.transport.write_all(&[CTRL_D])?;
        // 等设备确认软复位已经开始：`MPY: soft reboot` 在 boot.py/main.py 之前打印
        // （ports/*/main.c），所以这里不会吞掉程序输出，后面的读取窗口也从程序输出开始。
        let reboot = self.read_marker(
            SOFT_REBOOT_MARKER,
            Some(self.timeouts.banner),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        if !reboot.matched {
            return Err(HardwareError::timeout("等待设备软复位超时"));
        }
        Ok(())
    }

    fn ensure_raw_repl(&mut self) -> Result<(), HardwareError> {
        if self.in_raw_repl {
            return Ok(());
        }
        self.enter_raw_repl(true)
    }

    fn read_marker(
        &mut self,
        ending: &[u8],
        char_timeout: Option<Duration>,
        overall: Option<Duration>,
        cancel: Option<&AtomicBool>,
        keep_all: bool,
        on_chunk: impl FnMut(&[u8]),
    ) -> Result<ReadUntil, HardwareError> {
        let stdin = self.stdin.clone();
        let mut options = ReadUntilOptions::new(ending)
            .char_timeout(char_timeout)
            .overall_timeout(overall)
            .keep_all(keep_all);
        if let Some(cancel) = cancel {
            options = options.cancel(cancel);
        }
        if let Some(stdin) = stdin.as_deref() {
            options = options.stdin(Some(stdin));
        }
        read_until(&mut self.transport, &mut self.pending, &options, on_chunk)
    }

    /// 读掉一个待处理的提示符；读不到不致命（设备可能已经把提示符和别的输出粘在一起）。
    fn consume_prompt(&mut self, prompt: &[u8]) -> Result<(), HardwareError> {
        let _ = self.read_marker(
            prompt,
            Some(self.timeouts.prompt),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        Ok(())
    }

    fn read_exact(&mut self, length: usize) -> Result<Vec<u8>, HardwareError> {
        read_exact(
            &mut self.transport,
            &mut self.pending,
            length,
            self.timeouts.overall,
        )
    }

    fn drain_pending(&mut self) -> Result<usize, HardwareError> {
        drain_input(&mut self.transport, &mut self.pending)
    }

    // ---- 执行代码 ----

    /// 执行一段代码，返回原始 stdout/stderr。设备端异常不会变成 `Err`，由调用方判断。
    pub fn exec_raw(&mut self, code: &[u8]) -> Result<ExecOutcome, HardwareError> {
        self.ensure_raw_repl()?;
        // 上一步应该已经把应答读到提示符为止；这里再清一次，保证后面读到的 `OK` 属于本次执行。
        self.drain_pending()?;
        if !self.try_raw_paste(code)? {
            self.write_raw_code(code)?;
        }
        self.collect_exec_output()
    }

    /// 执行代码；设备端抛出异常时返回 `Err(Device)`，KeyboardInterrupt 返回 `Err(Cancelled)`。
    pub fn exec(&mut self, code: &str) -> Result<String, HardwareError> {
        let outcome = self.exec_raw(code.as_bytes())?;
        if outcome.interrupted {
            return Err(HardwareError::cancelled());
        }
        if !outcome.stderr.trim().is_empty() {
            return Err(HardwareError::device(outcome.stderr.trim()));
        }
        Ok(outcome.stdout)
    }

    /// 支持 Raw Paste 时用它发送代码：设备用窗口流控回传可接收量，适合 ESP8266 这类小内存设备。
    fn try_raw_paste(&mut self, code: &[u8]) -> Result<bool, HardwareError> {
        if self.raw_paste == RawPasteSupport::Unsupported {
            return Ok(false);
        }
        self.transport.write_all(PASTE_NEGOTIATION)?;
        let response = self.read_exact(2)?;
        if response == PASTE_ACCEPTED {
            self.raw_paste = RawPasteSupport::Supported;
            self.write_raw_paste(code)?;
            return Ok(true);
        }
        // 固件拒绝（R\x00）或太旧、把控制字节当成普通输入并重新打印了横幅：
        // 两种情况都清理到提示符，之后改用普通 Raw REPL。
        self.raw_paste = RawPasteSupport::Unsupported;
        self.consume_prompt(b">")?;
        Ok(false)
    }

    fn write_raw_paste(&mut self, code: &[u8]) -> Result<(), HardwareError> {
        let window_bytes = self.read_exact(2)?;
        let window = u16::from_le_bytes([window_bytes[0], window_bytes[1]]) as usize;
        if window == 0 {
            return Err(HardwareError::protocol("设备报告的 Raw Paste 窗口为 0"));
        }
        let mut remaining = window;
        let mut index = 0usize;
        let mut buffer = [0u8; 64];
        while index < code.len() {
            if remaining == 0 {
                // 窗口用尽：等设备发来新的窗口（0x01）。
                let deadline = Instant::now() + self.timeouts.overall;
                loop {
                    if self.transport.bytes_available()? > 0 {
                        let read = self.transport.read(&mut buffer)?;
                        if read > 0 {
                            for byte in &buffer[..read] {
                                match *byte {
                                    CTRL_A => remaining += window,
                                    CTRL_D => {
                                        // 设备要求提前结束：回一个 0x04 并放弃本次发送。
                                        self.transport.write_all(&[CTRL_D])?;
                                        return Err(HardwareError::protocol(
                                            "设备提前结束了 Raw Paste 传输",
                                        ));
                                    }
                                    other => {
                                        return Err(HardwareError::protocol(format!(
                                            "Raw Paste 期间收到意外字节 0x{other:02x}"
                                        )));
                                    }
                                }
                            }
                            if remaining > 0 {
                                break;
                            }
                        }
                    }
                    if Instant::now() >= deadline {
                        return Err(HardwareError::timeout("Raw Paste 等待设备窗口超时"));
                    }
                    std::thread::sleep(Duration::from_millis(2));
                }
            }
            let take = remaining.min(code.len() - index);
            self.transport.write_all(&code[index..index + take])?;
            index += take;
            remaining -= take;
        }
        // 通知设备数据结束，然后等它确认。
        self.transport.write_all(&[CTRL_D])?;
        let ack = self.read_marker(
            &[CTRL_D],
            Some(self.timeouts.exec_char),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        if !ack.matched {
            return Err(HardwareError::timeout("Raw Paste 等待设备确认超时"));
        }
        Ok(())
    }

    /// 普通 Raw REPL：分片写入（避免设备输入缓冲溢出），再用 CTRL-D 触发执行。
    fn write_raw_code(&mut self, code: &[u8]) -> Result<(), HardwareError> {
        for slice in code.chunks(WRITE_SLICE) {
            self.transport.write_all(slice)?;
            std::thread::sleep(WRITE_SLICE_DELAY);
        }
        self.transport.write_all(&[CTRL_D])?;
        let ack = self.read_exact(2)?;
        if ack != b"OK" {
            return Err(HardwareError::protocol(format!(
                "设备没有接受代码（应答 \"{}\"）",
                String::from_utf8_lossy(&ack)
            )));
        }
        Ok(())
    }

    fn collect_exec_output(&mut self) -> Result<ExecOutcome, HardwareError> {
        let stdout = self.read_marker(
            &[CTRL_D],
            Some(self.timeouts.exec_char),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        if !stdout.matched {
            return Err(HardwareError::timeout(
                "等待设备输出超时（程序可能仍在运行或设备已卡死）",
            ));
        }
        let stderr = self.read_marker(
            &[CTRL_D],
            Some(self.timeouts.exec_char),
            Some(self.timeouts.overall),
            None,
            true,
            |_| {},
        )?;
        if !stderr.matched {
            return Err(HardwareError::protocol("设备输出没有正常结束"));
        }
        // 收掉本次执行的提示符，保证流位置确定（普通 Raw REPL 与 Raw Paste 都会打印）。
        self.consume_prompt(b">")?;

        let stdout = String::from_utf8_lossy(&stdout.data).into_owned();
        let stderr = String::from_utf8_lossy(&stderr.data).into_owned();
        let interrupted = stderr.contains("KeyboardInterrupt");
        Ok(ExecOutcome {
            stdout,
            stderr,
            interrupted,
        })
    }

    // ---- 设备信息与文件 ----

    pub fn info(&mut self) -> Result<DeviceInfo, HardwareError> {
        let output = self.exec(INFO_SCRIPT)?;
        Ok(DeviceInfo::from_key_values(&output))
    }

    pub fn list_files(&mut self, directory: &str) -> Result<Vec<DeviceFile>, HardwareError> {
        let output = self.exec(&list_script(directory))?;
        let mut files = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let mut parts = line.splitn(3, '\t');
            let kind = parts
                .next()
                .unwrap_or("0")
                .trim()
                .parse::<u32>()
                .unwrap_or(0);
            let size = parts
                .next()
                .unwrap_or("0")
                .trim()
                .parse::<u64>()
                .unwrap_or(0);
            let name = parts.next().unwrap_or("").trim().to_string();
            if name.is_empty() {
                continue;
            }
            files.push(DeviceFile {
                name,
                size,
                is_directory: kind == 0x4000,
            });
        }
        Ok(files)
    }

    pub fn read_file(&mut self, path: &str) -> Result<Vec<u8>, HardwareError> {
        let output = self.exec(&read_script(path, DEVICE_READ_CHUNK))?;
        let mut data = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let decoded = STANDARD.decode(line.as_bytes()).map_err(|error| {
                HardwareError::protocol(format!("设备返回的文件内容无法解码：{error}"))
            })?;
            data.extend_from_slice(&decoded);
        }
        Ok(data)
    }

    pub fn file_size(&mut self, path: &str) -> Result<u64, HardwareError> {
        let output = self.exec(&size_script(path))?;
        output.trim().parse::<u64>().map_err(|_| {
            HardwareError::protocol(format!("设备返回的文件大小无法解析：{}", output.trim()))
        })
    }

    /// 删除设备上的文件。删除用户程序之外的文件属于破坏性操作，权限由调用方把关。
    pub fn remove_file(&mut self, path: &str) -> Result<(), HardwareError> {
        self.exec(&remove_script(path))?;
        Ok(())
    }

    /// 设备端 SHA-256；固件没有 hashlib 时返回 `None`（上传改为只校验大小）。
    pub fn file_sha256(&mut self, path: &str) -> Result<Option<String>, HardwareError> {
        match self.exec(&sha256_script(path)) {
            Ok(output) => {
                let digest = output.trim().to_ascii_lowercase();
                if digest.len() == 64 {
                    Ok(Some(digest))
                } else {
                    Ok(None)
                }
            }
            Err(error) if error.kind() == HardwareErrorKind::Device => Ok(None),
            Err(error) => Err(error),
        }
    }

    /// 分块上传文件并校验。任何校验失败都会返回错误，调用方不得继续执行设备上的旧程序。
    pub fn write_file(
        &mut self,
        path: &str,
        data: &[u8],
        options: &WriteFileOptions,
        mut on_progress: impl FnMut(u64, u64),
    ) -> Result<UploadReport, HardwareError> {
        self.ensure_raw_repl()?;
        let chunk_size = options.chunk_size.clamp(32, 8192);
        self.exec(&upload_begin_script(path))?;
        let total = data.len() as u64;
        let mut written = 0u64;
        for chunk in data.chunks(chunk_size) {
            self.exec(&upload_chunk_script(chunk))?;
            written += chunk.len() as u64;
            on_progress(written, total);
        }
        self.exec(UPLOAD_END_SCRIPT)?;

        let device_size = self.file_size(path)?;
        if device_size != data.len() as u64 {
            return Err(HardwareError::protocol(format!(
                "上传校验失败：设备上 {path} 是 {device_size} 字节，期望 {} 字节",
                data.len()
            )));
        }

        let host_digest = sha256_hex(data);
        let mut verified_hash = false;
        if options.verify_hash {
            if let Some(device_digest) = self.file_sha256(path)? {
                if device_digest != host_digest {
                    return Err(HardwareError::protocol(format!(
                        "上传校验失败：{path} 的 SHA-256 与设备内容不一致"
                    )));
                }
                verified_hash = true;
            }
        }

        Ok(UploadReport {
            path: path.to_string(),
            size: data.len() as u64,
            sha256: host_digest,
            verified_size: true,
            verified_hash,
        })
    }

    // ---- 运行 ----

    /// 软复位并读取设备输出，直到 `main.py` 结束（友好 REPL 提示符出现）、用户停止或观察窗口结束。
    pub fn run_main(
        &mut self,
        options: &RunOptions,
        mut on_output: impl FnMut(&[u8]),
    ) -> Result<RunOutcome, HardwareError> {
        self.reset()?;
        self.stdin = options.stdin.clone();
        let mut watcher = OutputWatcher::new(HOST_TAIL_LIMIT);
        let cancel = options.cancel.as_deref();
        let outcome = {
            let watcher_ref = &mut watcher;
            self.read_marker(
                FRIENDLY_PROMPT,
                None,
                options.timeout,
                cancel,
                false,
                move |chunk| {
                    watcher_ref.feed(chunk);
                    on_output(chunk);
                },
            )
        };
        let outcome = match outcome {
            Ok(outcome) => outcome,
            Err(error) if error.kind() == HardwareErrorKind::Cancelled => {
                // “停止”= 中断但不软复位；中断后设备回到友好 REPL。
                self.stdin = None;
                self.interrupt()?;
                return Ok(RunOutcome {
                    status: RunStatus::Interrupted,
                    streamed_bytes: watcher.bytes,
                    tail: watcher.tail_string(),
                });
            }
            Err(error) => return Err(error),
        };

        let status = if !outcome.matched {
            RunStatus::StillRunning
        } else if watcher.saw_traceback {
            RunStatus::Exception
        } else {
            RunStatus::Finished
        };
        self.stdin = None;
        Ok(RunOutcome {
            status,
            streamed_bytes: watcher.bytes,
            tail: watcher.tail_string(),
        })
    }

    /// 统一的“运行”：上传并校验 `entry_path`，成功后才软复位执行。
    /// 校验失败时直接返回错误，设备上的旧程序不会被启动。
    pub fn upload_and_run(
        &mut self,
        entry_path: &str,
        code: &[u8],
        write_options: &WriteFileOptions,
        run_options: &RunOptions,
        on_progress: impl FnMut(u64, u64),
        on_output: impl FnMut(&[u8]),
    ) -> Result<ProgramRunReport, HardwareError> {
        let upload = self.write_file(entry_path, code, write_options, on_progress)?;
        let run = self.run_main(run_options, on_output)?;
        Ok(ProgramRunReport { upload, run })
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

/// 统计设备输出：判断是否出现 traceback，并保留结尾片段给界面。
struct OutputWatcher {
    scan: Vec<u8>,
    tail: Vec<u8>,
    limit: usize,
    bytes: u64,
    saw_traceback: bool,
}

impl OutputWatcher {
    fn new(limit: usize) -> Self {
        Self {
            scan: Vec::new(),
            tail: Vec::new(),
            limit,
            bytes: 0,
            saw_traceback: false,
        }
    }

    fn feed(&mut self, chunk: &[u8]) {
        self.bytes += chunk.len() as u64;
        if !self.saw_traceback {
            // 标记可能跨片段出现，所以保留 marker_len - 1 个字节的重叠。
            let mut scan = std::mem::take(&mut self.scan);
            scan.extend_from_slice(chunk);
            if scan
                .windows(TRACEBACK_MARKER.len())
                .any(|window| window == TRACEBACK_MARKER)
            {
                self.saw_traceback = true;
            }
            let keep = TRACEBACK_MARKER.len().saturating_sub(1);
            self.scan = scan.split_off(scan.len().saturating_sub(keep));
        }
        self.tail.extend_from_slice(chunk);
        if self.tail.len() > self.limit {
            let drop = self.tail.len() - self.limit;
            self.tail.drain(..drop);
        }
    }

    fn tail_string(&self) -> String {
        String::from_utf8_lossy(&self.tail).into_owned()
    }
}

// ---- 设备端脚本 ----
//
// 每个脚本都带 `# vp:*` 标记：既方便在设备日志里认出是本程序下发的，
// 也让测试用的模拟设备可以精确匹配（不解释任意 Python）。

const INFO_SCRIPT: &str = r#"# vp:info
import sys
try:
    import os
except ImportError:
    os = None
def _vp(k, v):
    print("%s=%s" % (k, v))
try:
    _vp("implementation", sys.implementation.name)
except Exception:
    _vp("implementation", "micropython")
try:
    _vp("version", sys.version)
except Exception:
    pass
try:
    _v = sys.implementation.version
    _vp("mpy", "%d.%d.%d" % (_v[0], _v[1], _v[2]))
except Exception:
    pass
try:
    _vp("platform", sys.platform)
except Exception:
    pass
try:
    _u = os.uname()
    _vp("machine", _u.machine)
    _vp("release", _u.release)
except Exception:
    pass
"#;

const UPLOAD_END_SCRIPT: &str = "# vp:put-end\n_f.close()\n";

fn python_string(value: &str) -> String {
    let mut quoted = String::with_capacity(value.len() + 2);
    quoted.push('\'');
    for character in value.chars() {
        match character {
            '\\' => quoted.push_str("\\\\"),
            '\'' => quoted.push_str("\\'"),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            _ => quoted.push(character),
        }
    }
    quoted.push('\'');
    quoted
}

fn list_script(directory: &str) -> String {
    format!(
        "# vp:ls\nimport os\nfor _e in os.ilistdir({}):\n    _vp = _e[3] if len(_e) > 3 else 0\n    print(\"%d\\t%d\\t%s\" % (_e[1], _vp, _e[0]))\n",
        python_string(directory)
    )
}

fn read_script(path: &str, chunk_size: usize) -> String {
    format!(
        "# vp:read\nimport ubinascii\n_f = open({}, \"rb\")\nwhile True:\n    _b = _f.read({})\n    if not _b:\n        break\n    print(ubinascii.b2a_base64(_b).decode().strip())\n_f.close()\n",
        python_string(path),
        chunk_size
    )
}

fn size_script(path: &str) -> String {
    format!(
        "# vp:size\nimport os\nprint(os.stat({})[6])\n",
        python_string(path)
    )
}

fn remove_script(path: &str) -> String {
    format!("# vp:rm\nimport os\nos.remove({})\n", python_string(path))
}

fn sha256_script(path: &str) -> String {
    format!(
        "# vp:sha256\nimport hashlib\nimport ubinascii\n_h = hashlib.sha256()\n_f = open({}, \"rb\")\nwhile True:\n    _b = _f.read({})\n    if not _b:\n        break\n    _h.update(_b)\n_f.close()\nprint(ubinascii.hexlify(_h.digest()).decode())\n",
        python_string(path),
        DEVICE_READ_CHUNK
    )
}

fn upload_begin_script(path: &str) -> String {
    format!(
        "# vp:put-begin\nimport ubinascii\n_f = open({}, \"wb\")\n_w = _f.write\n",
        python_string(path)
    )
}

fn upload_chunk_script(chunk: &[u8]) -> String {
    format!(
        "# vp:put-chunk\n_w(ubinascii.a2b_base64(b\"{}\"))\n",
        STANDARD.encode(chunk)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::simulated::{SimPasteMode, SimulatedDevice};
    use std::sync::atomic::Ordering;

    fn device() -> MicroPythonDevice<SimulatedDevice> {
        let mut device = MicroPythonDevice::new(SimulatedDevice::default());
        device.set_timeouts(ReplTimeouts::fast());
        device
    }

    /// 测试里只观察一小段时间，避免协议出错时把测试挂死。
    fn observing() -> RunOptions {
        RunOptions::observing(Duration::from_millis(150))
    }

    fn sample_program() -> Vec<u8> {
        let mut code =
            String::from("import time\nfrom machine import Pin\nled = Pin(2, Pin.OUT)\n");
        for index in 0..40 {
            code.push_str(&format!("led.value({index} % 2)\ntime.sleep_ms(500)\n"));
        }
        code.into_bytes()
    }

    #[test]
    fn enters_raw_repl_and_reads_the_firmware_info() {
        let mut device = device();
        let info = device.info().expect("info succeeds");

        assert_eq!(info.implementation, "micropython");
        assert_eq!(info.mpy_version, "1.29.0");
        assert_eq!(info.machine, "ESP32 module with ESP32");
        assert!(device.in_raw_repl());
        assert_eq!(device.transport_mut().enter_raw_repl_count, 1);
    }

    #[test]
    fn executes_code_and_returns_stdout() {
        let mut device = device();
        device.transport_mut().script_responses.push((
            "# vp:custom".to_string(),
            "42\n".to_string(),
            String::new(),
        ));

        let output = device
            .exec("# vp:custom\nprint(6 * 7)\n")
            .expect("exec succeeds");

        assert_eq!(output, "42\n");
    }

    #[test]
    fn reports_device_tracebacks_as_device_errors() {
        let mut device = device();
        device.transport_mut().script_responses.push((
            "# vp:boom".to_string(),
            String::new(),
            "Traceback (most recent call last):\r\n  File \"<stdin>\", line 1\r\nNameError: name 'nope' isn't defined\r\n".to_string(),
        ));

        let error = device.exec("# vp:boom\nnope\n").expect_err("device error");

        assert_eq!(error.kind(), HardwareErrorKind::Device);
        assert!(error.detail().contains("NameError"));
    }

    #[test]
    fn maps_keyboard_interrupt_to_cancellation() {
        let mut device = device();
        device.transport_mut().script_responses.push((
            "# vp:loop".to_string(),
            String::new(),
            "Traceback (most recent call last):\r\nKeyboardInterrupt: \r\n".to_string(),
        ));

        let error = device
            .exec("# vp:loop\nwhile True: pass\n")
            .expect_err("interrupted");

        assert_eq!(error.kind(), HardwareErrorKind::Cancelled);
    }

    #[test]
    fn soft_reset_leaves_the_stream_aligned_for_the_next_command() {
        let mut device = device();
        device.enter_raw_repl(true).expect("enter raw repl");
        device.transport_mut().script_responses.push((
            "# vp:after".to_string(),
            "ok\n".to_string(),
            String::new(),
        ));

        // 软复位后如果提示符没有收干净，这里的 OK 应答就会错位。
        let output = device
            .exec("# vp:after\nprint('ok')\n")
            .expect("exec after reset");

        assert_eq!(device.transport_mut().soft_reset_count, 1);
        assert_eq!(output, "ok\n");
    }

    #[test]
    fn uploads_entry_file_in_chunks_and_verifies_it() {
        let mut device = device();
        let data = sample_program();
        let options = WriteFileOptions {
            chunk_size: 64,
            verify_hash: true,
        };
        let mut progress = Vec::new();

        let report = device
            .write_file("/main.py", &data, &options, |written, total| {
                progress.push((written, total));
            })
            .expect("upload succeeds");

        assert_eq!(device.transport_mut().file("/main.py"), Some(&data));
        assert_eq!(report.size, data.len() as u64);
        assert_eq!(report.sha256, sha256_hex(&data));
        assert!(report.verified_size);
        assert!(report.verified_hash);
        // 分块上传会产生多次进度回调，且最后一次是总量。
        let expected_chunks = data.len().div_ceil(64);
        assert_eq!(progress.len(), expected_chunks);
        assert_eq!(
            progress.last(),
            Some(&(data.len() as u64, data.len() as u64))
        );
    }

    #[test]
    fn falls_back_to_size_only_verification_without_hashlib() {
        let mut device = device();
        device.transport_mut().hashlib_available = false;
        let data = b"print('hi')\n".to_vec();

        let report = device
            .write_file("/main.py", &data, &WriteFileOptions::default(), |_, _| {})
            .expect("upload succeeds");

        assert!(report.verified_size);
        assert!(!report.verified_hash);
    }

    #[test]
    fn refuses_to_continue_when_the_device_content_differs() {
        let mut device = device();
        device.transport_mut().corrupt_uploads = true;

        let error = device
            .write_file(
                "/main.py",
                b"print('hi')\n",
                &WriteFileOptions::default(),
                |_, _| {},
            )
            .expect_err("size mismatch");

        assert_eq!(error.kind(), HardwareErrorKind::Protocol);
        assert!(error.detail().contains("上传校验失败"));
    }

    #[test]
    fn detects_a_hash_mismatch_even_when_the_size_matches() {
        let mut device = device();
        device.transport_mut().corrupt_hash = true;

        let error = device
            .write_file(
                "/main.py",
                b"print('hi')\n",
                &WriteFileOptions::default(),
                |_, _| {},
            )
            .expect_err("hash mismatch");

        assert_eq!(error.kind(), HardwareErrorKind::Protocol);
        assert!(error.detail().contains("SHA-256"));
    }

    #[test]
    fn reads_a_binary_file_back_byte_for_byte() {
        let mut device = device();
        let payload: Vec<u8> = (0..600u32).map(|index| (index % 256) as u8).collect();
        device
            .transport_mut()
            .files
            .insert("/boot.py".to_string(), payload.clone());

        let read = device.read_file("/boot.py").expect("read succeeds");

        assert_eq!(read, payload);
    }

    #[test]
    fn lists_files_with_sizes_and_directories() {
        let mut device = device();
        device.transport_mut().add_file("/main.py", b"print(1)\n");
        device.transport_mut().add_directory("lib");

        let mut files = device.list_files("/").expect("list succeeds");
        files.sort_by(|left, right| left.name.cmp(&right.name));

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "lib");
        assert!(files[0].is_directory);
        assert_eq!(files[1].name, "main.py");
        assert_eq!(files[1].size, 9);
        assert!(!files[1].is_directory);
    }

    #[test]
    fn runs_main_and_streams_its_output_until_the_program_finishes() {
        let mut device = device();
        device.transport_mut().program_output = b"tick 1\r\ntick 2\r\n".to_vec();
        let mut streamed = Vec::new();

        let outcome = device
            .run_main(&observing(), |chunk| streamed.extend_from_slice(chunk))
            .expect("run succeeds");

        assert_eq!(outcome.status, RunStatus::Finished);
        assert!(String::from_utf8_lossy(&streamed).contains("tick 2"));
        assert!(outcome.tail.contains("tick 2"));
        assert_eq!(device.transport_mut().soft_reset_count, 1);
    }

    #[test]
    fn streams_the_program_output_even_though_the_device_echoes_prompts() {
        // 真机在友好 REPL 收到空行会回显一个新的 “>>> ”，而 “>>> ” 正是“程序结束”的标志：
        // 软复位前后一旦多发一个回车，整段运行输出都会被当成“程序已结束”丢掉（真机实测现象）。
        let mut device = device();
        device.enter_raw_repl(true).expect("enter raw repl");
        device.transport_mut().program_never_finishes = true;
        device.transport_mut().program_output = b"tick 1\r\ntick 2\r\n".to_vec();
        let mut streamed = Vec::new();

        let outcome = device
            .run_main(&RunOptions::observing(Duration::from_millis(60)), |chunk| {
                streamed.extend_from_slice(chunk)
            })
            .expect("run succeeds");

        // 程序没结束（真机上是死循环），说明读到的是程序输出而不是回显出来的提示符。
        assert_eq!(outcome.status, RunStatus::StillRunning);
        assert!(String::from_utf8_lossy(&streamed).contains("tick 1"));
    }

    #[test]
    fn reports_a_timeout_when_the_device_never_confirms_the_soft_reset() {
        // 设备不软复位（固件异常、程序卡死）时，宁可报超时，也不要让读取窗口对着
        // 一片不会输出 “soft reboot” 的串口空等。
        let mut device = device();
        device.transport_mut().missing_soft_reboot_banner = true;

        let error = device
            .run_main(&observing(), |_| {})
            .expect_err("reset is not confirmed");

        assert_eq!(error.kind(), HardwareErrorKind::Timeout);
        assert!(error.detail().contains("软复位"));
    }

    #[test]
    fn reports_a_crash_as_an_exception() {
        let mut device = device();
        device.transport_mut().program_output =
            b"Traceback (most recent call last):\r\n  File \"main.py\", line 3\r\nValueError: bad pin\r\n".to_vec();

        let outcome = device.run_main(&observing(), |_| {}).expect("run succeeds");

        assert_eq!(outcome.status, RunStatus::Exception);
        assert!(outcome.tail.contains("ValueError"));
    }

    #[test]
    fn reports_an_endless_program_as_still_running() {
        let mut device = device();
        device.transport_mut().program_never_finishes = true;
        device.transport_mut().program_output = b"blink\r\n".to_vec();

        let outcome = device
            .run_main(&RunOptions::observing(Duration::from_millis(60)), |_| {})
            .expect("run succeeds");

        assert_eq!(outcome.status, RunStatus::StillRunning);
        assert!(device.transport_mut().running);
    }

    #[test]
    fn stops_a_running_program_without_soft_resetting_it() {
        let mut device = device();
        device.transport_mut().program_never_finishes = true;
        device.transport_mut().program_output = b"blink 1\r\nblink 2\r\n".to_vec();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_flag = Arc::clone(&cancel);
        let mut streamed = String::new();

        let outcome = device
            .run_main(&RunOptions::until_stopped().with_cancel(cancel), |chunk| {
                streamed.push_str(&String::from_utf8_lossy(chunk));
                // 设备一开始输出就按“停止”（模拟用户操作）；
                // 流式输出会保留结尾几个字节以判断结束标记，所以不能指望拿到完整的最后一行。
                if !streamed.is_empty() {
                    cancel_flag.store(true, Ordering::SeqCst);
                }
            })
            .expect("run succeeds");

        assert_eq!(outcome.status, RunStatus::Interrupted);
        // 停止之前程序输出已经流给主机；结尾几个字节被留着判断结束标记，所以只比对整行前缀。
        assert!(streamed.contains("blink 1"));
        assert_eq!(device.transport_mut().interrupt_count, 1);
        assert!(!device.transport_mut().running);
        // 停止不做软复位：只有“连接时”的那一次软复位。
        assert_eq!(device.transport_mut().soft_reset_count, 1);
    }

    #[test]
    fn upload_and_run_uploads_before_resetting_the_device() {
        let mut device = device();
        let data = sample_program();

        let report = device
            .upload_and_run(
                "/main.py",
                &data,
                &WriteFileOptions::default(),
                &observing(),
                |_, _| {},
                |_| {},
            )
            .expect("run succeeds");

        assert_eq!(report.upload.size, data.len() as u64);
        assert_eq!(report.run.status, RunStatus::Finished);
        assert_eq!(device.transport_mut().file("/main.py"), Some(&data));
    }

    #[test]
    fn failed_upload_never_starts_the_device_program() {
        let mut device = device();
        device.transport_mut().corrupt_uploads = true;
        let mut streamed = Vec::new();

        let error = device
            .upload_and_run(
                "/main.py",
                b"print('new')\n",
                &WriteFileOptions::default(),
                &observing(),
                |_, _| {},
                |chunk| streamed.extend_from_slice(chunk),
            )
            .expect_err("upload fails");

        assert_eq!(error.kind(), HardwareErrorKind::Protocol);
        // 只有连接时的软复位；没有第二次（也就是没有启动 main.py）。
        assert_eq!(device.transport_mut().soft_reset_count, 1);
        assert!(streamed.is_empty());
        assert!(!device.transport_mut().running);
    }

    #[test]
    fn reports_a_timeout_when_the_device_stops_answering() {
        let mut device = device();
        device.transport_mut().hang_after_scripts = Some(0);

        let error = device.exec("# vp:hang\nprint('x')\n").expect_err("timeout");
        assert_eq!(error.kind(), HardwareErrorKind::Timeout);
    }

    #[test]
    fn surfaces_a_disconnect_as_a_disconnected_error() {
        let mut device = device();
        device.transport_mut().unplug_after_scripts = Some(0);

        let error = device
            .exec("# vp:any\nprint('x')\n")
            .expect_err("disconnected");

        assert_eq!(error.kind(), HardwareErrorKind::Disconnected);
    }

    #[test]
    fn uploads_through_plain_raw_repl_when_the_device_rejects_raw_paste() {
        let mut device = device();
        device.transport_mut().paste_mode = SimPasteMode::Rejected;
        let data = sample_program();

        device
            .write_file("/main.py", &data, &WriteFileOptions::default(), |_, _| {})
            .expect("upload succeeds");

        assert_eq!(device.transport_mut().file("/main.py"), Some(&data));
    }

    #[test]
    fn uploads_through_plain_raw_repl_on_firmware_without_raw_paste() {
        let mut device = device();
        device.transport_mut().paste_mode = SimPasteMode::Legacy;
        let data = b"print('old firmware')\n".to_vec();

        device
            .write_file("/main.py", &data, &WriteFileOptions::default(), |_, _| {})
            .expect("upload succeeds");

        assert_eq!(device.transport_mut().file("/main.py"), Some(&data));
    }

    #[test]
    fn raw_paste_sends_each_byte_exactly_once_across_window_boundaries() {
        let mut device = device();
        // 用比窗口大得多的脚本，确保窗口流控被反复触发。
        let mut code = String::from("# vp:big\n");
        for index in 0..40 {
            code.push_str(&format!("print('line {}')\n", index));
        }
        device.transport_mut().script_responses.push((
            "# vp:big".to_string(),
            "done\n".to_string(),
            String::new(),
        ));

        let output = device.exec(&code).expect("exec succeeds");

        assert_eq!(output, "done\n");
        let received =
            String::from_utf8_lossy(device.transport_mut().received_bytes()).into_owned();
        assert_eq!(received.matches("line 39").count(), 1);
        assert_eq!(received.matches("# vp:big").count(), 1);
    }

    #[test]
    fn interrupt_stops_a_running_program_and_leaves_the_repl_ready() {
        let mut device = device();
        device.transport_mut().running = true;

        device.interrupt().expect("interrupt succeeds");

        assert_eq!(device.transport_mut().interrupt_count, 1);
        assert!(!device.transport_mut().running);
    }

    #[test]
    fn upload_chunk_size_follows_the_board_profile() {
        assert_eq!(
            default_upload_chunk_size("esp8266-esp12e"),
            ESP8266_UPLOAD_CHUNK_SIZE
        );
        assert_eq!(
            default_upload_chunk_size("esp32-wroom"),
            ESP32_UPLOAD_CHUNK_SIZE
        );
        assert!(
            default_upload_chunk_size("esp8266-esp12e") < default_upload_chunk_size("esp32-wroom")
        );
    }
}
