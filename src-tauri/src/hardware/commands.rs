//! Tauri 命令与事件（阶段 6）。
//!
//! 命令层只做三件事：把前端参数变成内部请求、把阻塞操作挪到后台线程、把内部事件转成
//! Tauri 事件。协议与会话逻辑都在 `micropython` / `session` 里，因此“没有真机”也能测试。
//!
//! 统一运行语义（冻结）：运行 = 上传入口程序 + 软复位执行；停止 = 中断不软复位；
//! 重置 = 软复位重跑设备上已有的入口程序；刷写固件只走设置向导。

use crate::hardware::errors::{HardwareError, HardwareErrorKind};
use crate::hardware::micropython::{
    default_upload_chunk_size, sha256_hex, DeviceFile, UploadReport,
};
use crate::hardware::session::{
    connect, disconnect, perform_run_with_ticket, perform_upload, DeviceSession, DeviceSnapshot,
    HardwareEvents, HardwareState, RunRequest,
};
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

// ---- 事件 ----

pub const EVENT_STATE_CHANGED: &str = "hardware:state-changed";
pub const EVENT_OUTPUT: &str = "hardware:output";
pub const EVENT_PROGRESS: &str = "hardware:operation-progress";
pub const EVENT_ERROR: &str = "hardware:error";
pub const EVENT_RUN_FINISHED: &str = "hardware:run-finished";

/// 命令返回给前端的稳定错误。`code` 与 `HardwareErrorKind::code()` 一一对应，
/// 前端据此决定提示文案与“是否要断开重连”等处理。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareCommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<HardwareError> for HardwareCommandError {
    fn from(error: HardwareError) -> Self {
        Self {
            code: error.kind().code(),
            message: error.to_string(),
        }
    }
}

impl HardwareCommandError {
    /// 内部错误（文件、线程、系统调用等）：前端只显示消息，不据此做分支。
    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal",
            message: message.into(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateChangedPayload {
    /// `None` 表示未连接。
    device: Option<DeviceSnapshot>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputPayload {
    run_id: u64,
    /// 设备程序的标准输出（设备端 stdout/stderr 混在一起）。
    stream: &'static str,
    text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    operation: String,
    written: u64,
    total: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    operation: String,
    code: &'static str,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunFinishedPayload {
    run_id: u64,
    status: crate::hardware::micropython::RunStatus,
    streamed_bytes: u64,
    tail: String,
}

/// 把会话层的事件转成 Tauri 事件。
#[derive(Clone)]
struct AppEvents {
    app: AppHandle,
}

impl HardwareEvents for AppEvents {
    fn state_changed(&self, snapshot: Option<DeviceSnapshot>) {
        let _ = self.app.emit(
            EVENT_STATE_CHANGED,
            StateChangedPayload { device: snapshot },
        );
    }

    fn output(&self, run_id: u64, text: &str) {
        if text.is_empty() {
            return;
        }
        let _ = self.app.emit(
            EVENT_OUTPUT,
            OutputPayload {
                run_id,
                stream: "stdout",
                text: text.to_string(),
            },
        );
    }

    fn progress(&self, operation: &str, written: u64, total: u64) {
        let _ = self.app.emit(
            EVENT_PROGRESS,
            ProgressPayload {
                operation: operation.to_string(),
                written,
                total,
            },
        );
    }

    fn run_finished(&self, run_id: u64, outcome: &crate::hardware::micropython::RunOutcome) {
        let _ = self.app.emit(
            EVENT_RUN_FINISHED,
            RunFinishedPayload {
                run_id,
                status: outcome.status,
                streamed_bytes: outcome.streamed_bytes,
                tail: outcome.tail.clone(),
            },
        );
    }

    fn failed(&self, operation: &str, error: &HardwareError) {
        let _ = self.app.emit(
            EVENT_ERROR,
            ErrorPayload {
                operation: operation.to_string(),
                code: error.kind().code(),
                message: error.to_string(),
            },
        );
    }
}

// ---- 命令辅助 ----

/// 在阻塞线程池里跑硬件操作：所有串口读写都是阻塞的，绝不能占用 UI 线程。
async fn run_blocking<T, F>(app: AppHandle, task: F) -> Result<T, HardwareCommandError>
where
    T: Send + 'static,
    F: FnOnce(&HardwareState, &dyn HardwareEvents) -> Result<T, HardwareError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<HardwareState>();
        let events = AppEvents { app: app.clone() };
        task(&state, &events).map_err(HardwareCommandError::from)
    })
    .await
    .map_err(|error| HardwareCommandError::internal(format!("硬件操作线程异常：{error}")))?
}

/// 启动后台运行作业并**立刻**返回编号：界面马上就能点“停止”。
fn start_background_run(app: &AppHandle, request: RunRequest) -> u64 {
    let state = app.state::<HardwareState>();
    let ticket = state.begin_run();
    let run_id = ticket.run_id;
    let events = AppEvents {
        app: app.clone(),
    };
    // 立刻广播一次状态：界面马上能看到「设备忙 / 正在运行」，即使它此刻还没收到任何输出。
    events.state_changed(state.snapshot());
    let worker = app.clone();
    std::thread::spawn(move || {
        let state = worker.state::<HardwareState>();
        let events = AppEvents {
            app: worker.clone(),
        };
        let _ = perform_run_with_ticket(&state, &events, &ticket, request);
    });
    run_id
}

// ---- 命令 ----

/// 打开串口并握手。同一串口重复连接是幂等的；另一个串口会返回 `port` 错误。
#[tauri::command]
pub async fn hardware_connect(
    app: AppHandle,
    port_name: String,
    board_id: String,
) -> Result<DeviceSnapshot, HardwareCommandError> {
    run_blocking(app, move |state, events| {
        let session = DeviceSession::open_serial(&port_name, &board_id)?;
        connect(state, events, session)
    })
    .await
}

#[tauri::command]
pub async fn hardware_disconnect(app: AppHandle) -> Result<bool, HardwareCommandError> {
    run_blocking(app, |state, events| disconnect(state, events)).await
}

/// 当前连接状态（前端刷新或重新打开面板时用它恢复）。
#[tauri::command]
pub fn hardware_device_state(state: State<'_, HardwareState>) -> Option<DeviceSnapshot> {
    state.snapshot()
}

#[tauri::command]
pub fn hardware_stop(state: State<'_, HardwareState>) -> bool {
    state.request_stop()
}

#[tauri::command]
pub async fn hardware_send_serial(
    app: AppHandle,
    text: String,
    line_ending: Option<String>,
) -> Result<Option<String>, HardwareCommandError> {
    run_blocking(app, move |state, _events| {
        if state.is_running() {
            let ending = match line_ending.as_deref() {
                Some("none") => "",
                Some("lf") => "\n",
                _ => "\r\n",
            };
            state.push_stdin(format!("{text}{ending}").as_bytes());
            return Ok(None);
        }
        state
            .with_device("发送串口消息", |session| session.device.exec(&text))
            .map(Some)
    })
    .await
}

#[tauri::command]
pub async fn hardware_list_files(
    app: AppHandle,
    path: String,
) -> Result<Vec<DeviceFile>, HardwareCommandError> {
    run_blocking(app, move |state, _| {
        state.with_device("读取文件列表", |session| {
            session.device.list_files(&path)
        })
    })
    .await
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub base64: String,
}

#[tauri::command]
pub async fn hardware_read_file(
    app: AppHandle,
    path: String,
) -> Result<ReadFileResult, HardwareCommandError> {
    run_blocking(app, move |state, _| {
        state.with_device("读取文件", |session| {
            let data = session.device.read_file(&path)?;
            Ok(ReadFileResult {
                path,
                size: data.len() as u64,
                sha256: sha256_hex(&data),
                base64: STANDARD.encode(&data),
            })
        })
    })
    .await
}

#[tauri::command]
pub async fn hardware_delete_file(
    app: AppHandle,
    path: String,
) -> Result<(), HardwareCommandError> {
    run_blocking(app, move |state, _| {
        state.with_device("删除文件", |session| session.device.remove_file(&path))
    })
    .await
}

/// 上传文件（不运行）。阶段 7 的“运行”走 `hardware_run`，这个命令留给附加文件（库、资源）。
#[tauri::command]
pub async fn hardware_upload(
    app: AppHandle,
    path: String,
    data_base64: String,
    chunk_size: Option<usize>,
    verify_hash: Option<bool>,
) -> Result<UploadReport, HardwareCommandError> {
    run_blocking(app, move |state, events| {
        let data = STANDARD.decode(data_base64.as_bytes()).map_err(|error| {
            HardwareError::new(
                HardwareErrorKind::Io,
                format!("上传内容不是合法的 base64：{error}"),
            )
        })?;
        let chunk_size = chunk_size.unwrap_or(1024).clamp(64, 4096);
        perform_upload(
            state,
            events,
            &path,
            &data,
            chunk_size,
            verify_hash.unwrap_or(true),
        )
    })
    .await
}

/// 运行 = 生成好的入口代码上传为 `entry_path`（默认 `main.py`），校验通过后软复位执行。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAccepted {
    pub run_id: u64,
}

#[tauri::command]
pub fn hardware_run(
    app: AppHandle,
    entry_path: String,
    code: String,
    board_id: String,
    chunk_size: Option<usize>,
    verify_hash: Option<bool>,
) -> Result<RunAccepted, HardwareCommandError> {
    if code.trim().is_empty() {
        return Err(HardwareCommandError {
            code: "invalid",
            message: "入口程序是空的，先在代码面板里生成代码再运行".to_string(),
        });
    }
    let chunk_size = chunk_size.unwrap_or_else(|| default_upload_chunk_size(&board_id));
    let run_id = start_background_run(
        &app,
        RunRequest::Upload {
            entry_path,
            code: code.into_bytes(),
            chunk_size,
            verify_hash: verify_hash.unwrap_or(true),
        },
    );
    Ok(RunAccepted { run_id })
}

/// 重置 = 软复位重跑设备上已有的入口程序（不重新上传）。
#[tauri::command]
pub fn hardware_reset(app: AppHandle) -> Result<RunAccepted, HardwareCommandError> {
    let run_id = start_background_run(&app, RunRequest::Replay);
    Ok(RunAccepted { run_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_errors_expose_stable_codes() {
        let error = HardwareCommandError::from(HardwareError::busy("程序正在运行"));
        assert_eq!(error.code, "busy");
        assert_eq!(error.message, "设备忙：程序正在运行");

        let error = HardwareCommandError::internal("线程异常");
        assert_eq!(error.code, "internal");
    }

    #[test]
    fn payloads_serialize_to_camel_case_for_the_frontend() {
        let value = serde_json::to_value(OutputPayload {
            run_id: 7,
            stream: "stdout",
            text: "tick".to_string(),
        })
        .expect("serialize");
        assert_eq!(value["runId"], 7);
        assert_eq!(value["stream"], "stdout");
        assert_eq!(value["text"], "tick");

        let value = serde_json::to_value(RunFinishedPayload {
            run_id: 3,
            status: crate::hardware::micropython::RunStatus::StillRunning,
            streamed_bytes: 12,
            tail: "blink".to_string(),
        })
        .expect("serialize");
        assert_eq!(value["runId"], 3);
        // 枚举按 camelCase 序列化，前端只认这几个字符串。
        assert_eq!(value["status"], "stillRunning");
        assert_eq!(value["streamedBytes"], 12);

        let value = serde_json::to_value(StateChangedPayload { device: None }).expect("serialize");
        assert!(value["device"].is_null());
    }
}
