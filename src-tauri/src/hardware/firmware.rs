use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

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
    vec![
        "--chip".to_string(),
        image.chip_family.clone(),
        "--port".to_string(),
        port_name.to_string(),
        "--baud".to_string(),
        "460800".to_string(),
        operation.to_string(),
    ]
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

#[tauri::command]
pub async fn hardware_flash_firmware(
    app: AppHandle,
    board_id: String,
    port_name: String,
    confirmed: bool,
) -> Result<FirmwareFlashResult, String> {
    if !confirmed {
        return Err("刷写固件前必须确认会覆盖设备 Flash".to_string());
    }
    let image =
        firmware_image_for_board(&board_id).ok_or_else(|| format!("不支持的板卡：{board_id}"))?;
    let cache_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法确定固件缓存目录：{error}"))?
        .join("hardware-firmware");
    let firmware_path = cached_firmware_path(&cache_root, &image);
    let bytes = fs::read(&firmware_path)
        .map_err(|error| format!("读取固件缓存失败，请先下载固件：{error}"))?;
    verify_firmware_bytes(&bytes, &image)?;
    let tool_path = esptools::Tool::EspTool
        .mount()
        .map_err(|error| format!("准备 esptool 失败：{error}"))?
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
        emit_progress("准备刷写", 5);
        run_esptool_command(
            &tool_path,
            flash_command_args(&image_for_flash, &port_for_result, "erase-flash"),
            "擦除 Flash",
        )?;
        emit_progress("擦除完成", 35);
        let mut write_args = flash_command_args(&image_for_flash, &port_for_result, "write-flash");
        write_args.push(format!("0x{:x}", image_for_flash.flash_offset));
        write_args.push(firmware_path_for_flash.to_string_lossy().into_owned());
        run_esptool_command(&tool_path, write_args, "写入 MicroPython 固件")?;
        emit_progress("刷写完成", 100);
        Ok(FirmwareFlashResult {
            board_id: board_for_result,
            port_name: port_for_result,
            version: version_for_result,
        })
    })
    .await
    .map_err(|error| format!("刷写任务异常退出：{error}"))?
}

fn run_esptool_command(tool_path: &Path, args: Vec<String>, stage: &str) -> Result<(), String> {
    let output = Command::new(tool_path)
        .args(args)
        .output()
        .map_err(|error| format!("{stage}失败，无法启动 esptool：{error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        Err(format!("{stage}失败：{detail}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_only_the_first_stage_board_families() {
        let catalog = firmware_catalog();

        assert_eq!(
            catalog
                .iter()
                .map(|image| image.board_id.as_str())
                .collect::<Vec<_>>(),
            vec!["esp32-wroom", "esp8266-esp12e"]
        );
        assert!(catalog.iter().all(|image| image.version == "1.29.0"));
    }

    #[test]
    fn uses_chip_specific_flash_offsets() {
        let catalog = firmware_catalog();

        assert_eq!(catalog[0].flash_offset, 0x1000);
        assert_eq!(catalog[1].flash_offset, 0);
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
        assert!(firmware_image_for_board("esp32-s3").is_none());
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

        assert_eq!(
            flash_command_args(&esp32, "COM3", "erase-flash"),
            vec![
                "--chip",
                "esp32",
                "--port",
                "COM3",
                "--baud",
                "460800",
                "erase-flash"
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
                "write-flash"
            ]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>()
        );
    }
}
