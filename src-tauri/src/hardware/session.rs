//! 设备会话与后台作业（阶段 6）。
//!
//! 这一层把「传输层 + 运行时适配器」包成一份**独占的会话**，并把长操作（运行/重置）
//! 放进后台线程：命令立即返回，进度与输出通过事件回传。
//!
//! 并发约定（与计划书一致）：
//! - 同一时刻只允许一个连接，以及一个写入或运行操作；
//! - 「停止」永远可用：它只置取消标志，不会去抢正被占用的会话；
//! - 运行期间其它操作立即返回 `Busy`，而不是排队等到程序结束；
//! - 设备真的断开时释放会话，界面回到「未连接」。

use crate::hardware::errors::{HardwareError, HardwareErrorKind};
use crate::hardware::micropython::{
    DeviceInfo, MicroPythonDevice, RunOptions, RunOutcome, UploadReport, WriteFileOptions,
};
use crate::hardware::serial::{SerialTransport, DEFAULT_BAUD_RATE};
use crate::hardware::transport::Transport;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use std::time::{Duration, Instant};

/// 会话使用的字节流：生产环境是串口，测试环境是模拟设备。
pub type DeviceTransport = Box<dyn Transport>;

/// 等待上一个作业释放设备的最长时间。
pub const RUN_IDLE_WAIT: Duration = Duration::from_secs(10);

/// 连接后的设备快照，用于前端显示与状态同步。
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub port_name: String,
    pub board_id: String,
    pub implementation: String,
    pub version: String,
    pub release: String,
    pub machine: String,
    /// 是否正在运行（上传/运行/重置期间为 true）。
    pub running: bool,
}

/// 一次设备连接。持有它就意味着独占串口。
pub struct DeviceSession {
    pub board_id: String,
    pub port_name: String,
    pub device: MicroPythonDevice<DeviceTransport>,
    pub info: DeviceInfo,
}

impl DeviceSession {
    /// 打开串口并完成握手：进入 Raw REPL（顺带中断可能残留的程序）+ 读取固件信息。
    pub fn open_serial(port_name: &str, board_id: &str) -> Result<Self, HardwareError> {
        let transport = SerialTransport::open(port_name, DEFAULT_BAUD_RATE)?;
        Self::handshake(Box::new(transport), board_id, port_name)
    }

    pub fn handshake(
        transport: DeviceTransport,
        board_id: &str,
        port_name: &str,
    ) -> Result<Self, HardwareError> {
        let mut device = MicroPythonDevice::new(transport);
        device.enter_raw_repl(true)?;
        let info = device.info()?;
        if !info.implementation.is_empty() && info.implementation != "micropython" {
            return Err(HardwareError::unsupported(format!(
                "{port_name} 上的固件不是 MicroPython（implementation={}），请先在设置里刷写固件",
                info.implementation
            )));
        }
        Ok(Self {
            board_id: board_id.to_string(),
            port_name: port_name.to_string(),
            device,
            info,
        })
    }

    pub fn snapshot(&self, running: bool) -> DeviceSnapshot {
        DeviceSnapshot {
            port_name: self.port_name.clone(),
            board_id: self.board_id.clone(),
            implementation: self.info.implementation.clone(),
            version: self.info.version.clone(),
            release: self.info.release.clone(),
            machine: self.info.machine.clone(),
            running,
        }
    }
}

/// 后台作业向上汇报的通道。实现方可以是 Tauri 事件，也可以是测试里的记录器。
pub trait HardwareEvents: Send + Sync {
    /// 连接状态变化（`None` 表示未连接）。
    fn state_changed(&self, snapshot: Option<DeviceSnapshot>);
    /// 设备输出（按到达顺序，可能损失少量非 UTF-8 字节）。
    fn output(&self, run_id: u64, text: &str);
    /// 上传进度。
    fn progress(&self, operation: &str, written: u64, total: u64);
    /// 运行结束（含正常结束、异常、被停止）。
    fn run_finished(&self, run_id: u64, outcome: &RunOutcome);
    /// 操作失败（统一“运行”失败时以事件上报，命令本身可能已经返回）。
    fn failed(&self, operation: &str, error: &HardwareError);
}

impl<T: HardwareEvents + ?Sized> HardwareEvents for Arc<T> {
    fn state_changed(&self, snapshot: Option<DeviceSnapshot>) {
        (**self).state_changed(snapshot);
    }

    fn output(&self, run_id: u64, text: &str) {
        (**self).output(run_id, text);
    }

    fn progress(&self, operation: &str, written: u64, total: u64) {
        (**self).progress(operation, written, total);
    }

    fn run_finished(&self, run_id: u64, outcome: &RunOutcome) {
        (**self).run_finished(run_id, outcome);
    }

    fn failed(&self, operation: &str, error: &HardwareError) {
        (**self).failed(operation, error);
    }
}

/// 后台作业的请求。
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RunRequest {
    /// 上传入口文件后运行（统一「运行」语义）。
    Upload {
        entry_path: String,
        code: Vec<u8>,
        chunk_size: usize,
        verify_hash: bool,
    },
    /// 只软复位重跑设备上已有的入口文件（对应「重置」）。
    Replay,
}

#[derive(Debug)]
pub struct RunJobResult {
    pub run_id: u64,
    pub upload: Option<UploadReport>,
    pub outcome: RunOutcome,
}

/// 一次后台作业的凭据：持有它代表“我这次运行还在进行”。
pub struct RunTicket {
    pub run_id: u64,
    pub cancel: Arc<AtomicBool>,
}

struct RunSignal {
    run_id: u64,
    cancel: Arc<AtomicBool>,
}

/// 连接与作业状态。以 Tauri 的 `manage` 托管，所有命令共用一份。
pub struct HardwareState {
    session: Mutex<Option<DeviceSession>>,
    /// 与 `session` 分开加锁：**「停止」绝不能因为设备被运行作业独占而失效**。
    control: Mutex<Option<RunSignal>>,
    running: AtomicBool,
    next_run_id: AtomicU64,
    /// 等待上一个作业释放设备的时间上限（测试里会缩短）。
    idle_wait: Duration,
}

impl Default for HardwareState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            control: Mutex::new(None),
            running: AtomicBool::new(false),
            next_run_id: AtomicU64::new(0),
            idle_wait: RUN_IDLE_WAIT,
        }
    }
}

impl HardwareState {
    /// 测试用：缩短等待设备空闲的时间，避免用例真的等满 10 秒。
    pub fn with_idle_wait(idle_wait: Duration) -> Self {
        Self {
            idle_wait,
            ..Self::default()
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// 当前连接快照；未连接时为 `None`。
    pub fn snapshot(&self) -> Option<DeviceSnapshot> {
        let guard = lock(&self.session);
        guard
            .as_ref()
            .map(|session| session.snapshot(self.is_running()))
    }

    pub fn is_connected(&self) -> bool {
        lock(&self.session).is_some()
    }

    /// 检查某个串口是否被设备会话占用。刷写固件会自己打开串口（esptool），而会话已经独占
    /// 它：直接刷只会拿到「拒绝访问」这类系统错误，所以调用方先用这里给出可读的 `busy`。
    ///
    /// 用 `try_lock` 而不是等待：正在运行的作业可能永远不会结束，刷写不该排队等它。
    pub fn ensure_port_free(&self, port_name: &str) -> Result<(), HardwareError> {
        let guard = match self.session.try_lock() {
            Ok(guard) => guard,
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(TryLockError::WouldBlock) => {
                return Err(HardwareError::busy(
                    "设备正在运行程序，请先断开设备再刷写固件",
                ))
            }
        };
        match guard.as_ref() {
            Some(session) if session.port_name == port_name => Err(HardwareError::busy(format!(
                "{} 已被设备连接占用，请先断开设备再刷写固件",
                session.port_name
            ))),
            // 其它串口是另一块开发板：刷写它不影响当前连接。
            _ => Ok(()),
        }
    }

    /// 借用会话做一次短操作（文件列表/读取/删除/上传）。
    /// 运行期间设备被独占：立即返回 `Busy`，不排队。
    pub fn with_device<T>(
        &self,
        action_name: &str,
        action: impl FnOnce(&mut DeviceSession) -> Result<T, HardwareError>,
    ) -> Result<T, HardwareError> {
        let mut guard = match self.session.try_lock() {
            Ok(guard) => guard,
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(TryLockError::WouldBlock) => {
                return Err(HardwareError::busy(format!(
                    "程序正在设备上运行，请先停止后再{action_name}"
                )))
            }
        };
        let session = guard.as_mut().ok_or_else(no_connection)?;
        action(session)
    }

    /// 开始一次后台作业：**取消上一个作业**并登记新的取消标志。
    pub fn begin_run(&self) -> RunTicket {
        let cancel = Arc::new(AtomicBool::new(false));
        let run_id = self.next_run_id.fetch_add(1, Ordering::SeqCst) + 1;
        let mut control = lock(&self.control);
        if let Some(previous) = control.as_ref() {
            // 新的运行先让旧作业退出：它自己会发 CTRL-C 中断，然后释放设备。
            previous.cancel.store(true, Ordering::SeqCst);
        }
        *control = Some(RunSignal {
            run_id,
            cancel: Arc::clone(&cancel),
        });
        self.running.store(true, Ordering::SeqCst);
        RunTicket { run_id, cancel }
    }

    /// 结束后台作业。只有“当前作业”才有权清掉状态，避免被替换掉的旧作业把新作业标记成空闲。
    pub fn finish_run(&self, ticket: &RunTicket) {
        let mut control = lock(&self.control);
        let is_current = control
            .as_ref()
            .is_some_and(|signal| signal.run_id == ticket.run_id);
        if is_current {
            *control = None;
            self.running.store(false, Ordering::SeqCst);
        }
    }

    /// 请求停止当前作业（对应「停止」按钮）。返回当时是否有作业在跑。
    pub fn request_stop(&self) -> bool {
        let control = lock(&self.control);
        match control.as_ref() {
            Some(signal) => {
                signal.cancel.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }

    /// 新建连接。同一串口重复连接是幂等的；不同串口则给出稳定错误。
    pub fn connect(&self, session: DeviceSession) -> Result<DeviceSnapshot, HardwareError> {
        let mut guard = match self.session.try_lock() {
            Ok(guard) => guard,
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(TryLockError::WouldBlock) => {
                return Err(HardwareError::busy("设备正在运行程序，请先停止后再连接"))
            }
        };
        if let Some(existing) = guard.as_ref() {
            if existing.port_name == session.port_name {
                return Ok(existing.snapshot(self.is_running()));
            }
            return Err(HardwareError::port(format!(
                "{} 已连接，请先断开再连接 {}",
                existing.port_name, session.port_name
            )));
        }
        let snapshot = session.snapshot(false);
        *guard = Some(session);
        Ok(snapshot)
    }

    /// 断开连接并关闭串口；正在运行的作业会先被停止。
    pub fn disconnect(&self) -> Result<bool, HardwareError> {
        self.request_stop();
        let mut guard = self.acquire_session(self.idle_wait)?;
        Ok(guard.take().is_some())
    }

    /// 设备真的断开（拔线）时释放会话，界面回到「未连接」。尽力而为：拿不到锁就跳过。
    pub fn release_after_failure(&self, error: &HardwareError) -> bool {
        if error.kind() != HardwareErrorKind::Disconnected {
            return false;
        }
        match self.session.try_lock() {
            Ok(mut guard) => guard.take().is_some(),
            Err(_) => false,
        }
    }

    /// 后台作业用：等上一个作业释放设备（有上限，避免永久卡住），然后独占会话执行。
    fn with_device_for_run<T>(
        &self,
        action: impl FnOnce(&mut DeviceSession) -> Result<T, HardwareError>,
    ) -> Result<T, HardwareError> {
        let mut guard = self.acquire_session(self.idle_wait)?;
        let session = guard.as_mut().ok_or_else(no_connection)?;
        action(session)
    }

    fn acquire_session(
        &self,
        wait: Duration,
    ) -> Result<MutexGuard<'_, Option<DeviceSession>>, HardwareError> {
        let deadline = Instant::now() + wait;
        loop {
            match self.session.try_lock() {
                Ok(guard) => return Ok(guard),
                Err(TryLockError::Poisoned(poisoned)) => return Ok(poisoned.into_inner()),
                Err(TryLockError::WouldBlock) => {
                    if Instant::now() >= deadline {
                        return Err(HardwareError::busy("等待设备空闲超时，请先停止当前程序"));
                    }
                    std::thread::sleep(Duration::from_millis(25));
                }
            }
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn no_connection() -> HardwareError {
    HardwareError::port("还没有连接开发板，请先在设置里连接设备")
}

/// 新建连接并上报状态。
pub fn connect(
    state: &HardwareState,
    events: &dyn HardwareEvents,
    session: DeviceSession,
) -> Result<DeviceSnapshot, HardwareError> {
    let snapshot = state.connect(session)?;
    events.state_changed(Some(snapshot.clone()));
    Ok(snapshot)
}

/// 断开连接并上报状态。
pub fn disconnect(
    state: &HardwareState,
    events: &dyn HardwareEvents,
) -> Result<bool, HardwareError> {
    let had_session = state.disconnect()?;
    if had_session {
        events.state_changed(None);
    }
    Ok(had_session)
}

/// 上传文件（不运行）。运行期间返回 `Busy`。
pub fn perform_upload(
    state: &HardwareState,
    events: &dyn HardwareEvents,
    path: &str,
    data: &[u8],
    chunk_size: usize,
    verify_hash: bool,
) -> Result<UploadReport, HardwareError> {
    let operation = format!("hardware_upload:{path}");
    let result = state.with_device("上传文件", |session| {
        let options = WriteFileOptions {
            chunk_size,
            verify_hash,
        };
        let report = session
            .device
            .write_file(path, data, &options, |written, total| {
                events.progress(&operation, written, total);
            })?;
        events.progress(&operation, report.size, report.size);
        Ok(report)
    });
    if let Err(error) = &result {
        events.failed(&operation, error);
        if state.release_after_failure(error) {
            events.state_changed(None);
        }
    }
    result
}

/// 执行一次后台作业（上传 + 运行，或只重跑）。整个过程中设备被独占。
pub fn perform_run(
    state: &HardwareState,
    events: &dyn HardwareEvents,
    request: RunRequest,
) -> Result<RunJobResult, HardwareError> {
    let ticket = state.begin_run();
    perform_run_with_ticket(state, events, &ticket, request)
}

/// 与 [`perform_run`] 相同，但作业凭据由调用方先取好。
///
/// 命令层需要**立刻**把 `run_id` 返回给前端（这样界面马上就能显示“停止”按钮），
/// 再在后台线程里执行，因此必须把“登记作业”和“执行作业”分开。
pub fn perform_run_with_ticket(
    state: &HardwareState,
    events: &dyn HardwareEvents,
    ticket: &RunTicket,
    request: RunRequest,
) -> Result<RunJobResult, HardwareError> {
    let operation = format!("hardware_run#{}", ticket.run_id);
    let result = execute_run(state, events, ticket, request).map_err(|error| {
        events.failed(&operation, &error);
        if state.release_after_failure(&error) {
            events.state_changed(None);
        }
        error
    });
    if let Ok(job) = &result {
        events.run_finished(ticket.run_id, &job.outcome);
    }
    state.finish_run(ticket);
    events.state_changed(state.snapshot());
    result
}

fn execute_run(
    state: &HardwareState,
    events: &dyn HardwareEvents,
    ticket: &RunTicket,
    request: RunRequest,
) -> Result<RunJobResult, HardwareError> {
    let run_id = ticket.run_id;
    let options = RunOptions {
        // 不设观察窗口：程序没结束就一直等，直到用户点「停止」。
        timeout: None,
        cancel: Some(Arc::clone(&ticket.cancel)),
    };
    state.with_device_for_run(|session| {
        let mut upload = None;
        if let RunRequest::Upload {
            entry_path,
            code,
            chunk_size,
            verify_hash,
        } = &request
        {
            let write_options = WriteFileOptions {
                chunk_size: *chunk_size,
                verify_hash: *verify_hash,
            };
            let operation = format!("hardware_upload#{run_id}");
            let report =
                session
                    .device
                    .write_file(entry_path, code, &write_options, |written, total| {
                        events.progress(&operation, written, total);
                    })?;
            events.progress(&operation, report.size, report.size);
            upload = Some(report);
        }
        let outcome = session.device.run_main(&options, |chunk| {
            events.output(run_id, &String::from_utf8_lossy(chunk));
        })?;
        Ok(RunJobResult {
            run_id,
            upload,
            outcome,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::micropython::RunStatus;
    use crate::hardware::simulated::SimulatedDevice;
    use std::sync::Mutex as StdMutex;

    /// 测试用传输：把模拟设备放在 `Arc<Mutex<..>>` 里，测试可以在运行过程中改设备行为
    /// （例如模拟拔线），也可以断言设备内部状态。
    #[derive(Clone)]
    struct SharedSimulated(Arc<StdMutex<SimulatedDevice>>);

    impl SharedSimulated {
        fn new(device: SimulatedDevice) -> Self {
            Self(Arc::new(StdMutex::new(device)))
        }

        fn with<R>(&self, action: impl FnOnce(&mut SimulatedDevice) -> R) -> R {
            action(&mut self.0.lock().unwrap())
        }
    }

    impl Transport for SharedSimulated {
        fn write_all(&mut self, bytes: &[u8]) -> Result<(), HardwareError> {
            self.0.lock().unwrap().write_all(bytes)
        }

        fn read(&mut self, buffer: &mut [u8]) -> Result<usize, HardwareError> {
            self.0.lock().unwrap().read(buffer)
        }

        fn bytes_available(&mut self) -> Result<usize, HardwareError> {
            self.0.lock().unwrap().bytes_available()
        }

        fn clear_input(&mut self) -> Result<(), HardwareError> {
            self.0.lock().unwrap().clear_input()
        }

        fn label(&self) -> String {
            "模拟设备".to_string()
        }
    }

    #[derive(Default)]
    struct RecordingEvents {
        events: StdMutex<Vec<String>>,
    }

    impl RecordingEvents {
        fn push(&self, event: String) {
            self.events.lock().unwrap().push(event);
        }

        fn lines(&self) -> Vec<String> {
            self.events.lock().unwrap().clone()
        }

        /// 等到某段文本出现。**按累积后的文本匹配**：流式输出的片段可能切断词元
        /// （例如 `blink` 被拆成 `blin` + `k`），逐条匹配会漏。
        fn wait_for(&self, needle: &str, timeout: Duration) -> bool {
            let deadline = Instant::now() + timeout;
            loop {
                if self.lines().join("\n").contains(needle) {
                    return true;
                }
                if Instant::now() >= deadline {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }

    impl HardwareEvents for RecordingEvents {
        fn state_changed(&self, snapshot: Option<DeviceSnapshot>) {
            self.push(match snapshot {
                Some(snapshot) => format!("state:{}", snapshot.port_name),
                None => "state:-".to_string(),
            });
        }

        fn output(&self, run_id: u64, text: &str) {
            self.push(format!("out:{run_id}:{text}"));
        }

        fn progress(&self, operation: &str, written: u64, total: u64) {
            self.push(format!("progress:{operation}:{written}/{total}"));
        }

        fn run_finished(&self, run_id: u64, outcome: &RunOutcome) {
            self.push(format!("finished:{run_id}:{:?}", outcome.status));
        }

        fn failed(&self, operation: &str, error: &HardwareError) {
            self.push(format!("failed:{operation}:{error}"));
        }
    }

    fn shared_session(
        configure: impl FnOnce(&mut SimulatedDevice),
    ) -> (DeviceSession, SharedSimulated) {
        let mut device = SimulatedDevice::default();
        configure(&mut device);
        let transport = SharedSimulated::new(device);
        let session = DeviceSession::handshake(Box::new(transport.clone()), "esp32-wroom", "SIM3")
            .expect("handshake");
        (session, transport)
    }

    fn endless_program() -> impl FnOnce(&mut SimulatedDevice) {
        |device: &mut SimulatedDevice| {
            device.program_never_finishes = true;
            device.program_output = b"blink\r\n".to_vec();
        }
    }

    #[test]
    fn operations_require_a_connection() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();

        assert!(state.snapshot().is_none());
        let error = state
            .with_device("读取文件列表", |session| {
                session.device.list_files("/")
            })
            .expect_err("no connection");
        assert_eq!(error.kind(), HardwareErrorKind::Port);
        assert!(error.detail().contains("还没有连接开发板"));

        let error = perform_run(&state, &events, RunRequest::Replay).expect_err("no connection");
        assert_eq!(error.kind(), HardwareErrorKind::Port);
        assert!(events.wait_for("failed:hardware_run#1", Duration::from_secs(1)));
        // 失败后状态回到“未连接”，不会残留运行标记。
        assert!(!state.is_running());
        assert!(state.snapshot().is_none());
    }

    #[test]
    fn connecting_the_same_port_is_idempotent_and_another_port_is_rejected() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();

        let (session, _device) = shared_session(|_| {});
        let snapshot = connect(&state, &events, session).expect("connect");
        assert_eq!(snapshot.port_name, "SIM3");
        assert_eq!(snapshot.board_id, "esp32-wroom");
        assert_eq!(snapshot.implementation, "micropython");
        assert_eq!(snapshot.release, "1.29.0");
        assert!(!snapshot.running);

        // 同一串口重复连接：幂等，返回当前快照。
        let (duplicate, _) = shared_session(|_| {});
        let again = connect(&state, &events, duplicate).expect("duplicate connect");
        assert_eq!(again.port_name, "SIM3");

        // 另一个串口：稳定错误，不覆盖已有连接。
        let (other, _) = shared_session(|_| {});
        let mut other = other;
        other.port_name = "SIM4".to_string();
        let error = connect(&state, &events, other).expect_err("occupied");
        assert_eq!(error.kind(), HardwareErrorKind::Port);
        assert!(error.detail().contains("SIM4"));
        assert_eq!(state.snapshot().expect("still connected").port_name, "SIM3");
    }

    #[test]
    fn disconnect_closes_the_session_and_reports_it() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, _device) = shared_session(|_| {});
        connect(&state, &events, session).expect("connect");

        assert!(disconnect(&state, &events).expect("disconnect"));
        assert!(state.snapshot().is_none());
        assert!(events.lines().contains(&"state:-".to_string()));
        // 已经断开后再断开：不算错误，只是没有会话。
        assert!(!disconnect(&state, &events).expect("second disconnect"));
    }

    #[test]
    fn flashing_is_rejected_while_the_session_holds_the_same_port() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, _device) = shared_session(|_| {});
        connect(&state, &events, session).expect("connect");

        let error = state
            .ensure_port_free("SIM3")
            .expect_err("同一串口已被会话占用");
        assert_eq!(error.kind(), HardwareErrorKind::Busy);
        assert!(error.detail().contains("先断开设备"));

        // 另一块开发板（另一个串口）不受影响：刷写它不需要断开当前连接。
        assert!(state.ensure_port_free("SIM4").is_ok());

        assert!(disconnect(&state, &events).expect("disconnect"));
        assert!(state.ensure_port_free("SIM3").is_ok());
    }

    #[test]
    fn flashing_is_rejected_while_a_run_keeps_the_session_busy() {
        let state = Arc::new(HardwareState::default());
        let events = Arc::new(RecordingEvents::default());
        let (session, _device) = shared_session(endless_program());
        connect(&state, &events, session).expect("connect");

        let runner_state = Arc::clone(&state);
        let runner_events = Arc::clone(&events);
        let runner = std::thread::spawn(move || {
            perform_run(&runner_state, runner_events.as_ref(), RunRequest::Replay)
        });
        assert!(events.wait_for("blink", Duration::from_secs(2)));

        // 会话被运行作业独占：刷写不能排队等它，立刻返回 busy。
        let error = state.ensure_port_free("SIM3").expect_err("运行中不能刷写");
        assert_eq!(error.kind(), HardwareErrorKind::Busy);
        assert!(error.detail().contains("正在运行程序"));

        assert!(state.request_stop());
        let job = runner.join().expect("join").expect("run result");
        assert_eq!(job.outcome.status, RunStatus::Interrupted);

        // 程序停了，但会话还占着串口：仍然拒绝，只是原因变成“串口已被连接占用”。
        let error = state.ensure_port_free("SIM3").expect_err("会话仍占着串口");
        assert!(error.detail().contains("已被设备连接占用"));
    }

    #[test]
    fn upload_writes_the_file_and_reports_progress() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, device) = shared_session(|_| {});
        connect(&state, &events, session).expect("connect");

        let payload = "print('hi')\n".repeat(20).into_bytes();
        let report =
            perform_upload(&state, &events, "/main.py", &payload, 64, true).expect("upload");

        assert_eq!(report.size, payload.len() as u64);
        assert!(report.verified_size);
        assert!(report.verified_hash);
        assert_eq!(
            device.with(|device| device.file("/main.py").cloned()),
            Some(payload)
        );
        assert!(events.wait_for("progress:hardware_upload:/main.py:", Duration::from_secs(1)));
    }

    #[test]
    fn file_operations_round_trip_and_delete() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, _device) = shared_session(|device| {
            device.add_file("/boot.py", b"payload\r\n");
        });
        connect(&state, &events, session).expect("connect");

        let files = state
            .with_device("读取文件列表", |session| {
                session.device.list_files("/")
            })
            .expect("list");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "boot.py");

        let contents = state
            .with_device("读取文件", |session| {
                session.device.read_file("/boot.py")
            })
            .expect("read");
        assert_eq!(contents, b"payload\r\n");

        state
            .with_device("删除文件", |session| {
                session.device.remove_file("/boot.py")
            })
            .expect("remove");
        let error = state
            .with_device("读取文件", |session| {
                session.device.read_file("/boot.py")
            })
            .expect_err("removed");
        assert_eq!(error.kind(), HardwareErrorKind::Device);
    }

    #[test]
    fn run_uploads_first_and_streams_output_until_the_program_finishes() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, device) = shared_session(|device| {
            device.program_output = b"tick 1\r\ntick 2\r\n".to_vec();
        });
        connect(&state, &events, session).expect("connect");

        let code = b"print('tick')\n".to_vec();
        let job = perform_run(
            &state,
            &events,
            RunRequest::Upload {
                entry_path: "/main.py".to_string(),
                code: code.clone(),
                chunk_size: 64,
                verify_hash: true,
            },
        )
        .expect("run");

        assert_eq!(job.outcome.status, RunStatus::Finished);
        assert_eq!(job.upload.expect("upload report").size, code.len() as u64);
        assert_eq!(
            device.with(|device| device.file("/main.py").cloned()),
            Some(code)
        );
        assert!(events.wait_for("tick 1", Duration::from_secs(1)));
        assert!(events.wait_for("finished:1:Finished", Duration::from_secs(1)));
        // 运行结束后设备空闲，可以继续操作。
        assert!(!state.is_running());
        assert!(state.is_connected());
    }

    #[test]
    fn a_failed_upload_reports_an_error_without_starting_the_program() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, device) = shared_session(|device| {
            device.corrupt_uploads = true;
            device.program_output = b"old program\r\n".to_vec();
        });
        connect(&state, &events, session).expect("connect");
        let resets_before = device.with(|device| device.soft_reset_count);

        let error = perform_run(
            &state,
            &events,
            RunRequest::Upload {
                entry_path: "/main.py".to_string(),
                code: b"print('new')\n".to_vec(),
                chunk_size: 64,
                verify_hash: true,
            },
        )
        .expect_err("upload verification fails");

        assert_eq!(error.kind(), HardwareErrorKind::Protocol);
        let lines = events.lines();
        assert!(lines
            .iter()
            .any(|line| line.contains("failed:hardware_run#1")));
        // 没有软复位、没有输出、也没有启动程序：校验失败绝不跑旧文件。
        assert_eq!(device.with(|device| device.soft_reset_count), resets_before);
        assert!(!device.with(|device| device.running));
        assert!(!lines.iter().any(|line| line.starts_with("out:")));
        assert!(!state.is_running());
    }

    #[test]
    fn a_run_that_crashes_is_reported_as_an_exception() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, _device) = shared_session(|device| {
            device.program_output =
                b"Traceback (most recent call last):\r\n  File \"main.py\", line 2\r\nValueError: bad pin\r\n"
                    .to_vec();
        });
        connect(&state, &events, session).expect("connect");

        let job = perform_run(&state, &events, RunRequest::Replay).expect("run");

        assert_eq!(job.outcome.status, RunStatus::Exception);
        assert!(job.outcome.tail.contains("ValueError"));
        assert!(events.wait_for("finished:1:Exception", Duration::from_secs(1)));
    }

    #[test]
    fn stop_interrupts_the_program_and_keeps_the_device_usable() {
        let state = Arc::new(HardwareState::default());
        let events = Arc::new(RecordingEvents::default());
        let (session, device) = shared_session(endless_program());
        connect(&state, &events, session).expect("connect");
        let resets_before = device.with(|device| device.soft_reset_count);
        let interrupts_before = device.with(|device| device.interrupt_count);

        let runner_state = Arc::clone(&state);
        let runner_events = Arc::clone(&events);
        let runner = std::thread::spawn(move || {
            perform_run(&runner_state, runner_events.as_ref(), RunRequest::Replay)
        });

        assert!(
            events.wait_for("blink", Duration::from_secs(2)),
            "run streams output"
        );

        // 运行期间其它操作立即失败，不排队。
        let error = state
            .with_device("读取文件列表", |session| {
                session.device.list_files("/")
            })
            .expect_err("busy");
        assert_eq!(error.kind(), HardwareErrorKind::Busy);
        assert!(state.is_running());

        // 「停止」只置取消标志，不抢会话锁。
        assert!(state.request_stop());
        let job = runner.join().expect("join").expect("run result");
        assert_eq!(job.outcome.status, RunStatus::Interrupted);
        // 停止是中断而不是软复位：只多了运行本身的那一次软复位，且发了 Ctrl-C。
        assert_eq!(
            device.with(|device| device.soft_reset_count),
            resets_before + 1
        );
        assert_eq!(
            device.with(|device| device.interrupt_count),
            interrupts_before + 1
        );
        assert!(!device.with(|device| device.running));

        // 停止后设备重回空闲，可继续操作。
        assert!(!state.is_running());
        assert!(state
            .with_device("读取文件列表", |session| session
                .device
                .list_files("/"))
            .is_ok());
    }

    #[test]
    fn a_new_run_cancels_the_previous_one() {
        let state = Arc::new(HardwareState::default());
        let (session, _device) = shared_session(endless_program());
        let bootstrap = RecordingEvents::default();
        connect(&state, &bootstrap, session).expect("connect");

        let first_events = Arc::new(RecordingEvents::default());
        let first_state = Arc::clone(&state);
        let first_events_thread = Arc::clone(&first_events);
        let first_handle = std::thread::spawn(move || {
            perform_run(
                &first_state,
                first_events_thread.as_ref(),
                RunRequest::Replay,
            )
        });
        assert!(first_events.wait_for("blink", Duration::from_secs(2)));

        // 第二次运行会先取消第一次，然后等它释放设备。
        let second_events = Arc::new(RecordingEvents::default());
        let second_state = Arc::clone(&state);
        let second_events_thread = Arc::clone(&second_events);
        let second_handle = std::thread::spawn(move || {
            perform_run(
                &second_state,
                second_events_thread.as_ref(),
                RunRequest::Replay,
            )
        });
        assert!(second_events.wait_for("blink", Duration::from_secs(3)));

        let first = first_handle.join().expect("join").expect("first result");
        assert_eq!(first.outcome.status, RunStatus::Interrupted);
        assert!(state.is_running(), "第二个作业仍在运行");

        assert!(state.request_stop());
        let second = second_handle.join().expect("join").expect("second result");
        assert_eq!(second.outcome.status, RunStatus::Interrupted);
        assert!(!state.is_running());
    }

    #[test]
    fn disconnect_stops_the_run_and_closes_the_session() {
        let state = Arc::new(HardwareState::default());
        let events = Arc::new(RecordingEvents::default());
        let (session, _device) = shared_session(endless_program());
        connect(&state, &events, session).expect("connect");

        let runner_state = Arc::clone(&state);
        let runner_events = Arc::clone(&events);
        let runner = std::thread::spawn(move || {
            perform_run(&runner_state, runner_events.as_ref(), RunRequest::Replay)
        });
        assert!(events.wait_for("blink", Duration::from_secs(2)));

        assert!(disconnect(&state, &events).expect("disconnect"));
        let job = runner.join().expect("join").expect("run result");
        assert_eq!(job.outcome.status, RunStatus::Interrupted);
        assert!(state.snapshot().is_none());
    }

    #[test]
    fn a_real_unplug_surfaces_as_a_disconnect_and_releases_the_session() {
        let state = HardwareState::default();
        let events = RecordingEvents::default();
        let (session, device) = shared_session(|device| {
            device.program_output = b"tick\r\n".to_vec();
        });
        connect(&state, &events, session).expect("connect");
        // 连接之后拔线：之后每个读写都失败（真机上是把 USB 拔掉）。
        device.with(|device| device.unplug_after_scripts = Some(0));

        let error = perform_run(
            &state,
            &events,
            RunRequest::Upload {
                entry_path: "/main.py".to_string(),
                code: b"print(1)\n".to_vec(),
                chunk_size: 64,
                verify_hash: true,
            },
        )
        .expect_err("disconnected");

        assert_eq!(error.kind(), HardwareErrorKind::Disconnected);
        assert!(events.wait_for("设备已断开", Duration::from_secs(1)));
        // 拔线后会话被释放，界面回到「未连接」。
        assert!(state.snapshot().is_none());
        assert!(!state.is_running());
    }

    #[test]
    fn run_idle_wait_bounds_the_queue_behind_a_stuck_operation() {
        let state = HardwareState::with_idle_wait(Duration::from_millis(150));
        let events = RecordingEvents::default();
        let (session, _device) = shared_session(|_| {});
        connect(&state, &events, session).expect("connect");

        // 手工占住会话，模拟一个卡住不返回的作业。
        let guard = state.session.try_lock().expect("free");
        let ticket = state.begin_run();
        assert!(state.request_stop());

        let started = Instant::now();
        let error = state
            .with_device_for_run(|_| Ok(()))
            .expect_err("wait times out");
        assert_eq!(error.kind(), HardwareErrorKind::Busy);
        assert!(started.elapsed() < Duration::from_secs(2));

        drop(guard);
        state.finish_run(&ticket);
        assert!(!state.is_running());
    }

    #[test]
    fn finish_run_ignores_a_replaced_ticket() {
        let state = HardwareState::default();
        let first = state.begin_run();
        let second = state.begin_run();
        // 第一个作业被替换时已经被取消。
        assert!(first.cancel.load(Ordering::SeqCst));
        assert_eq!(second.run_id, first.run_id + 1);

        state.finish_run(&first);
        assert!(state.is_running(), "旧作业退出不能把新作业标记成空闲");

        state.finish_run(&second);
        assert!(!state.is_running());
    }
}
