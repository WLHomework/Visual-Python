use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize)]
struct PythonOutput {
    task_id: u64,
    stream: &'static str,
    data: String,
}

#[derive(Clone, Serialize)]
struct PythonFinished {
    task_id: u64,
    exit_code: i32,
    stopped: bool,
    timed_out: bool,
}

#[derive(Clone, Serialize)]
struct PackageInstallOutput {
    stream: &'static str,
    data: String,
}

#[derive(Clone, Serialize)]
struct PackageInstallFinished {
    success: bool,
    stopped: bool,
    error: Option<String>,
    packages: Vec<String>,
}

#[derive(Clone, Serialize)]
struct ManimOutput {
    stream: &'static str,
    data: String,
}

#[derive(Clone, Serialize)]
struct ManimFinished {
    success: bool,
    stopped: bool,
    scene: String,
    work_dir: String,
    video_path: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManimStorageInfo {
    path: String,
    size_bytes: u64,
    render_count: u64,
}

#[derive(Clone, Serialize)]
struct OpenProjectEvent {
    path: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManimRenderConfig {
    quality: String,
    fps: u16,
    renderer: String,
    disable_caching: bool,
}

#[derive(Clone, Deserialize, Serialize)]
struct PythonEnvironment {
    path: String,
    version: String,
    implementation: String,
    virtual_env: bool,
}

#[derive(Clone, Deserialize, Serialize)]
struct PythonPackageStatus {
    name: String,
    installed: bool,
}

fn vpy_project_from_args<I>(args: I, current_dir: &Path) -> Option<PathBuf>
where
    I: IntoIterator<Item = OsString>,
{
    args.into_iter().find_map(|argument| {
        let candidate = PathBuf::from(argument);
        let is_vpy = candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("vpy"));
        if !is_vpy {
            return None;
        }
        let path = if candidate.is_absolute() {
            candidate
        } else {
            current_dir.join(candidate)
        };
        path.is_file().then_some(path)
    })
}

#[tauri::command]
fn get_startup_project() -> Option<String> {
    let current_dir = std::env::current_dir().unwrap_or_default();
    vpy_project_from_args(std::env::args_os(), &current_dir)
        .map(|path| path.to_string_lossy().into_owned())
}

fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or("main window is unavailable")?;
    main.unminimize().map_err(|error| error.to_string())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("main window is unavailable")?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn restore_main_window(app: AppHandle) -> Result<(), String> {
    show_main_window(&app)
}

#[tauri::command]
fn exit_application(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn finish_startup(app: AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or("main window is unavailable")?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
        .map_err(|error| error.to_string())?;
    main.set_icon(icon).map_err(|error| error.to_string())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    if let Some(splash) = app.get_webview_window("splash") {
        splash.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginPythonManifest {
    packages: Option<Vec<String>>,
    minimum_version: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    id: String,
    name: String,
    version: String,
    api_version: String,
    description: Option<String>,
    builtin: Option<bool>,
    entry: Option<String>,
    python: Option<PluginPythonManifest>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalPluginDiscovery {
    path: String,
    manifest: Option<PluginManifest>,
    valid: bool,
    errors: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalPluginDiscoveryResponse {
    plugins_dir: String,
    entries: Vec<ExternalPluginDiscovery>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalPluginEntry {
    path: String,
    manifest: PluginManifest,
    source: String,
}

#[derive(Default)]
struct PythonTasks {
    next_id: AtomicU64,
    active: Arc<Mutex<Option<ActivePythonTask>>>,
    timed_out: Arc<Mutex<HashSet<u64>>>,
}

struct ActivePythonTask {
    id: u64,
    pid: u32,
    stdin: ChildStdin,
}

#[derive(Default)]
struct PackageInstallTasks {
    active: Arc<Mutex<Option<ActivePackageInstall>>>,
}

struct ActivePackageInstall {
    pid: u32,
    stopped: Arc<AtomicBool>,
}

#[derive(Default)]
struct ManimTasks {
    active: Arc<Mutex<Option<ActiveManimTask>>>,
}

struct ActiveManimTask {
    pid: u32,
    stopped: Arc<AtomicBool>,
}

#[derive(Default)]
struct PyrightState {
    next_id: AtomicU64,
    active: Arc<Mutex<Option<ActivePyrightProcess>>>,
}

struct ActivePyrightProcess {
    id: u64,
    pid: u32,
    child: Child,
    stdin: ChildStdin,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PyrightStartInfo {
    session_id: u64,
    root_uri: String,
    document_uri: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PyrightStatus {
    session_id: u64,
    state: &'static str,
    message: Option<String>,
}

impl Drop for PyrightState {
    fn drop(&mut self) {
        let _ = stop_pyright_process(&self.active);
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PyrightMessage {
    session_id: u64,
    message: Value,
}

const PLUGIN_API_VERSION: &str = "1";
const MAX_PLUGIN_ZIP_FILES: usize = 512;
const MAX_PLUGIN_UNPACKED_BYTES: u64 = 50 * 1024 * 1024;

fn is_valid_plugin_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '.' || ch == '-')
}

fn is_valid_plugin_version(version: &str) -> bool {
    let core_end = version.find(['-', '+']).unwrap_or(version.len());
    let core = &version[..core_end];
    if core_end < version.len() && version[core_end + 1..].is_empty() {
        return false;
    }
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
}

fn validate_plugin_entry(entry: &str) -> Result<(), String> {
    let path = std::path::Path::new(entry);
    if entry.trim().is_empty() {
        return Err("entry cannot be empty".into());
    }
    if path.is_absolute() {
        return Err("entry must be a relative path".into());
    }
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("entry cannot contain parent directory segments".into());
    }
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("js") | Some("mjs") => Ok(()),
        _ => Err("entry must point to a .js or .mjs file".into()),
    }
}

fn validate_plugin_manifest_value(value: &Value) -> Result<PluginManifest, Vec<String>> {
    let manifest = serde_json::from_value::<PluginManifest>(value.clone());
    let mut errors = Vec::new();
    let object = match value.as_object() {
        Some(object) => object,
        None => {
            return Err(vec!["plugin.json must be a JSON object".into()]);
        }
    };

    for key in ["id", "name", "version", "apiVersion"] {
        if !object.get(key).is_some_and(|item| item.as_str().is_some()) {
            errors.push(format!("{key} must be a string"));
        }
    }

    let manifest = match manifest {
        Ok(manifest) => manifest,
        Err(error) => {
            errors.push(format!("manifest shape is invalid: {error}"));
            return Err(errors);
        }
    };

    if !is_valid_plugin_id(&manifest.id) {
        errors.push(format!("invalid plugin id: {}", manifest.id));
    }
    if manifest.name.trim().is_empty() {
        errors.push("plugin name cannot be empty".into());
    }
    if !is_valid_plugin_version(&manifest.version) {
        errors.push(format!("invalid plugin version: {}", manifest.version));
    }
    if manifest.api_version != PLUGIN_API_VERSION {
        errors.push(format!(
            "unsupported plugin API version: {}",
            manifest.api_version
        ));
    }
    if manifest.builtin.unwrap_or(false) {
        errors.push("external plugins cannot declare builtin: true".into());
    }
    match &manifest.entry {
        Some(entry) => {
            if let Err(error) = validate_plugin_entry(entry) {
                errors.push(error);
            }
        }
        None => errors.push("entry must be provided for external plugins".into()),
    }
    if let Some(python) = &manifest.python {
        if let Some(packages) = &python.packages {
            for package in packages {
                if package.trim().is_empty() {
                    errors.push("python packages cannot contain empty names".into());
                }
            }
        }
    }

    if errors.is_empty() {
        Ok(manifest)
    } else {
        Err(errors)
    }
}

fn discover_external_plugins_from_dir(
    plugins_dir: &std::path::Path,
) -> Vec<ExternalPluginDiscovery> {
    let mut entries = Vec::new();
    let Ok(children) = fs::read_dir(plugins_dir) else {
        return entries;
    };

    for child in children.flatten() {
        let Ok(file_type) = child.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let plugin_dir = child.path();
        let manifest_path = plugin_dir.join("plugin.json");
        let mut entry = ExternalPluginDiscovery {
            path: plugin_dir.to_string_lossy().into_owned(),
            manifest: None,
            valid: false,
            errors: Vec::new(),
        };

        match fs::read_to_string(&manifest_path) {
            Ok(contents) => match serde_json::from_str::<Value>(&contents) {
                Ok(value) => match validate_plugin_manifest_value(&value) {
                    Ok(manifest) => {
                        entry.manifest = Some(manifest);
                        entry.valid = true;
                    }
                    Err(errors) => entry.errors = errors,
                },
                Err(error) => entry
                    .errors
                    .push(format!("plugin.json is not valid JSON: {error}")),
            },
            Err(error) => entry
                .errors
                .push(format!("cannot read plugin.json: {error}")),
        }

        entries.push(entry);
    }

    let mut seen = HashSet::new();
    let mut duplicates = HashSet::new();
    for entry in &entries {
        if let Some(manifest) = &entry.manifest {
            if !seen.insert(manifest.id.clone()) {
                duplicates.insert(manifest.id.clone());
            }
        }
    }
    for entry in &mut entries {
        if let Some(manifest) = &entry.manifest {
            if duplicates.contains(&manifest.id) {
                entry.valid = false;
                entry
                    .errors
                    .push(format!("duplicate plugin id: {}", manifest.id));
            }
        }
    }

    entries.sort_by(|left, right| left.path.cmp(&right.path));
    entries
}

fn normal_zip_components(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => value.to_str().map(|text| text.to_owned()),
            _ => None,
        })
        .collect()
}

fn install_external_plugin_zip_file(
    zip_path: &Path,
    plugins_dir: &Path,
) -> Result<ExternalPluginDiscovery, String> {
    fs::create_dir_all(plugins_dir)
        .map_err(|error| format!("cannot create plugins directory: {error}"))?;
    let zip_file =
        fs::File::open(zip_path).map_err(|error| format!("cannot open plugin zip: {error}"))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|error| format!("invalid plugin zip: {error}"))?;
    if archive.is_empty() {
        return Err("plugin zip is empty".into());
    }
    if archive.len() > MAX_PLUGIN_ZIP_FILES {
        return Err(format!("plugin zip has too many files: {}", archive.len()));
    }

    let mut unpacked_size = 0_u64;
    let mut manifest_candidates: Vec<(usize, PathBuf)> = Vec::new();
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("cannot read plugin zip entry: {error}"))?;
        let enclosed = file
            .enclosed_name()
            .ok_or_else(|| format!("unsafe zip entry path: {}", file.name()))?;
        unpacked_size = unpacked_size.saturating_add(file.size());
        if unpacked_size > MAX_PLUGIN_UNPACKED_BYTES {
            return Err("plugin zip is too large after extraction".into());
        }
        if file.is_dir() {
            continue;
        }
        let components = normal_zip_components(&enclosed);
        match components.as_slice() {
            [name] if name == "plugin.json" => manifest_candidates.push((index, PathBuf::new())),
            [root, name] if name == "plugin.json" => {
                manifest_candidates.push((index, PathBuf::from(root)))
            }
            _ => {}
        }
    }

    if manifest_candidates.is_empty() {
        return Err(
            "plugin zip must contain plugin.json at the root or inside one top-level folder".into(),
        );
    }
    if manifest_candidates.len() > 1 {
        return Err("plugin zip contains multiple plugin.json files".into());
    }
    let (manifest_index, archive_root) = manifest_candidates.remove(0);

    let mut manifest_text = String::new();
    archive
        .by_index(manifest_index)
        .map_err(|error| format!("cannot read plugin.json: {error}"))?
        .read_to_string(&mut manifest_text)
        .map_err(|error| format!("cannot read plugin.json: {error}"))?;
    let manifest_value = serde_json::from_str::<Value>(&manifest_text)
        .map_err(|error| format!("plugin.json is not valid JSON: {error}"))?;
    let manifest =
        validate_plugin_manifest_value(&manifest_value).map_err(|errors| errors.join("; "))?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let temp_dir = plugins_dir.join(format!(".install-{}-{stamp}", manifest.id));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)
            .map_err(|error| format!("cannot clean temp plugin directory: {error}"))?;
    }
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("cannot create temp plugin directory: {error}"))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("cannot read plugin zip entry: {error}"))?;
        let enclosed = file
            .enclosed_name()
            .ok_or_else(|| format!("unsafe zip entry path: {}", file.name()))?;
        let relative = if archive_root.as_os_str().is_empty() {
            enclosed
        } else if let Ok(stripped) = enclosed.strip_prefix(&archive_root) {
            stripped.to_path_buf()
        } else {
            continue;
        };
        if relative.as_os_str().is_empty() {
            continue;
        }
        let output_path = temp_dir.join(&relative);
        if file.is_dir() {
            fs::create_dir_all(&output_path)
                .map_err(|error| format!("cannot create plugin directory: {error}"))?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("cannot create plugin directory: {error}"))?;
            }
            let mut output = fs::File::create(&output_path)
                .map_err(|error| format!("cannot create plugin file: {error}"))?;
            std::io::copy(&mut file, &mut output)
                .map_err(|error| format!("cannot extract plugin file: {error}"))?;
        }
    }

    let destination = plugins_dir.join(&manifest.id);
    if destination.exists() {
        fs::remove_dir_all(&destination)
            .map_err(|error| format!("cannot replace existing plugin: {error}"))?;
    }
    fs::rename(&temp_dir, &destination)
        .map_err(|error| format!("cannot install plugin: {error}"))?;
    Ok(ExternalPluginDiscovery {
        path: destination.to_string_lossy().into_owned(),
        manifest: Some(manifest),
        valid: true,
        errors: Vec::new(),
    })
}

fn delete_external_plugin_dir(plugin_path: &Path, plugins_dir: &Path) -> Result<(), String> {
    let plugins_dir = fs::canonicalize(plugins_dir)
        .map_err(|error| format!("plugins directory is unavailable: {error}"))?;
    let plugin_dir = fs::canonicalize(plugin_path)
        .map_err(|error| format!("plugin directory is unavailable: {error}"))?;
    if plugin_dir == plugins_dir {
        return Err("cannot delete the plugins root directory".into());
    }
    if !plugin_dir.starts_with(&plugins_dir) {
        return Err("plugin directory is outside the plugins folder".into());
    }
    if !plugin_dir.join("plugin.json").exists() {
        return Err("plugin directory does not contain plugin.json".into());
    }
    fs::remove_dir_all(&plugin_dir).map_err(|error| format!("cannot delete plugin: {error}"))
}

fn emit_reader<R: Read + Send + 'static>(
    app: AppHandle,
    task_id: u64,
    stream: &'static str,
    mut reader: R,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        let mut pending = Vec::<u8>::new();
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    if !pending.is_empty() {
                        let data = String::from_utf8_lossy(&pending).into_owned();
                        let _ = app.emit(
                            "python-output",
                            PythonOutput {
                                task_id,
                                stream,
                                data,
                            },
                        );
                    }
                    break;
                }
                Ok(size) => {
                    pending.extend_from_slice(&buffer[..size]);
                    loop {
                        match std::str::from_utf8(&pending) {
                            Ok(text) => {
                                if !text.is_empty() {
                                    let _ = app.emit(
                                        "python-output",
                                        PythonOutput {
                                            task_id,
                                            stream,
                                            data: text.to_owned(),
                                        },
                                    );
                                }
                                pending.clear();
                                break;
                            }
                            Err(error) => {
                                let valid = error.valid_up_to();
                                if valid > 0 {
                                    let text =
                                        String::from_utf8_lossy(&pending[..valid]).into_owned();
                                    let _ = app.emit(
                                        "python-output",
                                        PythonOutput {
                                            task_id,
                                            stream,
                                            data: text,
                                        },
                                    );
                                    pending.drain(..valid);
                                }
                                if error.error_len().is_none() {
                                    break;
                                }
                                let invalid = error.error_len().unwrap_or(1).min(pending.len());
                                pending.drain(..invalid);
                                let _ = app.emit(
                                    "python-output",
                                    PythonOutput {
                                        task_id,
                                        stream,
                                        data: "�".into(),
                                    },
                                );
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn emit_package_reader<R: Read + Send + 'static>(
    app: AppHandle,
    stream: &'static str,
    mut reader: R,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let data = String::from_utf8_lossy(&buffer[..size]).into_owned();
                    if !data.is_empty() {
                        let _ = app.emit(
                            "package-install-output",
                            PackageInstallOutput { stream, data },
                        );
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn emit_manim_reader<R: Read + Send + 'static>(
    app: AppHandle,
    stream: &'static str,
    mut reader: R,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let data = String::from_utf8_lossy(&buffer[..size]).into_owned();
                    if !data.is_empty() {
                        let _ = app.emit("manim-output", ManimOutput { stream, data });
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn find_latest_mp4(root: &Path) -> Option<PathBuf> {
    fn visit(dir: &Path, latest: &mut Option<(SystemTime, PathBuf)>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                visit(&path, latest);
                continue;
            }
            if path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("mp4"))
            {
                let modified = entry
                    .metadata()
                    .and_then(|metadata| metadata.modified())
                    .unwrap_or(UNIX_EPOCH);
                if latest
                    .as_ref()
                    .is_none_or(|(current, _)| modified > *current)
                {
                    *latest = Some((modified, path));
                }
            }
        }
    }
    let mut latest = None;
    visit(root, &mut latest);
    latest.map(|(_, path)| path)
}

fn manim_storage_dir(app: &AppHandle, storage_path: Option<&str>) -> Result<PathBuf, String> {
    let custom_path = storage_path
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let path = match custom_path {
        Some(value) => {
            let path = PathBuf::from(value);
            if !path.is_absolute() {
                return Err("Manim storage path must be absolute".into());
            }
            path
        }
        None => app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("renders"),
    };
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())?;
    Ok(path)
}

fn is_manim_render_entry(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("manim-"))
        .is_some_and(|stamp| !stamp.is_empty() && stamp.bytes().all(|byte| byte.is_ascii_digit()))
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries.flatten().fold(0, |size, entry| {
        let Ok(file_type) = entry.file_type() else {
            return size;
        };
        if file_type.is_dir() {
            size.saturating_add(directory_size(&entry.path()))
        } else if file_type.is_file() {
            size.saturating_add(entry.metadata().map(|metadata| metadata.len()).unwrap_or(0))
        } else {
            size
        }
    })
}

fn read_manim_storage_info(
    app: &AppHandle,
    storage_path: Option<&str>,
) -> Result<ManimStorageInfo, String> {
    let path = manim_storage_dir(app, storage_path)?;
    let entries = fs::read_dir(&path).map_err(|error| error.to_string())?;
    let mut render_count = 0;
    let mut size_bytes: u64 = 0;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !is_manim_render_entry(&entry_path)
            || !entry
                .file_type()
                .map(|file_type| file_type.is_dir())
                .unwrap_or(false)
        {
            continue;
        }
        render_count += 1;
        size_bytes = size_bytes.saturating_add(directory_size(&entry_path));
    }
    Ok(ManimStorageInfo {
        path: path.to_string_lossy().into_owned(),
        size_bytes,
        render_count,
    })
}

#[tauri::command]
fn get_manim_storage_info(
    app: AppHandle,
    storage_path: Option<String>,
) -> Result<ManimStorageInfo, String> {
    read_manim_storage_info(&app, storage_path.as_deref())
}

#[tauri::command]
fn clear_manim_render_files(
    app: AppHandle,
    tasks: State<ManimTasks>,
    storage_path: Option<String>,
) -> Result<ManimStorageInfo, String> {
    if tasks
        .active
        .lock()
        .map_err(|_| "Manim task state is unavailable")?
        .is_some()
    {
        return Err("Cannot clear render files while Manim is rendering".into());
    }
    let path = manim_storage_dir(&app, storage_path.as_deref())?;
    for entry in fs::read_dir(&path)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let entry_path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if !file_type.is_dir() || !is_manim_render_entry(&entry_path) {
            continue;
        }
        fs::remove_dir_all(&entry_path).map_err(|error| error.to_string())?;
    }
    read_manim_storage_info(&app, storage_path.as_deref())
}

#[tauri::command]
fn open_manim_render_folder(app: AppHandle, storage_path: Option<String>) -> Result<(), String> {
    let path = manim_storage_dir(&app, storage_path.as_deref())?;
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer.exe");
        command.arg(&path);
        command.creation_flags(0x08000000);
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x08000000)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(pid: u32) {
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status();
}

fn inspect_python(program: &str, prefix_args: &[&str]) -> Result<PythonEnvironment, String> {
    let script = "import json,sys; print(json.dumps({'path':sys.executable,'version':sys.version.split()[0],'implementation':sys.implementation.name,'virtual_env':sys.prefix!=getattr(sys,'base_prefix',sys.prefix)}))";
    let mut command = Command::new(program);
    command
        .args(prefix_args)
        .args(["-X", "utf8", "-c", script])
        .env("PYTHONIOENCODING", "utf-8");
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("无法解析 Python 环境：{e}"))
}

#[tauri::command]
fn detect_python() -> Vec<PythonEnvironment> {
    let candidates: Vec<(&str, Vec<&str>)> =
        vec![("python", vec![]), ("python3", vec![]), ("py", vec!["-3"])];
    let mut environments = Vec::new();
    for (program, args) in candidates {
        if let Ok(environment) = inspect_python(program, &args) {
            if !environments
                .iter()
                .any(|item: &PythonEnvironment| item.path.eq_ignore_ascii_case(&environment.path))
            {
                environments.push(environment);
            }
        }
    }
    environments
}

#[tauri::command]
fn validate_python(path: String) -> Result<PythonEnvironment, String> {
    inspect_python(&path, &[])
}

#[tauri::command]
fn check_python_packages(
    python_path: Option<String>,
    packages: Vec<String>,
) -> Result<Vec<PythonPackageStatus>, String> {
    if packages.is_empty() {
        return Ok(Vec::new());
    }
    let script = r#"
import importlib.util, json, sys
packages = json.loads(sys.stdin.read())
result = []
for name in packages:
    candidates = [name, name.replace("-", "_")]
    installed = any(importlib.util.find_spec(candidate) is not None for candidate in candidates)
    result.append({"name": name, "installed": installed})
print(json.dumps(result))
"#;
    let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
    command
        .args(["-X", "utf8", "-c", script])
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot start Python: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(
                serde_json::to_string(&packages)
                    .map_err(|error| error.to_string())?
                    .as_bytes(),
            )
            .map_err(|error| error.to_string())?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("cannot parse Python package check: {error}"))
}

#[tauri::command]
fn install_python_packages(
    app: AppHandle,
    tasks: State<PackageInstallTasks>,
    python_path: Option<String>,
    packages: Vec<String>,
    index_url: Option<String>,
) -> Result<(), String> {
    let packages: Vec<String> = packages
        .into_iter()
        .map(|package| package.trim().to_owned())
        .filter(|package| !package.is_empty())
        .collect();
    if packages.is_empty() {
        return Ok(());
    }
    let mut active = tasks
        .active
        .lock()
        .map_err(|_| "package install task state is unavailable")?;
    if active.is_some() {
        return Err("已有依赖安装任务正在运行".into());
    }
    let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
    command
        .args([
            "-X",
            "utf8",
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--progress-bar",
            "off",
        ])
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(index_url) = index_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
    {
        if !index_url.starts_with("https://") {
            return Err("pip index url must start with https://".into());
        }
        command.args(["-i", index_url]);
    }
    command.args(&packages);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot start pip: {error}"))?;
    let pid = child.id();
    let stopped = Arc::new(AtomicBool::new(false));
    *active = Some(ActivePackageInstall {
        pid,
        stopped: stopped.clone(),
    });
    drop(active);
    if let Some(stdout) = child.stdout.take() {
        emit_package_reader(app.clone(), "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        emit_package_reader(app.clone(), "stderr", stderr);
    }
    let active_tasks = tasks.active.clone();
    thread::spawn(move || {
        let result = child.wait();
        let stopped_by_user = stopped.load(Ordering::SeqCst);
        if let Ok(mut active) = active_tasks.lock() {
            if active.as_ref().is_some_and(|task| task.pid == pid) {
                *active = None;
            }
        }
        let (success, error) = match result {
            Ok(status) if status.success() => (true, None),
            Ok(status) if stopped_by_user => (false, None),
            Ok(status) => (false, Some(format!("pip exited with status: {status}"))),
            Err(error) => (false, Some(error.to_string())),
        };
        let _ = app.emit(
            "package-install-finished",
            PackageInstallFinished {
                success,
                stopped: stopped_by_user,
                error,
                packages,
            },
        );
    });
    Ok(())
}

#[tauri::command]
fn stop_package_install(tasks: State<PackageInstallTasks>) -> Result<(), String> {
    let (pid, stopped) = {
        let mut active = tasks
            .active
            .lock()
            .map_err(|_| "package install task state is unavailable")?;
        match active.take() {
            Some(task) => (task.pid, task.stopped),
            None => return Ok(()),
        }
    };
    stopped.store(true, Ordering::SeqCst);
    kill_process_tree(pid);
    Ok(())
}

#[tauri::command]
fn discover_external_plugins(app: AppHandle) -> Result<ExternalPluginDiscoveryResponse, String> {
    let plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    fs::create_dir_all(&plugins_dir)
        .map_err(|error| format!("cannot create plugins directory: {error}"))?;
    let entries = discover_external_plugins_from_dir(&plugins_dir);
    Ok(ExternalPluginDiscoveryResponse {
        plugins_dir: plugins_dir.to_string_lossy().into_owned(),
        entries,
    })
}

#[tauri::command]
fn read_external_plugin_entry(
    app: AppHandle,
    plugin_path: String,
) -> Result<ExternalPluginEntry, String> {
    let plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    let plugins_dir = fs::canonicalize(&plugins_dir)
        .map_err(|error| format!("plugins directory is unavailable: {error}"))?;
    let plugin_dir = fs::canonicalize(&plugin_path)
        .map_err(|error| format!("plugin directory is unavailable: {error}"))?;
    if !plugin_dir.starts_with(&plugins_dir) {
        return Err("plugin directory is outside the plugins folder".into());
    }

    let manifest_path = plugin_dir.join("plugin.json");
    let manifest_value = serde_json::from_str::<Value>(
        &fs::read_to_string(&manifest_path)
            .map_err(|error| format!("cannot read plugin.json: {error}"))?,
    )
    .map_err(|error| format!("plugin.json is not valid JSON: {error}"))?;
    let manifest =
        validate_plugin_manifest_value(&manifest_value).map_err(|errors| errors.join("; "))?;
    let entry = manifest
        .entry
        .as_deref()
        .ok_or("entry must be provided for external plugins")?;
    let entry_path = plugin_dir.join(entry);
    let entry_path = fs::canonicalize(&entry_path)
        .map_err(|error| format!("plugin entry is unavailable: {error}"))?;
    if !entry_path.starts_with(&plugin_dir) {
        return Err("plugin entry is outside the plugin folder".into());
    }
    let source = fs::read_to_string(&entry_path)
        .map_err(|error| format!("cannot read plugin entry: {error}"))?;
    Ok(ExternalPluginEntry {
        path: plugin_dir.to_string_lossy().into_owned(),
        manifest,
        source,
    })
}

#[tauri::command]
fn install_external_plugin_zip(
    app: AppHandle,
    zip_path: String,
) -> Result<ExternalPluginDiscovery, String> {
    let plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    install_external_plugin_zip_file(Path::new(&zip_path), &plugins_dir)
}

#[tauri::command]
fn delete_external_plugin(app: AppHandle, plugin_path: String) -> Result<(), String> {
    let plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    delete_external_plugin_dir(Path::new(&plugin_path), &plugins_dir)
}

fn read_lsp_message<R: BufRead>(reader: &mut R) -> Result<Option<Value>, String> {
    let mut content_length = None;
    loop {
        let mut header = String::new();
        let read = reader.read_line(&mut header).map_err(|error| error.to_string())?;
        if read == 0 {
            return Ok(None);
        }
        let header = header.trim_end_matches(['\r', '\n']);
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                content_length = Some(
                    value
                        .trim()
                        .parse::<usize>()
                        .map_err(|_| "Pyright returned an invalid Content-Length header")?,
                );
            }
        }
    }
    let content_length = content_length.ok_or("Pyright response is missing Content-Length")?;
    let mut body = vec![0; content_length];
    reader.read_exact(&mut body).map_err(|error| error.to_string())?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|error| format!("Pyright returned invalid JSON: {error}"))
}

fn write_lsp_message(writer: &mut ChildStdin, message: &Value) -> Result<(), String> {
    let body = serde_json::to_vec(message).map_err(|error| error.to_string())?;
    writer
        .write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes())
        .and_then(|_| writer.write_all(&body))
        .and_then(|_| writer.flush())
        .map_err(|error| format!("无法向 Pyright 发送消息：{error}"))
}

fn find_pyright_server(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("VISUAL_PYTHON_PYRIGHT_SERVER") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    let current_dir = std::env::current_dir().unwrap_or_default();
    let resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let candidates = [
        current_dir.join("node_modules/pyright/langserver.index.js"),
        current_dir.join("../node_modules/pyright/langserver.index.js"),
        current_dir.join("../../node_modules/pyright/langserver.index.js"),
        resource_dir.join("language-server/pyright/langserver.index.js"),
    ];
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "找不到 Pyright 语言服务器，请先安装项目依赖".into())
}

fn find_node_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("VISUAL_PYTHON_NODE") {
        return Ok(PathBuf::from(path));
    }
    let resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let bundled = if cfg!(target_os = "windows") {
        resource_dir.join("language-server/node.exe")
    } else {
        resource_dir.join("language-server/node")
    };
    Ok(if bundled.is_file() {
        bundled
    } else {
        PathBuf::from("node")
    })
}

fn stop_pyright_process(active: &Arc<Mutex<Option<ActivePyrightProcess>>>) -> Result<(), String> {
    let mut process = active
        .lock()
        .map_err(|_| "Pyright process state is unavailable")?
        .take();
    if let Some(process) = process.as_mut() {
        let _ = process.child.kill();
        let _ = process.child.wait();
    }
    Ok(())
}

#[tauri::command]
fn start_pyright_language_server(
    app: AppHandle,
    state: State<PyrightState>,
    project_path: Option<String>,
) -> Result<PyrightStartInfo, String> {
    stop_pyright_process(&state.active)?;
    let fallback_root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("language-service/workspace");
    let project = project_path.as_deref().map(PathBuf::from);
    let root = project
        .as_deref()
        .and_then(Path::parent)
        .filter(|path| path.is_dir())
        .map(Path::to_path_buf)
        .unwrap_or(fallback_root);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let document_name = project
        .as_deref()
        .and_then(Path::file_stem)
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(|name| format!("{name}.py"))
        .unwrap_or_else(|| "main.py".into());
    let document_path = root.join(document_name);
    let root_uri = url::Url::from_directory_path(&root)
        .map_err(|_| "无法创建 Pyright 工作区 URI")?
        .to_string();
    let document_uri = url::Url::from_file_path(&document_path)
        .map_err(|_| "无法创建 Python 文档 URI")?
        .to_string();

    let server = find_pyright_server(&app)?;
    let node = find_node_runtime(&app)?;
    let mut command = Command::new(node);
    command
        .arg(server)
        .arg("--stdio")
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 Pyright：{error}"))?;
    let session_id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let pid = child.id();
    let stdin = child.stdin.take().ok_or("无法连接 Pyright 输入流")?;
    let stdout = child.stdout.take().ok_or("无法连接 Pyright 输出流")?;
    let stderr = child.stderr.take().ok_or("无法连接 Pyright 错误流")?;
    *state
        .active
        .lock()
        .map_err(|_| "Pyright process state is unavailable")? = Some(ActivePyrightProcess {
        id: session_id,
        pid,
        child,
        stdin,
    });

    let output_app = app.clone();
    let output_state = state.active.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_lsp_message(&mut reader) {
                Ok(Some(message)) => {
                    let _ = output_app.emit(
                        "pyright-message",
                        PyrightMessage {
                            session_id,
                            message,
                        },
                    );
                }
                Ok(None) => break,
                Err(error) => {
                    let _ = output_app.emit(
                        "pyright-status",
                        PyrightStatus {
                            session_id,
                            state: "error",
                            message: Some(error),
                        },
                    );
                    break;
                }
            }
        }
        if let Ok(mut active) = output_state.lock() {
            if active
                .as_ref()
                .is_some_and(|process| process.id == session_id && process.pid == pid)
            {
                if let Some(mut process) = active.take() {
                    let _ = process.child.wait();
                }
            }
        }
        let _ = output_app.emit(
            "pyright-status",
            PyrightStatus {
                session_id,
                state: "stopped",
                message: None,
            },
        );
    });
    let error_app = app.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            let message = line.trim().to_string();
            if !message.is_empty() {
                let _ = error_app.emit(
                    "pyright-status",
                    PyrightStatus {
                        session_id,
                        state: "log",
                        message: Some(message),
                    },
                );
            }
            line.clear();
        }
    });
    let _ = app.emit(
        "pyright-status",
        PyrightStatus {
            session_id,
            state: "started",
            message: None,
        },
    );
    Ok(PyrightStartInfo {
        session_id,
        root_uri,
        document_uri,
    })
}

#[tauri::command]
fn send_pyright_message(
    state: State<PyrightState>,
    session_id: u64,
    message: Value,
) -> Result<(), String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "Pyright process state is unavailable")?;
    let process = active.as_mut().ok_or("Pyright 尚未启动")?;
    if process.id != session_id {
        return Err("Pyright 会话已经失效".into());
    }
    write_lsp_message(&mut process.stdin, &message)
}

#[tauri::command]
fn stop_pyright_language_server(state: State<PyrightState>, session_id: u64) -> Result<(), String> {
    let matches = state
        .active
        .lock()
        .map_err(|_| "Pyright process state is unavailable")?
        .as_ref()
        .is_some_and(|process| process.id == session_id);
    if matches {
        stop_pyright_process(&state.active)?;
    }
    Ok(())
}

#[tauri::command]
fn validate_python_code(code: String, python_path: Option<String>) -> Result<(), String> {
    let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
    command
        .args([
            "-X",
            "utf8",
            "-c",
            "import sys; compile(sys.stdin.read(), '<visual-python>', 'exec')",
        ])
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动 Python：{e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(code.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
fn start_python(
    app: AppHandle,
    tasks: State<PythonTasks>,
    code: String,
    timeout_secs: Option<u64>,
    python_path: Option<String>,
) -> Result<u64, String> {
    let mut active = tasks
        .active
        .lock()
        .map_err(|_| "Python task state is unavailable")?;
    if active.is_some() {
        return Err("已有 Python 程序正在运行".into());
    }

    let task_id = tasks.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
    command
        .args(["-u", "-X", "utf8", "-c", &code])
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动 Python：{e}"))?;
    let pid = child.id();
    let stdin = child.stdin.take().ok_or("无法连接 Python 标准输入")?;
    *active = Some(ActivePythonTask {
        id: task_id,
        pid,
        stdin,
    });
    drop(active);

    if let Some(stdout) = child.stdout.take() {
        emit_reader(app.clone(), task_id, "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        emit_reader(app.clone(), task_id, "stderr", stderr);
    }

    let active_for_wait = tasks.active.clone();
    let timed_out_for_wait = tasks.timed_out.clone();
    let app_for_wait = app.clone();
    thread::spawn(move || {
        let exit_code = child
            .wait()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(-1);
        let mut active = active_for_wait.lock().ok();
        let was_active = active
            .as_ref()
            .and_then(|state| state.as_ref())
            .is_some_and(|task| task.id == task_id);
        if let Some(state) = active.as_mut() {
            if state.as_ref().is_some_and(|task| task.id == task_id) {
                **state = None;
            }
        }
        let timed_out = timed_out_for_wait
            .lock()
            .ok()
            .is_some_and(|mut tasks| tasks.remove(&task_id));
        let _ = app_for_wait.emit(
            "python-finished",
            PythonFinished {
                task_id,
                exit_code,
                stopped: !was_active && !timed_out,
                timed_out,
            },
        );
    });

    let timeout = timeout_secs.unwrap_or(60).clamp(1, 3600);
    let active_for_timeout = tasks.active.clone();
    let timed_out_tasks = tasks.timed_out.clone();
    let app_for_timeout = app;
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(timeout));
        let timed_out_pid = active_for_timeout.lock().ok().and_then(|active| {
            active
                .as_ref()
                .filter(|task| task.id == task_id)
                .map(|task| task.pid)
        });
        if let Some(pid) = timed_out_pid {
            let _ = app_for_timeout.emit(
                "python-output",
                PythonOutput {
                    task_id,
                    stream: "system",
                    data: format!("运行超过 {timeout} 秒，已终止。\n"),
                },
            );
            if let Ok(mut tasks) = timed_out_tasks.lock() {
                tasks.insert(task_id);
            }
            if let Ok(mut active) = active_for_timeout.lock() {
                *active = None;
            }
            kill_process_tree(pid);
        }
    });
    Ok(task_id)
}

#[tauri::command]
fn stop_python(tasks: State<PythonTasks>, task_id: u64) -> Result<(), String> {
    let pid = {
        let mut active = tasks
            .active
            .lock()
            .map_err(|_| "Python task state is unavailable")?;
        match active.as_ref() {
            Some(task) if task.id == task_id => {
                let pid = task.pid;
                *active = None;
                pid
            }
            _ => return Ok(()),
        }
    };
    kill_process_tree(pid);
    Ok(())
}

#[tauri::command]
fn render_manim(
    app: AppHandle,
    tasks: State<ManimTasks>,
    code: String,
    scene_name: String,
    python_path: Option<String>,
    render_config: Option<ManimRenderConfig>,
    storage_path: Option<String>,
) -> Result<(), String> {
    let mut active = tasks
        .active
        .lock()
        .map_err(|_| "Manim task state is unavailable")?;
    if active.is_some() {
        return Err("已有 Manim 渲染任务正在运行".into());
    }
    let scene_name = scene_name.trim().to_owned();
    if !scene_name
        .chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_alphabetic() || ch == '_')
        || !scene_name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        return Err("invalid Manim scene name".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let work_dir = manim_storage_dir(&app, storage_path.as_deref())?.join(format!("manim-{stamp}"));
    fs::create_dir_all(&work_dir)
        .map_err(|error| format!("cannot create Manim work directory: {error}"))?;
    let script_path = work_dir.join("scene.py");
    fs::write(&script_path, code)
        .map_err(|error| format!("cannot write Manim scene file: {error}"))?;

    let config = render_config.unwrap_or(ManimRenderConfig {
        quality: "low".into(),
        fps: 15,
        renderer: "cairo".into(),
        disable_caching: false,
    });
    let quality_flag = match config.quality.as_str() {
        "preview" | "low" => "-ql",
        "medium" => "-qm",
        "high" => "-qh",
        "four_k" => "-qk",
        _ => return Err("invalid Manim quality preset".into()),
    };
    if !matches!(config.fps, 15 | 30 | 60) {
        return Err("invalid Manim frame rate".into());
    }
    if !matches!(config.renderer.as_str(), "cairo" | "opengl") {
        return Err("invalid Manim renderer".into());
    }

    let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
    command
        .args(["-X", "utf8", "-m", "manim"])
        .arg(&script_path)
        .arg(&scene_name)
        .arg(quality_flag)
        .arg("--fps")
        .arg(config.fps.to_string())
        .arg("--renderer")
        .arg(&config.renderer)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if config.quality == "preview" {
        command.args(["--resolution", "640,360"]);
    }
    if config.renderer == "opengl" {
        command.arg("--write_to_movie");
    }
    if config.disable_caching {
        command.arg("--disable_caching");
    }
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot start Manim: {error}"))?;
    let pid = child.id();
    let stopped = Arc::new(AtomicBool::new(false));
    *active = Some(ActiveManimTask {
        pid,
        stopped: stopped.clone(),
    });
    drop(active);
    if let Some(stdout) = child.stdout.take() {
        emit_manim_reader(app.clone(), "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        emit_manim_reader(app.clone(), "stderr", stderr);
    }
    let work_dir_text = work_dir.to_string_lossy().into_owned();
    let active_tasks = tasks.active.clone();
    thread::spawn(move || {
        let result = child.wait();
        let stopped_by_user = stopped.load(Ordering::SeqCst);
        if let Ok(mut active) = active_tasks.lock() {
            if active.as_ref().is_some_and(|task| task.pid == pid) {
                *active = None;
            }
        }
        let (success, error) = match result {
            Ok(status) if status.success() => (true, None),
            Ok(_) if stopped_by_user => (false, None),
            Ok(status) => (false, Some(format!("Manim exited with status: {status}"))),
            Err(error) => (false, Some(error.to_string())),
        };
        let video_path = if success {
            find_latest_mp4(&work_dir).map(|path| path.to_string_lossy().into_owned())
        } else {
            None
        };
        let _ = app.emit(
            "manim-finished",
            ManimFinished {
                success,
                stopped: stopped_by_user,
                scene: scene_name,
                work_dir: work_dir_text,
                video_path,
                error,
            },
        );
    });
    Ok(())
}

#[tauri::command]
fn stop_manim_render(tasks: State<ManimTasks>) -> Result<(), String> {
    let (pid, stopped) = {
        let mut active = tasks
            .active
            .lock()
            .map_err(|_| "Manim task state is unavailable")?;
        match active.take() {
            Some(task) => (task.pid, task.stopped),
            None => return Ok(()),
        }
    };
    stopped.store(true, Ordering::SeqCst);
    kill_process_tree(pid);
    Ok(())
}

#[tauri::command]
fn open_system_video(path: String) -> Result<(), String> {
    let video_path = PathBuf::from(path);
    if !video_path.is_file() {
        return Err("视频文件不存在".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]).arg(&video_path);
        command.creation_flags(0x08000000);
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&video_path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&video_path)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn reveal_video_in_folder(path: String) -> Result<(), String> {
    let video_path = PathBuf::from(path);
    if !video_path.is_file() {
        return Err("视频文件不存在".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer.exe");
        command.arg(format!("/select,{}", video_path.to_string_lossy()));
        command.creation_flags(0x08000000);
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R"])
            .arg(&video_path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let folder = video_path.parent().ok_or("无法定位视频所在文件夹")?;
        Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn send_python_input(tasks: State<PythonTasks>, task_id: u64, input: String) -> Result<(), String> {
    let mut active = tasks
        .active
        .lock()
        .map_err(|_| "Python task state is unavailable")?;
    let task = active
        .as_mut()
        .filter(|task| task.id == task_id)
        .ok_or("Python 程序未在运行")?;
    task.stdin
        .write_all(input.as_bytes())
        .and_then(|_| task.stdin.write_all(b"\n"))
        .and_then(|_| task.stdin.flush())
        .map_err(|e| format!("无法发送输入：{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, arguments, current_dir| {
                let arguments = arguments.into_iter().map(OsString::from);
                if let Some(path) = vpy_project_from_args(arguments, Path::new(&current_dir)) {
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.unminimize();
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                    let _ = app.emit(
                        "open-project",
                        OpenProjectEvent {
                            path: path.to_string_lossy().into_owned(),
                        },
                    );
                }
            },
        ))
        .manage(PythonTasks::default())
        .manage(PackageInstallTasks::default())
        .manage(ManimTasks::default())
        .manage(PyrightState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let show_item =
                MenuItem::with_id(app, "tray-show", "显示 Visual Python", true, None::<&str>)?;
            let exit_item = MenuItem::with_id(app, "tray-exit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &exit_item])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            TrayIconBuilder::with_id("visual-python-tray")
                .icon(icon)
                .tooltip("Visual Python")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray-show" => {
                        let _ = show_main_window(app);
                    }
                    "tray-exit" => {
                        let _ = app.emit("tray-exit-requested", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        let _ = show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "splash" && matches!(payload.event(), PageLoadEvent::Finished) {
                let splash = webview.window();
                let _ = splash.show();
                let _ = splash.set_focus();
            }
        })
        .invoke_handler(tauri::generate_handler![
            finish_startup,
            get_startup_project,
            hide_main_window,
            restore_main_window,
            exit_application,
            detect_python,
            validate_python,
            check_python_packages,
            install_python_packages,
            stop_package_install,
            discover_external_plugins,
            read_external_plugin_entry,
            install_external_plugin_zip,
            delete_external_plugin,
            start_pyright_language_server,
            send_pyright_message,
            stop_pyright_language_server,
            validate_python_code,
            start_python,
            stop_python,
            render_manim,
            stop_manim_render,
            get_manim_storage_info,
            clear_manim_render_files,
            open_manim_render_folder,
            open_system_video,
            reveal_video_in_folder,
            send_python_input
        ])
        .run(tauri::generate_context!())
        .expect("error while running Visual Python");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use zip::write::SimpleFileOptions;

    #[test]
    fn recognizes_only_managed_manim_render_entries() {
        assert!(is_manim_render_entry(Path::new("manim-123456")));
        assert!(!is_manim_render_entry(Path::new("manim-notes")));
        assert!(!is_manim_render_entry(Path::new("manim-123-backup")));
        assert!(!is_manim_render_entry(Path::new("personal-videos")));
        assert!(!is_manim_render_entry(Path::new("manim")));
    }

    #[test]
    fn finds_existing_vpy_project_argument() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-file-open-test-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let project = root.join("demo.VPY");
        fs::write(&project, b"{}").unwrap();

        let found = vpy_project_from_args(
            [
                OsString::from("visual-python.exe"),
                project.clone().into_os_string(),
            ],
            &root,
        );

        assert_eq!(found, Some(project));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn validates_external_plugin_manifest() {
        let manifest = validate_plugin_manifest_value(&json!({
          "id": "visual-python.sample",
          "name": "Sample",
          "version": "1.2.3",
          "apiVersion": "1",
          "entry": "index.js",
          "python": { "packages": ["numpy"], "minimumVersion": "3.11" }
        }))
        .expect("valid manifest");

        assert_eq!(manifest.id, "visual-python.sample");
    }

    #[test]
    fn rejects_invalid_external_plugin_manifest() {
        let errors = validate_plugin_manifest_value(&json!({
          "id": "Visual Python",
          "name": "",
          "version": "1.0",
          "apiVersion": "999",
          "builtin": true
        }))
        .expect_err("invalid manifest");

        assert!(errors
            .iter()
            .any(|error| error.contains("invalid plugin id")));
        assert!(errors
            .iter()
            .any(|error| error.contains("plugin name cannot be empty")));
        assert!(errors
            .iter()
            .any(|error| error.contains("invalid plugin version")));
        assert!(errors
            .iter()
            .any(|error| error.contains("unsupported plugin API version")));
        assert!(errors.iter().any(|error| error.contains("builtin")));
    }

    #[test]
    fn discovers_external_plugin_directories() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-plugin-test-{suffix}"));
        fs::create_dir_all(root.join("valid")).unwrap();
        fs::create_dir_all(root.join("duplicate")).unwrap();
        fs::create_dir_all(root.join("missing")).unwrap();
        let manifest = r#"{"id":"visual-python.sample","name":"Sample","version":"1.0.0","apiVersion":"1","entry":"index.js"}"#;
        fs::write(root.join("valid").join("plugin.json"), manifest).unwrap();
        fs::write(root.join("duplicate").join("plugin.json"), manifest).unwrap();

        let entries = discover_external_plugins_from_dir(&root);
        fs::remove_dir_all(&root).unwrap();

        assert_eq!(entries.len(), 3);
        assert_eq!(
            entries
                .iter()
                .filter(|entry| entry
                    .manifest
                    .as_ref()
                    .is_some_and(|manifest| manifest.id == "visual-python.sample"))
                .count(),
            2
        );
        assert!(entries
            .iter()
            .filter(|entry| entry
                .manifest
                .as_ref()
                .is_some_and(|manifest| manifest.id == "visual-python.sample"))
            .all(|entry| !entry.valid));
        assert!(entries.iter().any(|entry| entry.path.ends_with("missing")
            && entry
                .errors
                .iter()
                .any(|error| error.contains("cannot read plugin.json"))));
    }

    #[test]
    fn installs_external_plugin_zip() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-plugin-install-test-{suffix}"));
        let zip_path = root.join("demo.zip");
        let plugins_dir = root.join("plugins");
        fs::create_dir_all(&root).unwrap();

        {
            let zip_file = fs::File::create(&zip_path).unwrap();
            let mut writer = zip::ZipWriter::new(zip_file);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("demo/plugin.json", options).unwrap();
            writer.write_all(br#"{"id":"visual-python.zip-demo","name":"Zip Demo","version":"1.0.0","apiVersion":"1","entry":"index.js"}"#).unwrap();
            writer.start_file("demo/index.js", options).unwrap();
            writer
                .write_all(b"export default { activate() {} };")
                .unwrap();
            writer.finish().unwrap();
        }

        let discovery =
            install_external_plugin_zip_file(&zip_path, &plugins_dir).expect("installed plugin");
        assert!(discovery.valid);
        assert_eq!(
            discovery.manifest.as_ref().unwrap().id,
            "visual-python.zip-demo"
        );
        assert!(plugins_dir
            .join("visual-python.zip-demo")
            .join("plugin.json")
            .exists());
        assert!(plugins_dir
            .join("visual-python.zip-demo")
            .join("index.js")
            .exists());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn deletes_external_plugin_directory() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-plugin-delete-test-{suffix}"));
        let plugins_dir = root.join("plugins");
        let plugin_dir = plugins_dir.join("visual-python.delete-demo");
        fs::create_dir_all(&plugin_dir).unwrap();
        fs::write(plugin_dir.join("plugin.json"), "{}").unwrap();

        delete_external_plugin_dir(&plugin_dir, &plugins_dir).expect("deleted plugin");
        assert!(!plugin_dir.exists());
        assert!(delete_external_plugin_dir(&plugins_dir, &plugins_dir).is_err());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn parses_language_server_protocol_message() {
        let body = br#"{"jsonrpc":"2.0","id":7,"result":{"items":[]}}"#;
        let framed = format!(
            "Content-Length: {}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n{}",
            body.len(),
            String::from_utf8_lossy(body)
        );
        let mut reader = std::io::Cursor::new(framed.into_bytes());
        let message = read_lsp_message(&mut reader).unwrap().unwrap();
        assert_eq!(message["id"], 7);
        assert!(message["result"]["items"].as_array().unwrap().is_empty());
    }

    #[test]
    fn rejects_language_server_message_without_length() {
        let mut reader = std::io::Cursor::new(b"Content-Type: application/json\r\n\r\n{}".to_vec());
        assert!(read_lsp_message(&mut reader).is_err());
    }
}
