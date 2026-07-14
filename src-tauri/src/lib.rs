use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::collections::HashSet;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
struct PythonOutput { task_id: u64, stream: &'static str, data: String }

#[derive(Clone, Serialize)]
struct PythonFinished { task_id: u64, exit_code: i32, stopped: bool, timed_out: bool }

#[derive(Clone, Deserialize, Serialize)]
struct PythonEnvironment { path: String, version: String, implementation: String, virtual_env: bool }

#[derive(Default)]
struct PythonTasks {
  next_id: AtomicU64,
  active: Arc<Mutex<Option<ActivePythonTask>>>,
  timed_out: Arc<Mutex<HashSet<u64>>>,
}

struct ActivePythonTask { id: u64, pid: u32, stdin: ChildStdin }

fn emit_reader<R: Read + Send + 'static>(app: AppHandle, task_id: u64, stream: &'static str, mut reader: R) {
  thread::spawn(move || {
    let mut buffer = [0_u8; 1024];
    let mut pending = Vec::<u8>::new();
    loop {
      match reader.read(&mut buffer) {
        Ok(0) => {
          if !pending.is_empty() {
            let data = String::from_utf8_lossy(&pending).into_owned();
            let _ = app.emit("python-output", PythonOutput { task_id, stream, data });
          }
          break;
        }
        Ok(size) => {
          pending.extend_from_slice(&buffer[..size]);
          loop {
            match std::str::from_utf8(&pending) {
              Ok(text) => {
                if !text.is_empty() { let _ = app.emit("python-output", PythonOutput { task_id, stream, data: text.to_owned() }); }
                pending.clear();
                break;
              }
              Err(error) => {
                let valid = error.valid_up_to();
                if valid > 0 {
                  let text = String::from_utf8_lossy(&pending[..valid]).into_owned();
                  let _ = app.emit("python-output", PythonOutput { task_id, stream, data: text });
                  pending.drain(..valid);
                }
                if error.error_len().is_none() { break; }
                let invalid = error.error_len().unwrap_or(1).min(pending.len());
                pending.drain(..invalid);
                let _ = app.emit("python-output", PythonOutput { task_id, stream, data: "�".into() });
              }
            }
          }
        }
        Err(_) => break,
      }
    }
  });
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) {
  let _ = Command::new("taskkill")
    .args(["/PID", &pid.to_string(), "/T", "/F"])
    .creation_flags(0x08000000)
    .stdout(Stdio::null()).stderr(Stdio::null()).status();
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(pid: u32) { let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).status(); }

fn inspect_python(program: &str, prefix_args: &[&str]) -> Result<PythonEnvironment, String> {
  let script = "import json,sys; print(json.dumps({'path':sys.executable,'version':sys.version.split()[0],'implementation':sys.implementation.name,'virtual_env':sys.prefix!=getattr(sys,'base_prefix',sys.prefix)}))";
  let mut command = Command::new(program);
  command.args(prefix_args).args(["-X", "utf8", "-c", script]).env("PYTHONIOENCODING", "utf-8");
  #[cfg(target_os = "windows")]
  command.creation_flags(0x08000000);
  let output = command.output().map_err(|e| e.to_string())?;
  if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).into_owned()); }
  serde_json::from_slice(&output.stdout).map_err(|e| format!("无法解析 Python 环境：{e}"))
}

#[tauri::command]
fn detect_python() -> Vec<PythonEnvironment> {
  let candidates: Vec<(&str, Vec<&str>)> = vec![("python", vec![]), ("python3", vec![]), ("py", vec!["-3"])];
  let mut environments = Vec::new();
  for (program, args) in candidates {
    if let Ok(environment) = inspect_python(program, &args) {
      if !environments.iter().any(|item: &PythonEnvironment| item.path.eq_ignore_ascii_case(&environment.path)) { environments.push(environment); }
    }
  }
  environments
}

#[tauri::command]
fn validate_python(path: String) -> Result<PythonEnvironment, String> { inspect_python(&path, &[]) }

#[tauri::command]
fn validate_python_code(code: String, python_path: Option<String>) -> Result<(), String> {
  let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
  command.args(["-X", "utf8", "-c", "import sys; compile(sys.stdin.read(), '<visual-python>', 'exec')"])
    .env("PYTHONIOENCODING", "utf-8")
    .env("PYTHONUTF8", "1")
    .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
  #[cfg(target_os = "windows")]
  command.creation_flags(0x08000000);
  let mut child = command.spawn().map_err(|e| format!("无法启动 Python：{e}"))?;
  if let Some(mut stdin) = child.stdin.take() { stdin.write_all(code.as_bytes()).map_err(|e| e.to_string())?; }
  let output = child.wait_with_output().map_err(|e| e.to_string())?;
  if output.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) }
}

#[tauri::command]
fn start_python(app: AppHandle, tasks: State<PythonTasks>, code: String, timeout_secs: Option<u64>, python_path: Option<String>) -> Result<u64, String> {
  let mut active = tasks.active.lock().map_err(|_| "Python task state is unavailable")?;
  if active.is_some() { return Err("已有 Python 程序正在运行".into()); }

  let task_id = tasks.next_id.fetch_add(1, Ordering::Relaxed) + 1;
  let mut command = Command::new(python_path.as_deref().unwrap_or("python"));
  command.args(["-u", "-X", "utf8", "-c", &code])
    .env("PYTHONIOENCODING", "utf-8")
    .env("PYTHONUTF8", "1")
    .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
  #[cfg(target_os = "windows")]
  command.creation_flags(0x08000000);
  let mut child = command.spawn().map_err(|e| format!("无法启动 Python：{e}"))?;
  let pid = child.id();
  let stdin = child.stdin.take().ok_or("无法连接 Python 标准输入")?;
  *active = Some(ActivePythonTask { id: task_id, pid, stdin });
  drop(active);

  if let Some(stdout) = child.stdout.take() { emit_reader(app.clone(), task_id, "stdout", stdout); }
  if let Some(stderr) = child.stderr.take() { emit_reader(app.clone(), task_id, "stderr", stderr); }

  let active_for_wait = tasks.active.clone();
  let timed_out_for_wait = tasks.timed_out.clone();
  let app_for_wait = app.clone();
  thread::spawn(move || {
    let exit_code = child.wait().ok().and_then(|status| status.code()).unwrap_or(-1);
    let mut active = active_for_wait.lock().ok();
    let was_active = active.as_ref().and_then(|state| state.as_ref()).is_some_and(|task| task.id == task_id);
    if let Some(state) = active.as_mut() { if state.as_ref().is_some_and(|task| task.id == task_id) { **state = None; } }
    let timed_out = timed_out_for_wait.lock().ok().is_some_and(|mut tasks| tasks.remove(&task_id));
    let _ = app_for_wait.emit("python-finished", PythonFinished { task_id, exit_code, stopped: !was_active && !timed_out, timed_out });
  });

  let timeout = timeout_secs.unwrap_or(60).clamp(1, 3600);
  let active_for_timeout = tasks.active.clone();
  let timed_out_tasks = tasks.timed_out.clone();
  let app_for_timeout = app;
  thread::spawn(move || {
    thread::sleep(Duration::from_secs(timeout));
    let timed_out_pid = active_for_timeout.lock().ok().and_then(|active| active.as_ref().filter(|task| task.id == task_id).map(|task| task.pid));
    if let Some(pid) = timed_out_pid {
      let _ = app_for_timeout.emit("python-output", PythonOutput { task_id, stream: "system", data: format!("运行超过 {timeout} 秒，已终止。\n") });
      if let Ok(mut tasks) = timed_out_tasks.lock() { tasks.insert(task_id); }
      if let Ok(mut active) = active_for_timeout.lock() { *active = None; }
      kill_process_tree(pid);
    }
  });
  Ok(task_id)
}

#[tauri::command]
fn stop_python(tasks: State<PythonTasks>, task_id: u64) -> Result<(), String> {
  let pid = {
    let mut active = tasks.active.lock().map_err(|_| "Python task state is unavailable")?;
    match active.as_ref() {
      Some(task) if task.id == task_id => { let pid = task.pid; *active = None; pid }
      _ => return Ok(()),
    }
  };
  kill_process_tree(pid);
  Ok(())
}

#[tauri::command]
fn send_python_input(tasks: State<PythonTasks>, task_id: u64, input: String) -> Result<(), String> {
  let mut active = tasks.active.lock().map_err(|_| "Python task state is unavailable")?;
  let task = active.as_mut().filter(|task| task.id == task_id).ok_or("Python 程序未在运行")?;
  task.stdin.write_all(input.as_bytes()).and_then(|_| task.stdin.write_all(b"\n")).and_then(|_| task.stdin.flush())
    .map_err(|e| format!("无法发送输入：{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(PythonTasks::default())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![detect_python, validate_python, validate_python_code, start_python, stop_python, send_python_input])
    .run(tauri::generate_context!())
    .expect("error while running Visual Python");
}
