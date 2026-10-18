//! 模拟 MicroPython 设备（仅测试用）。
//!
//! 它实现的是**设备侧**的 Raw REPL / Raw Paste 协议和文件操作语义，
//! 让传输层与运行时适配器可以在没有真机的环境里被完整测试（阶段 4/5 验收要求）。
//!
//! 设备侧行为依据 MicroPython 官方实现：
//! - `shared/runtime/pyexec.c`（Raw REPL 与 Raw Paste 的字节级应答）
//! - `tools/pyboard.py`（主机侧握手顺序，MIT）
//!
//! 这里不解释任意 Python：只识别本项目自己生成的设备脚本（带 `# vp:` 标记），
//! 因此它验证的是协议与命令序列，而不是 Python 语义。

use crate::hardware::errors::{HardwareError, HardwareErrorKind};
use crate::hardware::transport::Transport;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, VecDeque};

const CTRL_A: u8 = 0x01;
const CTRL_B: u8 = 0x02;
const CTRL_C: u8 = 0x03;
const CTRL_D: u8 = 0x04;
const CTRL_E: u8 = 0x05;

const RAW_REPL_BANNER: &[u8] = b"raw REPL; CTRL-B to exit\r\n";
const FRIENDLY_BANNER: &[u8] = b"MicroPython v1.29.0 on 2026-08-24; ESP32 module with ESP32\r\nType \"help()\" for more information.\r\n";
const FRIENDLY_PROMPT: &[u8] = b">>> ";
/// Raw Paste 窗口大小（真实设备取输入缓冲区的一半）。
const PASTE_WINDOW: u16 = 128;

/// 固件对 Raw Paste 的支持情况，用于覆盖“新固件 / 明确拒绝 / 太旧不认识”三条路径。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SimPasteMode {
    /// 支持：`R\x01` + 窗口流控。
    Supported,
    /// 认识命令但不支持：`R\x00`。
    Rejected,
    /// 太旧：把控制字节当普通输入，重新打印 Raw REPL 横幅。
    Legacy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum SimState {
    /// 友好 REPL（也能接收 CTRL-A 进入 Raw REPL）。
    Idle,
    /// 收到 CTRL-E，等待 `A` 与 CTRL-A 组成 Raw Paste 协商。
    PastingCommand,
    /// Raw REPL：累积脚本直到 CTRL-D。
    Command,
    /// Raw Paste 数据阶段。
    PasteData,
}

pub struct SimulatedDevice {
    output: VecDeque<u8>,
    received: Vec<u8>,
    /// 设备执行过的脚本，供断言命令序列。
    pub scripts: Vec<String>,
    pub files: BTreeMap<String, Vec<u8>>,
    pub directories: Vec<String>,
    pending: Vec<u8>,
    open_file: Option<(String, Vec<u8>)>,
    state: SimState,
    paste_remaining: u16,

    pub in_raw_repl: bool,
    pub paste_mode: SimPasteMode,
    pub hashlib_available: bool,
    /// 上传结束时丢掉最后一个字节，用于测试大小校验失败。
    pub corrupt_uploads: bool,
    /// SHA-256 返回错误摘要，用于测试哈希校验失败。
    pub corrupt_hash: bool,
    /// main.py 在软复位后打印的内容。
    pub program_output: Vec<u8>,
    /// true：main.py 永不结束（模拟死循环），设备不会打印友好提示符。
    pub program_never_finishes: bool,
    pub running: bool,
    pub enter_raw_repl_count: usize,
    pub soft_reset_count: usize,
    pub interrupt_count: usize,
    /// 在第 N 个脚本之后停止应答，用于测试超时。
    pub hang_after_scripts: Option<usize>,
    /// 在第 N 个脚本之后模拟拔线：所有后续读写都失败。
    pub unplug_after_scripts: Option<usize>,
    /// 自定义脚本应答：(标记, stdout, stderr)，优先于内置处理。
    pub script_responses: Vec<(String, String, String)>,
}

impl Default for SimulatedDevice {
    fn default() -> Self {
        Self {
            output: VecDeque::new(),
            received: Vec::new(),
            scripts: Vec::new(),
            files: BTreeMap::new(),
            directories: Vec::new(),
            pending: Vec::new(),
            open_file: None,
            state: SimState::Idle,
            paste_remaining: 0,
            in_raw_repl: false,
            paste_mode: SimPasteMode::Supported,
            hashlib_available: true,
            corrupt_uploads: false,
            corrupt_hash: false,
            program_output: b"hello from main.py\r\n".to_vec(),
            program_never_finishes: false,
            running: false,
            enter_raw_repl_count: 0,
            soft_reset_count: 0,
            interrupt_count: 0,
            hang_after_scripts: None,
            unplug_after_scripts: None,
            script_responses: Vec::new(),
        }
    }
}

impl SimulatedDevice {
    pub fn add_file(&mut self, path: &str, contents: &[u8]) {
        self.files.insert(path.to_string(), contents.to_vec());
    }

    pub fn add_directory(&mut self, name: &str) {
        self.directories.push(name.to_string());
    }

    pub fn file(&self, path: &str) -> Option<&Vec<u8>> {
        self.files.get(path)
    }

    pub fn received_bytes(&self) -> &[u8] {
        &self.received
    }

    fn push_output(&mut self, bytes: &[u8]) {
        self.output.extend(bytes.iter().copied());
    }

    /// 设备已经“拔线”或“卡死”：读写都失败。
    fn disconnected(&self) -> bool {
        self.unplug_after_scripts
            .is_some_and(|limit| self.scripts.len() > limit)
    }

    fn hung(&self) -> bool {
        self.hang_after_scripts
            .is_some_and(|limit| self.scripts.len() > limit)
    }

    fn push_command_response(&mut self, stdout: &str, stderr: &str) {
        // Raw REPL 的应答格式：OK + stdout + 0x04 + stderr + 0x04 + “>” 提示符。
        self.push_output(b"OK");
        self.push_output(stdout.as_bytes());
        self.push_output(&[CTRL_D]);
        self.push_output(stderr.as_bytes());
        self.push_output(&[CTRL_D]);
        self.push_output(b">");
    }

    fn push_paste_response(&mut self, stdout: &str, stderr: &str) {
        // Raw Paste 的应答没有 OK 前缀，但同样以两个 0x04 结束。
        self.push_output(stdout.as_bytes());
        self.push_output(&[CTRL_D]);
        self.push_output(stderr.as_bytes());
        self.push_output(&[CTRL_D]);
        self.push_output(b">");
    }

    fn feed(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.feed_byte(*byte);
        }
    }

    fn feed_byte(&mut self, byte: u8) {
        match self.state {
            SimState::Command => self.feed_raw_repl_byte(byte),
            SimState::PasteData => self.feed_paste_byte(byte),
            SimState::PastingCommand => {
                if byte == CTRL_A {
                    if self.pending.last() == Some(&b'A') {
                        self.begin_raw_paste();
                    } else {
                        self.state = SimState::Command;
                        self.pending.clear();
                        self.enter_raw_repl();
                    }
                } else {
                    self.pending.push(byte);
                }
            }
            SimState::Idle => self.feed_friendly_repl_byte(byte),
        }
    }

    /// Raw REPL：普通字节进入 repl_line，控制字节有特殊含义（对齐 pyexec.c）。
    fn feed_raw_repl_byte(&mut self, byte: u8) {
        match byte {
            CTRL_D => {
                let script = String::from_utf8_lossy(&self.pending).into_owned();
                self.pending.clear();
                if script.is_empty() {
                    // 空行 + CTRL-D = 软复位
                    self.push_output(b"OK\r\n");
                    self.soft_reset_count += 1;
                    self.push_output(b"soft reboot\r\n");
                    self.push_output(RAW_REPL_BANNER);
                    self.push_output(b">");
                    return;
                }
                self.run_script(&script, false);
            }
            CTRL_C => self.pending.clear(),
            CTRL_B => {
                self.pending.clear();
                self.enter_friendly_repl();
            }
            CTRL_A => {
                self.pending.clear();
                self.enter_raw_repl();
            }
            CTRL_E => {
                self.pending.clear();
                self.pending.push(CTRL_E);
                self.state = SimState::PastingCommand;
            }
            _ => self.pending.push(byte),
        }
    }

    fn feed_paste_byte(&mut self, byte: u8) {
        if byte == CTRL_C {
            // 中断粘贴：先回 0x04（主机据此停止发送），再报 KeyboardInterrupt。
            self.state = SimState::Command;
            self.pending.clear();
            self.push_output(&[CTRL_D]);
            self.push_paste_response(
                "",
                "Traceback (most recent call last):\r\n  File \"<stdin>\", line 1\r\nKeyboardInterrupt: \r\n",
            );
            return;
        }
        if byte == CTRL_D {
            self.state = SimState::Command;
            let script = String::from_utf8_lossy(&self.pending).into_owned();
            self.pending.clear();
            self.push_output(&[CTRL_D]);
            self.run_script(&script, true);
            return;
        }
        self.pending.push(byte);
        // 与 pyexec.c 的 `if (--window_remain == 0)` 一致：窗口是被“刚刚消费的这个字节”用尽的，
        // 用尽时立刻补一个窗口给主机，不需要等下一个字节（否则主机会一直等窗口而卡死）。
        self.paste_remaining -= 1;
        if self.paste_remaining == 0 {
            self.paste_remaining = PASTE_WINDOW;
            self.push_output(&[CTRL_A]);
        }
    }

    /// 友好 REPL（对齐 pyexec.c 中 friendly REPL 的控制字节处理）。
    fn feed_friendly_repl_byte(&mut self, byte: u8) {
        match byte {
            CTRL_A => {
                self.pending.clear();
                self.enter_raw_repl();
            }
            CTRL_B => {
                self.pending.clear();
                self.enter_friendly_repl();
            }
            CTRL_C => self.interrupt(),
            CTRL_D => self.soft_reset_and_run_main(),
            CTRL_E => {
                self.pending.clear();
                self.pending.push(CTRL_E);
                self.state = SimState::PastingCommand;
            }
            _ => {}
        }
    }

    fn enter_raw_repl(&mut self) {
        self.in_raw_repl = true;
        self.state = SimState::Command;
        self.enter_raw_repl_count += 1;
        self.push_output(RAW_REPL_BANNER);
        self.push_output(b">");
    }

    fn enter_friendly_repl(&mut self) {
        self.in_raw_repl = false;
        self.state = SimState::Idle;
        self.push_output(b"\r\n");
        self.push_output(FRIENDLY_BANNER);
        self.push_output(FRIENDLY_PROMPT);
    }

    fn begin_raw_paste(&mut self) {
        self.pending.clear();
        match self.paste_mode {
            SimPasteMode::Supported => {
                self.push_output(b"R\x01");
                self.paste_remaining = PASTE_WINDOW;
                self.push_output(&PASTE_WINDOW.to_le_bytes());
                // 设备同时表示“还有一个窗口可用”。
                self.push_output(&[CTRL_A]);
                self.state = SimState::PasteData;
            }
            SimPasteMode::Rejected => {
                // 认识命令但不支持：回 R\x00，然后回到 Raw REPL 提示符。
                self.push_output(b"R\x00");
                self.push_output(b">");
                self.state = SimState::Command;
            }
            SimPasteMode::Legacy => {
                // 旧固件不认识 CTRL-E：控制字节被当成输入，重新打印横幅。
                self.push_output(RAW_REPL_BANNER);
                self.push_output(b">");
                self.state = SimState::Command;
            }
        }
    }

    /// 友好 REPL 的 CTRL-D：软复位并运行 boot.py + main.py，最后打印横幅和提示符。
    fn soft_reset_and_run_main(&mut self) {
        self.soft_reset_count += 1;
        self.push_output(b"\r\nsoft reboot\r\n");
        self.push_output(&self.program_output.clone());
        if self.program_never_finishes {
            self.running = true;
            return;
        }
        self.push_output(FRIENDLY_BANNER);
        self.push_output(FRIENDLY_PROMPT);
    }

    fn interrupt(&mut self) {
        self.interrupt_count += 1;
        if self.running {
            self.running = false;
            self.push_output(
                b"\r\nTraceback (most recent call last):\r\n  File \"main.py\", line 1, in <module>\r\nKeyboardInterrupt: \r\n",
            );
            self.push_output(FRIENDLY_PROMPT);
        } else if !self.in_raw_repl {
            self.push_output(FRIENDLY_PROMPT);
        }
    }

    fn run_script(&mut self, script: &str, pasted: bool) {
        self.scripts.push(script.to_string());
        if self.hung() {
            return;
        }
        let (stdout, stderr) = self.evaluate(script);
        if pasted {
            self.push_paste_response(&stdout, &stderr);
        } else {
            self.push_command_response(&stdout, &stderr);
        }
    }

    /// 识别本项目生成的设备脚本，返回 (stdout, stderr)。
    fn evaluate(&mut self, script: &str) -> (String, String) {
        if let Some((_, stdout, stderr)) = self
            .script_responses
            .iter()
            .find(|(marker, _, _)| script.contains(marker.as_str()))
            .cloned()
        {
            return (stdout, stderr);
        }
        if script.contains("# vp:info") {
            return (self.info_output(), String::new());
        }
        if script.contains("# vp:ls") {
            let mut lines = String::new();
            for directory in self.directories.clone() {
                lines.push_str(&format!("{}\t0\t{}\n", 0x4000, directory));
            }
            for (name, contents) in self.files.clone() {
                // 设备返回的是文件名（不带路径），和真实 MicroPython 的 ilistdir 一致。
                let listed = name.rsplit('/').next().unwrap_or(name.as_str()).to_string();
                lines.push_str(&format!("{}\t{}\t{}\n", 0x8000, contents.len(), listed));
            }
            return (lines, String::new());
        }
        if script.contains("# vp:read") {
            let path = extract_path(script);
            return match self.files.get(&path) {
                Some(contents) => {
                    let mut out = String::new();
                    for chunk in contents.chunks(256) {
                        out.push_str(&STANDARD.encode(chunk));
                        out.push('\n');
                    }
                    (out, String::new())
                }
                None => (String::new(), self.missing_file_traceback()),
            };
        }
        if script.contains("# vp:size") {
            let path = extract_path(script);
            return match self.files.get(&path) {
                Some(contents) => (format!("{}\n", contents.len()), String::new()),
                None => (String::new(), self.missing_file_traceback()),
            };
        }
        if script.contains("# vp:rm") {
            let path = extract_path(script);
            return match self.files.remove(&path) {
                Some(_) => (String::new(), String::new()),
                None => (String::new(), self.missing_file_traceback()),
            };
        }
        if script.contains("# vp:sha256") {
            if !self.hashlib_available {
                return (
                    String::new(),
                    "Traceback (most recent call last):\r\nImportError: no module named 'hashlib'\r\n"
                        .to_string(),
                );
            }
            let path = extract_path(script);
            return match self.files.get(&path) {
                Some(contents) => {
                    let digest = if self.corrupt_hash {
                        Sha256::digest(b"corrupted")
                    } else {
                        Sha256::digest(contents)
                    };
                    (format!("{digest:x}\n"), String::new())
                }
                None => (String::new(), self.missing_file_traceback()),
            };
        }
        if script.contains("# vp:put-chunk") {
            let payload = extract_base64(script);
            match (self.open_file.as_mut(), STANDARD.decode(payload.as_bytes())) {
                (Some((_, buffer)), Ok(bytes)) => {
                    buffer.extend_from_slice(&bytes);
                    (String::new(), String::new())
                }
                (None, _) => (
                    String::new(),
                    "Traceback (most recent call last):\r\nNameError: name '_w' isn't defined\r\n"
                        .to_string(),
                ),
                (_, Err(error)) => (
                    String::new(),
                    format!("Traceback (most recent call last):\r\nValueError: {error}\r\n"),
                ),
            }
        } else if script.contains("# vp:put-end") {
            if let Some((path, mut buffer)) = self.open_file.take() {
                if self.corrupt_uploads && !buffer.is_empty() {
                    buffer.truncate(buffer.len() - 1);
                }
                self.files.insert(path, buffer);
            }
            (String::new(), String::new())
        } else if script.contains("# vp:put-begin") {
            let path = extract_path(script);
            self.open_file = Some((path, Vec::new()));
            (String::new(), String::new())
        } else {
            (String::new(), String::new())
        }
    }

    fn missing_file_traceback(&self) -> String {
        "Traceback (most recent call last):\r\n  File \"<stdin>\", line 1\r\nOSError: [Errno 2] ENOENT\r\n"
            .to_string()
    }

    fn info_output(&self) -> String {
        "implementation=micropython\nversion=3.4.0; MicroPython v1.29.0 on 2026-08-24\nmpy=1.29.0\nplatform=esp32\nmachine=ESP32 module with ESP32\nrelease=1.29.0\n".to_string()
    }
}

/// 从脚本里取出第一个字符串字面量的内容（本项目生成的路径参数）。
fn extract_path(script: &str) -> String {
    let quote = script
        .find('\'')
        .map(|index| (index, '\''))
        .or_else(|| script.find('"').map(|index| (index, '"')));
    match quote {
        Some((index, delimiter)) => {
            let rest = &script[index + 1..];
            match rest.find(delimiter) {
                Some(end) => rest[..end].to_string(),
                None => String::new(),
            }
        }
        None => String::new(),
    }
}

fn extract_base64(script: &str) -> String {
    let start = match script.find("b\"") {
        Some(index) => index + 2,
        None => return String::new(),
    };
    let rest = &script[start..];
    match rest.find('"') {
        Some(end) => rest[..end].to_string(),
        None => String::new(),
    }
}

impl Transport for SimulatedDevice {
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), HardwareError> {
        if self.disconnected() {
            return Err(HardwareError::new(
                HardwareErrorKind::Disconnected,
                "模拟设备已拔线",
            ));
        }
        self.received.extend_from_slice(bytes);
        self.feed(bytes);
        Ok(())
    }

    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, HardwareError> {
        if self.disconnected() {
            return Err(HardwareError::new(
                HardwareErrorKind::Disconnected,
                "模拟设备已拔线",
            ));
        }
        let mut read = 0;
        while read < buffer.len() {
            match self.output.pop_front() {
                Some(byte) => {
                    buffer[read] = byte;
                    read += 1;
                }
                None => break,
            }
        }
        Ok(read)
    }

    fn bytes_available(&mut self) -> Result<usize, HardwareError> {
        if self.disconnected() {
            return Err(HardwareError::new(
                HardwareErrorKind::Disconnected,
                "模拟设备已拔线",
            ));
        }
        Ok(self.output.len())
    }

    fn clear_input(&mut self) -> Result<(), HardwareError> {
        self.output.clear();
        Ok(())
    }

    fn label(&self) -> String {
        "模拟设备".to_string()
    }
}
