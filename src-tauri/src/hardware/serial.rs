use crate::hardware::errors::{HardwareError, HardwareErrorKind};
use crate::hardware::transport::Transport;
use serialport::{ClearBuffer, SerialPort};
use std::time::Duration;

/// MicroPython 官方 REPL 默认波特率。刷写用 460800，日常通信固定 115200。
pub const DEFAULT_BAUD_RATE: u32 = 115_200;

/// 每次 `read` 的最长阻塞时间；协议层靠“可读字节数”轮询，不依赖它的长短。
const READ_TIMEOUT: Duration = Duration::from_millis(50);

pub struct SerialTransport {
    port: Box<dyn SerialPort>,
    label: String,
}

impl SerialTransport {
    pub fn open(port_name: &str, baud_rate: u32) -> Result<Self, HardwareError> {
        // ESP 开发板的 DTR/RTS 会直接接到 EN/BOOT 引脚，打开串口时不要拉高，
        // 否则设备会被一直摁在复位状态（刷写时由 esptool 自己控制这两个信号）。
        let port = serialport::new(port_name, baud_rate)
            .timeout(READ_TIMEOUT)
            .dtr_on_open(false)
            .open()
            .map_err(|error| {
                HardwareError::port(format!("无法打开 {port_name}：{}", error.description))
            })?;
        Ok(Self {
            port,
            label: port_name.to_string(),
        })
    }

    /// 设备被拔掉或驱动关闭时，读写会立刻失败，这里统一映射成“设备已断开”。
    fn map_io_error(&self, error: std::io::Error) -> HardwareError {
        use std::io::ErrorKind as IoKind;
        match error.kind() {
            IoKind::TimedOut | IoKind::WouldBlock => HardwareError::io("读取超时"),
            IoKind::BrokenPipe
            | IoKind::NotConnected
            | IoKind::ConnectionAborted
            | IoKind::ConnectionReset
            | IoKind::UnexpectedEof => {
                HardwareError::new(HardwareErrorKind::Disconnected, "串口连接已中断")
            }
            _ => HardwareError::io(error.to_string()),
        }
    }

    fn map_port_error(&self, error: serialport::Error) -> HardwareError {
        if error.kind == serialport::ErrorKind::NoDevice {
            return HardwareError::new(
                HardwareErrorKind::Disconnected,
                format!("{} 已断开", self.label),
            );
        }
        HardwareError::port(error.description)
    }
}

impl Transport for SerialTransport {
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), HardwareError> {
        use std::io::Write;
        self.port
            .write_all(bytes)
            .map_err(|error| self.map_io_error(error))
    }

    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, HardwareError> {
        use std::io::Read;
        match self.port.read(buffer) {
            Ok(read) => Ok(read),
            // 超时在轮询模型里等价于“暂时没有数据”。
            Err(error) => match error.kind() {
                std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => Ok(0),
                _ => Err(self.map_io_error(error)),
            },
        }
    }

    fn bytes_available(&mut self) -> Result<usize, HardwareError> {
        self.port
            .bytes_to_read()
            .map(|count| count as usize)
            .map_err(|error| self.map_port_error(error))
    }

    fn clear_input(&mut self) -> Result<(), HardwareError> {
        self.port
            .clear(ClearBuffer::Input)
            .map_err(|error| self.map_port_error(error))
    }

    fn label(&self) -> String {
        self.label.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_a_readable_port_error_when_the_device_is_missing() {
        let error = SerialTransport::open("COM-does-not-exist-9421", DEFAULT_BAUD_RATE)
            .err()
            .expect("opening an unknown port fails");

        assert_eq!(error.kind(), HardwareErrorKind::Port);
        assert!(error.to_string().contains("COM-does-not-exist-9421"));
    }
}
