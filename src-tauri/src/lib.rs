use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
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
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{Mutex as TokioMutex, Notify};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::{AUTHORIZATION, HeaderValue};
use tokio_tungstenite::tungstenite::Message;

mod codex_agent;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TtsConfig {
    provider: String,
    base_url: String,
    model: String,
    voice: String,
    speed: f32,
    audio_format: String,
    #[serde(default)]
    emotion: String,
    #[serde(default)]
    tone: String,
    #[serde(default)]
    intonation: String,
    #[serde(default)]
    reading_style: String,
    #[serde(default)]
    custom_instruction: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsPreviewResult {
    path: String,
    format: String,
    duration_seconds: f64,
    cached: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsVoiceOption {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceCloneResult {
    voice: String,
    target_model: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteClonedVoice {
    voice: String,
    target_model: String,
    language: String,
    created_at: String,
    modified_at: String,
}

#[derive(Deserialize)]
struct BailianUploadPolicy {
    upload_host: String,
    upload_dir: String,
    oss_access_key_id: String,
    signature: String,
    policy: String,
    x_oss_object_acl: String,
    x_oss_forbid_overwrite: String,
}

const BAILIAN_VOICE_CLONE_MODEL: &str = "qwen-audio-3.0-tts-plus";
const BAILIAN_VOICE_ENROLLMENT_MODEL: &str = "voice-enrollment";
const MAX_VOICE_SAMPLE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AiModelConfig {
    base_url: String,
    model: String,
    #[serde(default = "default_ai_protocol")]
    protocol: String,
}

fn default_ai_protocol() -> String {
    "auto".into()
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiToolFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiToolCall {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    function: AiToolFunctionCall,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiChatMessage {
    role: String,
    content: Option<String>,
    tool_call_id: Option<String>,
    tool_calls: Option<Vec<AiToolCall>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChatCompletionResult {
    content: String,
    tool_calls: Vec<AiToolCall>,
    model: String,
    truncated: bool,
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    total_tokens: Option<u64>,
    cached_tokens: Option<u64>,
    cache_creation_tokens: Option<u64>,
}

#[derive(Default)]
struct AiToolCallAccumulator {
    id: String,
    kind: String,
    name: String,
    arguments: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChatStreamEvent {
    request_id: String,
    channel: String,
    delta: String,
    tool_index: Option<usize>,
    tool_name: Option<String>,
}

#[derive(Clone)]
struct AiStreamTarget {
    app: AppHandle,
    request_id: String,
    cancellation: Arc<AiRequestCancellation>,
}

#[derive(Default)]
struct AiRequestCancellation {
    cancelled: AtomicBool,
    notify: Notify,
}

impl AiRequestCancellation {
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    async fn wait(&self) {
        if self.cancelled.load(Ordering::SeqCst) {
            return;
        }
        self.notify.notified().await;
    }
}

#[derive(Default)]
struct AiChatRequests {
    active: Mutex<HashMap<String, Arc<AiRequestCancellation>>>,
}

#[derive(Default)]
struct CodexAgentState {
    runtime: TokioMutex<Option<Arc<codex_agent::CodexAppServerRuntime>>>,
    config: TokioMutex<Option<AiModelConfig>>,
}

#[tauri::command]
async fn codex_agent_start(
    state: State<'_, CodexAgentState>,
    config: AiModelConfig,
) -> Result<(), String> {
    let base_url = validate_ai_base_url(&config.base_url)?;
    validate_ai_model_protocol(&config.protocol)?;
    let model = config.model.trim().to_string();
    if model.is_empty() || model.chars().count() > 200 {
        return Err("模型名称不能为空且不能超过 200 个字符".into());
    }
    let normalized = AiModelConfig {
        base_url: base_url.clone(),
        model: model.clone(),
        protocol: config.protocol.clone(),
    };
    let mut runtime = state.runtime.lock().await;
    let mut active_config = state.config.lock().await;
    if active_config.as_ref() == Some(&normalized)
        && runtime.as_ref().is_some_and(|current| current.is_usable())
    {
        return Ok(());
    }
    if let Some(previous) = runtime.take() {
        let _ = previous.shutdown().await;
    }
    let api_key = load_stored_ai_api_key(&base_url)?.or_else(|| ai_environment_api_key(&base_url));
    *runtime = Some(Arc::new(
        codex_agent::CodexAppServerRuntime::start(codex_agent::CodexAgentLaunchConfig {
            base_url,
            model,
            api_key,
        })
        .await?,
    ));
    *active_config = Some(normalized);
    Ok(())
}

#[tauri::command]
async fn codex_agent_request(
    state: State<'_, CodexAgentState>,
    request: Value,
) -> Result<Value, String> {
    let runtime = state
        .runtime
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Codex Agent 尚未启动".to_string())?;
    runtime.request_json(request).await
}

#[tauri::command]
async fn codex_agent_notify(
    state: State<'_, CodexAgentState>,
    notification: Value,
) -> Result<(), String> {
    let runtime = state
        .runtime
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Codex Agent 尚未启动".to_string())?;
    runtime.notify_json(notification).await
}

#[tauri::command]
async fn codex_agent_next_event(
    state: State<'_, CodexAgentState>,
) -> Result<Option<Value>, String> {
    let runtime = state
        .runtime
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Codex Agent 尚未启动".to_string())?;
    Ok(runtime.next_event_json().await)
}

#[tauri::command]
async fn codex_agent_respond_to_request(
    state: State<'_, CodexAgentState>,
    request_id: Value,
    result: Value,
) -> Result<(), String> {
    let request_id: codex_app_server_protocol::RequestId = serde_json::from_value(request_id)
        .map_err(|error| format!("Codex 宿主请求 ID 无效: {error}"))?;
    let runtime = state
        .runtime
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Codex Agent 尚未启动".to_string())?;
    runtime.resolve_server_request(request_id, result).await
}

#[tauri::command]
async fn codex_agent_reject_request(
    state: State<'_, CodexAgentState>,
    request_id: Value,
    code: i64,
    message: String,
    data: Option<Value>,
) -> Result<(), String> {
    let request_id: codex_app_server_protocol::RequestId = serde_json::from_value(request_id)
        .map_err(|error| format!("Codex 宿主请求 ID 无效: {error}"))?;
    let runtime = state
        .runtime
        .lock()
        .await
        .clone()
        .ok_or_else(|| "Codex Agent 尚未启动".to_string())?;
    runtime
        .reject_server_request(
            request_id,
            codex_app_server_protocol::JSONRPCErrorError {
                code,
                data,
                message,
            },
        )
        .await
}

#[tauri::command]
async fn codex_agent_shutdown(state: State<'_, CodexAgentState>) -> Result<(), String> {
    let runtime = state.runtime.lock().await.take();
    *state.config.lock().await = None;
    if let Some(runtime) = runtime {
        runtime.shutdown().await?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedProjectResource {
    id: String,
    r#type: String,
    path: String,
    original_name: String,
    size: u64,
    deduplicated: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExistingProjectResource {
    id: String,
    path: String,
    original_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectResourceStatus {
    path: String,
    exists: bool,
    size: u64,
}

fn transaction_stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn sibling_transaction_path(path: &Path, label: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or("Project path has no parent directory")?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    Ok(parent.join(format!(
        ".visual-python-{label}-{}-{name}",
        transaction_stamp()
    )))
}

fn validate_project_file_path(path: &Path) -> Result<(), String> {
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("vpy"))
    {
        return Err("Visual Python project path must end in .vpy".into());
    }
    if !path.parent().is_some_and(Path::is_dir) {
        return Err("Visual Python project directory does not exist".into());
    }
    Ok(())
}

fn replace_file_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    validate_project_file_path(path)?;
    let staged = sibling_transaction_path(path, "staged")?;
    let backup = sibling_transaction_path(path, "backup")?;
    fs::write(&staged, contents)
        .map_err(|error| format!("cannot stage Visual Python project: {error}"))?;
    let had_existing = path.is_file();
    if had_existing {
        if let Err(error) = fs::rename(path, &backup) {
            let _ = fs::remove_file(&staged);
            return Err(format!("cannot back up Visual Python project: {error}"));
        }
    }
    if let Err(error) = fs::rename(&staged, path) {
        if had_existing {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&staged);
        return Err(format!("cannot replace Visual Python project: {error}"));
    }
    if had_existing {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn update_project_resources<F>(project_path: &Path, update: F) -> Result<(), String>
where
    F: FnOnce(&mut Vec<Value>) -> Result<(), String>,
{
    let source = fs::read_to_string(project_path)
        .map_err(|error| format!("cannot read Visual Python project: {error}"))?;
    let mut project: Value = serde_json::from_str(&source)
        .map_err(|error| format!("Visual Python project is not valid JSON: {error}"))?;
    let object = project
        .as_object_mut()
        .ok_or("Visual Python project root must be an object")?;
    let resources = object
        .entry("resources")
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or("Visual Python project resources must be an array")?;
    update(resources)?;
    let contents = serde_json::to_vec_pretty(&project)
        .map_err(|error| format!("cannot serialize Visual Python project: {error}"))?;
    replace_file_atomically(project_path, &contents)
}

fn imported_resource_value(resource: &ImportedProjectResource) -> Value {
    serde_json::json!({
        "id": resource.id,
        "type": resource.r#type,
        "path": resource.path,
        "originalName": resource.original_name,
        "size": resource.size,
    })
}

fn value_contains_string(value: &Value, needle: &str) -> bool {
    match value {
        Value::String(text) => text == needle,
        Value::Array(items) => items.iter().any(|item| value_contains_string(item, needle)),
        Value::Object(object) => object
            .values()
            .any(|item| value_contains_string(item, needle)),
        _ => false,
    }
}

fn saved_project_uses_resource(project_path: &Path, resource_path: &str) -> Result<bool, String> {
    let source = fs::read_to_string(project_path)
        .map_err(|error| format!("cannot read Visual Python project: {error}"))?;
    let project: Value = serde_json::from_str(&source)
        .map_err(|error| format!("Visual Python project is not valid JSON: {error}"))?;
    let resource_id = project
        .get("resources")
        .and_then(Value::as_array)
        .and_then(|resources| {
            resources.iter().find_map(|value| {
                (value.get("path").and_then(Value::as_str) == Some(resource_path))
                    .then(|| value.get("id").and_then(Value::as_str))
                    .flatten()
            })
        });
    Ok(resource_id.is_some_and(|id| {
        project
            .get("workspace")
            .is_some_and(|workspace| value_contains_string(workspace, &format!("resource://{id}")))
    }))
}

#[tauri::command]
fn file_sha256(path: &Path) -> Result<[u8; 32], String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(digest.finalize().into())
}

#[tauri::command]
fn import_project_audio(
    app: AppHandle,
    project_path: String,
    source_path: String,
    existing_resources: Vec<ExistingProjectResource>,
) -> Result<ImportedProjectResource, String> {
    let project = PathBuf::from(&project_path);
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("Selected audio file does not exist".to_string());
    }
    let project_stem = project
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project path")?;
    let project_dir = project.parent().ok_or("Invalid project directory")?;
    let audio_dir = project_dir
        .join(format!("{project_stem}.assets"))
        .join("audio");
    fs::create_dir_all(&audio_dir).map_err(|error| error.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(&audio_dir, true)
        .map_err(|error| error.to_string())?;

    let original_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid audio file name")?
        .to_string();
    let source_hash = file_sha256(&source)?;
    for resource in existing_resources {
        let existing_path = project_resource_path(&project_path, &resource.path)?;
        if existing_path.is_file()
            && file_sha256(&existing_path).is_ok_and(|hash| hash == source_hash)
        {
            let size = fs::metadata(existing_path)
                .map_err(|error| error.to_string())?
                .len();
            return Ok(ImportedProjectResource {
                id: resource.id,
                r#type: "audio".to_string(),
                path: resource.path,
                original_name: resource.original_name,
                size,
                deduplicated: true,
            });
        }
    }
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("audio");
    let extension = source.extension().and_then(|value| value.to_str());
    let mut file_name = original_name.clone();
    let mut index = 2_u32;
    while audio_dir.join(&file_name).exists() {
        file_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        index += 1;
    }
    let destination = audio_dir.join(&file_name);
    let size = fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let id = format!("audio-{timestamp:x}");
    let resource = ImportedProjectResource {
        id,
        r#type: "audio".to_string(),
        path: format!("audio/{file_name}"),
        original_name,
        size,
        deduplicated: false,
    };
    if let Err(error) = update_project_resources(&project, |resources| {
        resources.push(imported_resource_value(&resource));
        Ok(())
    }) {
        let _ = fs::remove_file(&destination);
        return Err(error);
    }
    Ok(resource)
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory_recursive(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn paths_equal_for_platform(left: &Path, right: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(target_os = "windows"))]
    {
        left == right
    }
}

fn rename_path_case_aware(source: &Path, destination: &Path) -> Result<(), String> {
    if source == destination {
        return Ok(());
    }
    if paths_equal_for_platform(source, destination) {
        let temporary = sibling_transaction_path(source, "case-rename")?;
        fs::rename(source, &temporary).map_err(|error| error.to_string())?;
        if let Err(error) = fs::rename(&temporary, destination) {
            let _ = fs::rename(&temporary, source);
            return Err(error.to_string());
        }
        return Ok(());
    }
    fs::rename(source, destination).map_err(|error| error.to_string())
}

fn project_assets_path(project: &Path) -> Result<PathBuf, String> {
    let stem = project
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project path")?;
    Ok(project
        .parent()
        .ok_or("Invalid project directory")?
        .join(format!("{stem}.assets")))
}

#[tauri::command]
fn read_project_file(project_path: String) -> Result<String, String> {
    let path = Path::new(&project_path);
    validate_project_file_path(path)?;
    if !path.is_file() {
        return Err("Visual Python project file does not exist".into());
    }
    fs::read_to_string(path).map_err(|error| format!("cannot read Visual Python project: {error}"))
}

#[tauri::command]
fn write_project_file(project_path: String, contents: String) -> Result<(), String> {
    replace_file_atomically(Path::new(&project_path), contents.as_bytes())
}

#[tauri::command]
fn save_project_as(
    source_project_path: Option<String>,
    destination_project_path: String,
    contents: String,
) -> Result<(), String> {
    let destination = PathBuf::from(destination_project_path);
    validate_project_file_path(&destination)?;
    let source = source_project_path.as_deref().map(PathBuf::from);
    if source
        .as_ref()
        .is_some_and(|path| paths_equal_for_platform(path, &destination))
    {
        return replace_file_atomically(&destination, contents.as_bytes());
    }

    let staged_project = sibling_transaction_path(&destination, "save-as-project")?;
    let backup_project = sibling_transaction_path(&destination, "save-as-project-backup")?;
    fs::write(&staged_project, contents.as_bytes())
        .map_err(|error| format!("cannot stage Visual Python project: {error}"))?;

    let destination_assets = project_assets_path(&destination)?;
    let staged_assets = sibling_transaction_path(&destination_assets, "save-as-assets")?;
    let backup_assets = sibling_transaction_path(&destination_assets, "save-as-assets-backup")?;
    let source_assets = source.as_deref().map(project_assets_path).transpose()?;
    let has_staged_assets = source_assets.as_ref().is_some_and(|path| path.is_dir());
    if has_staged_assets {
        if let Err(error) =
            copy_directory_recursive(source_assets.as_ref().unwrap(), &staged_assets)
        {
            let _ = fs::remove_file(&staged_project);
            let _ = fs::remove_dir_all(&staged_assets);
            return Err(error);
        }
    }
    if destination_assets.exists() && !destination_assets.is_dir() {
        let _ = fs::remove_file(&staged_project);
        let _ = fs::remove_dir_all(&staged_assets);
        return Err("destination project resources path is not a directory".into());
    }

    let had_project = destination.is_file();
    let had_assets = destination_assets.is_dir();
    if had_project {
        if let Err(error) = fs::rename(&destination, &backup_project) {
            let _ = fs::remove_file(&staged_project);
            let _ = fs::remove_dir_all(&staged_assets);
            return Err(format!("cannot back up destination project: {error}"));
        }
    }
    if had_assets {
        if let Err(error) = fs::rename(&destination_assets, &backup_assets) {
            if had_project {
                let _ = fs::rename(&backup_project, &destination);
            }
            let _ = fs::remove_file(&staged_project);
            let _ = fs::remove_dir_all(&staged_assets);
            return Err(format!(
                "cannot back up destination project resources: {error}"
            ));
        }
    }

    let commit = (|| -> Result<(), String> {
        if has_staged_assets {
            fs::rename(&staged_assets, &destination_assets)
                .map_err(|error| format!("cannot install project resources: {error}"))?;
        }
        fs::rename(&staged_project, &destination)
            .map_err(|error| format!("cannot install Visual Python project: {error}"))?;
        Ok(())
    })();
    if let Err(error) = commit {
        if destination.is_file() {
            let _ = fs::remove_file(&destination);
        }
        if destination_assets.is_dir() {
            let _ = fs::remove_dir_all(&destination_assets);
        }
        if had_project {
            let _ = fs::rename(&backup_project, &destination);
        }
        if had_assets {
            let _ = fs::rename(&backup_assets, &destination_assets);
        }
        let _ = fs::remove_file(&staged_project);
        let _ = fs::remove_dir_all(&staged_assets);
        return Err(error);
    }
    if had_project {
        let _ = fs::remove_file(backup_project);
    }
    if had_assets {
        let _ = fs::remove_dir_all(backup_assets);
    }
    Ok(())
}

fn project_resource_path(project_path: &str, resource_path: &str) -> Result<PathBuf, String> {
    let project = PathBuf::from(project_path);
    let stem = project
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project path")?;
    let relative = Path::new(resource_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("Invalid project resource path".to_string());
    }
    Ok(project
        .parent()
        .ok_or("Invalid project directory")?
        .join(format!("{stem}.assets"))
        .join(relative))
}

fn allow_project_resource_directory(app: &AppHandle, project_path: &str) -> Result<(), String> {
    let project = PathBuf::from(project_path);
    let stem = project
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project path")?;
    let assets = project
        .parent()
        .ok_or("Invalid project directory")?
        .join(format!("{stem}.assets"));
    if assets.is_dir() {
        app.asset_protocol_scope()
            .allow_directory(&assets, true)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn replace_project_audio(
    app: AppHandle,
    project_path: String,
    resource_path: String,
    source_path: String,
) -> Result<ImportedProjectResource, String> {
    let project = PathBuf::from(&project_path);
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("Selected audio file does not exist".to_string());
    }
    let original_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid audio file name")?
        .to_string();
    let destination = project_resource_path(&project_path, &resource_path)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    allow_project_resource_directory(&app, &project_path)?;
    let same_file = source
        .canonicalize()
        .ok()
        .zip(destination.canonicalize().ok())
        .is_some_and(|(left, right)| left == right);
    let backup = sibling_transaction_path(&destination, "resource-backup")?;
    let staged = sibling_transaction_path(&destination, "resource-staged")?;
    let had_existing = destination.is_file();
    let size = if same_file {
        fs::metadata(&source)
            .map_err(|error| error.to_string())?
            .len()
    } else {
        fs::copy(&source, &staged).map_err(|error| error.to_string())?;
        if had_existing {
            if let Err(error) = fs::rename(&destination, &backup) {
                let _ = fs::remove_file(&staged);
                return Err(error.to_string());
            }
        }
        if let Err(error) = fs::rename(&staged, &destination) {
            if had_existing {
                let _ = fs::rename(&backup, &destination);
            }
            let _ = fs::remove_file(&staged);
            return Err(error.to_string());
        }
        match fs::metadata(&destination) {
            Ok(metadata) => metadata.len(),
            Err(error) => {
                let _ = fs::remove_file(&destination);
                if had_existing {
                    let _ = fs::rename(&backup, &destination);
                }
                return Err(error.to_string());
            }
        }
    };
    let resource = ImportedProjectResource {
        id: String::new(),
        r#type: "audio".to_string(),
        path: resource_path.clone(),
        original_name,
        size,
        deduplicated: false,
    };
    if let Err(error) = update_project_resources(&project, |resources| {
        let Some(existing) = resources.iter_mut().find(|value| {
            value.get("path").and_then(Value::as_str) == Some(resource_path.as_str())
        }) else {
            return Err("Project resource metadata does not exist".into());
        };
        existing["originalName"] = Value::String(resource.original_name.clone());
        existing["size"] = Value::Number(resource.size.into());
        Ok(())
    }) {
        if !same_file {
            let _ = fs::remove_file(&destination);
            if had_existing {
                let _ = fs::rename(&backup, &destination);
            }
        }
        return Err(error);
    }
    if had_existing && !same_file {
        let _ = fs::remove_file(backup);
    }
    Ok(resource)
}

#[tauri::command]
fn inspect_project_resources(
    app: AppHandle,
    project_path: String,
    resource_paths: Vec<String>,
) -> Result<Vec<ProjectResourceStatus>, String> {
    allow_project_resource_directory(&app, &project_path)?;
    resource_paths
        .into_iter()
        .map(|resource_path| {
            let path = project_resource_path(&project_path, &resource_path)?;
            let metadata = fs::metadata(path)
                .ok()
                .filter(|metadata| metadata.is_file());
            Ok(ProjectResourceStatus {
                path: resource_path,
                exists: metadata.is_some(),
                size: metadata.map(|value| value.len()).unwrap_or(0),
            })
        })
        .collect()
}

#[tauri::command]
fn delete_project_resource(project_path: String, resource_path: String) -> Result<(), String> {
    let project = PathBuf::from(&project_path);
    if saved_project_uses_resource(&project, &resource_path)? {
        return Err("请先保存已移除资源引用的工程，再重试".into());
    }
    let path = project_resource_path(&project_path, &resource_path)?;
    let backup = sibling_transaction_path(&path, "resource-deleted")?;
    if path.is_file() {
        fs::rename(&path, &backup).map_err(|error| error.to_string())?;
    }
    if let Err(error) = update_project_resources(&project, |resources| {
        resources.retain(|value| {
            value.get("path").and_then(Value::as_str) != Some(resource_path.as_str())
        });
        Ok(())
    }) {
        if backup.is_file() {
            let _ = fs::rename(&backup, &path);
        }
        return Err(error);
    }
    if backup.is_file() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

#[tauri::command]
fn reveal_project_resource(project_path: String, resource_path: String) -> Result<(), String> {
    let path = project_resource_path(&project_path, &resource_path)?;
    if !path.is_file() {
        return Err("Project resource does not exist".to_string());
    }
    reveal_video_in_folder(path.to_string_lossy().into_owned())
}

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
    task_id: u64,
    stream: &'static str,
    data: String,
}

#[derive(Clone, Serialize)]
struct ManimFinished {
    task_id: u64,
    success: bool,
    stopped: bool,
    scene: String,
    work_dir: String,
    output_type: String,
    transparent_background: bool,
    played_animation_count: Option<u32>,
    output_path: Option<String>,
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
#[serde(rename_all = "camelCase")]
struct TtsCacheInfo {
    path: String,
    size_bytes: u64,
    clip_count: u64,
}

#[derive(Clone, Serialize)]
struct OpenProjectEvent {
    path: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManimRenderConfig {
    #[serde(default = "default_manim_output_type")]
    output_type: String,
    #[serde(default)]
    transparent_background: bool,
    #[serde(default = "default_manim_image_size_mode")]
    image_size_mode: String,
    #[serde(default = "default_manim_image_width")]
    image_width: u16,
    #[serde(default = "default_manim_image_height")]
    image_height: u16,
    #[serde(default = "default_manim_image_capture_mode")]
    image_capture_mode: String,
    #[serde(default = "default_manim_image_animation_step")]
    image_animation_step: u16,
    quality: String,
    fps: u16,
    renderer: String,
    disable_caching: bool,
}

fn default_manim_output_type() -> String {
    "video".into()
}

fn default_manim_image_size_mode() -> String {
    "preset".into()
}

fn default_manim_image_width() -> u16 {
    1920
}

fn default_manim_image_height() -> u16 {
    1080
}

fn default_manim_image_capture_mode() -> String {
    "final".into()
}

fn default_manim_image_animation_step() -> u16 {
    1
}

fn manim_output_flags(
    output_type: &str,
    renderer: &str,
    transparent_background: bool,
) -> Vec<&'static str> {
    if output_type == "image" {
        let mut flags = vec!["--save_last_frame"];
        if transparent_background {
            flags.push("--transparent");
        }
        flags
    } else if renderer == "opengl" {
        vec!["--write_to_movie"]
    } else {
        Vec::new()
    }
}

fn manim_video_needs_frame(code: &str) -> bool {
    code.lines().any(|line| {
        let line = line.trim_start();
        !line.starts_with('#') && line.starts_with("def construct")
    }) && !code.lines().any(|line| {
        let line = line.trim_start();
        !line.starts_with('#') && (line.contains(".play(") || line.contains(".wait("))
    })
}

fn prepare_manim_video_code(code: &str, scene_name: &str) -> String {
    if !manim_video_needs_frame(code) {
        return code.to_owned();
    }
    format!(
        "{code}\n\n# Visual Python keeps static scenes exportable as MP4.\n_visual_python_original_construct = {scene_name}.construct\n\ndef _visual_python_construct_with_frame(self):\n    _visual_python_original_construct(self)\n    self.wait(0.1)\n\n{scene_name}.construct = _visual_python_construct_with_frame\n"
    )
}

fn manim_resolution_override(
    output_type: &str,
    image_size_mode: &str,
    image_width: u16,
    image_height: u16,
    quality: &str,
) -> Option<String> {
    if output_type == "image" && image_size_mode == "custom" {
        Some(format!("{image_width},{image_height}"))
    } else if quality == "preview" {
        Some("640,360".into())
    } else {
        None
    }
}

fn manim_image_animation_range(
    output_type: &str,
    image_capture_mode: &str,
    image_animation_step: u16,
) -> Option<String> {
    (output_type == "image" && image_capture_mode == "animation")
        .then(|| format!("0,{}", image_animation_step.saturating_sub(1)))
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

fn validate_tts_url(value: &str) -> Result<String, String> {
    let value = value.trim().trim_end_matches('/');
    if value.is_empty() {
        return Err("尚未配置配音接口地址，请在 Manim 设置的视频配音中填写接口地址".into());
    }
    if value.chars().count() > 1000 {
        return Err("配音接口地址不能超过 1000 个字符".into());
    }
    Ok(value.to_string())
}

fn is_http_tts_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn is_websocket_tts_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("ws://") || lower.starts_with("wss://")
}

fn bailian_http_base_url(base_url: &str) -> String {
    if is_http_tts_url(base_url) {
        return base_url.to_string();
    }
    if let Ok(parsed) = url::Url::parse(base_url) {
        if matches!(parsed.scheme(), "ws" | "wss") {
            if let Some(host) = parsed.host_str() {
                let scheme = if parsed.scheme() == "wss" { "https" } else { "http" };
                let port = parsed.port().map(|port| format!(":{port}")).unwrap_or_default();
                return format!("{scheme}://{host}{port}");
            }
        }
    }
    base_url.to_string()
}

fn resolve_bailian_voice<'a>(model: &'a str, voice: &'a str) -> &'a str {
    match (model, voice) {
        ("qwen-audio-3.0-tts-plus", "longanlingxi") => "longanlingxin",
        (_, "longanhuan_v3") => "longanhuan_v3.6",
        (_, "longjielidou_v3") => "longjielidou_v3.6",
        (_, "longpaopao_v3") => "longpaopao_v3.6",
        (_, "longhuohuo_v3") => "longhuohuo_v3.6",
        (_, "longchuanshu_v3") => "longchuanshu_v3.6",
        (_, "loongeva_v3") => "loongeva_v3.6",
        _ => voice,
    }
}

fn tts_websocket_task_id() -> String {
    let value = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!(
        "{:08x}-{:04x}-4{:03x}-8{:03x}-{:012x}",
        (value >> 96) as u32,
        (value >> 80) as u16,
        (value >> 64) as u16 & 0x0fff,
        (value >> 48) as u16 & 0x0fff,
        value as u64 & 0x0000_ffffffffffff
    )
}

fn tts_model_supports_instruction(model: &str) -> bool {
    let model = model.to_ascii_lowercase();
    model.contains("plus") || model.contains("instruct")
}

fn bailian_websocket_envelope(action: &str, task_id: &str, payload: Value) -> Value {
    serde_json::json!({
        "header": {
            "action": action,
            "task_id": task_id,
            "streaming": "duplex"
        },
        "payload": payload
    })
}

fn bailian_websocket_run_task(
    task_id: &str,
    model: &str,
    voice: &str,
    format: &str,
    speed: f32,
    instruction: Option<&str>,
) -> Value {
    let mut parameters = serde_json::json!({
        "text_type": "PlainText",
        "voice": voice,
        "format": format,
        "sample_rate": 24000,
        "rate": speed
    });
    if tts_model_supports_instruction(model) {
        if let Some(instruction) = instruction.filter(|value| !value.is_empty()) {
            parameters["instruction"] = Value::String(instruction.to_string());
        }
    }
    bailian_websocket_envelope(
        "run-task",
        task_id,
        serde_json::json!({
            "task_group": "audio",
            "task": "tts",
            "function": "SpeechSynthesizer",
            "model": model,
            "parameters": parameters,
            "input": {}
        }),
    )
}

fn bailian_websocket_continue_task(task_id: &str, text: &str) -> Value {
    bailian_websocket_envelope(
        "continue-task",
        task_id,
        serde_json::json!({ "input": { "text": text } }),
    )
}

fn bailian_websocket_finish_task(task_id: &str) -> Value {
    bailian_websocket_envelope("finish-task", task_id, serde_json::json!({ "input": {} }))
}

fn bailian_websocket_event_name(payload: &Value) -> &str {
    payload
        .get("header")
        .and_then(|header| header.get("event"))
        .and_then(Value::as_str)
        .unwrap_or_default()
}

fn bailian_websocket_error_message(payload: &Value) -> String {
    let message = payload
        .get("header")
        .and_then(|header| {
            header
                .get("error_message")
                .or_else(|| header.get("errorMessage"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            payload
                .get("payload")
                .and_then(|body| body.get("message").or_else(|| body.get("error")))
                .and_then(Value::as_str)
        })
        .unwrap_or("配音任务失败")
        .to_string();
    if message.contains("411") || message.to_ascii_lowercase().contains("speak operation failed") {
        return format!("{message}。请确认音色属于当前模型：Flash 只能用该模型系统音色，Plus 复刻音色不能用在 Flash 上。");
    }
    message
}

async fn send_bailian_websocket_json(
    sink: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    payload: &Value,
) -> Result<(), String> {
    sink.send(Message::text(payload.to_string()))
        .await
        .map_err(|error| format!("发送配音任务失败：{error}"))
}

async fn synthesize_bailian_websocket_tts(
    url: &str,
    api_key: &str,
    model: &str,
    voice: &str,
    text: &str,
    format: &str,
    speed: f32,
    instruction: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut request = url
        .into_client_request()
        .map_err(|error| format!("配音地址无效：{error}"))?;
    let authorization = format!("bearer {api_key}");
    let headers = request.headers_mut();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&authorization).map_err(|_| "API Key 无效".to_string())?,
    );
    headers.insert(
        "X-DashScope-DataInspection",
        HeaderValue::from_static("enable"),
    );
    if let Ok(user_agent) = HeaderValue::from_str("visual-python/0.1.0") {
        headers.insert("user-agent", user_agent);
    }
    let (stream, _) = tokio::time::timeout(
        Duration::from_secs(20),
        tokio_tungstenite::connect_async(request),
    )
    .await
    .map_err(|_| "配音 WebSocket 连接超时".to_string())?
    .map_err(|error| format!("配音 WebSocket 连接失败：{error}"))?;
    let (mut sink, mut incoming) = stream.split();
    let task_id = tts_websocket_task_id();
    send_bailian_websocket_json(
        &mut sink,
        &bailian_websocket_run_task(&task_id, model, voice, format, speed, instruction),
    )
    .await?;

    let mut audio = Vec::new();
    let mut started = false;
    loop {
        let message = tokio::time::timeout(Duration::from_secs(90), incoming.next())
            .await
            .map_err(|_| "配音 WebSocket 等待超时".to_string())?
            .ok_or_else(|| "配音 WebSocket 已关闭".to_string())?
            .map_err(|error| format!("读取配音数据失败：{error}"))?;
        match message {
            Message::Binary(data) => audio.extend_from_slice(data.as_ref()),
            Message::Ping(payload) => {
                sink.send(Message::Pong(payload))
                    .await
                    .map_err(|error| format!("配音心跳响应失败：{error}"))?;
            }
            Message::Close(_) => break,
            Message::Text(payload) => {
                let event: Value = serde_json::from_str(&payload.to_string())
                    .map_err(|_| "配音服务返回了无效的任务事件".to_string())?;
                match bailian_websocket_event_name(&event) {
                    "task-started" if !started => {
                        started = true;
                        send_bailian_websocket_json(
                            &mut sink,
                            &bailian_websocket_continue_task(&task_id, text),
                        )
                        .await?;
                        send_bailian_websocket_json(
                            &mut sink,
                            &bailian_websocket_finish_task(&task_id),
                        )
                        .await?;
                    }
                    "task-finished" => break,
                    "task-failed" => {
                        return Err(format!(
                            "百炼配音失败：{}",
                            bailian_websocket_error_message(&event)
                        ));
                    }
                    _ => {
                        if let Some(data) = find_audio_base64(&event) {
                            let encoded = data.rsplit_once(',').map(|(_, value)| value).unwrap_or(data);
                            if let Ok(bytes) =
                                base64::engine::general_purpose::STANDARD.decode(encoded)
                            {
                                audio.extend_from_slice(&bytes);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    if audio.is_empty() {
        return Err("配音服务没有返回音频数据".into());
    }
    Ok(audio)
}

fn openai_speech_endpoint(base_url: &str) -> String {
    let lower = base_url.to_ascii_lowercase();
    if lower.ends_with("/audio/speech") {
        base_url.to_string()
    } else if lower.ends_with("/chat/completions") {
        format!(
            "{}/audio/speech",
            &base_url[..base_url.len() - "/chat/completions".len()]
        )
    } else if lower.ends_with("/v1") {
        format!("{base_url}/audio/speech")
    } else {
        format!("{base_url}/v1/audio/speech")
    }
}

fn openai_chat_endpoint(base_url: &str) -> String {
    let lower = base_url.to_ascii_lowercase();
    if lower.ends_with("/chat/completions") {
        base_url.to_string()
    } else if lower.ends_with("/audio/speech") {
        format!(
            "{}/chat/completions",
            &base_url[..base_url.len() - "/audio/speech".len()]
        )
    } else if lower.ends_with("/v1") {
        format!("{base_url}/chat/completions")
    } else {
        format!("{base_url}/v1/chat/completions")
    }
}

fn openai_responses_endpoint(base_url: &str) -> String {
    let lower = base_url.to_ascii_lowercase();
    if lower.ends_with("/responses") {
        base_url.to_string()
    } else if lower.ends_with("/v1") {
        format!("{base_url}/responses")
    } else {
        format!("{base_url}/v1/responses")
    }
}

fn responses_connection_request_body(model: &str, profile: AiReasoningProfile) -> Value {
    let mut body = serde_json::json!({
        "model": model,
        "input": "请仅回复：连接成功",
        "max_output_tokens": 512,
        "stream": false
    });
    apply_ai_reasoning_controls(&mut body, Some("high"), profile, true)
        .expect("default reasoning controls are valid");
    body
}

fn should_retry_responses_connection(attempt: usize, content: Option<&str>) -> bool {
    attempt == 0 && content.is_none()
}

fn responses_message_content(payload: &Value) -> Option<String> {
    if let Some(text) = payload.get("output_text").and_then(Value::as_str) {
        let text = text.trim();
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }
    let mut content = String::new();
    if let Some(output) = payload.get("output").and_then(Value::as_array) {
        for item in output {
            let Some(parts) = item.get("content").and_then(Value::as_array) else {
                continue;
            };
            for part in parts {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    content.push_str(text);
                }
            }
        }
    }
    let content = content.trim();
    (!content.is_empty()).then(|| content.to_string())
}

fn is_responses_endpoint_unsupported(status: u16, body: &str) -> bool {
    if status == 404 || status == 405 {
        return true;
    }
    let lower = body.to_ascii_lowercase();
    lower.contains("http 404")
        || lower.contains("http 405")
        || lower.contains("not support")
        || lower.contains("unsupported")
        || lower.contains("not implemented")
        || (lower.contains("responses") && lower.contains("not found"))
}

fn should_fallback_responses_probe_to_chat(error: &str) -> bool {
    is_responses_endpoint_unsupported(0, error)
        || ai_reasoning_error_kind(400, error).is_some()
        || error.contains("关闭思考")
        || error.contains("始终思考")
}

fn uses_openai_chat_audio(base_url: &str) -> bool {
    let lower = base_url.to_ascii_lowercase();
    lower.ends_with("/chat/completions")
        || (lower.contains(".maas.aliyuncs.com/") && lower.contains("/compatible-mode/v1"))
}

fn bailian_speech_endpoint(base_url: &str) -> String {
    if !is_http_tts_url(base_url) {
        return base_url.to_string();
    }
    let lower = base_url.to_ascii_lowercase();
    if lower.ends_with("/speechsynthesizer") {
        base_url.to_string()
    } else if lower.ends_with("/api/v1") {
        format!("{base_url}/services/audio/tts/SpeechSynthesizer")
    } else {
        format!("{base_url}/api/v1/services/audio/tts/SpeechSynthesizer")
    }
}

fn bailian_api_endpoint(base_url: &str, service_path: &str) -> String {
    let base_url = bailian_http_base_url(base_url);
    let lower = base_url.to_ascii_lowercase();
    if let Some(index) = lower.find("/api/v1/") {
        format!("{}/{}", &base_url[..index + "/api/v1".len()], service_path)
    } else if lower.ends_with("/api/v1") {
        format!("{base_url}/{service_path}")
    } else {
        format!("{base_url}/api/v1/{service_path}")
    }
}

fn bailian_voice_customization_endpoint(base_url: &str) -> String {
    bailian_api_endpoint(base_url, "services/audio/tts/customization")
}

#[cfg(test)]
fn bailian_voice_list_endpoint(base_url: &str) -> String {
    bailian_api_endpoint(base_url, "services/audio/tts/voice-list")
}

fn bailian_uploads_endpoint(base_url: &str) -> String {
    bailian_api_endpoint(base_url, "uploads")
}

fn is_valid_tts_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn is_cloned_voice_id(voice: &str) -> bool {
    is_valid_tts_id(voice)
}

fn is_bailian_plus_cloned_voice(voice: &str) -> bool {
    voice.starts_with("qwen-audio-3.0-tts-plus-") && is_cloned_voice_id(voice)
}

fn voice_sample_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("wav") => Some("audio/wav"),
        Some("mp3") => Some("audio/mpeg"),
        Some("m4a") => Some("audio/mp4"),
        _ => None,
    }
}

fn parse_remote_cloned_voices(payload: &Value) -> Vec<RemoteClonedVoice> {
    payload
        .get("output")
        .and_then(|output| output.get("voice_list"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let voice = item
                .get("voice_id")
                .or_else(|| item.get("voice"))?
                .as_str()?
                .trim();
            let target_model = item
                .get("target_model")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or(BAILIAN_VOICE_CLONE_MODEL);
            if target_model != BAILIAN_VOICE_CLONE_MODEL || !is_bailian_plus_cloned_voice(voice) {
                return None;
            }
            let text = |key: &str| {
                item.get(key)
                    .and_then(|value| {
                        value
                            .as_str()
                            .map(str::to_string)
                            .or_else(|| value.as_i64().map(|number| number.to_string()))
                    })
                    .unwrap_or_default()
            };
            Some(RemoteClonedVoice {
                voice: voice.to_string(),
                target_model: target_model.to_string(),
                language: item
                    .get("language_hints")
                    .and_then(Value::as_array)
                    .and_then(|values| values.first())
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| text("language")),
                created_at: text("gmt_create"),
                modified_at: text("gmt_modified"),
            })
        })
        .collect()
}

fn tts_speed_instruction(speed: f32) -> Option<&'static str> {
    if speed <= 0.7 {
        Some("请使用很慢且清晰的语速朗读。")
    } else if speed < 0.95 {
        Some("请使用稍慢且清晰的语速朗读。")
    } else if speed > 1.3 {
        Some("请使用较快但保持清晰的语速朗读。")
    } else if speed > 1.05 {
        Some("请使用稍快且清晰的语速朗读。")
    } else {
        None
    }
}

fn tts_instruction(config: &TtsConfig) -> Result<Option<String>, String> {
    let choice = |value: &str, allowed: &[&str], label: &str| {
        if value.is_empty() || allowed.contains(&value) {
            Ok(())
        } else {
            Err(format!("不支持的配音{label}设置"))
        }
    };
    choice(
        &config.emotion,
        &[
            "auto", "neutral", "calm", "happy", "sad", "excited", "serious", "warm",
        ],
        "情感",
    )?;
    choice(
        &config.tone,
        &[
            "natural",
            "friendly",
            "professional",
            "firm",
            "gentle",
            "lively",
        ],
        "语气",
    )?;
    choice(
        &config.intonation,
        &["natural", "flat", "expressive", "emphatic"],
        "语调",
    )?;
    choice(
        &config.reading_style,
        &[
            "natural",
            "narration",
            "teaching",
            "news",
            "storytelling",
            "dialogue",
            "promotional",
        ],
        "朗读风格",
    )?;

    let custom = config.custom_instruction.trim();
    if custom.chars().count() > 200 || custom.chars().any(char::is_control) {
        return Err("自定义表达要求不能超过 200 个字符或包含控制字符".into());
    }

    let mut sentences = Vec::new();
    let emotion = match config.emotion.as_str() {
        "neutral" => Some("请保持中性克制的情绪。"),
        "calm" => Some("请带着平静从容的情绪。"),
        "happy" => Some("请带着愉快明朗的情绪。"),
        "sad" => Some("请带着悲伤低沉的情绪。"),
        "excited" => Some("请带着激动高昂的情绪。"),
        "serious" => Some("请带着严肃庄重的情绪。"),
        "warm" => Some("请带着温暖真诚的情绪。"),
        _ => None,
    };
    let tone = match config.tone.as_str() {
        "friendly" => Some("请使用亲切友好的语气。"),
        "professional" => Some("请使用清晰专业的语气。"),
        "firm" => Some("请使用坚定有力的语气。"),
        "gentle" => Some("请使用温柔舒缓的语气。"),
        "lively" => Some("请使用活泼生动的语气。"),
        _ => None,
    };
    let intonation = match config.intonation.as_str() {
        "flat" => Some("请采用平缓稳定的语调。"),
        "expressive" => Some("请采用抑扬丰富、富有表现力的语调。"),
        "emphatic" => Some("请在关键词和重点内容上加强语调。"),
        _ => None,
    };
    let style = match config.reading_style.as_str() {
        "narration" => Some("请以自然清晰的旁白解说风格朗读。"),
        "teaching" => Some("请以条理清楚的课程讲解风格朗读。"),
        "news" => Some("请以准确稳重的新闻播报风格朗读。"),
        "storytelling" => Some("请以有画面感的故事讲述风格朗读。"),
        "dialogue" => Some("请以自然鲜活的角色对白风格朗读。"),
        "promotional" => Some("请以有感染力的宣传介绍风格朗读。"),
        _ => None,
    };
    sentences.extend(
        [
            emotion,
            tone,
            intonation,
            style,
            tts_speed_instruction(config.speed),
        ]
        .into_iter()
        .flatten()
        .map(str::to_string),
    );
    if !custom.is_empty() {
        let punctuation = custom.ends_with(['。', '！', '？', '.', '!', '?']);
        sentences.push(if punctuation {
            custom.to_string()
        } else {
            format!("{custom}。")
        });
    }
    Ok((!sentences.is_empty()).then(|| sentences.join("")))
}

fn is_bailian_voice_compatible(model: &str, voice: &str) -> bool {
    is_valid_tts_id(model) && is_valid_tts_id(voice)
}

fn tts_voice_option_label(id: &str, name: Option<&str>) -> String {
    match name.map(str::trim).filter(|value| !value.is_empty() && *value != id) {
        Some(name) => format!("{name} · {id}"),
        None => id.to_string(),
    }
}

fn push_tts_voice_option(out: &mut Vec<TtsVoiceOption>, seen: &mut HashSet<String>, id: &str, label: Option<&str>) {
    let id = id.trim();
    if !is_valid_tts_id(id) || !seen.insert(id.to_string()) {
        return;
    }
    out.push(TtsVoiceOption {
        id: id.to_string(),
        label: tts_voice_option_label(id, label),
    });
}

#[cfg(test)]
fn collect_tts_voice_options(value: &Value, out: &mut Vec<TtsVoiceOption>, seen: &mut HashSet<String>) {
    match value {
        Value::Object(object) => {
            let id = ["voice", "voice_id", "id"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str));
            let label = ["name", "desc", "label", "description", "voice_name"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str));
            if let Some(id) = id {
                push_tts_voice_option(out, seen, id, label);
            }
            for key in ["voices", "voice_list", "data", "output", "result", "list"] {
                if let Some(child) = object.get(key) {
                    collect_tts_voice_options(child, out, seen);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                if let Some(id) = item.as_str() {
                    push_tts_voice_option(out, seen, id, None);
                } else {
                    collect_tts_voice_options(item, out, seen);
                }
            }
        }
        _ => {}
    }
}

#[cfg(test)]
fn parse_tts_voice_options(payload: &Value) -> Vec<TtsVoiceOption> {
    let mut voices = Vec::new();
    let mut seen = HashSet::new();
    collect_tts_voice_options(payload, &mut voices, &mut seen);
    voices
}

fn builtin_tts_voices(model: &str) -> Vec<TtsVoiceOption> {
    let voices: &[(&str, &str)] = match model {
        "qwen-audio-3.0-tts-plus" => &[("longanlingxin", "龙安灵心"), ("longanlufeng", "龙安鲁风")],
        "qwen-audio-3.0-tts-flash" => &[
            ("longanfengyue", "龙安风悦"),
            ("longanyuanfei", "龙安元妃"),
            ("longanlingxi", "龙安灵希"),
            ("longanxiaoxin", "龙安小昕"),
            ("longanhuan_v3.6", "龙安欢"),
            ("longjielidou_v3.6", "龙杰力豆"),
            ("longpaopao_v3.6", "龙泡泡"),
            ("longhuohuo_v3.6", "龙火火"),
            ("longchuanshu_v3.6", "龙川叔"),
            ("loongmary", "loongmary"),
            ("loongeva_v3.6", "loongeva"),
            ("loongjohn", "loongJohn"),
        ],
        _ => &[],
    };
    voices
        .iter()
        .map(|(id, label)| TtsVoiceOption {
            id: (*id).into(),
            label: format!("{label} · {id}"),
        })
        .collect()
}

fn find_audio_url(value: &Value) -> Option<&str> {
    match value {
        Value::Object(object) => {
            for key in ["url", "audio_url", "audioUrl"] {
                if let Some(Value::String(url)) = object.get(key) {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        return Some(url);
                    }
                }
            }
            object.values().find_map(find_audio_url)
        }
        Value::Array(items) => items.iter().find_map(find_audio_url),
        _ => None,
    }
}

fn find_audio_base64(value: &Value) -> Option<&str> {
    match value {
        Value::Object(object) => {
            if let Some(Value::Object(audio)) = object.get("audio") {
                if let Some(Value::String(data)) = audio.get("data") {
                    return Some(data);
                }
            }
            object.values().find_map(find_audio_base64)
        }
        Value::Array(items) => items.iter().find_map(find_audio_base64),
        _ => None,
    }
}

fn tts_error_body(body: &str) -> String {
    let compact = body.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(500).collect()
}

fn voice_clone_error_body(body: &str) -> String {
    let payload = serde_json::from_str::<Value>(body).ok();
    match payload
        .as_ref()
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
    {
        Some("Audio.AudioShortError") => "声音样本中的有效人声不足。请录制 12-20 秒，至少持续清晰说话 10 秒，减少开头和中间的停顿后重试。".into(),
        _ => tts_error_body(body),
    }
}

fn tts_cache_key(config: &TtsConfig, text: &str, format: &str) -> String {
    let mut digest = Sha256::new();
    for value in [
        "visual-python-tts-v1",
        config.provider.as_str(),
        config.base_url.trim().trim_end_matches('/'),
        config.model.as_str(),
        config.voice.as_str(),
        config.emotion.as_str(),
        config.tone.as_str(),
        config.intonation.as_str(),
        config.reading_style.as_str(),
        config.custom_instruction.trim(),
        format,
        text,
    ] {
        digest.update(value.as_bytes());
        digest.update([0]);
    }
    digest.update(config.speed.to_bits().to_le_bytes());
    digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn wav_duration_seconds(audio: &[u8]) -> Option<f64> {
    if audio.len() < 12 || &audio[0..4] != b"RIFF" || &audio[8..12] != b"WAVE" {
        return None;
    }
    let mut offset = 12usize;
    let mut byte_rate = None;
    let mut data_size = None;
    while offset.checked_add(8)? <= audio.len() {
        let id = &audio[offset..offset + 4];
        let size = u32::from_le_bytes(audio[offset + 4..offset + 8].try_into().ok()?) as usize;
        let data_start = offset + 8;
        let available = audio.len().saturating_sub(data_start);
        if id == b"data" && size > available {
            data_size = Some(available as u64);
            break;
        }
        if size > available {
            return None;
        }
        if id == b"fmt " && size >= 12 {
            byte_rate = Some(u32::from_le_bytes(
                audio[data_start + 8..data_start + 12].try_into().ok()?,
            ));
        } else if id == b"data" {
            data_size = Some(size as u64);
        }
        offset = data_start + size + (size % 2);
    }
    let rate = byte_rate?;
    if rate == 0 {
        return None;
    }
    Some(data_size? as f64 / rate as f64)
}

const TTS_CREDENTIAL_SERVICE: &str = "Visual Python TTS";

fn tts_credential_account(config: &TtsConfig) -> String {
    format!(
        "{}@{}",
        config.provider.trim().to_ascii_lowercase(),
        config
            .base_url
            .trim()
            .trim_end_matches('/')
            .to_ascii_lowercase()
    )
}

#[cfg(target_os = "windows")]
fn load_stored_tts_api_key(config: &TtsConfig) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(TTS_CREDENTIAL_SERVICE, &tts_credential_account(config))
        .map_err(|error| format!("无法访问配音凭据：{error}"))?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("无法读取配音凭据：{error}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn load_stored_tts_api_key(_config: &TtsConfig) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn store_tts_api_key(config: &TtsConfig, api_key: &str) -> Result<(), String> {
    keyring::Entry::new(TTS_CREDENTIAL_SERVICE, &tts_credential_account(config))
        .map_err(|error| format!("无法访问配音凭据：{error}"))?
        .set_password(api_key)
        .map_err(|error| format!("无法保存配音凭据：{error}"))
}

#[cfg(not(target_os = "windows"))]
fn store_tts_api_key(_config: &TtsConfig, _api_key: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn delete_stored_tts_api_key(config: &TtsConfig) -> Result<(), String> {
    let entry = keyring::Entry::new(TTS_CREDENTIAL_SERVICE, &tts_credential_account(config))
        .map_err(|error| format!("无法访问配音凭据：{error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法删除配音凭据：{error}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn delete_stored_tts_api_key(_config: &TtsConfig) -> Result<(), String> {
    Ok(())
}

fn tts_environment_api_key(config: &TtsConfig) -> Option<String> {
    let variable = if config.provider == "aliyun-bailian" {
        "DASHSCOPE_API_KEY"
    } else {
        "OPENAI_API_KEY"
    };
    std::env::var(variable)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
fn has_tts_api_key(config: TtsConfig) -> Result<bool, String> {
    Ok(load_stored_tts_api_key(&config)?.is_some())
}

#[tauri::command]
fn clear_tts_api_key(config: TtsConfig) -> Result<(), String> {
    delete_stored_tts_api_key(&config)
}

const AI_CREDENTIAL_SERVICE: &str = "Visual Python AI";

fn validate_ai_base_url(value: &str) -> Result<String, String> {
    let value = value.trim().trim_end_matches('/');
    if value.is_empty() || value.len() > 1000 {
        return Err("AI 请求地址不能为空且不能超过 1000 个字符".into());
    }
    let parsed = url::Url::parse(value).map_err(|_| "AI 请求地址无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("AI 请求地址只支持 HTTP 或 HTTPS".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("AI 请求地址不能包含用户名或密码".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("AI 请求地址不能包含查询参数或片段".into());
    }
    if parsed.host_str().is_none() {
        return Err("AI 请求地址缺少主机名".into());
    }
    Ok(value.to_string())
}

fn validate_ai_model_protocol(value: &str) -> Result<(), String> {
    if matches!(value, "auto" | "responses" | "chat-completions") {
        Ok(())
    } else {
        Err("AI 接口协议只能是自动检测、Responses 或 Chat Completions".into())
    }
}

fn ai_credential_account(base_url: &str) -> Result<String, String> {
    Ok(validate_ai_base_url(base_url)?.to_ascii_lowercase())
}

#[cfg(target_os = "windows")]
fn load_stored_ai_api_key(base_url: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(AI_CREDENTIAL_SERVICE, &ai_credential_account(base_url)?)
        .map_err(|error| format!("无法访问 AI 凭据：{error}"))?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("无法读取 AI 凭据：{error}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn load_stored_ai_api_key(_base_url: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn store_ai_api_key(base_url: &str, api_key: &str) -> Result<(), String> {
    keyring::Entry::new(AI_CREDENTIAL_SERVICE, &ai_credential_account(base_url)?)
        .map_err(|error| format!("无法访问 AI 凭据：{error}"))?
        .set_password(api_key)
        .map_err(|error| format!("无法保存 AI 凭据：{error}"))
}

#[cfg(not(target_os = "windows"))]
fn store_ai_api_key(_base_url: &str, _api_key: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn delete_stored_ai_api_key(base_url: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(AI_CREDENTIAL_SERVICE, &ai_credential_account(base_url)?)
        .map_err(|error| format!("无法访问 AI 凭据：{error}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法删除 AI 凭据：{error}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn delete_stored_ai_api_key(_base_url: &str) -> Result<(), String> {
    Ok(())
}

fn ai_environment_api_key(base_url: &str) -> Option<String> {
    let variable = url::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
        .filter(|host| host.contains("dashscope.aliyuncs.com"))
        .map(|_| "DASHSCOPE_API_KEY")
        .unwrap_or("OPENAI_API_KEY");
    std::env::var(variable)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn ai_error_body(body: &str) -> String {
    if let Ok(payload) = serde_json::from_str::<Value>(body) {
        if let Some(message) = payload
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return message.chars().take(800).collect();
        }
        if let Some(message) = payload.get("message").and_then(Value::as_str) {
            return message.chars().take(800).collect();
        }
    }
    body.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(800)
        .collect()
}

fn ai_text_content(content: &Value) -> Option<String> {
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    let parts = content.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("");
    (!text.is_empty()).then_some(text)
}

fn ai_message_content(payload: &Value) -> Option<String> {
    let content = payload
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?;
    ai_text_content(content)
}

fn unique_ai_tool_call_id(id: &str, index: usize, used_ids: &mut HashSet<String>) -> String {
    let base_id = if id.trim().is_empty() {
        format!("call-{index}")
    } else {
        id.trim().to_owned()
    };
    let mut unique_id = base_id.clone();
    let mut suffix = 2;
    while used_ids.contains(&unique_id) {
        unique_id = format!("{base_id}-{suffix}");
        suffix += 1;
    }
    used_ids.insert(unique_id.clone());
    unique_id
}

fn ai_message_tool_calls(payload: &Value) -> Vec<AiToolCall> {
    let Some(tool_calls) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("tool_calls"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };

    let mut used_ids = HashSet::new();
    tool_calls
        .iter()
        .enumerate()
        .filter_map(|(index, call)| {
            let function = call.get("function")?.as_object()?;
            let name = function.get("name").and_then(Value::as_str)?.trim();
            if name.is_empty() {
                return None;
            }

            let arguments = match function.get("arguments") {
                Some(Value::String(value)) if !value.trim().is_empty() => value.clone(),
                Some(Value::String(_)) => "{}".into(),
                Some(value) if !value.is_null() => {
                    serde_json::to_string(value).unwrap_or_else(|_| "{}".into())
                }
                _ => "{}".into(),
            };
            let id = call.get("id").and_then(Value::as_str).unwrap_or_default();
            let kind = call
                .get("type")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("function")
                .to_owned();

            Some(AiToolCall {
                id: unique_ai_tool_call_id(id, index, &mut used_ids),
                kind,
                function: AiToolFunctionCall {
                    name: name.to_owned(),
                    arguments,
                },
            })
        })
        .collect()
}

fn merge_stream_metadata(target: &mut String, value: &str) {
    if value.is_empty() {
        return;
    }
    if target.is_empty() {
        *target = value.to_owned();
        return;
    }
    if target == value || target.starts_with(value) {
        return;
    }
    if value.starts_with(target.as_str()) {
        *target = value.to_owned();
    } else {
        target.push_str(value);
    }
}

fn merge_stream_arguments(target: &mut String, value: &str) {
    if value.is_empty() || target == value {
        return;
    }
    if target.is_empty() || value.starts_with(target.as_str()) {
        *target = value.to_owned();
    } else {
        target.push_str(value);
    }
}

fn stream_tool_call_index(
    delta: &Value,
    fallback_index: usize,
    delta_count: usize,
    calls: &[AiToolCallAccumulator],
) -> Option<usize> {
    if let Some(index) = delta.get("index").and_then(Value::as_u64) {
        return Some(index as usize);
    }
    let id = delta.get("id").and_then(Value::as_str).unwrap_or_default();
    if !id.trim().is_empty() {
        if let Some(index) = calls.iter().position(|call| call.id == id) {
            return Some(index);
        }
    }
    let name = delta
        .get("function")
        .and_then(|function| function.get("name"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !name.trim().is_empty() {
        if let Some(index) = calls.iter().position(|call| call.name == name) {
            return Some(index);
        }
    }
    if delta_count > 1 {
        return Some(fallback_index);
    }
    if !id.trim().is_empty() || !name.trim().is_empty() {
        return Some(calls.len());
    }
    match calls.len() {
        0 | 1 => Some(0),
        _ => None,
    }
}

fn merge_ai_stream_tool_calls(payload: &Value, calls: &mut Vec<AiToolCallAccumulator>) {
    let Some(deltas) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("tool_calls"))
        .and_then(Value::as_array)
    else {
        return;
    };
    for (fallback_index, delta) in deltas.iter().enumerate() {
        let Some(index) = stream_tool_call_index(delta, fallback_index, deltas.len(), calls) else {
            continue;
        };
        while calls.len() <= index {
            calls.push(AiToolCallAccumulator::default());
        }
        let call = &mut calls[index];
        if let Some(value) = delta.get("id").and_then(Value::as_str) {
            merge_stream_metadata(&mut call.id, value);
        }
        if let Some(value) = delta.get("type").and_then(Value::as_str) {
            merge_stream_metadata(&mut call.kind, value);
        }
        if let Some(function) = delta.get("function") {
            if let Some(value) = function.get("name").and_then(Value::as_str) {
                merge_stream_metadata(&mut call.name, value);
            }
            if let Some(value) = function.get("arguments").and_then(Value::as_str) {
                merge_stream_arguments(&mut call.arguments, value);
            }
        }
    }
}

fn ai_stream_tool_argument_deltas(payload: &Value) -> Vec<(usize, Option<String>, String)> {
    payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("tool_calls"))
        .and_then(Value::as_array)
        .map(|deltas| {
            deltas
                .iter()
                .enumerate()
                .filter_map(|(fallback_index, delta)| {
                    let function = delta.get("function")?;
                    let arguments = function.get("arguments").and_then(Value::as_str)?;
                    if arguments.is_empty() {
                        return None;
                    }
                    Some((
                        delta
                            .get("index")
                            .and_then(Value::as_u64)
                            .map(|value| value as usize)
                            .unwrap_or(fallback_index),
                        function
                            .get("name")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        arguments.to_owned(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn finish_ai_stream_tool_calls(calls: Vec<AiToolCallAccumulator>) -> Vec<AiToolCall> {
    let mut used_ids = HashSet::new();
    calls
        .into_iter()
        .enumerate()
        .filter(|(_, call)| !call.name.trim().is_empty())
        .map(|(index, call)| AiToolCall {
            id: unique_ai_tool_call_id(&call.id, index, &mut used_ids),
            kind: if call.kind.trim().is_empty() {
                "function".into()
            } else {
                call.kind
            },
            function: AiToolFunctionCall {
                name: call.name,
                arguments: call.arguments,
            },
        })
        .collect()
}

fn ai_stream_delta(payload: &Value) -> Option<String> {
    let content = payload
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?;
    ai_text_content(content)
}

fn ai_stream_reasoning_delta(payload: &Value) -> Option<&str> {
    payload
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("reasoning_content")?
        .as_str()
}

fn ai_stream_finish_reason(payload: &Value) -> Option<&str> {
    payload
        .get("choices")?
        .as_array()?
        .first()?
        .get("finish_reason")?
        .as_str()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AiReasoningProfile {
    Enabled,
    AlwaysOn,
    EffortOnly,
    Omitted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AiReasoningErrorKind {
    AlwaysOnRequired,
    UnknownEnableThinking,
    UnknownReasoningParameter,
}

fn default_ai_reasoning_effort<'a>(effort: Option<&'a str>) -> Result<&'a str, String> {
    match effort {
        None => Ok("high"),
        Some(value) if matches!(value, "low" | "medium" | "high" | "xhigh") => Ok(value),
        Some(_) => Err("AI 思考强度无效".into()),
    }
}

fn always_on_reasoning_effort(effort: &str) -> &'static str {
    match effort {
        "low" => "low",
        "xhigh" => "max",
        _ => "high",
    }
}

fn openai_reasoning_effort(effort: &str) -> &'static str {
    match effort {
        "max" => "high",
        "low" => "low",
        "medium" => "medium",
        "xhigh" => "xhigh",
        _ => "high",
    }
}

#[cfg(test)]
fn apply_ai_reasoning_effort(
    body: &mut Value,
    reasoning_effort: Option<&str>,
) -> Result<(), String> {
    let effort = default_ai_reasoning_effort(reasoning_effort)?;
    body["reasoning_effort"] = Value::String(effort.into());
    Ok(())
}

fn apply_ai_reasoning_controls(
    body: &mut Value,
    reasoning_effort: Option<&str>,
    profile: AiReasoningProfile,
    include_responses_reasoning: bool,
) -> Result<(), String> {
    let effort = default_ai_reasoning_effort(reasoning_effort)?;
    match profile {
        AiReasoningProfile::Omitted => Ok(()),
        AiReasoningProfile::EffortOnly => {
            body["reasoning_effort"] = Value::String(effort.into());
            if include_responses_reasoning {
                body["reasoning"] = serde_json::json!({ "effort": effort });
            }
            Ok(())
        }
        AiReasoningProfile::Enabled => {
            body["enable_thinking"] = Value::Bool(true);
            body["reasoning_effort"] = Value::String(effort.into());
            if include_responses_reasoning {
                body["reasoning"] = serde_json::json!({ "effort": effort });
            }
            Ok(())
        }
        AiReasoningProfile::AlwaysOn => {
            let compatible = always_on_reasoning_effort(effort);
            body["enable_thinking"] = Value::Bool(true);
            body["reasoning_effort"] = Value::String(compatible.into());
            if include_responses_reasoning {
                body["reasoning"] =
                    serde_json::json!({ "effort": openai_reasoning_effort(compatible) });
            }
            Ok(())
        }
    }
}

fn ai_reasoning_error_kind(status: u16, body: &str) -> Option<AiReasoningErrorKind> {
    if !matches!(status, 400 | 422) {
        return None;
    }
    let lower = body.to_ascii_lowercase();
    if body.contains("关闭思考")
        || body.contains("始终思考")
        || lower.contains("always think")
        || lower.contains("thinking cannot be disabled")
        || (lower.contains("low")
            && lower.contains("high")
            && lower.contains("max")
            && (lower.contains("reasoning") || lower.contains("effort") || body.contains("思考")))
    {
        return Some(AiReasoningErrorKind::AlwaysOnRequired);
    }
    if lower.contains("enable_thinking") {
        return Some(AiReasoningErrorKind::UnknownEnableThinking);
    }
    if lower.contains("reasoning_effort")
        || lower.contains("reasoning effort")
        || lower.contains("thinking parameter")
        || lower.contains("unknown parameter: reasoning")
    {
        return Some(AiReasoningErrorKind::UnknownReasoningParameter);
    }
    None
}

fn next_ai_reasoning_profile(
    current: AiReasoningProfile,
    kind: AiReasoningErrorKind,
) -> Option<AiReasoningProfile> {
    match (current, kind) {
        (AiReasoningProfile::Enabled, AiReasoningErrorKind::AlwaysOnRequired) => {
            Some(AiReasoningProfile::AlwaysOn)
        }
        (AiReasoningProfile::Enabled, AiReasoningErrorKind::UnknownEnableThinking)
        | (AiReasoningProfile::AlwaysOn, AiReasoningErrorKind::UnknownEnableThinking) => {
            Some(AiReasoningProfile::EffortOnly)
        }
        (AiReasoningProfile::Enabled, AiReasoningErrorKind::UnknownReasoningParameter)
        | (AiReasoningProfile::AlwaysOn, AiReasoningErrorKind::UnknownReasoningParameter)
        | (AiReasoningProfile::EffortOnly, AiReasoningErrorKind::UnknownReasoningParameter) => {
            Some(AiReasoningProfile::Omitted)
        }
        _ => None,
    }
}

fn build_ai_http_client(stream: bool) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().connect_timeout(Duration::from_secs(20));
    builder = if stream {
        // Streaming turns with thinking can last several minutes. Fail only when
        // the connection goes idle, not when the whole response exceeds 90s.
        builder.read_timeout(Duration::from_secs(180))
    } else {
        builder.timeout(Duration::from_secs(120))
    };
    builder
        .build()
        .map_err(|error| format!("无法创建 AI 请求：{error}"))
}

fn format_ai_stream_read_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "AI 流式响应超时。深度思考或较长回复需要保持连接，请重试当前任务。".into();
    }
    let detail = error.to_string();
    if error.is_decode() || detail.contains("decoding response body") || detail.contains("error reading a body")
    {
        return "AI 流式响应中断，连接被关闭或超时。请重试当前任务。".into();
    }
    format!("读取 AI 流式响应失败：{error}")
}

fn supports_ai_stream_usage(base_url: &str) -> bool {
    url::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
        .is_some_and(|host| {
            host == "api.openai.com" || host == "aliyuncs.com" || host.ends_with(".aliyuncs.com")
        })
}

fn ai_usage_u64(usage: &Value, paths: &[&[&str]]) -> Option<u64> {
    paths.iter().find_map(|path| {
        path.iter()
            .try_fold(usage, |value, key| value.get(*key))
            .and_then(Value::as_u64)
    })
}

fn ai_cache_usage(usage: &Value) -> (Option<u64>, Option<u64>) {
    let cached = ai_usage_u64(
        usage,
        &[
            &["prompt_tokens_details", "cached_tokens"],
            &["input_tokens_details", "cached_tokens"],
            &["cached_tokens"],
            &["cache_read_input_tokens"],
        ],
    );
    let created = ai_usage_u64(
        usage,
        &[
            &["prompt_tokens_details", "cache_creation_tokens"],
            &["input_tokens_details", "cache_creation_tokens"],
            &["cache_creation_tokens"],
            &["cache_creation_input_tokens"],
        ],
    );
    (cached, created)
}

fn ai_token_usage(
    usage: &Value,
) -> (
    Option<u64>,
    Option<u64>,
    Option<u64>,
    Option<u64>,
    Option<u64>,
) {
    let prompt = ai_usage_u64(usage, &[&["prompt_tokens"], &["input_tokens"]]);
    let completion = ai_usage_u64(usage, &[&["completion_tokens"], &["output_tokens"]]);
    let total = ai_usage_u64(usage, &[&["total_tokens"]])
        .or_else(|| prompt.zip(completion).map(|(input, output)| input + output));
    let (cached, created) = ai_cache_usage(usage);
    (prompt, completion, total, cached, created)
}

fn sse_event_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|window| window == b"\n\n");
    let crlf = buffer.windows(4).position(|window| window == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(index), None) => Some((index, 2)),
        (None, Some(index)) => Some((index, 4)),
        (None, None) => None,
    }
}

fn take_sse_events(buffer: &mut Vec<u8>) -> Vec<String> {
    let mut events = Vec::new();
    while let Some((index, delimiter_length)) = sse_event_boundary(buffer) {
        let event = buffer.drain(..index).collect::<Vec<_>>();
        buffer.drain(..delimiter_length);
        if let Ok(text) = String::from_utf8(event) {
            let data = text
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(str::trim_start)
                .collect::<Vec<_>>()
                .join("\n");
            if !data.is_empty() {
                events.push(data);
            }
        }
    }
    events
}

async fn perform_ai_chat_completion(
    config: AiModelConfig,
    messages: Vec<AiChatMessage>,
    tools: Option<Vec<Value>>,
    tool_choice: Option<Value>,
    omit_tool_choice: bool,
    api_key: Option<String>,
    max_tokens: u32,
    reasoning_effort: Option<String>,
    stream_target: Option<AiStreamTarget>,
) -> Result<AiChatCompletionResult, String> {
    perform_ai_chat_completion_attempt(
        config,
        messages,
        tools,
        tool_choice,
        omit_tool_choice,
        api_key,
        max_tokens,
        reasoning_effort,
        stream_target,
        AiReasoningProfile::Enabled,
    )
    .await
}

async fn perform_ai_chat_completion_attempt(
    config: AiModelConfig,
    messages: Vec<AiChatMessage>,
    tools: Option<Vec<Value>>,
    tool_choice: Option<Value>,
    omit_tool_choice: bool,
    api_key: Option<String>,
    max_tokens: u32,
    reasoning_effort: Option<String>,
    stream_target: Option<AiStreamTarget>,
    reasoning_profile: AiReasoningProfile,
) -> Result<AiChatCompletionResult, String> {
    let base_url = validate_ai_base_url(&config.base_url)?;
    let model = config.model.trim();
    if model.is_empty() || model.chars().count() > 200 {
        return Err("模型名称不能为空且不能超过 200 个字符".into());
    }
    if messages.is_empty() || messages.len() > 100 {
        return Err("AI 请求需要包含 1 到 100 条消息".into());
    }
    let mut total_characters = 0usize;
    for message in &messages {
        if !matches!(
            message.role.as_str(),
            "system" | "user" | "assistant" | "tool"
        ) {
            return Err("AI 消息角色只支持 system、user、assistant 或 tool".into());
        }
        let length = message
            .content
            .as_deref()
            .unwrap_or_default()
            .chars()
            .count();
        let has_tool_calls = message
            .tool_calls
            .as_ref()
            .is_some_and(|calls| !calls.is_empty());
        if (length == 0 && !(message.role == "assistant" && has_tool_calls)) || length > 50_000 {
            return Err("单条 AI 消息需要包含 1 到 50000 个字符，或包含 assistant 工具调用".into());
        }
        if message.role == "tool"
            && message
                .tool_call_id
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
        {
            return Err("tool 消息必须包含 toolCallId".into());
        }
        total_characters = total_characters.saturating_add(length);
        if let Some(calls) = &message.tool_calls {
            if calls.len() > 16 {
                return Err("单条 assistant 消息最多包含 16 个工具调用".into());
            }
            for call in calls {
                if call.id.trim().is_empty() || call.function.name.trim().is_empty() {
                    return Err("AI 工具调用缺少 ID 或函数名称".into());
                }
                total_characters =
                    total_characters.saturating_add(call.function.arguments.chars().count());
            }
        }
    }
    if total_characters > 200_000 {
        return Err("AI 请求消息总长度不能超过 200000 个字符".into());
    }

    let supplied_key = api_key
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let key = supplied_key
        .clone()
        .or(load_stored_ai_api_key(&base_url)?)
        .or_else(|| ai_environment_api_key(&base_url))
        .ok_or_else(|| "请先填写 API Key".to_string())?;
    let client = build_ai_http_client(stream_target.is_some())?;
    if let Some(definitions) = &tools {
        if definitions.is_empty() || definitions.len() > 128 {
            return Err("Function Calling 工具数量需要在 1 到 128 之间".into());
        }
        let serialized_length = serde_json::to_string(definitions)
            .map_err(|error| format!("Function Calling 工具定义无效：{error}"))?
            .chars()
            .count();
        if serialized_length > 120_000 {
            return Err("Function Calling 工具定义总长度不能超过 120000 个字符".into());
        }
    }
    if tool_choice.is_some() && tools.is_none() {
        return Err("tool_choice 需要同时提供 Function Calling 工具".into());
    }
    if let Some(choice) = &tool_choice {
        let valid = match choice {
            Value::String(value) => matches!(value.as_str(), "auto" | "required"),
            Value::Object(value) => {
                value.get("type").and_then(Value::as_str) == Some("function")
                    && value
                        .get("function")
                        .and_then(Value::as_object)
                        .and_then(|function| function.get("name"))
                        .and_then(Value::as_str)
                        .is_some_and(|name| !name.trim().is_empty() && name.len() <= 200)
            }
            _ => false,
        };
        if !valid {
            return Err("Function Calling tool_choice 无效".into());
        }
    }
    let request_messages = messages
        .iter()
        .map(|message| {
            let mut value = serde_json::json!({
                "role": message.role,
                "content": message.content
            });
            if let Some(tool_call_id) = &message.tool_call_id {
                value["tool_call_id"] = Value::String(tool_call_id.clone());
            }
            if let Some(tool_calls) = &message.tool_calls {
                value["tool_calls"] = serde_json::to_value(tool_calls).unwrap_or(Value::Null);
            }
            value
        })
        .collect::<Vec<_>>();
    let mut request_body = serde_json::json!({
        "model": model,
        "messages": request_messages,
        "max_tokens": max_tokens,
        "stream": stream_target.is_some()
    });
    apply_ai_reasoning_controls(
        &mut request_body,
        reasoning_effort.as_deref(),
        reasoning_profile,
        false,
    )?;
    if stream_target.is_some() && supports_ai_stream_usage(&base_url) {
        request_body["stream_options"] = serde_json::json!({ "include_usage": true });
    }
    if let Some(definitions) = tools.clone() {
        request_body["tools"] = Value::Array(definitions);
        if !omit_tool_choice {
            request_body["tool_choice"] = tool_choice
                .clone()
                .unwrap_or_else(|| Value::String("auto".into()));
        }
    }
    let request = client
        .post(openai_chat_endpoint(&base_url))
        .bearer_auth(&key)
        .json(&request_body);
    let cancellation = stream_target
        .as_ref()
        .map(|target| target.cancellation.clone());
    let send = request.send();
    let mut response = match cancellation.as_ref() {
        Some(cancellation) => tokio::select! {
            result = send => result.map_err(|error| format!("AI 请求失败：{error}"))?,
            _ = cancellation.wait() => return Err("AI 生成已停止".into()),
        },
        None => send
            .await
            .map_err(|error| format!("AI 请求失败：{error}"))?,
    };
    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .map_err(|error| format!("无法读取 AI 响应：{error}"))?;
        if let Some(kind) = ai_reasoning_error_kind(status.as_u16(), &body) {
            if let Some(next_profile) = next_ai_reasoning_profile(reasoning_profile, kind) {
                return Box::pin(perform_ai_chat_completion_attempt(
                    config,
                    messages,
                    tools,
                    tool_choice,
                    omit_tool_choice,
                    api_key,
                    max_tokens,
                    reasoning_effort,
                    stream_target.clone(),
                    next_profile,
                ))
                .await;
            }
        }
        return Err(format!(
            "AI 请求失败（HTTP {}）：{}",
            status.as_u16(),
            ai_error_body(&body)
        ));
    }
    if let Some(target) = stream_target.as_ref() {
        let mut buffer = Vec::new();
        let mut content = String::new();
        let mut response_model = model.to_string();
        let mut prompt_tokens = None;
        let mut completion_tokens = None;
        let mut total_tokens = None;
        let mut cached_tokens = None;
        let mut cache_creation_tokens = None;
        let mut finish_reason = None::<String>;
        let mut received_reasoning = false;
        let mut streamed_tool_calls = Vec::<AiToolCallAccumulator>::new();
        loop {
            let next_chunk = response.chunk();
            let chunk = tokio::select! {
                result = next_chunk => result.map_err(format_ai_stream_read_error)?,
                _ = target.cancellation.wait() => return Err("AI 生成已停止".into()),
            };
            let Some(chunk) = chunk else {
                break;
            };
            buffer.extend_from_slice(&chunk);
            for data in take_sse_events(&mut buffer) {
                if data == "[DONE]" {
                    continue;
                }
                let payload: Value = serde_json::from_str(&data)
                    .map_err(|_| "AI 服务返回了无效的流式 JSON".to_string())?;
                if let Some(message) = payload
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(Value::as_str)
                {
                    return Err(format!("AI 请求失败：{message}"));
                }
                if let Some(value) = payload.get("model").and_then(Value::as_str) {
                    response_model = value.to_string();
                }
                if let Some(delta) =
                    ai_stream_reasoning_delta(&payload).filter(|value| !value.is_empty())
                {
                    received_reasoning = true;
                    target
                        .app
                        .emit(
                            "ai-chat-stream",
                            AiChatStreamEvent {
                                request_id: target.request_id.clone(),
                                channel: "reasoning".into(),
                                delta: delta.to_string(),
                                tool_index: None,
                                tool_name: None,
                            },
                        )
                        .map_err(|error| format!("无法发送 AI 思考状态：{error}"))?;
                }
                if let Some(value) = ai_stream_finish_reason(&payload) {
                    finish_reason = Some(value.to_string());
                }
                for (tool_index, tool_name, delta) in ai_stream_tool_argument_deltas(&payload) {
                    target
                        .app
                        .emit(
                            "ai-chat-stream",
                            AiChatStreamEvent {
                                request_id: target.request_id.clone(),
                                channel: "toolArguments".into(),
                                delta,
                                tool_index: Some(tool_index),
                                tool_name,
                            },
                        )
                        .map_err(|error| format!("无法发送 AI 工具参数流：{error}"))?;
                }
                merge_ai_stream_tool_calls(&payload, &mut streamed_tool_calls);
                if let Some(delta) = ai_stream_delta(&payload) {
                    content.push_str(&delta);
                    target
                        .app
                        .emit(
                            "ai-chat-stream",
                            AiChatStreamEvent {
                                request_id: target.request_id.clone(),
                                channel: "content".into(),
                                delta,
                                tool_index: None,
                                tool_name: None,
                            },
                        )
                        .map_err(|error| format!("无法发送 AI 流式内容：{error}"))?;
                }
                if let Some(usage) = payload.get("usage") {
                    (
                        prompt_tokens,
                        completion_tokens,
                        total_tokens,
                        cached_tokens,
                        cache_creation_tokens,
                    ) = ai_token_usage(usage);
                }
            }
        }
        if !buffer.is_empty() {
            buffer.extend_from_slice(b"\n\n");
            for data in take_sse_events(&mut buffer) {
                if data == "[DONE]" {
                    continue;
                }
                let payload: Value = serde_json::from_str(&data)
                    .map_err(|_| "AI 服务返回了无效的流式 JSON".to_string())?;
                if let Some(delta) =
                    ai_stream_reasoning_delta(&payload).filter(|value| !value.is_empty())
                {
                    received_reasoning = true;
                    target
                        .app
                        .emit(
                            "ai-chat-stream",
                            AiChatStreamEvent {
                                request_id: target.request_id.clone(),
                                channel: "reasoning".into(),
                                delta: delta.to_string(),
                                tool_index: None,
                                tool_name: None,
                            },
                        )
                        .map_err(|error| format!("无法发送 AI 思考状态：{error}"))?;
                }
                for (tool_index, tool_name, delta) in ai_stream_tool_argument_deltas(&payload) {
                    target
                        .app
                        .emit(
                            "ai-chat-stream",
                            AiChatStreamEvent {
                                request_id: target.request_id.clone(),
                                channel: "toolArguments".into(),
                                delta,
                                tool_index: Some(tool_index),
                                tool_name,
                            },
                        )
                        .map_err(|error| format!("无法发送 AI 工具参数流：{error}"))?;
                }
                merge_ai_stream_tool_calls(&payload, &mut streamed_tool_calls);
                if let Some(delta) = ai_stream_delta(&payload) {
                    content.push_str(&delta);
                    target
                        .app
                        .emit(
                            "ai-chat-stream",
                            AiChatStreamEvent {
                                request_id: target.request_id.clone(),
                                channel: "content".into(),
                                delta,
                                tool_index: None,
                                tool_name: None,
                            },
                        )
                        .map_err(|error| format!("无法发送 AI 流式内容：{error}"))?;
                }
                if let Some(usage) = payload.get("usage") {
                    (
                        prompt_tokens,
                        completion_tokens,
                        total_tokens,
                        cached_tokens,
                        cache_creation_tokens,
                    ) = ai_token_usage(usage);
                }
            }
        }
        let truncated = finish_reason.as_deref() == Some("length");
        let content = content.trim().to_string();
        let tool_calls = finish_ai_stream_tool_calls(streamed_tool_calls);
        if !truncated && content.is_empty() && tool_calls.is_empty() && received_reasoning {
            return Err("模型只返回了思考过程，没有生成最终内容。请提高输出长度或降低思考强度后重试".into());
        }
        if !truncated && content.is_empty() && tool_calls.is_empty() {
            return Err("AI 流式响应中没有找到文本或工具调用".into());
        }
        if let Some(value) = supplied_key.as_deref() {
            store_ai_api_key(&base_url, value)?;
        }
        return Ok(AiChatCompletionResult {
            content,
            tool_calls,
            model: response_model,
            truncated,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cached_tokens,
            cache_creation_tokens,
        });
    }
    let body = response
        .text()
        .await
        .map_err(|error| format!("无法读取 AI 响应：{error}"))?;
    let payload: Value =
        serde_json::from_str(&body).map_err(|_| "AI 服务没有返回有效的 JSON 响应".to_string())?;
    let content = ai_message_content(&payload)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    let tool_calls = ai_message_tool_calls(&payload);
    if content.is_empty() && tool_calls.is_empty() {
        return Err("AI 响应中没有找到文本或工具调用".into());
    }
    if let Some(value) = supplied_key.as_deref() {
        store_ai_api_key(&base_url, value)?;
    }
    let usage = payload.get("usage");
    let (prompt_tokens, completion_tokens, total_tokens, cached_tokens, cache_creation_tokens) =
        usage.map(ai_token_usage).unwrap_or_default();
    Ok(AiChatCompletionResult {
        content,
        tool_calls,
        model: payload
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(model)
            .to_string(),
        truncated: false,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cached_tokens,
        cache_creation_tokens,
    })
}

#[tauri::command]
fn has_ai_api_key(base_url: String) -> Result<bool, String> {
    Ok(load_stored_ai_api_key(&base_url)?.is_some())
}

#[tauri::command]
fn clear_ai_api_key(base_url: String) -> Result<(), String> {
    delete_stored_ai_api_key(&base_url)
}

async fn perform_ai_responses_connection(
    config: AiModelConfig,
    api_key: Option<String>,
) -> Result<AiChatCompletionResult, String> {
    let base_url = validate_ai_base_url(&config.base_url)?;
    let model = config.model.trim();
    if model.is_empty() || model.chars().count() > 200 {
        return Err("模型名称不能为空且不能超过 200 个字符".into());
    }
    let supplied_key = api_key
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let key = supplied_key
        .clone()
        .or(load_stored_ai_api_key(&base_url)?)
        .or_else(|| ai_environment_api_key(&base_url))
        .ok_or_else(|| "请先填写 API Key".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("无法创建 AI 请求：{error}"))?;
    let endpoint = openai_responses_endpoint(&base_url);
    let mut profile = AiReasoningProfile::Enabled;
    let mut empty_content_retries = 0;
    loop {
        let request_body = responses_connection_request_body(model, profile);
        let response = client
            .post(&endpoint)
            .bearer_auth(&key)
            .json(&request_body)
            .send()
            .await
            .map_err(|error| format!("AI 请求失败：{error}"))?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("无法读取 AI 响应：{error}"))?;
        if !status.is_success() {
            let error_body = ai_error_body(&body);
            if let Some(kind) = ai_reasoning_error_kind(status.as_u16(), &error_body) {
                if let Some(next_profile) = next_ai_reasoning_profile(profile, kind) {
                    profile = next_profile;
                    continue;
                }
            }
            return Err(format!(
                "AI 请求失败（HTTP {}）：{}",
                status.as_u16(),
                error_body
            ));
        }
        let payload: Value = serde_json::from_str(&body)
            .map_err(|_| "AI 服务没有返回有效的 JSON 响应".to_string())?;
        let content = responses_message_content(&payload);
        if let Some(content) = content {
            if let Some(value) = supplied_key.as_deref() {
                store_ai_api_key(&base_url, value)?;
            }
            let (
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cached_tokens,
                cache_creation_tokens,
            ) = payload.get("usage").map(ai_token_usage).unwrap_or_default();
            return Ok(AiChatCompletionResult {
                content,
                tool_calls: Vec::new(),
                model: payload
                    .get("model")
                    .and_then(Value::as_str)
                    .unwrap_or(model)
                    .to_string(),
                truncated: false,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cached_tokens,
                cache_creation_tokens,
            });
        }
        if should_retry_responses_connection(empty_content_retries, None) {
            empty_content_retries += 1;
            continue;
        }
        return Err("AI 响应中没有找到文本".to_string());
    }
}

#[tauri::command]
async fn test_ai_connection(
    config: AiModelConfig,
    api_key: Option<String>,
) -> Result<AiChatCompletionResult, String> {
    validate_ai_model_protocol(&config.protocol)?;
    if config.protocol == "chat-completions" {
        return perform_ai_chat_completion(
            config,
            vec![AiChatMessage {
                role: "user".into(),
                content: Some("Reply only: connection successful".into()),
                tool_call_id: None,
                tool_calls: None,
            }],
            None,
            None,
            false,
            api_key,
            512,
            Some("high".into()),
            None,
        )
        .await;
    }
    if config.protocol == "responses" {
        return perform_ai_responses_connection(config, api_key).await;
    }
    match perform_ai_responses_connection(config.clone(), api_key.clone()).await {
        Ok(result) => Ok(result),
        Err(error) => {
            if should_fallback_responses_probe_to_chat(&error) {
                return perform_ai_chat_completion(
                    config,
                    vec![AiChatMessage {
                        role: "user".into(),
                        content: Some("请仅回复：连接成功".into()),
                        tool_call_id: None,
                        tool_calls: None,
                    }],
                    None,
                    None,
                    false,
                    api_key,
                    512,
                    Some("high".into()),
                    None,
                )
                .await;
            }
            Err(error)
        }
    }
}

#[tauri::command]
async fn ai_chat_completion(
    config: AiModelConfig,
    messages: Vec<AiChatMessage>,
    tools: Option<Vec<Value>>,
) -> Result<AiChatCompletionResult, String> {
    perform_ai_chat_completion(config, messages, tools, None, false, None, 1200, None, None).await
}

#[tauri::command]
async fn ai_chat_completion_stream(
    app: AppHandle,
    requests: State<'_, AiChatRequests>,
    request_id: String,
    config: AiModelConfig,
    messages: Vec<AiChatMessage>,
    tools: Option<Vec<Value>>,
    tool_choice: Option<Value>,
    omit_tool_choice: Option<bool>,
    max_tokens: Option<u32>,
    reasoning_effort: Option<String>,
) -> Result<AiChatCompletionResult, String> {
    if request_id.trim().is_empty() || request_id.len() > 100 {
        return Err("AI 流式请求 ID 无效".into());
    }
    let max_tokens = max_tokens.unwrap_or(1200);
    if !(32..=65_536).contains(&max_tokens) {
        return Err("AI 输出长度需要在 32 到 65536 token 之间".into());
    }
    let cancellation = Arc::new(AiRequestCancellation::default());
    {
        let mut active = requests
            .active
            .lock()
            .map_err(|_| "AI 请求状态不可用".to_string())?;
        if active.contains_key(&request_id) {
            return Err("AI 流式请求 ID 已存在".into());
        }
        active.insert(request_id.clone(), cancellation.clone());
    }
    let result = perform_ai_chat_completion(
        config,
        messages,
        tools,
        tool_choice,
        omit_tool_choice.unwrap_or(false),
        None,
        max_tokens,
        reasoning_effort,
        Some(AiStreamTarget {
            app,
            request_id: request_id.clone(),
            cancellation,
        }),
    )
    .await;
    if let Ok(mut active) = requests.active.lock() {
        active.remove(&request_id);
    }
    result
}

#[tauri::command]
fn cancel_ai_chat_stream(
    requests: State<AiChatRequests>,
    request_id: String,
) -> Result<(), String> {
    let cancellation = requests
        .active
        .lock()
        .map_err(|_| "AI 请求状态不可用".to_string())?
        .get(&request_id)
        .cloned();
    if let Some(cancellation) = cancellation {
        cancellation.cancel();
    }
    Ok(())
}

fn voice_clone_recording_directory(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法读取应用数据目录：{error}"))?
        .join("voice-clone-recordings"))
}

#[tauri::command]
fn save_voice_clone_recording(app: AppHandle, audio_base64: String) -> Result<String, String> {
    if audio_base64.len() > (MAX_VOICE_SAMPLE_BYTES as usize * 4 / 3) + 128 {
        return Err("录音文件不能超过 10 MB".into());
    }
    let encoded = audio_base64
        .rsplit_once(',')
        .map(|(_, value)| value)
        .unwrap_or(audio_base64.as_str());
    let audio = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| format!("无法读取录音数据：{error}"))?;
    if audio.is_empty() || audio.len() as u64 > MAX_VOICE_SAMPLE_BYTES {
        return Err("录音文件需要大于 0 字节且不超过 10 MB".into());
    }
    let duration =
        wav_duration_seconds(&audio).ok_or_else(|| "录音不是有效的 PCM WAV 文件".to_string())?;
    if !(10.0..=20.5).contains(&duration) {
        return Err("录音时长需要在 10 到 20 秒之间，并至少包含 10 秒清晰人声".into());
    }
    let directory = voice_clone_recording_directory(&app)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建录音目录：{error}"))?;
    if let Ok(entries) = fs::read_dir(&directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            let managed = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("voice-sample-") && name.ends_with(".wav"));
            if managed {
                let _ = fs::remove_file(path);
            }
        }
    }
    let path = directory.join(format!("voice-sample-{}.wav", transaction_stamp()));
    fs::write(&path, audio).map_err(|error| format!("无法保存录音：{error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_voice_clone_recording(app: AppHandle, path: String) -> Result<(), String> {
    let directory = voice_clone_recording_directory(&app)?;
    let candidate = PathBuf::from(path);
    if !candidate.is_file() {
        return Ok(());
    }
    let root = directory
        .canonicalize()
        .map_err(|error| format!("无法读取录音目录：{error}"))?;
    let candidate = candidate
        .canonicalize()
        .map_err(|error| format!("无法读取录音文件：{error}"))?;
    if !candidate.starts_with(&root) {
        return Err("拒绝删除录音目录之外的文件".into());
    }
    fs::remove_file(candidate).map_err(|error| format!("无法删除临时录音：{error}"))
}

async fn upload_bailian_voice_sample(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    path: &Path,
    mime: &str,
    audio: Vec<u8>,
) -> Result<String, String> {
    let mut policy_url = url::Url::parse(&bailian_uploads_endpoint(base_url))
        .map_err(|_| "百炼声音样本上传凭证地址无效".to_string())?;
    policy_url
        .query_pairs_mut()
        .append_pair("action", "getPolicy")
        .append_pair("model", BAILIAN_VOICE_CLONE_MODEL);
    let response = client
        .get(policy_url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| format!("获取百炼声音样本上传凭证失败：{error}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "获取百炼声音样本上传凭证失败（HTTP {}）：{}",
            status.as_u16(),
            tts_error_body(&body)
        ));
    }
    let payload: Value = serde_json::from_str(&body)
        .map_err(|_| "百炼没有返回有效的声音样本上传凭证".to_string())?;
    let policy: BailianUploadPolicy = serde_json::from_value(
        payload
            .get("data")
            .cloned()
            .ok_or_else(|| "百炼声音样本上传凭证中缺少 data".to_string())?,
    )
    .map_err(|error| format!("百炼声音样本上传凭证不完整：{error}"))?;
    let upload_url = url::Url::parse(&policy.upload_host)
        .map_err(|_| "百炼返回了无效的声音样本上传地址".to_string())?;
    if upload_url.scheme() != "https"
        || !upload_url
            .host_str()
            .is_some_and(|host| host == "aliyuncs.com" || host.ends_with(".aliyuncs.com"))
    {
        return Err("百炼返回了不受信任的声音样本上传地址".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("wav")
        .to_ascii_lowercase();
    let file_name = format!("voice-sample-{}.{}", transaction_stamp(), extension);
    let object_key = format!("{}/{}", policy.upload_dir.trim_matches('/'), file_name);
    let file_part = reqwest::multipart::Part::bytes(audio)
        .file_name(file_name)
        .mime_str(mime)
        .map_err(|error| format!("无法准备声音样本上传内容：{error}"))?;
    let form = reqwest::multipart::Form::new()
        .text("OSSAccessKeyId", policy.oss_access_key_id)
        .text("Signature", policy.signature)
        .text("policy", policy.policy)
        .text("x-oss-object-acl", policy.x_oss_object_acl)
        .text("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite)
        .text("key", object_key.clone())
        .text("success_action_status", "200")
        .part("file", file_part);
    let upload = client
        .post(upload_url)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("上传声音样本到百炼临时存储失败：{error}"))?;
    if !upload.status().is_success() {
        let status = upload.status();
        let body = upload.text().await.unwrap_or_default();
        return Err(format!(
            "上传声音样本到百炼临时存储失败（HTTP {}）：{}",
            status.as_u16(),
            tts_error_body(&body)
        ));
    }
    Ok(format!("oss://{object_key}"))
}

#[tauri::command]
async fn create_cloned_voice(
    config: TtsConfig,
    sample_path: String,
    preferred_name: String,
    language: String,
    api_key: Option<String>,
) -> Result<VoiceCloneResult, String> {
    if config.provider != "aliyun-bailian" {
        return Err("声音复刻仅支持阿里百炼配音服务".into());
    }
    let base_url = validate_tts_url(&config.base_url)?;
    let preferred_name = preferred_name.trim();
    if preferred_name.is_empty()
        || preferred_name.len() > 9
        || !preferred_name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    {
        return Err("声音复刻标识需要包含 1 到 9 个小写英文字母或数字".into());
    }
    let supported_languages = ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"];
    if !supported_languages.contains(&language.as_str()) {
        return Err("不支持所选的样本语言".into());
    }
    let path = PathBuf::from(sample_path.trim());
    let mime = voice_sample_mime(&path)
        .ok_or_else(|| "声音样本仅支持 WAV、MP3 或 M4A 文件".to_string())?;
    let metadata = fs::metadata(&path).map_err(|error| format!("无法读取声音样本：{error}"))?;
    if !metadata.is_file() {
        return Err("声音样本不是有效文件".into());
    }
    if metadata.len() == 0 || metadata.len() > MAX_VOICE_SAMPLE_BYTES {
        return Err("声音样本需要大于 0 字节且不超过 10 MB".into());
    }
    let audio = fs::read(&path).map_err(|error| format!("无法读取声音样本：{error}"))?;
    if mime == "audio/wav" {
        let duration = wav_duration_seconds(&audio)
            .ok_or_else(|| "声音样本不是有效的 PCM WAV 文件".to_string())?;
        if !(10.0..=20.5).contains(&duration) {
            return Err("声音样本时长需要在 10 到 20 秒之间".into());
        }
    }
    let supplied_key = api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let key = supplied_key
        .clone()
        .or(load_stored_tts_api_key(&config)?)
        .or_else(|| tts_environment_api_key(&config))
        .ok_or_else(|| "请先填写 API Key".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("无法创建声音复刻请求：{error}"))?;
    let sample_url =
        upload_bailian_voice_sample(&client, &base_url, &key, &path, mime, audio).await?;
    let input = serde_json::json!({
        "action": "create_voice",
        "target_model": BAILIAN_VOICE_CLONE_MODEL,
        "prefix": preferred_name,
        "url": sample_url,
        "language_hints": [language],
        "max_prompt_audio_length": 20.0,
    });
    let response = client
        .post(bailian_voice_customization_endpoint(&base_url))
        .bearer_auth(&key)
        .header("X-DashScope-OssResourceResolve", "enable")
        .json(&serde_json::json!({ "model": BAILIAN_VOICE_ENROLLMENT_MODEL, "input": input }))
        .send()
        .await
        .map_err(|error| format!("声音复刻请求失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("无法读取声音复刻响应：{error}"))?;
    if !status.is_success() {
        return Err(format!(
            "声音复刻失败（HTTP {}）：{}",
            status.as_u16(),
            voice_clone_error_body(&body)
        ));
    }
    let payload: Value =
        serde_json::from_str(&body).map_err(|_| "百炼没有返回有效的声音复刻响应".to_string())?;
    let output = payload
        .get("output")
        .and_then(Value::as_object)
        .ok_or_else(|| "声音复刻响应中缺少 output".to_string())?;
    let voice = output
        .get("voice_id")
        .and_then(Value::as_str)
        .filter(|voice| is_bailian_plus_cloned_voice(voice))
        .ok_or_else(|| "声音复刻响应中没有有效的音色 ID".to_string())?
        .to_string();
    let target_model = output
        .get("target_model")
        .and_then(Value::as_str)
        .unwrap_or(BAILIAN_VOICE_CLONE_MODEL)
        .to_string();
    if target_model != BAILIAN_VOICE_CLONE_MODEL {
        return Err(format!("百炼返回了不兼容的声音复刻模型：{target_model}"));
    }
    if let Some(value) = supplied_key {
        store_tts_api_key(&config, &value)?;
    }
    Ok(VoiceCloneResult {
        voice,
        target_model,
    })
}

#[tauri::command]
async fn list_cloned_voices(
    config: TtsConfig,
    api_key: Option<String>,
) -> Result<Vec<RemoteClonedVoice>, String> {
    if config.provider != "aliyun-bailian" {
        return Err("云端音色仅支持阿里百炼配音服务".into());
    }
    let base_url = validate_tts_url(&config.base_url)?;
    let supplied_key = api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let key = supplied_key
        .clone()
        .or(load_stored_tts_api_key(&config)?)
        .or_else(|| tts_environment_api_key(&config))
        .ok_or_else(|| "请先填写 API Key".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("无法创建音色查询请求：{error}"))?;
    let mut voices = Vec::new();
    for page_index in 0..10 {
        let response = client
            .post(bailian_voice_customization_endpoint(&base_url))
            .bearer_auth(&key)
            .json(&serde_json::json!({
                "model": BAILIAN_VOICE_ENROLLMENT_MODEL,
                "input": { "action": "list_voice", "page_size": 100, "page_index": page_index }
            }))
            .send()
            .await
            .map_err(|error| format!("查询百炼音色失败：{error}"))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!(
                "查询百炼音色失败（HTTP {}）：{}",
                status.as_u16(),
                tts_error_body(&body)
            ));
        }
        let payload: Value =
            serde_json::from_str(&body).map_err(|_| "百炼没有返回有效的音色列表".to_string())?;
        let page_count = payload
            .get("output")
            .and_then(|output| output.get("voice_list"))
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        voices.extend(parse_remote_cloned_voices(&payload));
        if page_count < 100 {
            break;
        }
    }
    if let Some(value) = supplied_key {
        store_tts_api_key(&config, &value)?;
    }
    Ok(voices)
}

#[tauri::command]
async fn list_tts_voices(
    config: TtsConfig,
    api_key: Option<String>,
) -> Result<Vec<TtsVoiceOption>, String> {
    if config.provider != "aliyun-bailian" {
        return Err("当前版本仅支持阿里百炼配音服务".into());
    }
    let model = config.model.trim();
    if !is_valid_tts_id(model) {
        return Err("配音模型名称无效".into());
    }
    let mut voices = builtin_tts_voices(model);
    let mut seen: HashSet<String> = voices.iter().map(|voice| voice.id.clone()).collect();
    if model == BAILIAN_VOICE_CLONE_MODEL {
        if let Ok(cloned) = list_cloned_voices(config.clone(), api_key.clone()).await {
            for item in cloned {
                push_tts_voice_option(&mut voices, &mut seen, &item.voice, Some("复刻音色"));
            }
        }
    }
    if voices.is_empty() {
        return Err("百炼没有为该模型提供音色列表接口，请按文档手动填写音色 ID".into());
    }
    Ok(voices)
}

#[tauri::command]
async fn delete_cloned_voice(
    config: TtsConfig,
    voice: String,
    api_key: Option<String>,
) -> Result<(), String> {
    if config.provider != "aliyun-bailian" || !is_bailian_plus_cloned_voice(voice.trim()) {
        return Err("声音复刻音色 ID 无效".into());
    }
    let base_url = validate_tts_url(&config.base_url)?;
    let supplied_key = api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let key = supplied_key
        .clone()
        .or(load_stored_tts_api_key(&config)?)
        .or_else(|| tts_environment_api_key(&config))
        .ok_or_else(|| "请先填写 API Key".to_string())?;
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("无法创建删除音色请求：{error}"))?
        .post(bailian_voice_customization_endpoint(&base_url))
        .bearer_auth(&key)
        .json(&serde_json::json!({
            "model": BAILIAN_VOICE_ENROLLMENT_MODEL,
            "input": { "action": "delete_voice", "voice_id": voice.trim() }
        }))
        .send()
        .await
        .map_err(|error| format!("删除百炼音色失败：{error}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "删除百炼音色失败（HTTP {}）：{}",
            status.as_u16(),
            tts_error_body(&body)
        ));
    }
    if let Some(value) = supplied_key {
        store_tts_api_key(&config, &value)?;
    }
    Ok(())
}

#[tauri::command]
async fn synthesize_tts_preview(
    app: AppHandle,
    config: TtsConfig,
    text: String,
    api_key: Option<String>,
    storage_path: Option<String>,
) -> Result<TtsPreviewResult, String> {
    if config.provider != "aliyun-bailian" {
        return Err("当前版本仅支持阿里百炼配音服务".into());
    }
    let text = text.trim();
    if text.is_empty() || text.chars().count() > 2000 {
        return Err("试听文本需要包含 1 到 2000 个字符".into());
    }
    if config.model.trim().is_empty() || config.voice.trim().is_empty() {
        return Err("请填写配音模型和音色".into());
    }
    if !(0.5..=2.0).contains(&config.speed) {
        return Err("配音语速需要在 0.5 到 2.0 之间".into());
    }
    let instruction = tts_instruction(&config)?;
    let base_url = validate_tts_url(&config.base_url)?;
    let format = if config.audio_format == "mp3" {
        "mp3"
    } else {
        "wav"
    };
    let cache_directory = tts_cache_directory(&app, storage_path.as_deref())?;
    fs::create_dir_all(&cache_directory)
        .map_err(|error| format!("无法创建配音缓存目录：{error}"))?;
    let cache_path = cache_directory.join(format!(
        "{}.{}",
        tts_cache_key(&config, text, format),
        format
    ));
    let supplied_key = api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if cache_path.is_file() {
        match fs::read(&cache_path) {
            Ok(audio) if !audio.is_empty() => {
                let duration_seconds = if format == "wav" {
                    wav_duration_seconds(&audio).unwrap_or(0.0)
                } else {
                    0.0
                };
                if format != "wav" || duration_seconds > 0.0 {
                    if let Some(value) = supplied_key.as_deref() {
                        store_tts_api_key(&config, value)?;
                    }
                    return Ok(TtsPreviewResult {
                        path: cache_path.to_string_lossy().into_owned(),
                        format: format.into(),
                        duration_seconds,
                        cached: true,
                    });
                }
                let _ = fs::remove_file(&cache_path);
            }
            _ => {
                let _ = fs::remove_file(&cache_path);
            }
        }
    }
    let key = supplied_key
        .clone()
        .or(load_stored_tts_api_key(&config)?)
        .or_else(|| tts_environment_api_key(&config))
        .ok_or_else(|| "请先填写 API Key".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("无法创建配音请求：{error}"))?;
    let audio = if config.provider == "aliyun-bailian" {
        let voice = resolve_bailian_voice(config.model.as_str(), config.voice.as_str());
        if !is_bailian_voice_compatible(&config.model, voice) {
            return Err(format!(
                "音色 {voice} 不适用于模型 {}，请重新选择模型和音色",
                config.model
            ));
        }
        if is_websocket_tts_url(&base_url) {
            synthesize_bailian_websocket_tts(
                &base_url,
                &key,
                config.model.trim(),
                voice,
                text,
                format,
                config.speed,
                instruction.as_deref(),
            )
            .await?
        } else {
        let mut input = serde_json::json!({
            "text": text,
            "voice": voice,
            "format": format,
            "sample_rate": 24000
        });
        if let Some(instruction) = instruction.as_deref() {
            input["instruction"] = Value::String(instruction.into());
        }
        let response = client
            .post(bailian_speech_endpoint(&base_url))
            .bearer_auth(&key)
            .json(&serde_json::json!({ "model": config.model, "input": input }))
            .send()
            .await
            .map_err(|error| format!("百炼配音请求失败：{error}"))?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("无法读取百炼响应：{error}"))?;
        if !status.is_success() {
            return Err(format!(
                "百炼配音失败（HTTP {}）：{}",
                status.as_u16(),
                tts_error_body(&body)
            ));
        }
        let payload: Value =
            serde_json::from_str(&body).map_err(|_| "百炼没有返回有效的 JSON 响应".to_string())?;
        let audio_url =
            find_audio_url(&payload).ok_or_else(|| "百炼响应中没有找到音频地址".to_string())?;
        let download = client
            .get(audio_url)
            .send()
            .await
            .map_err(|error| format!("下载配音失败：{error}"))?;
        if !download.status().is_success() {
            return Err(format!(
                "下载配音失败（HTTP {}）",
                download.status().as_u16()
            ));
        }
        download
            .bytes()
            .await
            .map_err(|error| format!("读取配音文件失败：{error}"))?
            .to_vec()
        }
    } else if config.provider == "openai-compatible" {
        if uses_openai_chat_audio(&base_url) {
            let mut messages = Vec::new();
            if let Some(instruction) = instruction.as_deref() {
                messages.push(serde_json::json!({
                    "role": "system",
                    "content": [{ "type": "text", "text": instruction }]
                }));
            }
            messages.push(serde_json::json!({
                "role": "user",
                "content": [{ "type": "text", "text": text }]
            }));
            let response = client
                .post(openai_chat_endpoint(&base_url))
                .bearer_auth(&key)
                .json(&serde_json::json!({
                    "model": config.model,
                    "messages": messages,
                    "modalities": ["text", "audio"],
                    "audio": { "voice": config.voice, "format": format }
                }))
                .send()
                .await
                .map_err(|error| format!("OpenAI 兼容配音请求失败：{error}"))?;
            let status = response.status();
            let body = response
                .text()
                .await
                .map_err(|error| format!("无法读取配音响应：{error}"))?;
            if !status.is_success() {
                return Err(format!(
                    "配音服务返回错误（HTTP {}）：{}",
                    status.as_u16(),
                    tts_error_body(&body)
                ));
            }
            let payload: Value = serde_json::from_str(&body)
                .map_err(|_| "OpenAI 兼容服务没有返回有效的 JSON 响应".to_string())?;
            if let Some(data) = find_audio_base64(&payload) {
                let encoded = data
                    .rsplit_once(',')
                    .map(|(_, value)| value)
                    .unwrap_or(data);
                base64::engine::general_purpose::STANDARD
                    .decode(encoded)
                    .map_err(|error| format!("无法解码配音数据：{error}"))?
            } else if let Some(audio_url) = find_audio_url(&payload) {
                let download = client
                    .get(audio_url)
                    .send()
                    .await
                    .map_err(|error| format!("下载配音失败：{error}"))?;
                if !download.status().is_success() {
                    return Err(format!(
                        "下载配音失败（HTTP {}）",
                        download.status().as_u16()
                    ));
                }
                download
                    .bytes()
                    .await
                    .map_err(|error| format!("读取配音文件失败：{error}"))?
                    .to_vec()
            } else {
                return Err("OpenAI 兼容响应中没有找到音频数据".into());
            }
        } else {
            let response = client
                .post(openai_speech_endpoint(&base_url))
                .bearer_auth(&key)
                .json(&serde_json::json!({
                    "model": config.model,
                    "voice": config.voice,
                    "input": text,
                    "speed": config.speed,
                    "response_format": format
                }))
                .send()
                .await
                .map_err(|error| format!("OpenAI 兼容配音请求失败：{error}"))?;
            let status = response.status();
            if !status.is_success() {
                let body = response.text().await.unwrap_or_default();
                return Err(format!(
                    "配音服务返回错误（HTTP {}）：{}",
                    status.as_u16(),
                    tts_error_body(&body)
                ));
            }
            response
                .bytes()
                .await
                .map_err(|error| format!("读取配音文件失败：{error}"))?
                .to_vec()
        }
    } else {
        return Err("不支持的配音协议".into());
    };

    if audio.is_empty() {
        return Err("配音服务返回了空音频".into());
    }
    let duration_seconds = if format == "wav" {
        wav_duration_seconds(&audio).ok_or_else(|| "配音服务返回的 WAV 音频无法读取".to_string())?
    } else {
        0.0
    };
    fs::write(&cache_path, audio).map_err(|error| format!("无法保存配音缓存文件：{error}"))?;
    if let Some(value) = supplied_key {
        store_tts_api_key(&config, &value)?;
    }
    Ok(TtsPreviewResult {
        path: cache_path.to_string_lossy().into_owned(),
        format: format.into(),
        duration_seconds,
        cached: false,
    })
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

fn normalize_vpy_file_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 160
        || value.chars().any(|ch| {
            ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        })
    {
        return Err("invalid Visual Python project name".into());
    }
    let name = if value.to_ascii_lowercase().ends_with(".vpy") {
        format!("{}.vpy", &value[..value.len() - 4])
    } else {
        format!("{value}.vpy")
    };
    let base_name = name[..name.len() - 4].trim_end_matches([' ', '.']);
    if base_name.is_empty()
        || matches!(
            base_name.to_ascii_lowercase().as_str(),
            "con"
                | "prn"
                | "aux"
                | "nul"
                | "com1"
                | "com2"
                | "com3"
                | "com4"
                | "com5"
                | "com6"
                | "com7"
                | "com8"
                | "com9"
                | "lpt1"
                | "lpt2"
                | "lpt3"
                | "lpt4"
                | "lpt5"
                | "lpt6"
                | "lpt7"
                | "lpt8"
                | "lpt9"
        )
    {
        return Err("invalid Visual Python project name".into());
    }
    Ok(format!("{base_name}.vpy"))
}

#[tauri::command]
fn rename_project_file(current_path: String, new_name: String) -> Result<String, String> {
    let current_path = PathBuf::from(current_path);
    if !current_path.is_file()
        || !current_path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("vpy"))
    {
        return Err("current Visual Python project does not exist".into());
    }
    let new_name = normalize_vpy_file_name(&new_name)?;
    let parent = current_path
        .parent()
        .ok_or("current Visual Python project has no parent directory")?;
    let destination = parent.join(&new_name);
    if destination == current_path {
        return Ok(destination.to_string_lossy().into_owned());
    }
    let case_only_change = paths_equal_for_platform(&current_path, &destination);
    if destination.exists() && !case_only_change {
        return Err("a project with this name already exists".into());
    }
    let current_stem = current_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("invalid current project name")?;
    let destination_stem = destination
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("invalid destination project name")?;
    let current_assets = parent.join(format!("{current_stem}.assets"));
    let destination_assets = parent.join(format!("{destination_stem}.assets"));
    let renamed_assets = current_assets.is_dir() && current_assets != destination_assets;
    if renamed_assets {
        if destination_assets.exists()
            && !paths_equal_for_platform(&current_assets, &destination_assets)
        {
            return Err("a project resource directory with this name already exists".into());
        }
        rename_path_case_aware(&current_assets, &destination_assets)
            .map_err(|error| format!("cannot rename project resources: {error}"))?;
    }
    if let Err(error) = rename_path_case_aware(&current_path, &destination) {
        if renamed_assets {
            let _ = rename_path_case_aware(&destination_assets, &current_assets);
        }
        return Err(format!("cannot rename Visual Python project: {error}"));
    }
    Ok(destination.to_string_lossy().into_owned())
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
struct PluginAgentCodegenManifest {
    entry_block: Option<String>,
    statement_input: Option<String>,
    runtime_names: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginAgentManifest {
    description: String,
    tools: Option<Vec<String>>,
    file_types: Option<Vec<String>>,
    detect: Option<String>,
    codegen: Option<PluginAgentCodegenManifest>,
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
    agent: Option<PluginAgentManifest>,
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
    next_id: AtomicU64,
    active: Arc<Mutex<Option<ActiveManimTask>>>,
}

struct ActiveManimTask {
    id: u64,
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
    if let Some(agent) = &manifest.agent {
        if agent.description.trim().is_empty() {
            errors.push("agent description cannot be empty".into());
        }
        if agent
            .tools
            .as_ref()
            .is_some_and(|tools| tools.iter().any(|tool| tool.trim().is_empty()))
        {
            errors.push("agent tools cannot contain empty names".into());
        }
        if agent.file_types.as_ref().is_some_and(|file_types| {
            file_types
                .iter()
                .any(|file_type| file_type.trim().is_empty())
        }) {
            errors.push("agent file types cannot contain empty values".into());
        }
        if agent
            .detect
            .as_deref()
            .is_some_and(|detect| !matches!(detect, "imports" | "content" | "project"))
        {
            errors.push("agent detect must be one of: imports, content, project".into());
        }
        if let Some(codegen) = &agent.codegen {
            if codegen
                .entry_block
                .as_deref()
                .is_some_and(|entry_block| entry_block.trim().is_empty())
            {
                errors.push("agent codegen entry block cannot be empty".into());
            }
            if codegen
                .statement_input
                .as_deref()
                .is_some_and(|statement_input| statement_input.trim().is_empty())
            {
                errors.push("agent codegen statement input cannot be empty".into());
            }
            if codegen.runtime_names.as_ref().is_some_and(|runtime_names| {
                runtime_names
                    .iter()
                    .any(|runtime_name| runtime_name.trim().is_empty())
            }) {
                errors.push("agent codegen runtime names cannot contain empty values".into());
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

fn install_external_plugin_draft_files(
    files: HashMap<String, String>,
    plugins_dir: &Path,
) -> Result<ExternalPluginDiscovery, String> {
    const MAX_FILES: usize = 24;
    const MAX_FILE_BYTES: usize = 256 * 1024;
    const MAX_TOTAL_BYTES: usize = 2 * 1024 * 1024;

    if files.is_empty() {
        return Err("plugin draft is empty".into());
    }
    if files.len() > MAX_FILES {
        return Err(format!("plugin draft has too many files: {}", files.len()));
    }
    let manifest_text = files
        .get("plugin.json")
        .ok_or("plugin draft is missing plugin.json")?;
    let manifest_value = serde_json::from_str::<Value>(manifest_text)
        .map_err(|error| format!("plugin.json is not valid JSON: {error}"))?;
    let manifest =
        validate_plugin_manifest_value(&manifest_value).map_err(|errors| errors.join("; "))?;
    let entry = manifest
        .entry
        .as_deref()
        .ok_or("entry must be provided for external plugins")?;
    if !files.contains_key(entry) {
        return Err(format!("plugin draft is missing entry file: {entry}"));
    }

    let mut total_bytes = 0_usize;
    let mut relative_files = Vec::with_capacity(files.len());
    for (name, contents) in files {
        let components = name.split('/').collect::<Vec<_>>();
        if components.is_empty()
            || components
                .iter()
                .any(|component| component.is_empty() || *component == "." || *component == "..")
        {
            return Err(format!("unsafe plugin draft path: {name}"));
        }
        if name.contains('\\') || Path::new(&name).is_absolute() {
            return Err(format!("unsafe plugin draft path: {name}"));
        }
        if contents.len() > MAX_FILE_BYTES {
            return Err(format!("plugin draft file is too large: {name}"));
        }
        total_bytes = total_bytes.saturating_add(contents.len());
        if total_bytes > MAX_TOTAL_BYTES {
            return Err("plugin draft is too large".into());
        }
        relative_files.push((PathBuf::from(name), contents));
    }

    fs::create_dir_all(plugins_dir)
        .map_err(|error| format!("cannot create plugins directory: {error}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let temp_dir = plugins_dir.join(format!(".draft-{}-{stamp}", manifest.id));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)
            .map_err(|error| format!("cannot clean temp plugin directory: {error}"))?;
    }
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("cannot create temp plugin directory: {error}"))?;
    for (relative, contents) in relative_files {
        let output_path = temp_dir.join(relative);
        if let Some(parent) = output_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                let _ = fs::remove_dir_all(&temp_dir);
                return Err(format!("cannot create plugin directory: {error}"));
            }
        }
        if let Err(error) = fs::write(&output_path, contents) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!("cannot write plugin draft file: {error}"));
        }
    }

    let destination = plugins_dir.join(&manifest.id);
    let backup = plugins_dir.join(format!(".backup-{}-{stamp}", manifest.id));
    let had_destination = destination.exists();
    if backup.exists() {
        fs::remove_dir_all(&backup)
            .map_err(|error| format!("cannot clean plugin backup directory: {error}"))?;
    }
    if had_destination {
        if let Err(error) = fs::rename(&destination, &backup) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!(
                "cannot prepare existing plugin for replacement: {error}"
            ));
        }
    }
    if let Err(error) = fs::rename(&temp_dir, &destination) {
        let _ = fs::remove_dir_all(&temp_dir);
        if had_destination {
            let _ = fs::rename(&backup, &destination);
        }
        return Err(format!("cannot install plugin draft: {error}"));
    }
    if had_destination {
        let _ = fs::remove_dir_all(&backup);
    }
    Ok(ExternalPluginDiscovery {
        path: destination.to_string_lossy().into_owned(),
        manifest: Some(manifest),
        valid: true,
        errors: Vec::new(),
    })
}

fn read_external_plugin_files_from_dir(
    plugin_id: &str,
    plugins_dir: &Path,
) -> Result<HashMap<String, String>, String> {
    const MAX_FILES: usize = 24;
    const MAX_FILE_BYTES: u64 = 256 * 1024;
    const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024;

    if !is_valid_plugin_id(plugin_id) {
        return Err("invalid plugin id".into());
    }
    let plugins_dir = fs::canonicalize(plugins_dir)
        .map_err(|error| format!("plugins directory is unavailable: {error}"))?;
    let requested_dir = plugins_dir.join(plugin_id);
    let requested_metadata = fs::symlink_metadata(&requested_dir)
        .map_err(|error| format!("plugin directory is unavailable: {error}"))?;
    if requested_metadata.file_type().is_symlink() || !requested_metadata.is_dir() {
        return Err("plugin directory must be a regular directory".into());
    }
    let plugin_dir = fs::canonicalize(&requested_dir)
        .map_err(|error| format!("plugin directory is unavailable: {error}"))?;
    if plugin_dir.parent() != Some(plugins_dir.as_path()) {
        return Err("plugin directory is outside the plugins folder".into());
    }

    let mut pending = vec![(plugin_dir.clone(), PathBuf::new())];
    let mut files = HashMap::new();
    let mut total_bytes = 0_u64;
    while let Some((directory, relative_dir)) = pending.pop() {
        let mut entries = fs::read_dir(&directory)
            .map_err(|error| format!("cannot read plugin directory: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("cannot read plugin directory entry: {error}"))?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("cannot inspect plugin file: {error}"))?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "plugin file cannot be a symlink: {}",
                    entry.path().display()
                ));
            }
            let relative = relative_dir.join(entry.file_name());
            if metadata.is_dir() {
                pending.push((entry.path(), relative));
                continue;
            }
            if !metadata.is_file() {
                return Err(format!(
                    "unsupported plugin file type: {}",
                    entry.path().display()
                ));
            }
            if files.len() >= MAX_FILES {
                return Err(format!("plugin has more than {MAX_FILES} files"));
            }
            if metadata.len() > MAX_FILE_BYTES {
                return Err(format!("plugin file is too large: {}", relative.display()));
            }
            total_bytes = total_bytes.saturating_add(metadata.len());
            if total_bytes > MAX_TOTAL_BYTES {
                return Err("plugin files are too large".into());
            }
            let bytes = fs::read(entry.path())
                .map_err(|error| format!("cannot read plugin file: {error}"))?;
            let contents = String::from_utf8(bytes)
                .map_err(|_| format!("plugin file is not UTF-8 text: {}", relative.display()))?;
            let name = relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            files.insert(name, contents);
        }
    }

    let manifest_text = files
        .get("plugin.json")
        .ok_or("plugin is missing plugin.json")?;
    let manifest_value = serde_json::from_str::<Value>(manifest_text)
        .map_err(|error| format!("plugin.json is not valid JSON: {error}"))?;
    let manifest =
        validate_plugin_manifest_value(&manifest_value).map_err(|errors| errors.join("; "))?;
    if manifest.id != plugin_id {
        return Err("plugin manifest id does not match requested plugin id".into());
    }
    Ok(files)
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
    task_id: u64,
    stream: &'static str,
    mut reader: R,
    captured_output: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let data = String::from_utf8_lossy(&buffer[..size]).into_owned();
                    if !data.is_empty() {
                        if let Ok(mut output) = captured_output.lock() {
                            output.push_str(&data);
                            if output.len() > 64_000 {
                                let mut boundary = output.len() - 64_000;
                                while !output.is_char_boundary(boundary) {
                                    boundary += 1;
                                }
                                output.drain(..boundary);
                            }
                        }
                        let _ = app.emit(
                            "manim-output",
                            ManimOutput {
                                task_id,
                                stream,
                                data,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
    })
}

fn extract_manim_played_animation_count(output: &str) -> Option<u32> {
    output
        .lines()
        .filter_map(|line| {
            let rest = line.rsplit_once("Played ")?.1;
            let (count, suffix) = rest.split_once(char::is_whitespace)?;
            suffix
                .trim_start()
                .starts_with("animation")
                .then(|| count.parse().ok())
                .flatten()
        })
        .last()
}

fn find_latest_manim_output(root: &Path, extension: &str) -> Option<PathBuf> {
    fn visit(dir: &Path, extension: &str, latest: &mut Option<(SystemTime, PathBuf)>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                visit(&path, extension, latest);
                continue;
            }
            if path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
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
    visit(root, extension, &mut latest);
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

const MANIM_OUTPUT_MARKER: &str = ".visual-python-output";

fn sanitize_manim_output_filename(
    value: Option<&str>,
    fallback: &str,
    output_type: &str,
) -> String {
    let raw = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback);
    let lower = raw.to_ascii_lowercase();
    let without_extension = if lower.ends_with(".mp4") || lower.ends_with(".png") {
        &raw[..raw.len() - 4]
    } else {
        raw
    };
    let mut sanitized = without_extension
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>();
    sanitized = sanitized
        .trim()
        .trim_end_matches([' ', '.'])
        .chars()
        .take(120)
        .collect();
    if sanitized.is_empty() {
        sanitized = fallback.to_owned();
    }
    if matches!(
        sanitized.to_ascii_lowercase().as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    ) {
        sanitized.insert(0, '_');
    }
    let extension = if output_type == "image" { "png" } else { "mp4" };
    format!("{sanitized}.{extension}")
}

fn is_safe_manim_output_filename(value: &str) -> bool {
    let path = Path::new(value);
    path.file_name().and_then(|name| name.to_str()) == Some(value)
        && path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(extension.to_ascii_lowercase().as_str(), "mp4" | "png")
            })
}

fn unique_manim_output_path(storage_dir: &Path, requested_name: &str) -> PathBuf {
    let requested = storage_dir.join(requested_name);
    if !requested.exists() {
        return requested;
    }
    let stem = Path::new(requested_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("render");
    let extension = Path::new(requested_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp4");
    for index in 2_u32.. {
        let candidate = storage_dir.join(format!("{stem} ({index}).{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn managed_manim_output_path(storage_dir: &Path, work_dir: &Path) -> Option<PathBuf> {
    let name = fs::read_to_string(work_dir.join(MANIM_OUTPUT_MARKER)).ok()?;
    let name = name.trim();
    if !is_safe_manim_output_filename(name) {
        return None;
    }
    let output = storage_dir.join(name);
    output.is_file().then_some(output)
}

fn finalize_manim_output(
    storage_dir: &Path,
    work_dir: &Path,
    source: &Path,
    requested_name: &str,
) -> Result<PathBuf, String> {
    let destination = unique_manim_output_path(storage_dir, requested_name);
    fs::copy(source, &destination)
        .map_err(|error| format!("cannot save final Manim output: {error}"))?;
    let Some(file_name) = destination.file_name().and_then(|name| name.to_str()) else {
        let _ = fs::remove_file(&destination);
        return Err("cannot determine final Manim output name".into());
    };
    if let Err(error) = fs::write(work_dir.join(MANIM_OUTPUT_MARKER), file_name) {
        let _ = fs::remove_file(&destination);
        return Err(format!("cannot record final Manim output: {error}"));
    }
    Ok(destination)
}

fn finalize_rendered_manim_output(
    storage_dir: &Path,
    work_dir: &Path,
    requested_name: &str,
    output_type: &str,
) -> Result<PathBuf, String> {
    let (extension, missing_output_label) = if output_type == "image" {
        ("png", "a PNG image")
    } else {
        ("mp4", "an MP4 video")
    };
    let source = find_latest_manim_output(work_dir, extension)
        .ok_or_else(|| format!("Manim completed without producing {missing_output_label}"))?;
    finalize_manim_output(storage_dir, work_dir, &source, requested_name)
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

fn read_tts_cache_info_from_path(path: &Path) -> TtsCacheInfo {
    let Ok(entries) = fs::read_dir(path) else {
        return TtsCacheInfo {
            path: path.to_string_lossy().into_owned(),
            size_bytes: 0,
            clip_count: 0,
        };
    };
    entries.flatten().fold(
        TtsCacheInfo {
            path: path.to_string_lossy().into_owned(),
            size_bytes: 0,
            clip_count: 0,
        },
        |mut info, entry| {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| {
                        matches!(extension.to_ascii_lowercase().as_str(), "wav" | "mp3")
                    })
            {
                info.clip_count = info.clip_count.saturating_add(1);
                info.size_bytes = info
                    .size_bytes
                    .saturating_add(entry.metadata().map(|metadata| metadata.len()).unwrap_or(0));
            }
            info
        },
    )
}

fn tts_cache_directory(app: &AppHandle, storage_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(value) = storage_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(PathBuf::from(value).join("clips"));
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?
        .join("tts-cache")
        .join("clips"))
}

#[tauri::command]
fn get_tts_cache_info(
    app: AppHandle,
    storage_path: Option<String>,
) -> Result<TtsCacheInfo, String> {
    Ok(read_tts_cache_info_from_path(&tts_cache_directory(
        &app,
        storage_path.as_deref(),
    )?))
}

#[tauri::command]
fn clear_tts_cache(
    app: AppHandle,
    tasks: State<ManimTasks>,
    storage_path: Option<String>,
) -> Result<TtsCacheInfo, String> {
    if tasks
        .active
        .lock()
        .map_err(|_| "Manim task state is unavailable")?
        .is_some()
    {
        return Err("渲染期间不能清理配音缓存".into());
    }
    let path = tts_cache_directory(&app, storage_path.as_deref())?;
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|error| format!("无法清理配音缓存：{error}"))?;
    }
    Ok(read_tts_cache_info_from_path(&path))
}

#[tauri::command]
fn open_tts_cache_folder(app: AppHandle, storage_path: Option<String>) -> Result<(), String> {
    let path = tts_cache_directory(&app, storage_path.as_deref())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
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

fn read_manim_storage_info(
    app: &AppHandle,
    storage_path: Option<&str>,
) -> Result<ManimStorageInfo, String> {
    let path = manim_storage_dir(app, storage_path)?;
    let entries = fs::read_dir(&path).map_err(|error| error.to_string())?;
    let mut render_count = 0;
    let mut size_bytes: u64 = 0;
    let mut managed_outputs = HashSet::new();
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
        if let Some(output_path) = managed_manim_output_path(&path, &entry_path) {
            managed_outputs.insert(output_path);
        }
    }
    for output_path in managed_outputs {
        size_bytes = size_bytes.saturating_add(
            output_path
                .metadata()
                .map(|metadata| metadata.len())
                .unwrap_or(0),
        );
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
        if let Some(output_path) = managed_manim_output_path(&path, &entry_path) {
            fs::remove_file(output_path).map_err(|error| error.to_string())?;
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

const MIN_SUPPORTED_PYTHON_MINOR: u16 = 11;
const MAX_SUPPORTED_PYTHON_MINOR: u16 = 14;

fn python_version_parts(version: &str) -> Option<(u16, u16, u16)> {
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts
        .next()
        .and_then(|value| {
            let digits: String = value
                .chars()
                .take_while(|character| character.is_ascii_digit())
                .collect();
            (!digits.is_empty()).then_some(digits)
        })
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    Some((major, minor, patch))
}

fn is_supported_python_version(version: &str) -> bool {
    python_version_parts(version).is_some_and(|(major, minor, _)| {
        major == 3 && (MIN_SUPPORTED_PYTHON_MINOR..=MAX_SUPPORTED_PYTHON_MINOR).contains(&minor)
    })
}

fn add_supported_python(
    environments: &mut Vec<PythonEnvironment>,
    result: Result<PythonEnvironment, String>,
) {
    let Ok(environment) = result else {
        return;
    };
    if !is_supported_python_version(&environment.version)
        || environments
            .iter()
            .any(|item| item.path.eq_ignore_ascii_case(&environment.path))
    {
        return;
    }
    environments.push(environment);
}

fn python_launcher_paths(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| {
            let lower = line.to_ascii_lowercase();
            let executable_end = lower.rfind(".exe")? + 4;
            let prefix = &line[..executable_end];
            let bytes = prefix.as_bytes();
            let drive_start = (0..bytes.len().saturating_sub(2)).find(|index| {
                bytes[*index].is_ascii_alphabetic()
                    && bytes[*index + 1] == b':'
                    && matches!(bytes[*index + 2], b'\\' | b'/')
            });
            let unc_start = prefix.find("\\\\");
            let start = match (drive_start, unc_start) {
                (Some(drive), Some(unc)) => drive.min(unc),
                (Some(drive), None) => drive,
                (None, Some(unc)) => unc,
                (None, None) => return None,
            };
            Some(prefix[start..].trim_matches('"').to_string())
        })
        .collect()
}

#[tauri::command]
fn detect_python(selected_path: Option<String>) -> Vec<PythonEnvironment> {
    let mut environments = Vec::new();

    if let Some(path) = selected_path.as_deref() {
        add_supported_python(&mut environments, inspect_python(path, &[]));
    }

    for (program, args) in [("python", &[][..]), ("python3", &[][..])] {
        add_supported_python(&mut environments, inspect_python(program, args));
    }

    #[cfg(target_os = "windows")]
    {
        let mut launcher = Command::new("py");
        launcher.arg("-0p").creation_flags(0x08000000);
        if let Ok(output) = launcher.output() {
            let listing = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            for path in python_launcher_paths(&listing) {
                add_supported_python(&mut environments, inspect_python(&path, &[]));
            }
        }
        for tag in ["-3.11", "-3.12", "-3.13", "-3.14"] {
            add_supported_python(&mut environments, inspect_python("py", &[tag]));
        }
    }

    #[cfg(not(target_os = "windows"))]
    for program in ["python3.11", "python3.12", "python3.13", "python3.14"] {
        add_supported_python(&mut environments, inspect_python(program, &[]));
    }

    environments.sort_by(|left, right| {
        python_version_parts(&right.version)
            .cmp(&python_version_parts(&left.version))
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });
    environments
}

fn validate_supported_python(path: &str) -> Result<PythonEnvironment, String> {
    let environment = inspect_python(path, &[])?;
    if !is_supported_python_version(&environment.version) {
        return Err(format!(
            "当前项目仅支持 Python 3.{} 至 3.{}，所选解释器为 Python {}",
            MIN_SUPPORTED_PYTHON_MINOR, MAX_SUPPORTED_PYTHON_MINOR, environment.version
        ));
    }
    Ok(environment)
}

#[tauri::command]
fn validate_python(path: String) -> Result<PythonEnvironment, String> {
    validate_supported_python(&path)
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
import importlib.metadata, importlib.util, json, sys
packages = json.loads(sys.stdin.read())
result = []
for name in packages:
    candidates = [name, name.replace("-", "_")]
    try:
        installed = importlib.metadata.version(name) is not None
    except importlib.metadata.PackageNotFoundError:
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
            Ok(_status) if stopped_by_user => (false, None),
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
fn read_external_plugin_files(
    app: AppHandle,
    plugin_id: String,
) -> Result<HashMap<String, String>, String> {
    let plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    read_external_plugin_files_from_dir(&plugin_id, &plugins_dir)
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
fn install_external_plugin_draft(
    app: AppHandle,
    files: HashMap<String, String>,
) -> Result<ExternalPluginDiscovery, String> {
    let plugins_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    install_external_plugin_draft_files(files, &plugins_dir)
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
        let read = reader
            .read_line(&mut header)
            .map_err(|error| error.to_string())?;
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
    reader
        .read_exact(&mut body)
        .map_err(|error| error.to_string())?;
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
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
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
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
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
fn inspect_python_structure(code: String, python_path: Option<String>) -> Result<Value, String> {
    const SCRIPT: &str = r#"
import ast, json, sys

source = sys.stdin.read()
tree = ast.parse(source, filename="<visual-python>")

def statement_info(node, source_lines):
    segment = ast.get_source_segment(source, node) or source_lines[node.lineno - 1].strip()
    summary = " ".join(segment.strip().split())[:240]
    is_docstring = isinstance(node, ast.Expr) and isinstance(getattr(node, "value", None), (ast.Str, ast.Constant)) and isinstance(getattr(node.value, "value", getattr(node.value, "s", None)), str)
    return {
        "kind": type(node).__name__,
        "startLine": node.lineno,
        "endLine": getattr(node, "end_lineno", node.lineno),
        "summary": summary,
        "isDocstring": is_docstring,
    }

def function_info(node, source_lines):
    body = [statement_info(item, source_lines) for item in node.body]
    return {
        "name": node.name,
        "kind": "asyncFunction" if isinstance(node, ast.AsyncFunctionDef) else "function",
        "startLine": node.lineno,
        "endLine": getattr(node, "end_lineno", node.lineno),
        "bodyStartLine": node.body[0].lineno if node.body else node.lineno + 1,
        "bodyEndLine": getattr(node.body[-1], "end_lineno", node.lineno) if node.body else node.lineno,
        "column": node.col_offset,
        "statements": body,
    }

source_lines = source.splitlines()
classes = []
functions = []
imports = []
statements = [statement_info(node, source_lines) for node in tree.body]
for node in tree.body:
    if isinstance(node, ast.ClassDef):
        methods = [function_info(item, source_lines) for item in node.body if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))]
        classes.append({
            "name": node.name,
            "startLine": node.lineno,
            "endLine": getattr(node, "end_lineno", node.lineno),
            "column": node.col_offset,
            "methods": methods,
        })
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        functions.append(function_info(node, source_lines))
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        imports.append(statement_info(node, source_lines))

json.dump({"classes": classes, "functions": functions, "imports": imports, "statements": statements}, sys.stdout, ensure_ascii=False)
"#;
    let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
    command
        .args(["-X", "utf8", "-c", SCRIPT])
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 Python：{error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(code.as_bytes())
            .map_err(|error| error.to_string())?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    serde_json::from_slice(&output.stdout).map_err(|error| format!("无法解析 Python 结构：{error}"))
}

#[tauri::command]
fn start_python(
    app: AppHandle,
    tasks: State<PythonTasks>,
    code: String,
    timeout_secs: Option<u64>,
    python_path: Option<String>,
    project_path: Option<String>,
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
    if let Some(project_directory) = project_path
        .as_deref()
        .and_then(|path| Path::new(path).parent())
        .filter(|path| path.is_dir())
    {
        command.current_dir(project_directory);
    }
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

fn is_valid_manim_scene_name(value: &str) -> bool {
    let mut characters = value.trim().chars();
    match characters.next() {
        Some(character) if character.is_alphabetic() || character == '_' => {}
        _ => return false,
    }
    characters.all(|character| character.is_alphanumeric() || character == '_')
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
    output_file_name: Option<String>,
) -> Result<u64, String> {
    let mut active = tasks
        .active
        .lock()
        .map_err(|_| "Manim task state is unavailable")?;
    if active.is_some() {
        return Err("已有 Manim 渲染任务正在运行".into());
    }
    let scene_name = scene_name.trim().to_owned();
    if !is_valid_manim_scene_name(&scene_name) {
        return Err("invalid Manim scene name".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let storage_dir = manim_storage_dir(&app, storage_path.as_deref())?;
    let work_dir = storage_dir.join(format!("manim-{stamp}"));
    fs::create_dir_all(&work_dir)
        .map_err(|error| format!("cannot create Manim work directory: {error}"))?;
    let script_path = work_dir.join("scene.py");

    let config = render_config.unwrap_or(ManimRenderConfig {
        output_type: default_manim_output_type(),
        transparent_background: false,
        image_size_mode: default_manim_image_size_mode(),
        image_width: default_manim_image_width(),
        image_height: default_manim_image_height(),
        image_capture_mode: default_manim_image_capture_mode(),
        image_animation_step: default_manim_image_animation_step(),
        quality: "low".into(),
        fps: 15,
        renderer: "cairo".into(),
        disable_caching: false,
    });
    if !matches!(config.output_type.as_str(), "video" | "image") {
        return Err("invalid Manim output type".into());
    }
    if !matches!(config.image_size_mode.as_str(), "preset" | "custom") {
        return Err("invalid Manim image size mode".into());
    }
    if !(64..=8192).contains(&config.image_width) || !(64..=8192).contains(&config.image_height) {
        return Err("invalid Manim image dimensions".into());
    }
    if !matches!(config.image_capture_mode.as_str(), "final" | "animation") {
        return Err("invalid Manim image capture mode".into());
    }
    if !(1..=10_000).contains(&config.image_animation_step) {
        return Err("invalid Manim image animation step".into());
    }
    let requested_output_name = sanitize_manim_output_filename(
        output_file_name.as_deref(),
        &format!("{scene_name}-{stamp}"),
        &config.output_type,
    );
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
    let render_code = if config.output_type == "video" {
        prepare_manim_video_code(&code, &scene_name)
    } else {
        code
    };
    fs::write(&script_path, render_code)
        .map_err(|error| format!("cannot write Manim scene file: {error}"))?;

    let task_id = tasks.next_id.fetch_add(1, Ordering::Relaxed) + 1;
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
    if let Some(resolution) = manim_resolution_override(
        &config.output_type,
        &config.image_size_mode,
        config.image_width,
        config.image_height,
        &config.quality,
    ) {
        command.args(["--resolution", &resolution]);
    }
    if let Some(animation_range) = manim_image_animation_range(
        &config.output_type,
        &config.image_capture_mode,
        config.image_animation_step,
    ) {
        command.args(["--from_animation_number", &animation_range]);
    }
    command.args(manim_output_flags(
        &config.output_type,
        &config.renderer,
        config.transparent_background,
    ));
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
        id: task_id,
        pid,
        stopped: stopped.clone(),
    });
    drop(active);
    let captured_output = Arc::new(Mutex::new(String::new()));
    let stdout_reader = child.stdout.take().map(|stdout| {
        emit_manim_reader(
            app.clone(),
            task_id,
            "stdout",
            stdout,
            captured_output.clone(),
        )
    });
    let stderr_reader = child.stderr.take().map(|stderr| {
        emit_manim_reader(
            app.clone(),
            task_id,
            "stderr",
            stderr,
            captured_output.clone(),
        )
    });
    let work_dir_text = work_dir.to_string_lossy().into_owned();
    let output_type = config.output_type.clone();
    let transparent_background = config.transparent_background;
    let active_tasks = tasks.active.clone();
    thread::spawn(move || {
        let result = child.wait();
        if let Some(reader) = stdout_reader {
            let _ = reader.join();
        }
        if let Some(reader) = stderr_reader {
            let _ = reader.join();
        }
        let played_animation_count = captured_output
            .lock()
            .ok()
            .and_then(|output| extract_manim_played_animation_count(&output));
        let stopped_by_user = stopped.load(Ordering::SeqCst);
        if let Ok(mut active) = active_tasks.lock() {
            if active
                .as_ref()
                .is_some_and(|task| task.id == task_id && task.pid == pid)
            {
                *active = None;
            }
        }
        let (mut success, mut error) = match result {
            Ok(status) if status.success() => (true, None),
            Ok(_) if stopped_by_user => (false, None),
            Ok(status) => (false, Some(format!("Manim exited with status: {status}"))),
            Err(error) => (false, Some(error.to_string())),
        };
        let output_path = if success {
            match finalize_rendered_manim_output(
                &storage_dir,
                &work_dir,
                &requested_output_name,
                &output_type,
            ) {
                Ok(path) => Some(path.to_string_lossy().into_owned()),
                Err(finalize_error) => {
                    success = false;
                    error = Some(finalize_error);
                    None
                }
            }
        } else {
            None
        };
        let _ = app.emit(
            "manim-finished",
            ManimFinished {
                task_id,
                success,
                stopped: stopped_by_user,
                scene: scene_name,
                work_dir: work_dir_text,
                output_type,
                transparent_background,
                played_animation_count,
                output_path,
                error,
            },
        );
    });
    Ok(task_id)
}

#[tauri::command]
fn stop_manim_render(tasks: State<ManimTasks>, task_id: Option<u64>) -> Result<(), String> {
    let (pid, stopped) = {
        let mut active = tasks
            .active
            .lock()
            .map_err(|_| "Manim task state is unavailable")?;
        match active.as_ref() {
            Some(task) if task_id.is_some_and(|id| id != task.id) => return Ok(()),
            _ => {}
        }
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
    let output_path = PathBuf::from(path);
    if !output_path.is_file() {
        return Err("渲染结果文件不存在".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]).arg(&output_path);
        command.creation_flags(0x08000000);
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&output_path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&output_path)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn open_manim_guide(app: AppHandle) -> Result<(), String> {
    let bundled_path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录：{error}"))?
        .join("docs")
        .join("manim-plugin")
        .join("manim-plugin.html");
    if bundled_path.is_file() {
        return open_system_video(bundled_path.to_string_lossy().into_owned());
    }

    #[cfg(debug_assertions)]
    {
        let development_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("docs")
            .join("manim-plugin")
            .join("manim-plugin.html");
        if development_path.is_file() {
            return open_system_video(development_path.to_string_lossy().into_owned());
        }
    }

    Err("未找到内置 Manim 使用说明，请重新安装应用或重新生成说明文档。".into())
}

#[tauri::command]
fn open_plugin_development_guide(app: AppHandle) -> Result<(), String> {
    let bundled_path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录：{error}"))?
        .join("docs")
        .join("plugin-development")
        .join("plugin-development.html");
    if bundled_path.is_file() {
        return open_system_video(bundled_path.to_string_lossy().into_owned());
    }

    #[cfg(debug_assertions)]
    {
        let development_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("docs")
            .join("plugin-development")
            .join("plugin-development.html");
        if development_path.is_file() {
            return open_system_video(development_path.to_string_lossy().into_owned());
        }
    }

    Err("未找到插件开发文档，请检查项目文档目录或重新安装应用。".into())
}

#[tauri::command]
fn reveal_video_in_folder(path: String) -> Result<(), String> {
    let output_path = PathBuf::from(path);
    if !output_path.is_file() {
        return Err("渲染结果文件不存在".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer.exe");
        command.arg(format!("/select,{}", output_path.to_string_lossy()));
        command.creation_flags(0x08000000);
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R"])
            .arg(&output_path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let folder = output_path.parent().ok_or("无法定位渲染结果所在文件夹")?;
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
        .manage(AiChatRequests::default())
        .manage(CodexAgentState::default())
        .manage(PyrightState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
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
            rename_project_file,
            read_project_file,
            write_project_file,
            save_project_as,
            import_project_audio,
            replace_project_audio,
            inspect_project_resources,
            delete_project_resource,
            reveal_project_resource,
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
            read_external_plugin_files,
            install_external_plugin_zip,
            install_external_plugin_draft,
            delete_external_plugin,
            start_pyright_language_server,
            send_pyright_message,
            stop_pyright_language_server,
            validate_python_code,
            inspect_python_structure,
            start_python,
            stop_python,
            render_manim,
            stop_manim_render,
            get_manim_storage_info,
            clear_manim_render_files,
            get_tts_cache_info,
            clear_tts_cache,
            open_tts_cache_folder,
            open_manim_render_folder,
            open_system_video,
            open_manim_guide,
            open_plugin_development_guide,
            reveal_video_in_folder,
            has_tts_api_key,
            clear_tts_api_key,
            save_voice_clone_recording,
            delete_voice_clone_recording,
            create_cloned_voice,
            list_cloned_voices,
            list_tts_voices,
            delete_cloned_voice,
            synthesize_tts_preview,
            has_ai_api_key,
            clear_ai_api_key,
            test_ai_connection,
            ai_chat_completion,
            ai_chat_completion_stream,
            cancel_ai_chat_stream,
            send_python_input,
            codex_agent_start,
            codex_agent_request,
            codex_agent_notify,
            codex_agent_next_event,
            codex_agent_respond_to_request,
            codex_agent_reject_request,
            codex_agent_shutdown
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
    fn accepts_only_supported_python_versions() {
        assert!(is_supported_python_version("3.11.9"));
        assert!(is_supported_python_version("3.14.0"));
        assert!(!is_supported_python_version("3.10.14"));
        assert!(!is_supported_python_version("3.15.0a1"));
        assert!(!is_supported_python_version("2.7.18"));
    }

    #[test]
    fn defaults_ai_model_protocol_to_auto_for_older_configurations() {
        let config: AiModelConfig = serde_json::from_value(json!({
            "baseUrl": "https://example.com/v1",
            "model": "test-model"
        }))
        .expect("AI model config should deserialize");
        assert_eq!(config.protocol, "auto");
    }

    #[test]
    fn validates_ai_model_protocol_values() {
        assert!(validate_ai_model_protocol("auto").is_ok());
        assert!(validate_ai_model_protocol("responses").is_ok());
        assert!(validate_ai_model_protocol("chat-completions").is_ok());
        assert!(validate_ai_model_protocol("legacy").is_err());
    }

    #[test]
    fn accepts_unicode_manim_scene_names() {
        assert!(is_valid_manim_scene_name("你好Manim"));
        assert!(is_valid_manim_scene_name("圆形动画"));
        assert!(!is_valid_manim_scene_name("2D动画"));
        assert!(!is_valid_manim_scene_name("动画 场景"));
    }

    #[test]
    fn parses_legacy_python_launcher_paths() {
        let output = r#"
 -V:3.13 *        C:\Users\Ada Lovelace\Python313\python.exe
 -V:3.11          D:\Python311\python.exe
 ignored line
"#;
        assert_eq!(
            python_launcher_paths(output),
            vec![
                r"C:\Users\Ada Lovelace\Python313\python.exe",
                r"D:\Python311\python.exe"
            ]
        );
    }

    #[test]
    fn parses_tts_voice_lists_from_provider_payloads() {
        let voices = parse_tts_voice_options(&json!({
            "output": {
                "voice_list": [
                    { "voice": "Cherry", "name": "芊悦" },
                    { "voice_id": "longanlingxin", "desc": "龙安灵心" },
                    { "id": "bad id" }
                ]
            }
        }));
        assert_eq!(
            voices,
            vec![
                TtsVoiceOption {
                    id: "Cherry".into(),
                    label: "芊悦 · Cherry".into(),
                },
                TtsVoiceOption {
                    id: "longanlingxin".into(),
                    label: "龙安灵心 · longanlingxin".into(),
                },
            ]
        );
        assert!(is_bailian_voice_compatible(
            "qwen-audio-3.0-tts-flash",
            "loongmary"
        ));
        assert!(!is_bailian_voice_compatible("qwen-audio-3.0-tts-flash", ""));
    }

    #[test]
    fn builds_tts_endpoints_from_service_roots() {
        assert_eq!(
            openai_speech_endpoint("https://example.com/v1"),
            "https://example.com/v1/audio/speech"
        );
        assert_eq!(
            openai_speech_endpoint("https://example.com/custom/audio/speech"),
            "https://example.com/custom/audio/speech"
        );
        assert_eq!(
            openai_chat_endpoint("https://example.com/compatible-mode/v1"),
            "https://example.com/compatible-mode/v1/chat/completions"
        );
        assert!(uses_openai_chat_audio(
            "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
        ));
        assert_eq!(
            bailian_speech_endpoint("https://workspace.cn-beijing.maas.aliyuncs.com"),
            "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"
        );
        assert_eq!(
            bailian_voice_customization_endpoint("https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"),
            "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization"
        );
        assert_eq!(
            bailian_uploads_endpoint("https://workspace.cn-beijing.maas.aliyuncs.com/api/v1"),
            "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/uploads"
        );
    }

    #[test]
    fn reports_missing_tts_address_separately_from_invalid_addresses() {
        assert!(validate_tts_url("  ").unwrap_err().contains("尚未配置"));
        assert_eq!(validate_tts_url("wss://example.com/tts").unwrap(), "wss://example.com/tts");
        assert_eq!(
            validate_tts_url("https://example.com/").unwrap(),
            "https://example.com"
        );
        assert_eq!(
            bailian_speech_endpoint("wss://example.com/live"),
            "wss://example.com/live"
        );
        assert_eq!(
            bailian_http_base_url("wss://dashscope.aliyuncs.com/api-ws/v1/inference"),
            "https://dashscope.aliyuncs.com"
        );
        assert_eq!(
            bailian_voice_list_endpoint("wss://dashscope.aliyuncs.com/api-ws/v1/inference"),
            "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/voice-list"
        );
        assert!(is_websocket_tts_url(
            "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
        ));
        let start = bailian_websocket_run_task(
            "task-1",
            "qwen-audio-3.0-tts-flash",
            "longanhuan_v3.6",
            "mp3",
            1.0,
            Some("请使用稍快且清晰的语速朗读。"),
        );
        assert_eq!(start["header"]["action"], "run-task");
        assert_eq!(start["header"]["streaming"], "duplex");
        assert_eq!(start["payload"]["model"], "qwen-audio-3.0-tts-flash");
        assert_eq!(start["payload"]["parameters"]["voice"], "longanhuan_v3.6");
        assert_eq!(start["payload"]["input"], serde_json::json!({}));
        assert!(start["payload"]["parameters"].get("instruction").is_none());
        assert_eq!(
            bailian_websocket_continue_task("task-1", "今天天气怎么样？")["payload"]["input"]["text"],
            "今天天气怎么样？"
        );
    }

    #[test]
    fn explains_short_voice_clone_samples_without_exposing_provider_json() {
        let body = r#"{"code":"Audio.AudioShortError","message":"valid audio too short!","request_id":"test"}"#;
        let message = voice_clone_error_body(body);
        assert!(message.contains("有效人声不足"));
        assert!(message.contains("12-20 秒"));
        assert!(!message.contains("AudioShortError"));
    }

    #[test]
    fn builds_openai_chat_endpoints_from_common_base_urls() {
        assert_eq!(
            openai_chat_endpoint("https://dashscope.aliyuncs.com/compatible-mode/v1"),
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        );
        assert_eq!(
            openai_chat_endpoint("https://example.com/v1/chat/completions"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            openai_chat_endpoint("https://example.com"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn builds_openai_responses_endpoints_from_common_base_urls() {
        assert_eq!(
            openai_responses_endpoint("https://example.com/v1"),
            "https://example.com/v1/responses"
        );
        assert_eq!(
            openai_responses_endpoint("https://example.com/v1/responses"),
            "https://example.com/v1/responses"
        );
        assert_eq!(
            openai_responses_endpoint("https://example.com"),
            "https://example.com/v1/responses"
        );
    }

    #[test]
    fn builds_connection_probe_with_thinking_enabled() {
        let body = responses_connection_request_body("qwen3.7-flash", AiReasoningProfile::Enabled);
        assert_eq!(body["max_output_tokens"], 512);
        assert_eq!(body["enable_thinking"], true);
        assert_eq!(body["reasoning_effort"], "high");
        assert_eq!(body["reasoning"]["effort"], "high");
    }

    #[test]
    fn enables_thinking_for_generic_openai_compatible_providers() {
        let body =
            responses_connection_request_body("reasoning-model", AiReasoningProfile::Enabled);
        assert_eq!(body["enable_thinking"], true);
        assert_eq!(body["reasoning_effort"], "high");
        assert_eq!(body["reasoning"]["effort"], "high");
    }

    #[test]
    fn retries_responses_probe_once_when_only_reasoning_is_returned() {
        assert!(should_retry_responses_connection(0, None));
        assert!(!should_retry_responses_connection(0, Some("连接成功")));
        assert!(!should_retry_responses_connection(1, None));
    }

    #[test]
    fn extracts_text_from_openai_responses_payloads() {
        assert_eq!(
            responses_message_content(&json!({
                "output": [{
                    "type": "message",
                    "content": [{ "type": "output_text", "text": "hello" }]
                }]
            })),
            Some("hello".into())
        );
        assert_eq!(
            responses_message_content(&json!({ "output_text": "fallback" })),
            Some("fallback".into())
        );
    }

    #[test]
    fn recognizes_responses_endpoint_protocol_errors() {
        assert!(is_responses_endpoint_unsupported(404, "Not support"));
        assert!(is_responses_endpoint_unsupported(
            0,
            "AI request failed (HTTP 405): Method Not Allowed"
        ));
        assert!(is_responses_endpoint_unsupported(400, "Responses endpoint is unsupported"));
        assert!(!is_responses_endpoint_unsupported(400, "invalid model"));
        assert!(!is_responses_endpoint_unsupported(401, "Unauthorized"));
    }

    #[test]
    fn extracts_text_from_openai_chat_responses() {
        assert_eq!(
            ai_message_content(&json!({ "choices": [{ "message": { "content": "hello" } }] })),
            Some("hello".into())
        );
        assert_eq!(
            ai_message_content(&json!({
                "choices": [{ "message": { "content": [{ "type": "text", "text": "hel" }, { "type": "text", "text": "lo" }] } }]
            })),
            Some("hello".into())
        );
    }

    #[test]
    fn extracts_and_merges_openai_tool_calls() {
        let calls = ai_message_tool_calls(&json!({
            "choices": [{ "message": { "content": null, "tool_calls": [{
                "id": "call-1",
                "type": "function",
                "function": { "name": "get_context", "arguments": "{}" }
            }] } }]
        }));
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call-1");
        assert_eq!(calls[0].function.name, "get_context");

        let mut streamed = Vec::new();
        merge_ai_stream_tool_calls(
            &json!({ "choices": [{ "delta": { "tool_calls": [{
                "index": 0, "id": "call-2", "type": "function",
                "function": { "name": "explore_blocks", "arguments": "{\"queries\":" }
            }] } }] }),
            &mut streamed,
        );
        merge_ai_stream_tool_calls(
            &json!({ "choices": [{ "delta": { "tool_calls": [{
                "index": 0, "function": { "arguments": "[\"圆形\"]}" }
            }] } }] }),
            &mut streamed,
        );
        let calls = finish_ai_stream_tool_calls(streamed);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.name, "explore_blocks");
        assert_eq!(calls[0].function.arguments, "{\"queries\":[\"圆形\"]}");

        let deltas =
            ai_stream_tool_argument_deltas(&json!({ "choices": [{ "delta": { "tool_calls": [{
            "index": 2, "function": { "name": "replace_code", "arguments": "{\"code\":\"pri" }
        }] } }] }));
        assert_eq!(
            deltas,
            vec![(2, Some("replace_code".into()), "{\"code\":\"pri".into())]
        );
    }

    #[test]
    fn extracts_non_stream_tool_calls_individually_when_metadata_is_incomplete() {
        let calls = ai_message_tool_calls(&json!({
            "choices": [{ "message": { "content": null, "tool_calls": [
                { "function": { "name": "get_context", "arguments": "" } },
                { "id": "same", "function": { "name": "get_scene", "arguments": {} } },
                { "id": "same", "type": "function", "function": { "name": "check_code", "arguments": "{}" } }
            ] } }]
        }));

        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0].id, "call-0");
        assert_eq!(calls[0].kind, "function");
        assert_eq!(calls[0].function.name, "get_context");
        assert_eq!(calls[0].function.arguments, "{}");
        assert_eq!(calls[1].function.arguments, "{}");
        assert_eq!(calls[2].id, "same-2");
    }

    #[test]
    fn merges_stream_tool_fragments_by_id_when_index_is_missing() {
        let mut streamed = Vec::new();
        merge_ai_stream_tool_calls(
            &json!({ "choices": [{ "delta": { "tool_calls": [
                { "index": 0, "id": "call-1", "type": "function", "function": { "name": "get_context", "arguments": "{}" } },
                { "index": 1, "id": "call-2", "type": "function", "function": { "name": "get_scene", "arguments": "{\"sceneId\":\"" } }
            ] } }] }),
            &mut streamed,
        );
        merge_ai_stream_tool_calls(
            &json!({ "choices": [{ "delta": { "tool_calls": [{
                "id": "call-2", "function": { "arguments": "demo\"}" }
            }] } }] }),
            &mut streamed,
        );

        let calls = finish_ai_stream_tool_calls(streamed);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].id, "call-1");
        assert_eq!(calls[0].function.arguments, "{}");
        assert_eq!(calls[1].id, "call-2");
        assert_eq!(calls[1].function.arguments, "{\"sceneId\":\"demo\"}");
    }

    #[test]
    fn ignores_repeated_stream_tool_metadata() {
        let mut streamed = Vec::new();
        for arguments in ["{\"include", "Resources\":true}"] {
            merge_ai_stream_tool_calls(
                &json!({ "choices": [{ "delta": { "tool_calls": [{
                    "index": 0,
                    "id": "call-1",
                    "type": "function",
                    "function": { "name": "get_context", "arguments": arguments }
                }] } }] }),
                &mut streamed,
            );
        }

        let calls = finish_ai_stream_tool_calls(streamed);
        assert_eq!(calls[0].id, "call-1");
        assert_eq!(calls[0].kind, "function");
        assert_eq!(calls[0].function.name, "get_context");
        assert_eq!(calls[0].function.arguments, "{\"includeResources\":true}");
    }

    #[test]
    fn recognizes_reasoning_and_finish_events() {
        let reasoning = json!({ "choices": [{ "delta": { "reasoning_content": "thinking" } }] });
        let finished = json!({ "choices": [{ "delta": {}, "finish_reason": "length" }] });
        assert_eq!(ai_stream_reasoning_delta(&reasoning), Some("thinking"));
        assert_eq!(ai_stream_finish_reason(&finished), Some("length"));
    }

    #[test]
    fn ai_reasoning_effort_uses_openai_values() {
        let mut body = json!({ "model": "reasoning-model" });
        apply_ai_reasoning_effort(&mut body, Some("xhigh")).unwrap();
        assert_eq!(body["reasoning_effort"], "xhigh");
        apply_ai_reasoning_effort(&mut body, None).unwrap();
        assert_eq!(body["reasoning_effort"], "high");

        assert!(apply_ai_reasoning_effort(&mut body, Some("extra-high")).is_err());
    }

    #[test]
    fn enables_thinking_by_default_for_openai_compatible_models() {
        let mut body = json!({ "model": "qwen3.7-flash" });
        apply_ai_reasoning_controls(
            &mut body,
            Some("high"),
            AiReasoningProfile::Enabled,
            false,
        )
        .unwrap();
        assert_eq!(body["enable_thinking"], true);
        assert_eq!(body["reasoning_effort"], "high");
        assert!(body.get("reasoning").is_none());
    }

    #[test]
    fn maps_always_on_thinking_effort_to_provider_values() {
        let mut body = json!({ "model": "ZHIPU/GLM-5.3-Flash" });
        apply_ai_reasoning_controls(
            &mut body,
            Some("xhigh"),
            AiReasoningProfile::AlwaysOn,
            false,
        )
        .unwrap();
        assert_eq!(body["enable_thinking"], true);
        assert_eq!(body["reasoning_effort"], "max");

        apply_ai_reasoning_controls(
            &mut body,
            Some("medium"),
            AiReasoningProfile::AlwaysOn,
            false,
        )
        .unwrap();
        assert_eq!(body["reasoning_effort"], "high");
    }

    #[test]
    fn retries_reasoning_profiles_for_provider_errors() {
        assert_eq!(
            ai_reasoning_error_kind(
                400,
                "该模型始终思考，不支持关闭思考；请使用 low、high 或 max。"
            ),
            Some(AiReasoningErrorKind::AlwaysOnRequired)
        );
        assert_eq!(
            next_ai_reasoning_profile(
                AiReasoningProfile::Enabled,
                AiReasoningErrorKind::AlwaysOnRequired
            ),
            Some(AiReasoningProfile::AlwaysOn)
        );
        assert_eq!(
            next_ai_reasoning_profile(
                AiReasoningProfile::Enabled,
                AiReasoningErrorKind::UnknownEnableThinking
            ),
            Some(AiReasoningProfile::EffortOnly)
        );
        assert_eq!(
            next_ai_reasoning_profile(
                AiReasoningProfile::EffortOnly,
                AiReasoningErrorKind::UnknownReasoningParameter
            ),
            Some(AiReasoningProfile::Omitted)
        );
        assert_eq!(
            next_ai_reasoning_profile(
                AiReasoningProfile::AlwaysOn,
                AiReasoningErrorKind::AlwaysOnRequired
            ),
            None
        );
        assert_eq!(
            ai_reasoning_error_kind(401, "reasoning_effort is invalid"),
            None
        );
    }

    #[test]
    fn marks_ai_requests_as_cancelled() {
        let cancellation = AiRequestCancellation::default();
        assert!(!cancellation.cancelled.load(Ordering::SeqCst));
        cancellation.cancel();
        assert!(cancellation.cancelled.load(Ordering::SeqCst));
    }

    #[test]
    fn falls_back_to_chat_when_responses_thinking_is_rejected() {
        assert!(should_fallback_responses_probe_to_chat(
            "AI 请求失败（HTTP 400）：该模型始终思考，不支持关闭思考；请使用 low、high 或 max。"
        ));
        assert!(should_fallback_responses_probe_to_chat(
            "AI 请求失败（HTTP 404）：Not support"
        ));
        assert!(!should_fallback_responses_probe_to_chat(
            "AI 请求失败（HTTP 401）：Unauthorized"
        ));
    }

    #[test]
    fn builds_streaming_ai_client_without_a_short_total_timeout() {
        assert!(build_ai_http_client(true).is_ok());
        assert!(build_ai_http_client(false).is_ok());
    }

    #[test]
    fn requests_stream_usage_only_from_known_compatible_providers() {
        assert!(supports_ai_stream_usage("https://api.openai.com/v1"));
        assert!(supports_ai_stream_usage(
            "https://dashscope.aliyuncs.com/compatible-mode/v1"
        ));
        assert!(!supports_ai_stream_usage("https://example.com/v1"));
    }

    #[test]
    fn reads_cache_usage_from_openai_and_compatible_shapes() {
        let openai = serde_json::json!({
            "prompt_tokens_details": { "cached_tokens": 768, "cache_creation_tokens": 128 }
        });
        assert_eq!(ai_cache_usage(&openai), (Some(768), Some(128)));

        let responses = serde_json::json!({
            "input_tokens_details": { "cached_tokens": 1536 }
        });
        assert_eq!(ai_cache_usage(&responses), (Some(1536), None));

        let compatible = serde_json::json!({
            "cache_read_input_tokens": 2048,
            "cache_creation_input_tokens": 256
        });
        assert_eq!(ai_cache_usage(&compatible), (Some(2048), Some(256)));

        let responses_usage = serde_json::json!({
            "input_tokens": 3000,
            "output_tokens": 200,
            "input_tokens_details": { "cached_tokens": 2800 }
        });
        assert_eq!(
            ai_token_usage(&responses_usage),
            (Some(3000), Some(200), Some(3200), Some(2800), None)
        );
    }

    #[test]
    fn parses_openai_sse_events_across_network_chunks() {
        let mut buffer = b"data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n".to_vec();
        assert!(take_sse_events(&mut buffer).is_empty());
        buffer.extend_from_slice(
            b"\ndata: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\r\n\r\ndata: [DONE]\n\n",
        );
        let events = take_sse_events(&mut buffer);
        assert_eq!(events.len(), 3);
        let first: Value = serde_json::from_str(&events[0]).unwrap();
        let second: Value = serde_json::from_str(&events[1]).unwrap();
        assert_eq!(ai_stream_delta(&first), Some("hel".into()));
        assert_eq!(ai_stream_delta(&second), Some("lo".into()));
        assert_eq!(events[2], "[DONE]");
        assert!(buffer.is_empty());
    }

    #[test]
    fn validates_ai_request_addresses() {
        assert!(validate_ai_base_url("https://example.com/v1").is_ok());
        assert!(validate_ai_base_url("http://127.0.0.1:11434/v1").is_ok());
        assert!(validate_ai_base_url("file:///tmp/model").is_err());
        assert!(validate_ai_base_url("https://user:secret@example.com/v1").is_err());
        assert!(validate_ai_base_url("https://example.com/v1?token=secret").is_err());
    }

    #[test]
    fn finds_nested_tts_audio_urls() {
        let response = json!({ "output": { "audio": { "url": "https://example.com/voice.wav" } } });
        assert_eq!(
            find_audio_url(&response),
            Some("https://example.com/voice.wav")
        );
        assert_eq!(find_audio_url(&json!({ "output": {} })), None);
        let compatible = json!({ "choices": [{ "message": { "audio": { "data": "UklGRg==" } } }] });
        assert_eq!(find_audio_base64(&compatible), Some("UklGRg=="));
    }

    #[test]
    fn reads_pcm_wav_duration() {
        let mut wav = vec![0u8; 48_044];
        wav[0..4].copy_from_slice(b"RIFF");
        wav[4..8].copy_from_slice(&(48_036u32).to_le_bytes());
        wav[8..12].copy_from_slice(b"WAVE");
        wav[12..16].copy_from_slice(b"fmt ");
        wav[16..20].copy_from_slice(&(16u32).to_le_bytes());
        wav[20..22].copy_from_slice(&(1u16).to_le_bytes());
        wav[22..24].copy_from_slice(&(1u16).to_le_bytes());
        wav[24..28].copy_from_slice(&(24_000u32).to_le_bytes());
        wav[28..32].copy_from_slice(&(48_000u32).to_le_bytes());
        wav[32..34].copy_from_slice(&(2u16).to_le_bytes());
        wav[34..36].copy_from_slice(&(16u16).to_le_bytes());
        wav[36..40].copy_from_slice(b"data");
        wav[40..44].copy_from_slice(&(48_000u32).to_le_bytes());
        assert_eq!(wav_duration_seconds(&wav), Some(1.0));

        wav[4..8].copy_from_slice(&(0x7fff_ffffu32).to_le_bytes());
        wav[40..44].copy_from_slice(&(0x7fff_ffffu32).to_le_bytes());
        assert_eq!(wav_duration_seconds(&wav), Some(1.0));
    }

    #[test]
    fn creates_stable_and_config_sensitive_tts_cache_keys() {
        let config = TtsConfig {
            provider: "aliyun-bailian".into(),
            base_url: "https://example.com".into(),
            model: "qwen-audio-3.0-tts-plus".into(),
            voice: "longanlingxin".into(),
            speed: 1.0,
            audio_format: "wav".into(),
            emotion: "auto".into(),
            tone: "natural".into(),
            intonation: "natural".into(),
            reading_style: "natural".into(),
            custom_instruction: String::new(),
        };
        assert_eq!(
            tts_cache_key(&config, "同一段旁白", "wav"),
            tts_cache_key(&config, "同一段旁白", "wav")
        );
        let mut changed = config.clone();
        changed.speed = 1.2;
        assert_ne!(
            tts_cache_key(&config, "同一段旁白", "wav"),
            tts_cache_key(&changed, "同一段旁白", "wav")
        );
        changed.speed = 1.0;
        changed.emotion = "happy".into();
        assert_ne!(
            tts_cache_key(&config, "同一段旁白", "wav"),
            tts_cache_key(&changed, "同一段旁白", "wav")
        );
    }

    #[test]
    fn builds_native_tts_expression_instructions() {
        let config = TtsConfig {
            provider: "aliyun-bailian".into(),
            base_url: "https://example.com".into(),
            model: BAILIAN_VOICE_CLONE_MODEL.into(),
            voice: "longanlingxin".into(),
            speed: 0.8,
            audio_format: "wav".into(),
            emotion: "happy".into(),
            tone: "friendly".into(),
            intonation: "expressive".into(),
            reading_style: "teaching".into(),
            custom_instruction: "公式部分读得更清楚".into(),
        };
        let instruction = tts_instruction(&config).unwrap().unwrap();
        assert!(instruction.contains("愉快明朗"));
        assert!(instruction.contains("亲切友好"));
        assert!(instruction.contains("抑扬丰富"));
        assert!(instruction.contains("课程讲解"));
        assert!(instruction.contains("稍慢"));
        assert!(instruction.ends_with("公式部分读得更清楚。"));
    }

    #[test]
    fn counts_only_managed_tts_audio_cache_files() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-tts-cache-test-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("first.wav"), vec![0u8; 12]).unwrap();
        fs::write(root.join("second.mp3"), vec![0u8; 8]).unwrap();
        fs::write(root.join("notes.txt"), vec![0u8; 40]).unwrap();
        let info = read_tts_cache_info_from_path(&root);
        assert_eq!(info.clip_count, 2);
        assert_eq!(info.size_bytes, 20);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn validates_bailian_model_voice_pairs() {
        assert!(is_bailian_voice_compatible(
            "qwen-audio-3.0-tts-plus",
            "longanlingxin"
        ));
        assert!(!is_bailian_voice_compatible(
            "qwen-audio-3.0-tts-flash",
            "longanlingxi"
        ));
        assert!(is_bailian_voice_compatible(
            "qwen-audio-3.0-tts-plus",
            "longanlufeng"
        ));
        assert!(!is_bailian_voice_compatible(
            "qwen-audio-3.0-tts-plus",
            "longanlingxi"
        ));
        assert!(is_bailian_voice_compatible(
            BAILIAN_VOICE_CLONE_MODEL,
            "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3"
        ));
        assert!(!is_bailian_voice_compatible(
            BAILIAN_VOICE_CLONE_MODEL,
            "loongmary"
        ));
        assert_eq!(
            voice_sample_mime(Path::new("sample.wav")),
            Some("audio/wav")
        );
        assert_eq!(
            voice_sample_mime(Path::new("sample.M4A")),
            Some("audio/mp4")
        );
        assert_eq!(voice_sample_mime(Path::new("sample.ogg")), None);
    }

    #[test]
    fn parses_only_supported_remote_cloned_voices() {
        let payload = json!({
            "output": { "voice_list": [
                { "voice_id": "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3", "target_model": BAILIAN_VOICE_CLONE_MODEL, "language": "zh", "gmt_create": "2026-07-29" },
                { "voice": "other_voice", "target_model": "qwen3-tts-vc-realtime-2026-01-15" },
                { "voice": "非法音色", "target_model": BAILIAN_VOICE_CLONE_MODEL }
            ] }
        });
        let voices = parse_remote_cloned_voices(&payload);
        assert_eq!(voices.len(), 1);
        assert_eq!(voices[0].voice, "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3");
        assert_eq!(voices[0].language, "zh");
    }

    #[test]
    fn recognizes_only_managed_manim_render_entries() {
        assert!(is_manim_render_entry(Path::new("manim-123456")));
        assert!(!is_manim_render_entry(Path::new("manim-notes")));
        assert!(!is_manim_render_entry(Path::new("manim-123-backup")));
        assert!(!is_manim_render_entry(Path::new("personal-videos")));
        assert!(!is_manim_render_entry(Path::new("manim")));
    }

    #[test]
    fn validates_and_renames_vpy_project_files() {
        assert_eq!(normalize_vpy_file_name("lesson").unwrap(), "lesson.vpy");
        assert!(normalize_vpy_file_name("lesson:01").is_err());
        assert!(normalize_vpy_file_name("CON.vpy").is_err());

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-rename-test-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        let original = root.join("old.vpy");
        fs::write(&original, br#"{"version":1,"resources":[]}"#).unwrap();
        let original_assets = root.join("old.assets");
        fs::create_dir_all(original_assets.join("audio")).unwrap();
        fs::write(original_assets.join("audio").join("voice.wav"), b"audio").unwrap();

        let renamed =
            rename_project_file(original.to_string_lossy().into_owned(), "new-name".into())
                .unwrap();

        assert_eq!(PathBuf::from(renamed), root.join("new-name.vpy"));
        assert!(!original.exists());
        assert!(root.join("new-name.vpy").is_file());
        assert!(!original_assets.exists());
        assert!(root
            .join("new-name.assets")
            .join("audio")
            .join("voice.wav")
            .is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_vpy_projects_without_frontend_file_scope_grants() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-read-project-test-{}",
            transaction_stamp()
        ));
        fs::create_dir_all(&root).unwrap();
        let project = root.join("lesson.vpy");
        let contents = r#"{"version":1,"name":"lesson.vpy","workspace":{}}"#;
        fs::write(&project, contents).unwrap();

        assert_eq!(
            read_project_file(project.to_string_lossy().into_owned()).unwrap(),
            contents
        );
        assert!(read_project_file(root.join("lesson.txt").to_string_lossy().into_owned()).is_err());
        assert!(
            read_project_file(root.join("missing.vpy").to_string_lossy().into_owned()).is_err()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn renames_project_and_resources_when_only_letter_case_changes() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-case-rename-test-{}",
            transaction_stamp()
        ));
        fs::create_dir_all(root.join("Lesson.assets")).unwrap();
        fs::write(root.join("Lesson.vpy"), br#"{"version":1,"resources":[]}"#).unwrap();
        fs::write(root.join("Lesson.assets").join("voice.wav"), b"audio").unwrap();

        let renamed = rename_project_file(
            root.join("Lesson.vpy").to_string_lossy().into_owned(),
            "lesson.vpy".into(),
        )
        .unwrap();

        assert_eq!(PathBuf::from(renamed), root.join("lesson.vpy"));
        assert!(root.join("lesson.assets").join("voice.wav").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saves_project_and_assets_as_one_recoverable_unit() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-save-as-test-{}",
            transaction_stamp()
        ));
        fs::create_dir_all(root.join("source.assets").join("audio")).unwrap();
        let source = root.join("source.vpy");
        let destination = root.join("destination.vpy");
        fs::write(
            &source,
            br#"{"version":1,"name":"source.vpy","workspace":{},"resources":[]}"#,
        )
        .unwrap();
        fs::write(
            root.join("source.assets").join("audio").join("new.wav"),
            b"new",
        )
        .unwrap();
        fs::write(&destination, b"old project").unwrap();
        fs::create_dir_all(root.join("destination.assets")).unwrap();
        fs::write(root.join("destination.assets").join("old.wav"), b"old").unwrap();

        let contents = r#"{"version":1,"name":"destination.vpy","workspace":{},"resources":[]}"#;
        save_project_as(
            Some(source.to_string_lossy().into_owned()),
            destination.to_string_lossy().into_owned(),
            contents.into(),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&destination).unwrap(), contents);
        assert!(root
            .join("destination.assets")
            .join("audio")
            .join("new.wav")
            .is_file());
        assert!(!root.join("destination.assets").join("old.wav").exists());
        assert!(fs::read_dir(&root).unwrap().flatten().all(|entry| !entry
            .file_name()
            .to_string_lossy()
            .starts_with(".visual-python-")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn restores_destination_when_save_as_cannot_install_assets() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-save-as-rollback-test-{}",
            transaction_stamp()
        ));
        fs::create_dir_all(root.join("source.assets")).unwrap();
        let source = root.join("source.vpy");
        let destination = root.join("destination.vpy");
        fs::write(&source, b"source project").unwrap();
        fs::write(root.join("source.assets").join("new.wav"), b"new").unwrap();
        fs::write(&destination, b"old project").unwrap();
        fs::write(root.join("destination.assets"), b"blocking file").unwrap();

        assert!(save_project_as(
            Some(source.to_string_lossy().into_owned()),
            destination.to_string_lossy().into_owned(),
            "new project".into(),
        )
        .is_err());

        assert_eq!(fs::read(&destination).unwrap(), b"old project");
        assert_eq!(
            fs::read(root.join("destination.assets")).unwrap(),
            b"blocking file"
        );
        assert!(fs::read_dir(&root).unwrap().flatten().all(|entry| !entry
            .file_name()
            .to_string_lossy()
            .starts_with(".visual-python-")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn updates_project_resource_metadata_without_touching_other_fields() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-resource-metadata-test-{}",
            transaction_stamp()
        ));
        fs::create_dir_all(&root).unwrap();
        let project = root.join("lesson.vpy");
        fs::write(
            &project,
            br#"{"version":1,"name":"lesson.vpy","workspace":{"blocks":{}},"resources":[]}"#,
        )
        .unwrap();

        update_project_resources(&project, |resources| {
            resources.push(serde_json::json!({"id":"audio-1","type":"audio","path":"audio/a.wav","originalName":"a.wav","size":3}));
            Ok(())
        })
        .unwrap();

        let value: Value = serde_json::from_str(&fs::read_to_string(&project).unwrap()).unwrap();
        assert_eq!(value["name"], "lesson.vpy");
        assert_eq!(value["workspace"]["blocks"], serde_json::json!({}));
        assert_eq!(value["resources"][0]["id"], "audio-1");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_delete_a_resource_still_used_by_the_saved_workspace() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-resource-usage-test-{}",
            transaction_stamp()
        ));
        fs::create_dir_all(&root).unwrap();
        let project = root.join("lesson.vpy");
        fs::write(
            &project,
            br#"{"version":1,"name":"lesson.vpy","workspace":{"fields":{"TEXT":"resource://audio-1"}},"resources":[{"id":"audio-1","type":"audio","path":"audio/a.wav","originalName":"a.wav","size":3}]}"#,
        )
        .unwrap();

        assert!(saved_project_uses_resource(&project, "audio/a.wav").unwrap());
        assert!(delete_project_resource(
            project.to_string_lossy().into_owned(),
            "audio/a.wav".into(),
        )
        .unwrap_err()
        .contains("请先保存"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn builds_output_specific_manim_flags() {
        assert_eq!(
            manim_output_flags("image", "cairo", true),
            vec!["--save_last_frame", "--transparent"]
        );
        assert_eq!(
            manim_output_flags("image", "opengl", false),
            vec!["--save_last_frame"]
        );
        assert_eq!(
            manim_output_flags("video", "opengl", true),
            vec!["--write_to_movie"]
        );
        assert!(manim_output_flags("video", "cairo", true).is_empty());
        assert_eq!(
            manim_resolution_override("image", "custom", 1200, 800, "preview"),
            Some("1200,800".into())
        );
        assert_eq!(
            manim_resolution_override("image", "preset", 1200, 800, "preview"),
            Some("640,360".into())
        );
        assert_eq!(
            manim_resolution_override("video", "custom", 1200, 800, "high"),
            None
        );
        assert_eq!(
            manim_image_animation_range("image", "animation", 1),
            Some("0,0".into())
        );
        assert_eq!(
            manim_image_animation_range("image", "animation", 4),
            Some("0,3".into())
        );
        assert_eq!(manim_image_animation_range("image", "final", 4), None);
        assert_eq!(manim_image_animation_range("video", "animation", 4), None);
    }

    #[test]
    fn reads_the_final_manim_playback_step_count() {
        assert_eq!(
            extract_manim_played_animation_count("INFO Rendered MainScene\nPlayed 3 animations\n"),
            Some(3)
        );
        assert_eq!(
            extract_manim_played_animation_count(
                "Played 2 animations\nother output\nPlayed 0 animations\n"
            ),
            Some(0)
        );
        assert_eq!(extract_manim_played_animation_count("rendering"), None);
    }

    #[test]
    fn sanitizes_and_numbers_manim_output_names() {
        assert_eq!(
            sanitize_manim_output_filename(Some("lesson: 01?.mp4"), "fallback", "video"),
            "lesson_ 01_.mp4"
        );
        assert_eq!(
            sanitize_manim_output_filename(Some("CON.mp4"), "fallback", "video"),
            "_CON.mp4"
        );

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-manim-output-test-{suffix}"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("lesson.mp4"), b"existing").unwrap();
        assert_eq!(
            unique_manim_output_path(&root, "lesson.mp4"),
            root.join("lesson (2).mp4")
        );
        fs::write(root.join("cover.png"), b"existing").unwrap();
        assert_eq!(
            unique_manim_output_path(&root, "cover.png"),
            root.join("cover (2).png")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn records_final_manim_output_with_its_work_directory() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-manim-finalize-test-{suffix}"));
        let work_dir = root.join("manim-123");
        fs::create_dir_all(&work_dir).unwrap();
        let source = work_dir.join("source.mp4");
        fs::write(&source, b"video").unwrap();

        let output = finalize_manim_output(&root, &work_dir, &source, "lesson.mp4").unwrap();

        assert_eq!(output, root.join("lesson.mp4"));
        assert_eq!(managed_manim_output_path(&root, &work_dir), Some(output));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_successful_manim_runs_without_a_video() {
        let root = std::env::temp_dir().join(format!(
            "visual-python-manim-missing-output-test-{}",
            transaction_stamp()
        ));
        let work_dir = root.join("manim-123");
        fs::create_dir_all(&work_dir).unwrap();

        assert_eq!(
            finalize_rendered_manim_output(&root, &work_dir, "lesson.mp4", "video").unwrap_err(),
            "Manim completed without producing an MP4 video"
        );
        assert_eq!(
            finalize_rendered_manim_output(&root, &work_dir, "lesson.png", "image").unwrap_err(),
            "Manim completed without producing a PNG image"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn identifies_static_manim_scenes_that_need_a_video_frame() {
        assert!(manim_video_needs_frame(
            "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.add(Circle())\n"
        ));
        assert!(!manim_video_needs_frame(
            "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.play(Create(Circle()))\n"
        ));
        assert!(!manim_video_needs_frame(
            "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.wait(1)\n"
        ));
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
          "python": { "packages": ["numpy"], "minimumVersion": "3.11" },
          "agent": {
            "description": "处理示例项目",
            "tools": ["inspect_sample"],
            "fileTypes": [".sample"],
            "detect": "content",
            "codegen": {
              "entryBlock": "visual_python_sample_program",
              "statementInput": "BODY",
              "runtimeNames": ["workspace", "actor"]
            }
          }
        }))
        .expect("valid manifest");

        assert_eq!(manifest.id, "visual-python.sample");
        assert_eq!(manifest.agent.as_ref().unwrap().description, "处理示例项目");
        assert_eq!(
            manifest.agent.as_ref().unwrap().tools.as_ref().unwrap(),
            &["inspect_sample"]
        );
        assert_eq!(
            manifest
                .agent
                .as_ref()
                .unwrap()
                .file_types
                .as_ref()
                .unwrap(),
            &[".sample"]
        );
        let codegen = manifest.agent.as_ref().unwrap().codegen.as_ref().unwrap();
        assert_eq!(
            codegen.entry_block.as_deref(),
            Some("visual_python_sample_program")
        );
        assert_eq!(codegen.statement_input.as_deref(), Some("BODY"));
        assert_eq!(
            codegen.runtime_names.as_ref().unwrap(),
            &["workspace", "actor"]
        );
    }

    #[test]
    fn rejects_invalid_agent_manifest() {
        let errors = validate_plugin_manifest_value(&json!({
          "id": "visual-python.sample",
          "name": "Sample",
          "version": "1.2.3",
          "apiVersion": "1",
          "entry": "index.js",
          "agent": {
            "description": "",
            "tools": [""],
            "fileTypes": [""],
            "detect": "unknown",
            "codegen": {
              "entryBlock": "",
              "statementInput": "",
              "runtimeNames": [""]
            }
          }
        }))
        .expect_err("invalid agent manifest");

        assert!(errors
            .iter()
            .any(|error| error.contains("agent description cannot be empty")));
        assert!(errors
            .iter()
            .any(|error| error.contains("agent tools cannot contain empty names")));
        assert!(errors
            .iter()
            .any(|error| error.contains("agent file types cannot contain empty values")));
        assert!(errors
            .iter()
            .any(|error| error.contains("agent detect must be one of")));
        assert!(errors
            .iter()
            .any(|error| error.contains("agent codegen entry block cannot be empty")));
        assert!(errors
            .iter()
            .any(|error| error.contains("agent codegen statement input cannot be empty")));
        assert!(
            errors
                .iter()
                .any(|error| error
                    .contains("agent codegen runtime names cannot contain empty values"))
        );
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
    fn installs_external_plugin_draft_files_safely() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-plugin-draft-test-{suffix}"));
        let plugins_dir = root.join("plugins");
        fs::create_dir_all(&root).unwrap();
        let files = HashMap::from([
            ("plugin.json".to_owned(), r#"{"id":"visual-python.draft-demo","name":"Draft Demo","version":"1.0.0","apiVersion":"1","entry":"index.js"}"#.to_owned()),
            ("index.js".to_owned(), "export default { activate() {} };".to_owned()),
            ("docs/README.md".to_owned(), "# Draft Demo\n".to_owned()),
        ]);

        let discovery =
            install_external_plugin_draft_files(files, &plugins_dir).expect("installed draft");
        assert!(discovery.valid);
        assert!(plugins_dir
            .join("visual-python.draft-demo")
            .join("docs/README.md")
            .exists());

        let replacement_files = HashMap::from([
            ("plugin.json".to_owned(), r#"{"id":"visual-python.draft-demo","name":"Draft Demo Updated","version":"1.0.1","apiVersion":"1","entry":"index.js"}"#.to_owned()),
            ("index.js".to_owned(), "export default { activate() {} };".to_owned()),
            ("README.md".to_owned(), "# Updated\n".to_owned()),
        ]);
        install_external_plugin_draft_files(replacement_files, &plugins_dir)
            .expect("replaced draft");
        assert_eq!(
            fs::read_to_string(
                plugins_dir
                    .join("visual-python.draft-demo")
                    .join("README.md")
            )
            .unwrap(),
            "# Updated\n"
        );
        assert!(!fs::read_dir(&plugins_dir)
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().starts_with(".backup-")));

        let unsafe_files = HashMap::from([
            ("plugin.json".to_owned(), r#"{"id":"visual-python.unsafe","name":"Unsafe","version":"1.0.0","apiVersion":"1","entry":"index.js"}"#.to_owned()),
            ("../outside.js".to_owned(), "bad".to_owned()),
            ("index.js".to_owned(), "export default { activate() {} };".to_owned()),
        ]);
        assert!(install_external_plugin_draft_files(unsafe_files, &plugins_dir).is_err());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reads_installed_plugin_text_files_by_id() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-plugin-read-test-{suffix}"));
        let plugins_dir = root.join("plugins");
        let plugin_dir = plugins_dir.join("visual-python.read-demo");
        fs::create_dir_all(plugin_dir.join("docs")).unwrap();
        fs::write(plugin_dir.join("plugin.json"), r#"{"id":"visual-python.read-demo","name":"Read Demo","version":"1.0.0","apiVersion":"1","entry":"index.js"}"#).unwrap();
        fs::write(
            plugin_dir.join("index.js"),
            "export default { activate() {} };\n",
        )
        .unwrap();
        fs::write(plugin_dir.join("docs").join("guide.txt"), "guide\n").unwrap();

        let files = read_external_plugin_files_from_dir("visual-python.read-demo", &plugins_dir)
            .expect("read plugin files");

        assert_eq!(
            files.get("docs/guide.txt").map(String::as_str),
            Some("guide\n")
        );
        assert!(read_external_plugin_files_from_dir("../outside", &plugins_dir).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_binary_installed_plugin_files() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("visual-python-plugin-binary-test-{suffix}"));
        let plugins_dir = root.join("plugins");
        let plugin_dir = plugins_dir.join("visual-python.binary-demo");
        fs::create_dir_all(&plugin_dir).unwrap();
        fs::write(plugin_dir.join("plugin.json"), r#"{"id":"visual-python.binary-demo","name":"Binary Demo","version":"1.0.0","apiVersion":"1","entry":"index.js"}"#).unwrap();
        fs::write(plugin_dir.join("index.js"), [0xff, 0xfe, 0xfd]).unwrap();

        let error = read_external_plugin_files_from_dir("visual-python.binary-demo", &plugins_dir)
            .expect_err("binary file must be rejected");

        assert!(error.contains("UTF-8"));
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
