use std::{path::PathBuf, sync::Arc};

use codex_app_server_client::{
    EnvironmentManager, ExecServerRuntimePaths, InProcessAppServerClient, InProcessClientStartArgs,
    InProcessServerEvent, RequestResult,
};
use codex_app_server_protocol::{ClientNotification, ClientRequest, RequestId};
#[cfg(test)]
use codex_app_server_protocol::{ServerNotification, TurnStatus};
use codex_arg0::Arg0DispatchPaths;
use codex_config::{CloudConfigBundleLoader, LoaderOverrides};
use codex_feedback::CodexFeedback;
use codex_protocol::protocol::SessionSource;
#[cfg(test)]
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{mpsc, oneshot};

use codex_app_server_client::legacy_core::config::Config;

const CODEX_RUNTIME_STACK_SIZE_BYTES: usize = 16 * 1024 * 1024;

pub struct CodexAgentLaunchConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

impl CodexAgentLaunchConfig {
    fn cli_overrides(&self) -> Vec<(String, toml::Value)> {
        let mut overrides = vec![
            ("model".into(), self.model.clone().into()),
            ("model_provider".into(), "visual-python".into()),
            (
                "model_providers.visual-python.name".into(),
                "Visual Python".into(),
            ),
            (
                "model_providers.visual-python.base_url".into(),
                self.base_url.clone().into(),
            ),
            (
                "model_providers.visual-python.wire_api".into(),
                "responses".into(),
            ),
            (
                "model_providers.visual-python.request_max_retries".into(),
                1_i64.into(),
            ),
            (
                "model_providers.visual-python.stream_max_retries".into(),
                1_i64.into(),
            ),
        ];
        if let Some(api_key) = self
            .api_key
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            overrides.push((
                "model_providers.visual-python.experimental_bearer_token".into(),
                api_key.clone().into(),
            ));
        }
        overrides
    }
}

fn local_exec_server_paths(
    current_exe: PathBuf,
) -> Result<(ExecServerRuntimePaths, Arg0DispatchPaths), String> {
    let runtime_paths = ExecServerRuntimePaths::new(current_exe.clone(), None)
        .map_err(|error| format!("无法配置 Codex 执行环境路径: {error}"))?;
    let arg0_paths = Arg0DispatchPaths {
        codex_self_exe: Some(current_exe),
        ..Default::default()
    };
    Ok((runtime_paths, arg0_paths))
}

pub struct CodexAppServerRuntime {
    commands: mpsc::Sender<RuntimeCommand>,
    events: tokio::sync::Mutex<mpsc::UnboundedReceiver<InProcessServerEvent>>,
    worker: tokio::sync::Mutex<Option<std::thread::JoinHandle<()>>>,
    closed: Arc<AtomicBool>,
}

enum RuntimeCommand {
    Request {
        request: ClientRequest,
        response: oneshot::Sender<Result<RequestResult, String>>,
    },
    Notify {
        notification: ClientNotification,
        response: oneshot::Sender<Result<(), String>>,
    },
    Resolve {
        request_id: RequestId,
        result: Value,
        response: oneshot::Sender<Result<(), String>>,
    },
    Reject {
        request_id: RequestId,
        error: codex_app_server_protocol::JSONRPCErrorError,
        response: oneshot::Sender<Result<(), String>>,
    },
    Shutdown {
        response: oneshot::Sender<Result<(), String>>,
    },
}

impl CodexAppServerRuntime {
    pub async fn start(launch_config: CodexAgentLaunchConfig) -> Result<Self, String> {
        let (commands, command_receiver) = mpsc::channel(32);
        let (events, event_receiver) = mpsc::unbounded_channel();
        let (startup_sender, startup_receiver) = oneshot::channel();
        let closed = Arc::new(AtomicBool::new(false));
        let worker_closed = Arc::clone(&closed);
        let worker = std::thread::Builder::new()
            .name("visual-python-codex".to_owned())
            .stack_size(CODEX_RUNTIME_STACK_SIZE_BYTES)
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .thread_name("visual-python-codex-worker")
                    .thread_stack_size(CODEX_RUNTIME_STACK_SIZE_BYTES)
                    .build();
                let runtime = match runtime {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        let _ =
                            startup_sender.send(Err(format!("无法创建 Codex 专用运行时: {error}")));
                        worker_closed.store(true, Ordering::SeqCst);
                        return;
                    }
                };
                runtime.block_on(run_app_server_worker(
                    launch_config,
                    command_receiver,
                    events,
                    startup_sender,
                    Arc::clone(&worker_closed),
                ));
                worker_closed.store(true, Ordering::SeqCst);
            })
            .map_err(|error| format!("无法创建 Codex 工作线程: {error}"))?;

        match startup_receiver.await {
            Ok(Ok(())) => Ok(Self {
                commands,
                events: tokio::sync::Mutex::new(event_receiver),
                worker: tokio::sync::Mutex::new(Some(worker)),
                closed,
            }),
            Ok(Err(error)) => {
                let _ = worker.join();
                Err(error)
            }
            Err(_) => {
                let _ = worker.join();
                Err("Codex 专用运行时未返回启动结果".to_string())
            }
        }
    }

    pub fn is_usable(&self) -> bool {
        !self.closed.load(Ordering::SeqCst) && !self.commands.is_closed()
    }

    pub async fn request(&self, request: ClientRequest) -> Result<RequestResult, String> {
        if !self.is_usable() {
            return Err("Codex Agent 运行时已关闭".to_string());
        }
        let (response, result) = oneshot::channel();
        self.commands
            .send(RuntimeCommand::Request { request, response })
            .await
            .map_err(|_| "Codex Agent 运行时已关闭".to_string())?;
        result
            .await
            .map_err(|_| "Codex Agent 未返回请求结果".to_string())?
    }

    pub async fn request_json(&self, payload: Value) -> Result<Value, String> {
        let request: ClientRequest = serde_json::from_value(payload)
            .map_err(|error| format!("Codex 请求格式无效: {error}"))?;
        match self.request(request).await? {
            Ok(result) => Ok(json!({ "ok": true, "result": result })),
            Err(error) => Ok(json!({
                "ok": false,
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "data": error.data,
                }
            })),
        }
    }

    pub async fn notify(&self, notification: ClientNotification) -> Result<(), String> {
        if !self.is_usable() {
            return Err("Codex Agent 运行时已关闭".to_string());
        }
        let (response, result) = oneshot::channel();
        self.commands
            .send(RuntimeCommand::Notify {
                notification,
                response,
            })
            .await
            .map_err(|_| "Codex Agent 运行时已关闭".to_string())?;
        result
            .await
            .map_err(|_| "Codex Agent 未返回通知结果".to_string())?
    }

    pub async fn notify_json(&self, payload: Value) -> Result<(), String> {
        let notification: ClientNotification = serde_json::from_value(payload)
            .map_err(|error| format!("Codex 通知格式无效: {error}"))?;
        self.notify(notification).await
    }

    pub async fn resolve_server_request(
        &self,
        request_id: RequestId,
        result: Value,
    ) -> Result<(), String> {
        if !self.is_usable() {
            return Err("Codex Agent 运行时已关闭".to_string());
        }
        let (response, result_channel) = oneshot::channel();
        self.commands
            .send(RuntimeCommand::Resolve {
                request_id,
                result,
                response,
            })
            .await
            .map_err(|_| "Codex Agent 运行时已关闭".to_string())?;
        result_channel
            .await
            .map_err(|_| "Codex Agent 未返回宿主请求响应结果".to_string())?
    }

    pub async fn reject_server_request(
        &self,
        request_id: RequestId,
        error: codex_app_server_protocol::JSONRPCErrorError,
    ) -> Result<(), String> {
        if !self.is_usable() {
            return Err("Codex Agent 运行时已关闭".to_string());
        }
        let (response, result_channel) = oneshot::channel();
        self.commands
            .send(RuntimeCommand::Reject {
                request_id,
                error,
                response,
            })
            .await
            .map_err(|_| "Codex Agent 运行时已关闭".to_string())?;
        result_channel
            .await
            .map_err(|_| "Codex Agent 未返回宿主请求拒绝结果".to_string())?
    }

    pub async fn next_event(&self) -> Option<InProcessServerEvent> {
        self.events.lock().await.recv().await
    }

    pub async fn next_event_json(&self) -> Option<Value> {
        self.next_event().await.map(serialize_in_process_event)
    }

    pub async fn shutdown(&self) -> Result<(), String> {
        if self.is_usable() {
            let (response, result) = oneshot::channel();
            if self
                .commands
                .send(RuntimeCommand::Shutdown { response })
                .await
                .is_ok()
            {
                result
                    .await
                    .map_err(|_| "Codex Agent 未返回关闭结果".to_string())??;
            }
        }
        if let Some(worker) = self.worker.lock().await.take() {
            tokio::task::spawn_blocking(move || worker.join())
                .await
                .map_err(|error| format!("等待 Codex 工作线程失败: {error}"))?
                .map_err(|_| "Codex 工作线程异常退出".to_string())?;
        }
        Ok(())
    }
}

async fn start_app_server_client(
    launch_config: CodexAgentLaunchConfig,
) -> Result<InProcessAppServerClient, String> {
    let cli_overrides = launch_config.cli_overrides();
    let current_exe = std::env::current_exe()
        .map_err(|error| format!("无法获取 Visual Python 可执行文件路径: {error}"))?;
    let (runtime_paths, arg0_paths) = local_exec_server_paths(current_exe)?;
    let config = Arc::new(
        Config::load_default_with_cli_overrides(cli_overrides.clone())
            .await
            .map_err(|error| format!("无法加载 Codex 配置: {error}"))?,
    );
    let environment_manager = Arc::new(
        EnvironmentManager::from_env(Some(runtime_paths), config.http_client_factory())
            .await
            .map_err(|error| format!("无法初始化 Codex 执行环境: {error}"))?,
    );
    let state_db = match codex_rollout::state_db::try_init(config.as_ref()).await {
        Ok(state_db) => Some(state_db),
        Err(error) => {
            log::warn!("Codex 会话持久化不可用，将使用当前进程会话：{error:#}");
            None
        }
    };
    InProcessAppServerClient::start(InProcessClientStartArgs {
        arg0_paths,
        config,
        cli_overrides,
        loader_overrides: LoaderOverrides::default(),
        strict_config: false,
        cloud_config_bundle: CloudConfigBundleLoader::default(),
        feedback: CodexFeedback::new(),
        log_db: None,
        state_db,
        environment_manager,
        config_warnings: Vec::new(),
        session_source: SessionSource::Custom("visual-python".to_owned()),
        enable_codex_api_key_env: true,
        client_name: "visual-python".to_owned(),
        client_version: env!("CARGO_PKG_VERSION").to_owned(),
        experimental_api: true,
        mcp_server_openai_form_elicitation: false,
        opt_out_notification_methods: Vec::new(),
        channel_capacity: 128,
    })
    .await
    .map_err(|error| format!("无法启动 Codex App Server: {error}"))
}

async fn run_app_server_worker(
    launch_config: CodexAgentLaunchConfig,
    mut command_receiver: mpsc::Receiver<RuntimeCommand>,
    events: mpsc::UnboundedSender<InProcessServerEvent>,
    startup_sender: oneshot::Sender<Result<(), String>>,
    closed: Arc<AtomicBool>,
) {
    let mut client = match start_app_server_client(launch_config).await {
        Ok(client) => client,
        Err(error) => {
            let _ = startup_sender.send(Err(error));
            return;
        }
    };
    if startup_sender.send(Ok(())).is_err() {
        let _ = client.shutdown().await;
        return;
    }

    loop {
        tokio::select! {
            command = command_receiver.recv() => {
                let Some(command) = command else { break };
                match command {
                    RuntimeCommand::Shutdown { response } => {
                        let result = client
                            .shutdown()
                            .await
                            .map_err(|error| format!("关闭 Codex App Server 失败: {error}"));
                        let _ = response.send(result);
                        break;
                    }
                    command => handle_command(&mut client, command).await,
                }
            }
            event = client.next_event() => {
                let Some(event) = event else { break; };
                if events.send(event).is_err() { break; }
            }
        }
    }
    closed.store(true, Ordering::SeqCst);
}

async fn handle_command(client: &mut InProcessAppServerClient, command: RuntimeCommand) {
    match command {
        RuntimeCommand::Request { request, response } => {
            let result = client
                .request(request)
                .await
                .map_err(|error| format!("Codex 请求失败: {error}"));
            let _ = response.send(result);
        }
        RuntimeCommand::Notify {
            notification,
            response,
        } => {
            let result = client
                .notify(notification)
                .await
                .map_err(|error| format!("Codex 通知失败: {error}"));
            let _ = response.send(result);
        }
        RuntimeCommand::Resolve {
            request_id,
            result,
            response,
        } => {
            let result = client
                .resolve_server_request(request_id, result)
                .await
                .map_err(|error| format!("Codex 宿主请求响应失败: {error}"));
            let _ = response.send(result);
        }
        RuntimeCommand::Reject {
            request_id,
            error,
            response,
        } => {
            let result = client
                .reject_server_request(request_id, error)
                .await
                .map_err(|error| format!("Codex 宿主请求拒绝失败: {error}"));
            let _ = response.send(result);
        }
        RuntimeCommand::Shutdown { .. } => unreachable!("shutdown is handled by the worker"),
    }
}

fn serialize_in_process_event(event: InProcessServerEvent) -> Value {
    match event {
        InProcessServerEvent::ServerNotification(notification) => json!({
            "kind": "notification",
            "notification": *notification,
        }),
        InProcessServerEvent::ServerRequest(request) => json!({
            "kind": "serverRequest",
            "request": *request,
        }),
        InProcessServerEvent::Lagged { skipped } => json!({
            "kind": "lagged",
            "skipped": skipped,
        }),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
#[cfg(test)]
pub enum CodexAgentEvent {
    AssistantDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ReasoningDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ItemStarted {
        thread_id: String,
        turn_id: String,
        item_id: String,
    },
    ItemCompleted {
        thread_id: String,
        turn_id: String,
        item_id: String,
    },
    TurnCompleted {
        thread_id: String,
        turn_id: String,
        status: String,
    },
    TokenUsage {
        thread_id: String,
        turn_id: String,
        input_tokens: i64,
        cached_input_tokens: i64,
        output_tokens: i64,
        total_tokens: i64,
    },
}

#[cfg(test)]
pub fn map_notification(notification: ServerNotification) -> Option<CodexAgentEvent> {
    match notification {
        ServerNotification::AgentMessageDelta(notification) => {
            Some(CodexAgentEvent::AssistantDelta {
                thread_id: notification.thread_id,
                turn_id: notification.turn_id,
                item_id: notification.item_id,
                delta: notification.delta,
            })
        }
        ServerNotification::ReasoningSummaryTextDelta(notification) => {
            Some(CodexAgentEvent::ReasoningDelta {
                thread_id: notification.thread_id,
                turn_id: notification.turn_id,
                item_id: notification.item_id,
                delta: notification.delta,
            })
        }
        ServerNotification::ReasoningTextDelta(notification) => {
            Some(CodexAgentEvent::ReasoningDelta {
                thread_id: notification.thread_id,
                turn_id: notification.turn_id,
                item_id: notification.item_id,
                delta: notification.delta,
            })
        }
        ServerNotification::ItemStarted(notification) => Some(CodexAgentEvent::ItemStarted {
            thread_id: notification.thread_id,
            turn_id: notification.turn_id,
            item_id: notification.item.id().to_owned(),
        }),
        ServerNotification::ItemCompleted(notification) => Some(CodexAgentEvent::ItemCompleted {
            thread_id: notification.thread_id,
            turn_id: notification.turn_id,
            item_id: notification.item.id().to_owned(),
        }),
        ServerNotification::TurnCompleted(notification) => {
            let turn_id = notification.turn.id.clone();
            let status = match notification.turn.status {
                TurnStatus::Completed => "completed",
                TurnStatus::Interrupted => "interrupted",
                TurnStatus::Failed => "failed",
                TurnStatus::InProgress => "in_progress",
            };
            Some(CodexAgentEvent::TurnCompleted {
                thread_id: notification.thread_id,
                turn_id,
                status: status.to_owned(),
            })
        }
        ServerNotification::ThreadTokenUsageUpdated(notification) => {
            let usage = notification.token_usage.last;
            Some(CodexAgentEvent::TokenUsage {
                thread_id: notification.thread_id,
                turn_id: notification.turn_id,
                input_tokens: usage.input_tokens,
                cached_input_tokens: usage.cached_input_tokens,
                output_tokens: usage.output_tokens,
                total_tokens: usage.total_tokens,
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_protocol::{
        AgentMessageDeltaNotification, ReasoningSummaryTextDeltaNotification, ThreadTokenUsage,
        ThreadTokenUsageUpdatedNotification, TokenUsageBreakdown, TurnCompletedNotification,
    };

    #[test]
    fn configures_local_exec_server_with_current_executable() {
        let current_exe = std::env::current_exe().expect("current executable");
        let (runtime_paths, arg0_paths) =
            local_exec_server_paths(current_exe.clone()).expect("local runtime paths");

        assert!(runtime_paths.codex_self_exe.is_absolute());
        assert_eq!(
            runtime_paths.codex_self_exe.as_path(),
            current_exe.as_path()
        );
        assert_eq!(runtime_paths.codex_linux_sandbox_exe, None);
        assert_eq!(arg0_paths.codex_self_exe, Some(current_exe));
        assert_eq!(arg0_paths.codex_linux_sandbox_exe, None);
    }

    #[test]
    fn builds_visual_python_model_provider_overrides() {
        let overrides = CodexAgentLaunchConfig {
            base_url: "https://example.com/v1".into(),
            model: "example-model".into(),
            api_key: Some("secret-key".into()),
        }
        .cli_overrides();
        let values = overrides
            .into_iter()
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(
            values.get("model").and_then(toml::Value::as_str),
            Some("example-model")
        );
        assert_eq!(
            values.get("model_provider").and_then(toml::Value::as_str),
            Some("visual-python")
        );
        assert_eq!(
            values
                .get("model_providers.visual-python.base_url")
                .and_then(toml::Value::as_str),
            Some("https://example.com/v1")
        );
        assert_eq!(
            values
                .get("model_providers.visual-python.wire_api")
                .and_then(toml::Value::as_str),
            Some("responses")
        );
        assert_eq!(
            values
                .get("model_providers.visual-python.experimental_bearer_token")
                .and_then(toml::Value::as_str),
            Some("secret-key")
        );
    }

    #[tokio::test]
    async fn starts_and_stops_embedded_app_server() {
        let runtime = CodexAppServerRuntime::start(CodexAgentLaunchConfig {
            base_url: "https://example.com/v1".into(),
            model: "example-model".into(),
            api_key: Some("test-key".into()),
        })
        .await
        .expect("embedded app server should start");

        assert!(runtime.is_usable());
        let response = runtime
            .request_json(json!({
                "method": "thread/start",
                "id": "runtime-test-1",
                "params": {
                    "model": "example-model",
                    "modelProvider": "visual-python",
                    "cwd": null,
                    "approvalPolicy": "never",
                    "sandbox": "read-only",
                    "ephemeral": true,
                    "baseInstructions": null,
                    "developerInstructions": null,
                    "dynamicTools": []
                }
            }))
            .await
            .expect("thread start request should complete");
        assert_eq!(response.get("ok").and_then(Value::as_bool), Some(true));
        runtime.shutdown().await.expect("runtime should stop");
    }

    #[tokio::test]
    async fn reports_runtime_as_unusable_after_worker_shutdown() {
        let (commands, _receiver) = mpsc::channel(1);
        let (_event_sender, event_receiver) = mpsc::unbounded_channel();
        let worker = std::thread::spawn(|| {});
        let runtime = CodexAppServerRuntime {
            commands,
            events: tokio::sync::Mutex::new(event_receiver),
            worker: tokio::sync::Mutex::new(Some(worker)),
            closed: Arc::new(AtomicBool::new(false)),
        };

        assert!(runtime.is_usable());
        runtime
            .closed
            .store(true, std::sync::atomic::Ordering::SeqCst);
        assert!(!runtime.is_usable());
    }

    fn usage(
        total_tokens: i64,
        input_tokens: i64,
        cached_input_tokens: i64,
        output_tokens: i64,
    ) -> TokenUsageBreakdown {
        TokenUsageBreakdown {
            total_tokens,
            input_tokens,
            cached_input_tokens,
            cache_write_input_tokens: 0,
            output_tokens,
            reasoning_output_tokens: 0,
        }
    }

    #[test]
    fn maps_streaming_assistant_and_reasoning_deltas() {
        let assistant = map_notification(ServerNotification::AgentMessageDelta(
            AgentMessageDeltaNotification {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                item_id: "item-1".into(),
                delta: "hello".into(),
            },
        ));
        let reasoning = map_notification(ServerNotification::ReasoningSummaryTextDelta(
            ReasoningSummaryTextDeltaNotification {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                item_id: "reasoning-1".into(),
                delta: "inspect".into(),
                summary_index: 0,
            },
        ));

        assert_eq!(
            assistant,
            Some(CodexAgentEvent::AssistantDelta {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                item_id: "item-1".into(),
                delta: "hello".into(),
            })
        );
        assert_eq!(
            reasoning,
            Some(CodexAgentEvent::ReasoningDelta {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                item_id: "reasoning-1".into(),
                delta: "inspect".into(),
            })
        );
    }

    #[test]
    fn maps_turn_completion_and_token_usage() {
        let completed = map_notification(ServerNotification::TurnCompleted(
            TurnCompletedNotification {
                thread_id: "thread-1".into(),
                turn: serde_json::from_value(serde_json::json!({
                    "id": "turn-1",
                    "items": [],
                    "status": "completed",
                    "error": null
                }))
                .expect("valid test turn"),
            },
        ));
        let tokens = map_notification(ServerNotification::ThreadTokenUsageUpdated(
            ThreadTokenUsageUpdatedNotification {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                token_usage: ThreadTokenUsage {
                    total: usage(12, 8, 3, 4),
                    last: usage(12, 8, 3, 4),
                    model_context_window: None,
                },
            },
        ));

        assert_eq!(
            completed,
            Some(CodexAgentEvent::TurnCompleted {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                status: "completed".into(),
            })
        );
        assert_eq!(
            tokens,
            Some(CodexAgentEvent::TokenUsage {
                thread_id: "thread-1".into(),
                turn_id: "turn-1".into(),
                input_tokens: 8,
                cached_input_tokens: 3,
                output_tokens: 4,
                total_tokens: 12,
            })
        );
    }

    #[test]
    fn ignores_notifications_that_are_not_part_of_the_agent_stream() {
        assert_eq!(
            map_notification(ServerNotification::Warning(
                serde_json::from_value(serde_json::json!({"message": "warning"}))
                    .expect("valid warning"),
            )),
            None
        );
    }
}
