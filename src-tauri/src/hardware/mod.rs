//! 硬件编程支持。
//!
//! - `firmware`（阶段 1）：MicroPython 固件目录、下载校验与 esptool 刷写。
//! - `transport` / `serial`（阶段 4）：可注入的字节流抽象与串口实现。
//! - `micropython`（阶段 5）：Raw REPL / Raw Paste 运行时适配器。
//! - `simulated`（仅测试）：模拟设备，让协议层在没有真机时也能被完整测试。

pub mod commands;
pub mod errors;
pub mod firmware;
pub mod micropython;
pub mod serial;
pub mod session;
pub mod transport;

#[cfg(test)]
pub mod simulated;
