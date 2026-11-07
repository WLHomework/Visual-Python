use std::fmt;

/// 硬件操作的错误种类。前端的错误提示按种类给出可操作建议，因此种类必须稳定。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HardwareErrorKind {
    /// 串口/文件等系统层错误。
    Io,
    /// 无法打开或占用设备（含拔线、被其他程序占用）。
    Port,
    /// 设备未连接或连接已失效。
    Disconnected,
    /// 协议不符合预期（应答缺失、标记错误）。
    Protocol,
    /// 等待设备超时（含死循环未结束）。
    Timeout,
    /// 设备端抛出了异常（MicroPython traceback）。
    Device,
    /// 当前板卡或固件不支持该能力。
    Unsupported,
    /// 设备正被另一个操作占用（例如程序仍在运行）。
    Busy,
    /// 用户主动取消。
    Cancelled,
}

impl HardwareErrorKind {
    /// 稳定的机器可读标识，供前端区分处理。
    pub fn code(self) -> &'static str {
        match self {
            HardwareErrorKind::Io => "io",
            HardwareErrorKind::Port => "port",
            HardwareErrorKind::Disconnected => "disconnected",
            HardwareErrorKind::Protocol => "protocol",
            HardwareErrorKind::Timeout => "timeout",
            HardwareErrorKind::Device => "device",
            HardwareErrorKind::Unsupported => "unsupported",
            HardwareErrorKind::Busy => "busy",
            HardwareErrorKind::Cancelled => "cancelled",
        }
    }

    fn label(self) -> &'static str {
        match self {
            HardwareErrorKind::Io => "通信失败",
            HardwareErrorKind::Port => "串口不可用",
            HardwareErrorKind::Disconnected => "设备已断开",
            HardwareErrorKind::Protocol => "设备应答异常",
            HardwareErrorKind::Timeout => "等待设备超时",
            HardwareErrorKind::Device => "设备运行出错",
            HardwareErrorKind::Unsupported => "设备不支持",
            HardwareErrorKind::Busy => "设备忙",
            HardwareErrorKind::Cancelled => "操作已取消",
        }
    }
}

#[derive(Clone, Debug)]
pub struct HardwareError {
    kind: HardwareErrorKind,
    message: String,
}

impl HardwareError {
    pub fn new(kind: HardwareErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Io, message)
    }

    pub fn port(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Port, message)
    }

    pub fn disconnected(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Disconnected, message)
    }

    pub fn protocol(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Protocol, message)
    }

    pub fn timeout(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Timeout, message)
    }

    pub fn device(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Device, message)
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Unsupported, message)
    }

    pub fn busy(message: impl Into<String>) -> Self {
        Self::new(HardwareErrorKind::Busy, message)
    }

    pub fn cancelled() -> Self {
        Self::new(HardwareErrorKind::Cancelled, "")
    }

    pub fn kind(&self) -> HardwareErrorKind {
        self.kind
    }

    #[cfg(test)]
    pub fn detail(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for HardwareError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.message.is_empty() {
            write!(formatter, "{}", self.kind.label())
        } else {
            write!(formatter, "{}：{}", self.kind.label(), self.message)
        }
    }
}

impl std::error::Error for HardwareError {}

impl From<serialport::Error> for HardwareError {
    fn from(error: serialport::Error) -> Self {
        HardwareError::port(error.to_string())
    }
}

impl From<std::io::Error> for HardwareError {
    fn from(error: std::io::Error) -> Self {
        HardwareError::io(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_stable_codes_and_readable_messages() {
        assert_eq!(
            HardwareError::timeout("等待启动输出").kind().code(),
            "timeout"
        );
        assert_eq!(
            HardwareError::protocol("未收到 Raw REPL 提示符").to_string(),
            "设备应答异常：未收到 Raw REPL 提示符"
        );
        assert_eq!(HardwareError::cancelled().to_string(), "操作已取消");
        assert_eq!(HardwareError::busy("程序正在运行").kind().code(), "busy");
        assert_eq!(
            HardwareError::busy("程序正在运行").to_string(),
            "设备忙：程序正在运行"
        );
    }

    #[test]
    fn maps_transport_errors_into_port_failures() {
        let error: HardwareError = serialport::Error::new(
            serialport::ErrorKind::NoDevice,
            "device not found".to_string(),
        )
        .into();

        assert_eq!(error.kind(), HardwareErrorKind::Port);
        assert!(error.detail().contains("device not found"));
    }
}
