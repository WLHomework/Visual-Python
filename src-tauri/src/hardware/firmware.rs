use crate::hardware::commands::HardwareCommandError;
use crate::hardware::session::HardwareState;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareImage {
    pub board_id: String,
    pub chip_family: String,
    pub version: String,
    pub filename: String,
    pub url: String,
    pub sha256: String,
    pub flash_offset: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortInfo {
    pub port_name: String,
    pub label: String,
    pub port_type: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareDownloadResult {
    pub board_id: String,
    pub version: String,
    pub path: String,
    pub cached: bool,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareFlashResult {
    pub board_id: String,
    pub port_name: String,
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FirmwareFlashProgress {
    board_id: String,
    port_name: String,
    stage: String,
    progress: u8,
}

pub fn firmware_catalog() -> Vec<FirmwareImage> {
    vec![
        FirmwareImage {
            board_id: "esp32-wroom".to_string(),
            chip_family: "esp32".to_string(),
            version: "1.29.0".to_string(),
            filename: "ESP32_GENERIC-20260824-v1.29.0.bin".to_string(),
            url: "https://micropython.org/resources/firmware/ESP32_GENERIC-20260824-v1.29.0.bin"
                .to_string(),
            sha256: "e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6".to_string(),
            flash_offset: 0x1000,
        },
        FirmwareImage {
            board_id: "esp8266-esp12e".to_string(),
            chip_family: "esp8266".to_string(),
            version: "1.29.0".to_string(),
            filename: "ESP8266_GENERIC-20260824-v1.29.0.bin".to_string(),
            url: "https://micropython.org/resources/firmware/ESP8266_GENERIC-20260824-v1.29.0.bin"
                .to_string(),
            sha256: "94bfdf94a6c48ac5dfe79203577baad61a58c2525cc39a010b934a6666d4c551".to_string(),
            flash_offset: 0,
        },
        FirmwareImage {
            board_id: "esp32-s3".to_string(),
            chip_family: "esp32s3".to_string(),
            version: "1.29.0".to_string(),
            filename: "ESP32_GENERIC_S3-20260824-v1.29.0.bin".to_string(),
            url: "https://micropython.org/resources/firmware/ESP32_GENERIC_S3-20260824-v1.29.0.bin"
                .to_string(),
            sha256: "1dd9dcd27ba2d6a1cb7f7b49a063f46d3d807d68b0151161233920228285e300".to_string(),
            flash_offset: 0,
        },
    ]
}

pub fn firmware_image_for_board(board_id: &str) -> Option<FirmwareImage> {
    firmware_catalog()
        .into_iter()
        .find(|image| image.board_id == board_id)
}

pub fn firmware_cache_filename(image: &FirmwareImage) -> String {
    format!("{}/{}", image.version, image.filename)
}

pub fn cached_firmware_path(cache_root: &Path, image: &FirmwareImage) -> PathBuf {
    cache_root.join(&image.version).join(&image.filename)
}

pub fn flash_command_args(image: &FirmwareImage, port_name: &str, operation: &str) -> Vec<String> {
    let esptool_operation = match operation {
        "erase-flash" => "erase_flash",
        "write-flash" => "write_flash",
        other => other,
    };
    vec![
        "--chip".to_string(),
        image.chip_family.clone(),
        "--port".to_string(),
        port_name.to_string(),
        "--baud".to_string(),
        "460800".to_string(),
        esptool_operation.to_string(),
    ]
}

/// ESP8266 的镜像头里不总是带正确的 4 MB Flash 配置，写入时显式让 esptool 探测。
/// 注意 `--flash_size` 属于 `write_flash` 子命令，必须放在命令之后。
fn write_flash_command_args(image: &FirmwareImage, port_name: &str, firmware_path: &Path) -> Vec<String> {
    let mut args = flash_command_args(image, port_name, "write-flash");
    args.push("--flash_size=detect".to_string());
    args.push(format!("0x{:x}", image.flash_offset));
    args.push(firmware_path.to_string_lossy().into_owned());
    args
}

/// 刷写前确认串口上实际连接的芯片与工程选择的板卡一致，避免把 S3/WROOM 镜像刷进 8266。
fn verify_flash_target(tool_path: &Path, port_name: &str, chip_family: &str) -> Result<(), String> {
    let output = Command::new(tool_path)
        .args(["--port", port_name, "--baud", "115200", "chip_id"])
        .output()
        .map_err(|error| format!("识别芯片失败，无法启动 esptool：{error}"))?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(format!("识别芯片失败：{}", text.trim()));
    }
    let detected = text
        .lines()
        .find(|line| line.contains("Chip is "))
        .map(str::trim)
        .ok_or_else(|| format!("无法识别串口上的芯片：{}", text.trim()))?;
    if chip_matches_family(detected, chip_family) {
        Ok(())
    } else {
        Err(format!(
            "串口 {port_name} 上的芯片是「{detected}」，与当前工程选择的板卡（{chip_family}）不匹配；请切换开发板或串口后再刷写。"
        ))
    }
}

fn chip_matches_family(detected: &str, chip_family: &str) -> bool {
    let lower = detected.to_ascii_lowercase();
    match chip_family {
        "esp8266" => lower.contains("esp8266"),
        "esp32s3" => lower.contains("esp32-s3"),
        "esp32" => {
            lower.contains("esp32")
                && !lower.contains("esp32-s3")
                && !lower.contains("esp32-c")
                && !lower.contains("esp32-h")
                && !lower.contains("esp32-p")
        }
        _ => false,
    }
}

pub fn verify_firmware_bytes(bytes: &[u8], image: &FirmwareImage) -> Result<(), String> {
    let digest = Sha256::digest(bytes);
    let actual = format!("{digest:x}");
    if actual.eq_ignore_ascii_case(&image.sha256) {
        Ok(())
    } else {
        Err(format!(
            "固件校验失败：期望 {}, 实际 {}",
            image.sha256, actual
        ))
    }
}

pub fn format_serial_port_label(port_name: &str, product_name: Option<&str>) -> String {
    product_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map_or_else(
            || port_name.to_string(),
            |name| format!("{name} ({port_name})"),
        )
}

#[tauri::command]
pub fn hardware_get_firmware_catalog() -> Vec<FirmwareImage> {
    firmware_catalog()
}

#[tauri::command]
pub fn hardware_list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    serialport::available_ports()
        .map(|ports| {
            ports
                .into_iter()
                .map(|port| {
                    let (product_name, port_type) = match port.port_type {
                        serialport::SerialPortType::UsbPort(info) => (info.product, "usb"),
                        serialport::SerialPortType::BluetoothPort => (None, "bluetooth"),
                        serialport::SerialPortType::PciPort => (None, "pci"),
                        serialport::SerialPortType::Unknown => (None, "unknown"),
                    };
                    SerialPortInfo {
                        label: format_serial_port_label(&port.port_name, product_name.as_deref()),
                        port_name: port.port_name,
                        port_type: port_type.to_string(),
                    }
                })
                .collect()
        })
        .map_err(|error| format!("枚举串口失败：{error}"))
}

#[tauri::command]
pub async fn hardware_download_firmware(
    app: AppHandle,
    board_id: String,
) -> Result<FirmwareDownloadResult, String> {
    let image =
        firmware_image_for_board(&board_id).ok_or_else(|| format!("不支持的板卡：{board_id}"))?;
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法确定固件缓存目录：{error}"))?
        .join("hardware-firmware");
    let path = cached_firmware_path(&cache_root, &image);

    if path.is_file() {
        let bytes = fs::read(&path).map_err(|error| format!("读取固件缓存失败：{error}"))?;
        verify_firmware_bytes(&bytes, &image)?;
        return Ok(FirmwareDownloadResult {
            board_id: image.board_id,
            version: image.version,
            path: path.to_string_lossy().into_owned(),
            cached: true,
            size_bytes: bytes.len() as u64,
        });
    }

    let response = reqwest::get(&image.url)
        .await
        .map_err(|error| format!("下载 MicroPython 固件失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 MicroPython 固件失败：HTTP {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取固件下载内容失败：{error}"))?;
    verify_firmware_bytes(&bytes, &image)?;
    fs::create_dir_all(path.parent().expect("versioned firmware path has a parent"))
        .map_err(|error| format!("创建固件缓存目录失败：{error}"))?;
    fs::write(&path, &bytes).map_err(|error| format!("保存固件缓存失败：{error}"))?;

    Ok(FirmwareDownloadResult {
        board_id: image.board_id,
        version: image.version,
        path: path.to_string_lossy().into_owned(),
        cached: false,
        size_bytes: bytes.len() as u64,
    })
}

/// 刷写前的准备结果：这些步骤都不碰串口、也不启动 esptool，所以能脱离 Tauri 单独测试。
#[derive(Debug)]
struct PreparedFlash {
    image: FirmwareImage,
    path: PathBuf,
}

/// 检查刷写前提：已确认覆盖、板卡受支持、串口没被设备连接占用、本地已有通过校验的固件。
fn prepare_flash(
    state: &HardwareState,
    cache_root: &Path,
    board_id: &str,
    port_name: &str,
    confirmed: bool,
) -> Result<PreparedFlash, HardwareCommandError> {
    if !confirmed {
        return Err(HardwareCommandError {
            code: "invalid",
            message: "刷写固件前必须确认会覆盖设备 Flash".to_string(),
        });
    }
    let image = firmware_image_for_board(board_id).ok_or_else(|| HardwareCommandError {
        code: "invalid",
        message: format!("不支持的板卡：{board_id}"),
    })?;
    // 设备连接占着串口时 esptool 只会报系统层错误：这里先给出稳定的 `busy`。
    state.ensure_port_free(port_name)?;
    let path = cached_firmware_path(cache_root, &image);
    let bytes = fs::read(&path).map_err(|error| {
        HardwareCommandError::internal(format!("读取固件缓存失败，请先下载固件：{error}"))
    })?;
    verify_firmware_bytes(&bytes, &image).map_err(HardwareCommandError::internal)?;
    Ok(PreparedFlash { image, path })
}

#[tauri::command]
pub async fn hardware_flash_firmware(
    app: AppHandle,
    state: State<'_, HardwareState>,
    board_id: String,
    port_name: String,
    confirmed: bool,
) -> Result<FirmwareFlashResult, HardwareCommandError> {
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| HardwareCommandError::internal(format!("无法确定固件缓存目录：{error}")))?
        .join("hardware-firmware");
    let PreparedFlash {
        image,
        path: firmware_path,
    } = prepare_flash(&state, &cache_root, &board_id, &port_name, confirmed)?;
    let tool_path = esptools::Tool::EspTool
        .mount()
        .map_err(|error| HardwareCommandError::internal(format!("准备 esptool 失败：{error}")))?
        .path();
    let app_for_progress = app.clone();
    let port_for_result = port_name.clone();
    let board_for_result = image.board_id.clone();
    let version_for_result = image.version.clone();
    let image_for_flash = image.clone();
    let firmware_path_for_flash = firmware_path.clone();
    tokio::task::spawn_blocking(move || {
        let emit_progress = |stage: &str, progress: u8| {
            let _ = app_for_progress.emit(
                "hardware:flash-progress",
                FirmwareFlashProgress {
                    board_id: image_for_flash.board_id.clone(),
                    port_name: port_for_result.clone(),
                    stage: stage.to_string(),
                    progress,
                },
            );
        };
        emit_progress("正在识别芯片", 3);
        verify_flash_target(&tool_path, &port_for_result, &image_for_flash.chip_family)
            .map_err(HardwareCommandError::internal)?;
        emit_progress("准备刷写", 5);
        emit_progress("正在擦除 Flash", 10);
        run_esptool_command(
            &tool_path,
            flash_command_args(&image_for_flash, &port_for_result, "erase-flash"),
            "擦除 Flash",
            (10, 34),
            |_| {},
        )
        .map_err(HardwareCommandError::internal)?;
        emit_progress("擦除完成", 35);
        let write_args = write_flash_command_args(
            &image_for_flash,
            &port_for_result,
            &firmware_path_for_flash,
        );
        run_esptool_command(
            &tool_path,
            write_args,
            "写入 MicroPython 固件",
            (35, 99),
            |progress| emit_progress("正在写入固件", progress),
        )
        .map_err(HardwareCommandError::internal)?;
        emit_progress("刷写完成", 100);
        Ok(FirmwareFlashResult {
            board_id: board_for_result,
            port_name: port_for_result,
            version: version_for_result,
        })
    })
    .await
    .map_err(|error| HardwareCommandError::internal(format!("刷写任务异常退出：{error}")))?
}

/// 运行 esptool 并实时解析 `Writing at 0x... (NN %)`，把原始百分比映射到整体刷写区间。
/// stdout/stderr 由两个线程持续读取，避免 esptool 因管道写满而阻塞。
fn run_esptool_command<F>(
    tool_path: &Path,
    args: Vec<String>,
    stage: &str,
    progress_range: (u8, u8),
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8),
{
    let mut child = Command::new(tool_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("{stage}失败，无法启动 esptool：{error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("{stage}失败：无法读取 esptool 输出"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("{stage}失败：无法读取 esptool 错误输出"))?;
    let (sender, receiver) = mpsc::channel::<(bool, String)>();
    let stdout_sender = sender.clone();
    thread::spawn(move || pump_esptool_output(stdout, stdout_sender, false));
    let stderr_sender = sender.clone();
    thread::spawn(move || pump_esptool_output(stderr, stderr_sender, true));
    drop(sender);

    let mut lines: Vec<String> = Vec::new();
    let mut last_progress = progress_range.0;
    for (is_stderr, line) in receiver {
        if is_stderr {
            lines.push(format!("stderr: {line}"));
        } else {
            lines.push(line.clone());
        }
        if lines.len() > 200 {
            lines.remove(0);
        }
        if let Some(raw) = parse_esptool_percent(&line) {
            let mapped = scale_esptool_progress(raw, progress_range);
            if mapped > last_progress {
                last_progress = mapped;
                on_progress(mapped);
            }
        }
    }
    let status = child
        .wait()
        .map_err(|error| format!("{stage}失败：等待 esptool 结束失败：{error}"))?;
    if status.success() {
        return Ok(());
    }
    let detail = lines
        .iter()
        .rev()
        .take(12)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    Err(format!(
        "{stage}失败：{}",
        if detail.is_empty() {
            "esptool 未返回错误详情".to_string()
        } else {
            detail
        }
    ))
}

fn pump_esptool_output<R: Read + Send + 'static>(
    mut reader: R,
    sender: mpsc::Sender<(bool, String)>,
    is_stderr: bool,
) {
    let mut buffer = [0u8; 4096];
    let mut pending: Vec<u8> = Vec::new();
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                for byte in &buffer[..read] {
                    if *byte == b'\r' || *byte == b'\n' {
                        if !pending.is_empty() {
                            let line = String::from_utf8_lossy(&pending).trim().to_string();
                            pending.clear();
                            if !line.is_empty() {
                                let _ = sender.send((is_stderr, line));
                            }
                        }
                    } else {
                        pending.push(*byte);
                    }
                }
            }
            Err(_) => break,
        }
    }
    if !pending.is_empty() {
        let line = String::from_utf8_lossy(&pending).trim().to_string();
        if !line.is_empty() {
            let _ = sender.send((is_stderr, line));
        }
    }
}

/// esptool 写入阶段会输出 `Writing at 0x00063f0e... (66 %)`，取括号里的百分比。
fn parse_esptool_percent(line: &str) -> Option<u8> {
    if !line.contains("Writing at") {
        return None;
    }
    let open = line.rfind('(')? + 1;
    let rest = &line[open..];
    let end = rest.find('%')?;
    rest[..end]
        .trim()
        .parse::<u32>()
        .ok()
        .map(|value| value.min(100) as u8)
}

fn scale_esptool_progress(raw: u8, (start, end): (u8, u8)) -> u8 {
    let span = end.saturating_sub(start) as u32;
    let scaled = start as u32 + span * raw as u32 / 100;
    scaled.min(end as u32) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::session::DeviceSession;
    use crate::hardware::simulated::SimulatedDevice;

    #[test]
    fn parses_and_scales_esptool_write_progress() {
        assert_eq!(
            parse_esptool_percent("Writing at 0x00063f0e... (66 %)"),
            Some(66)
        );
        assert_eq!(
            parse_esptool_percent("Writing at 0x00000000... (100 %)"),
            Some(100)
        );
        assert_eq!(parse_esptool_percent("Wrote 643424 bytes"), None);
        assert_eq!(scale_esptool_progress(0, (35, 99)), 35);
        assert_eq!(scale_esptool_progress(66, (35, 99)), 77);
        assert_eq!(scale_esptool_progress(100, (35, 99)), 99);
    }

    #[test]
    fn exposes_supported_board_families() {
        let catalog = firmware_catalog();

        assert_eq!(
            catalog
                .iter()
                .map(|image| image.board_id.as_str())
                .collect::<Vec<_>>(),
            vec!["esp32-wroom", "esp8266-esp12e", "esp32-s3"]
        );
        assert!(catalog.iter().all(|image| image.version == "1.29.0"));
    }

    #[test]
    fn matches_detected_chip_against_board_family() {
        assert!(chip_matches_family("Chip is ESP8266EX", "esp8266"));
        assert!(chip_matches_family("Chip is ESP32-S3 (QFN56)", "esp32s3"));
        assert!(chip_matches_family("Chip is ESP32-D0WD-V3", "esp32"));
        assert!(!chip_matches_family("Chip is ESP8266EX", "esp32"));
        assert!(!chip_matches_family("Chip is ESP32-D0WD", "esp32s3"));
    }

    #[test]
    fn write_flash_detects_flash_size() {
        let catalog = firmware_catalog();
        let args = write_flash_command_args(&catalog[1], "COM3", Path::new("fw.bin"));
        let command = args.iter().position(|arg| arg == "write_flash").expect("write_flash command");

        assert_eq!(args[command + 1], "--flash_size=detect");
        assert_eq!(args[command + 2], "0x0");
        assert_eq!(args.last().map(String::as_str), Some("fw.bin"));
    }

    #[test]
    fn uses_chip_specific_flash_offsets() {
        let catalog = firmware_catalog();

        assert_eq!(catalog[0].flash_offset, 0x1000);
        assert_eq!(catalog[1].flash_offset, 0);
        assert_eq!(catalog[2].flash_offset, 0);
    }

    #[test]
    fn verifies_firmware_bytes_against_sha256() {
        let image = FirmwareImage {
            board_id: "esp32-wroom".to_string(),
            chip_family: "esp32".to_string(),
            version: "1.29.0".to_string(),
            filename: "test.bin".to_string(),
            url: "https://example.com/test.bin".to_string(),
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".to_string(),
            flash_offset: 0x1000,
        };

        assert!(verify_firmware_bytes(b"abc", &image).is_ok());
        assert!(verify_firmware_bytes(b"abd", &image).is_err());
    }

    #[test]
    fn formats_serial_port_labels_without_losing_the_port_name() {
        assert_eq!(format_serial_port_label("COM3", None), "COM3");
        assert_eq!(
            format_serial_port_label("COM4", Some("USB-SERIAL CH340")),
            "USB-SERIAL CH340 (COM4)"
        );
    }

    #[test]
    fn resolves_only_known_firmware_images_and_keeps_cache_names_stable() {
        let image = firmware_image_for_board("esp32-wroom").expect("ESP32 image should exist");

        assert_eq!(image.filename, "ESP32_GENERIC-20260824-v1.29.0.bin");
        assert_eq!(
            firmware_cache_filename(&image),
            "1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin"
        );
        let s3 = firmware_image_for_board("esp32-s3").expect("ESP32-S3 image should exist");
        assert_eq!(s3.filename, "ESP32_GENERIC_S3-20260824-v1.29.0.bin");
        assert_eq!(s3.sha256, "1dd9dcd27ba2d6a1cb7f7b49a063f46d3d807d68b0151161233920228285e300");
    }

    #[test]
    fn places_cached_images_under_a_versioned_hardware_directory() {
        let image = firmware_image_for_board("esp8266-esp12e").expect("ESP8266 image should exist");
        let cache_root = std::path::Path::new("C:/cache");

        assert_eq!(
            cached_firmware_path(cache_root, &image),
            std::path::PathBuf::from("C:/cache/1.29.0/ESP8266_GENERIC-20260824-v1.29.0.bin")
        );
    }

    #[test]
    fn builds_chip_specific_esptool_arguments() {
        let esp32 = firmware_image_for_board("esp32-wroom").expect("ESP32 image should exist");
        let esp8266 =
            firmware_image_for_board("esp8266-esp12e").expect("ESP8266 image should exist");
        let esp32s3 =
            firmware_image_for_board("esp32-s3").expect("ESP32-S3 image should exist");

        assert_eq!(
            flash_command_args(&esp32, "COM3", "erase-flash"),
            vec![
                "--chip",
                "esp32",
                "--port",
                "COM3",
                "--baud",
                "460800",
                "erase_flash"
            ]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>()
        );
        assert_eq!(
            flash_command_args(&esp8266, "COM4", "write-flash"),
            vec![
                "--chip",
                "esp8266",
                "--port",
                "COM4",
                "--baud",
                "460800",
                "write_flash"
            ]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>()
        );
        assert_eq!(
            flash_command_args(&esp32s3, "COM5", "write-flash")[0..2],
            ["--chip".to_string(), "esp32s3".to_string()]
        );
        assert_eq!(
            flash_command_args(&esp32s3, "COM5", "write-flash").last(),
            Some(&"write_flash".to_string())
        );
    }

    /// 用模拟设备建立一条会话：刷写互斥检查靠它证明「串口已被占用」。
    fn connected_state(port_name: &str) -> HardwareState {
        let state = HardwareState::default();
        let session = DeviceSession::handshake(
            Box::new(SimulatedDevice::default()),
            "esp32-wroom",
            port_name,
        )
        .expect("handshake");
        state.connect(session).expect("connect");
        state
    }

    #[test]
    fn refuses_to_flash_a_port_held_by_a_device_connection() {
        let state = connected_state("SIM3");
        // 走到这里就说明没有启动 esptool：检查在它之前。
        let error =
            prepare_flash(&state, Path::new("C:/cache"), "esp32-wroom", "SIM3", true).unwrap_err();

        assert_eq!(error.code, "busy");
        assert!(error.message.contains("先断开设备"));
    }

    #[test]
    fn another_port_is_not_blocked_by_the_connection() {
        let state = connected_state("SIM3");
        let error =
            prepare_flash(&state, Path::new("C:/cache"), "esp32-wroom", "SIM4", true).unwrap_err();

        // 只卡在「固件还没下载」：说明互斥检查放行了另一块开发板的串口。
        assert_ne!(error.code, "busy");
        assert!(error.message.contains("读取固件缓存失败"));
    }

    #[test]
    fn flashing_checks_confirmation_and_the_board_before_touching_the_port() {
        let state = HardwareState::default();
        let cache = Path::new("C:/cache");

        assert_eq!(
            prepare_flash(&state, cache, "esp32-wroom", "COM3", false)
                .unwrap_err()
                .code,
            "invalid"
        );
        let unknown = prepare_flash(&state, cache, "unknown-board", "COM3", true).unwrap_err();
        assert_eq!(unknown.code, "invalid");
        assert!(unknown.message.contains("不支持的板卡"));
    }
}
