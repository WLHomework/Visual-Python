import { useCallback, useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import Editor from "@monaco-editor/react";
import { Blocks, Braces, Check, ChevronDown, Download, FileCode2, FilePlus2, FolderOpen, Play, RefreshCw, Save, SaveAll, Send, Settings, Square, Terminal, Trash2, Undo2, Redo2, X } from "lucide-react";
import { generateWorkspacePython, registerUsedVariablesToolbox, starterState, toolbox, visualPythonTheme } from "./pythonBlocks";

type ProjectFile = { version: 1; name: string; workspace: object };
type DraftProject = ProjectFile & { path: string | null; savedAt: number };
type RecentProject = { path: string; name: string; openedAt: number };
type OutputEntry = { id: number; stream: "stdout" | "stderr" | "system" | "input"; data: string };
type PythonOutputEvent = { task_id: number; stream: OutputEntry["stream"]; data: string };
type PythonFinishedEvent = { task_id: number; exit_code: number; stopped: boolean; timed_out: boolean };
type PythonEnvironment = { path: string; version: string; implementation: string; virtual_env: boolean };
type CodeProblem = { id: number; line: number; message: string };

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState<OutputEntry[]>([{ id: 0, stream: "system", data: "准备就绪。运行项目后，输出将显示在这里。\n" }]);
  const [running, setRunning] = useState(false);
  const [stdinValue, setStdinValue] = useState("");
  const taskId = useRef<number | null>(null);
  const outputId = useRef(1);
  const [projectName, setProjectName] = useState("hello-python.vpy");
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => JSON.parse(localStorage.getItem("visual-python:recent") || "[]"));
  const loadingWorkspace = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const [activePanel, setActivePanel] = useState<"output" | "problems">("output");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pythonEnvironments, setPythonEnvironments] = useState<PythonEnvironment[]>([]);
  const [pythonEnvironment, setPythonEnvironment] = useState<PythonEnvironment | null>(() => {
    try { return JSON.parse(localStorage.getItem("visual-python:environment") || "null"); } catch { return null; }
  });
  const [detectingPython, setDetectingPython] = useState(false);
  const [problems, setProblems] = useState<CodeProblem[]>([]);
  const problemId = useRef(1);
  const stderrBuffer = useRef("");

  useEffect(() => {
    if (!host.current) return;
    const ws = Blockly.inject(host.current, {
      toolbox, renderer: "zelos", theme: visualPythonTheme, trashcan: true,
      grid: { spacing: 24, length: 2, colour: "#d9dde3", snap: true },
      zoom: { controls: true, wheel: true, startScale: .88, maxScale: 1.4, minScale: .45, scaleSpeed: 1.1 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    registerUsedVariablesToolbox(ws);
    const savedDraft = localStorage.getItem("visual-python:draft");
    let draft: DraftProject | null = null;
    try { draft = savedDraft ? JSON.parse(savedDraft) as DraftProject : null; } catch { localStorage.removeItem("visual-python:draft"); }
    loadingWorkspace.current = true;
    Blockly.serialization.workspaces.load(draft?.workspace || starterState, ws);
    if (draft) { setProjectName(draft.name); setProjectPath(draft.path); setDirty(true); }
    queueMicrotask(() => { loadingWorkspace.current = false; });
    const update = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      setCode(generateWorkspacePython(ws));
      if (!loadingWorkspace.current) setDirty(true);
    };
    ws.addChangeListener(update);
    setCode(generateWorkspacePython(ws));
    workspace.current = ws;
    const observer = new ResizeObserver(() => Blockly.svgResize(ws));
    observer.observe(host.current);
    return () => { observer.disconnect(); ws.dispose(); };
  }, []);

  useEffect(() => {
    if (!dirty || !workspace.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    const saveDraft = () => {
      const ws = workspace.current;
      if (!ws) return;
      if (ws.isDragging()) {
        autosaveTimer.current = window.setTimeout(saveDraft, 300);
        return;
      }
      const draft: DraftProject = { version: 1, name: projectName, path: projectPath, savedAt: Date.now(), workspace: Blockly.serialization.workspaces.save(ws) };
      localStorage.setItem("visual-python:draft", JSON.stringify(draft));
      autosaveTimer.current = null;
    };
    autosaveTimer.current = window.setTimeout(saveDraft, 800);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [dirty, projectName, projectPath, code]);

  const rememberRecent = useCallback((path: string, name: string) => {
    setRecentProjects((items) => {
      const next = [{ path, name, openedAt: Date.now() }, ...items.filter((item) => item.path !== path)].slice(0, 8);
      localStorage.setItem("visual-python:recent", JSON.stringify(next));
      return next;
    });
  }, []);

  const selectPythonEnvironment = useCallback((environment: PythonEnvironment) => {
    setPythonEnvironment(environment); localStorage.setItem("visual-python:environment", JSON.stringify(environment));
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已选择 Python ${environment.version}：${environment.path}\n` }]);
  }, []);

  const detectPythonEnvironments = useCallback(async () => {
    setDetectingPython(true);
    try {
      const environments = await invoke<PythonEnvironment[]>("detect_python"); setPythonEnvironments(environments);
      if (!pythonEnvironment && environments[0]) selectPythonEnvironment(environments[0]);
    } catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `检测 Python 失败：${String(error)}\n` }]); }
    finally { setDetectingPython(false); }
  }, [pythonEnvironment, selectPythonEnvironment]);

  useEffect(() => { void detectPythonEnvironments(); }, []);

  const choosePythonExecutable = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Python executable", extensions: ["exe"] }] });
    if (!path) return;
    setDetectingPython(true);
    try {
      const environment = await invoke<PythonEnvironment>("validate_python", { path });
      setPythonEnvironments((items) => [environment, ...items.filter((item) => item.path !== environment.path)]); selectPythonEnvironment(environment);
    } catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `无效的 Python 解释器：${String(error)}\n` }]); }
    finally { setDetectingPython(false); }
  }, [selectPythonEnvironment]);

  useEffect(() => {
    const unlisteners = Promise.all([
      listen<PythonOutputEvent>("python-output", ({ payload }) => {
        if (taskId.current === 0) taskId.current = payload.task_id;
        if (taskId.current !== payload.task_id) return;
        setOutput((entries) => [...entries, { id: outputId.current++, stream: payload.stream, data: payload.data }]);
        if (payload.stream === "stderr") {
          stderrBuffer.current = `${stderrBuffer.current}${payload.data}`.slice(-12000);
          const lineMatches = [...stderrBuffer.current.matchAll(/File "<string>", line (\d+)/g)];
          const lastLine = lineMatches.at(-1);
          if (lastLine) {
            const line = Number(lastLine[1]);
            const message = stderrBuffer.current.trim().split("\n").at(-1) || "Python 运行错误";
            setProblems((items) => items.some((item) => item.line === line && item.message === message) ? items : [...items, { id: problemId.current++, line, message }]);
            setActivePanel("problems");
          }
        }
      }),
      listen<PythonFinishedEvent>("python-finished", ({ payload }) => {
        if (taskId.current === 0) taskId.current = payload.task_id;
        if (taskId.current !== payload.task_id) return;
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `${payload.stopped ? "程序已停止" : `进程退出代码：${payload.exit_code}`}\n` }]);
        taskId.current = null; setRunning(false);
      }),
    ]);
    return () => { void unlisteners.then((listeners) => listeners.forEach((unlisten) => unlisten())); };
  }, []);

  const writeProject = useCallback(async (path: string) => {
    if (!workspace.current) return false;
    const data: ProjectFile = { version: 1, name: path.split(/[\\/]/).pop() || projectName, workspace: Blockly.serialization.workspaces.save(workspace.current) };
    await writeTextFile(path, JSON.stringify(data, null, 2));
    setProjectName(data.name); setProjectPath(path); setDirty(false); localStorage.removeItem("visual-python:draft"); rememberRecent(path, data.name);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已保存：${path}\n` }]);
    return true;
  }, [projectName, rememberRecent]);

  const saveProjectAs = useCallback(async () => {
    const path = await save({ defaultPath: projectPath || projectName, filters: [{ name: "Visual Python", extensions: ["vpy"] }] });
    if (!path) return false;
    return writeProject(path);
  }, [projectName, projectPath, writeProject]);

  const saveProject = useCallback(async () => projectPath ? writeProject(projectPath) : saveProjectAs(), [projectPath, saveProjectAs, writeProject]);

  const loadProject = useCallback(async (path: string) => {
    if (!workspace.current) return;
    if (dirty && !window.confirm("当前工程有未保存修改。确定要打开其他工程吗？")) return;
    try {
      const data = JSON.parse(await readTextFile(path)) as ProjectFile;
      if (data.version !== 1 || !data.workspace) throw new Error("不支持的工程格式");
      loadingWorkspace.current = true;
      Blockly.serialization.workspaces.load(data.workspace, workspace.current);
      setProjectName(data.name || path.split(/[\\/]/).pop() || "untitled.vpy"); setProjectPath(path); setDirty(false); localStorage.removeItem("visual-python:draft");
      setCode(generateWorkspacePython(workspace.current)); setProblems([]); rememberRecent(path, data.name);
      setOutput([{ id: outputId.current++, stream: "system", data: `已打开：${path}\n` }]);
      queueMicrotask(() => { loadingWorkspace.current = false; });
    } catch (error) {
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `无法打开工程：${String(error)}\n` }]);
      setRecentProjects((items) => { const next = items.filter((item) => item.path !== path); localStorage.setItem("visual-python:recent", JSON.stringify(next)); return next; });
    }
  }, [dirty, rememberRecent]);

  const openProject = useCallback(async () => {
    const path = await open({ multiple: false, filters: [{ name: "Visual Python", extensions: ["vpy"] }] });
    if (path) await loadProject(path);
  }, [loadProject]);

  const newProject = useCallback(() => {
    if (!workspace.current) return;
    if (dirty && !window.confirm("当前工程有未保存修改。确定要新建工程吗？")) return;
    loadingWorkspace.current = true; Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [] } }, workspace.current);
    setProjectName("untitled.vpy"); setProjectPath(null); setDirty(false); setCode(""); setProblems([]); localStorage.removeItem("visual-python:draft");
    setOutput([{ id: outputId.current++, stream: "system", data: "已创建新工程。\n" }]);
    setProjectMenuOpen(false); queueMicrotask(() => { loadingWorkspace.current = false; });
  }, [dirty]);

  const exportPython = useCallback(async () => {
    const defaultName = projectName.replace(/\.vpy$/i, ".py");
    const path = await save({ defaultPath: defaultName, filters: [{ name: "Python", extensions: ["py"] }] });
    if (!path) return;
    await writeTextFile(path, code);
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `已导出 Python：${path}\n` }]);
  }, [code, projectName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(); }
      if (event.key.toLowerCase() === "o") { event.preventDefault(); void openProject(); }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); newProject(); }
    };
    const closeMenu = () => setProjectMenuOpen(false);
    window.addEventListener("keydown", onKeyDown); window.addEventListener("blur", closeMenu);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("blur", closeMenu); };
  }, [newProject, openProject, saveProject]);

  const runCode = useCallback(async () => {
    if (running) return;
    taskId.current = 0;
    stderrBuffer.current = ""; setProblems([]);
    setRunning(true); setOutput([{ id: outputId.current++, stream: "system", data: `> Python 运行 ${projectName}\n\n` }]);
    try {
      const startedTaskId = await invoke<number>("start_python", { code, timeoutSecs: 60, pythonPath: pythonEnvironment?.path || null });
      if (taskId.current === 0) taskId.current = startedTaskId;
    } catch (error) {
      setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `运行失败：${String(error)}\n` }]);
      taskId.current = null;
      setRunning(false);
    }
  }, [code, projectName, pythonEnvironment, running]);

  const stopCode = useCallback(async () => {
    if (taskId.current === null) return;
    const stoppingTask = taskId.current;
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: "正在停止程序...\n" }]);
    await invoke("stop_python", { taskId: stoppingTask });
  }, []);

  const sendInput = useCallback(async () => {
    const currentTask = taskId.current;
    if (!running || currentTask === null || currentTask === 0 || !stdinValue.length) return;
    const submitted = stdinValue;
    setStdinValue("");
    setOutput((entries) => [...entries, { id: outputId.current++, stream: "input", data: `${submitted}\n` }]);
    try { await invoke("send_python_input", { taskId: currentTask, input: submitted }); }
    catch (error) { setOutput((entries) => [...entries, { id: outputId.current++, stream: "stderr", data: `${String(error)}\n` }]); }
  }, [running, stdinValue]);

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Braces size={17}/></span><strong>Visual Python</strong><div className="project-menu-wrap"><button className="project-menu-trigger" onClick={() => setProjectMenuOpen((open) => !open)}>工程 <ChevronDown size={13}/></button>{projectMenuOpen && <div className="project-menu">
        <button onClick={newProject}><FilePlus2 size={15}/><span>新建工程</span><kbd>Ctrl+N</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void openProject(); }}><FolderOpen size={15}/><span>打开工程</span><kbd>Ctrl+O</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProject(); }}><Save size={15}/><span>保存</span><kbd>Ctrl+S</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProjectAs(); }}><SaveAll size={15}/><span>另存为</span></button>
        <button onClick={() => { setProjectMenuOpen(false); void exportPython(); }}><Download size={15}/><span>导出 Python</span></button>
        {recentProjects.length > 0 && <><div className="menu-label">最近工程</div>{recentProjects.map((item) => <button className="recent-project" key={item.path} onClick={() => { setProjectMenuOpen(false); void loadProject(item.path); }}><FileCode2 size={15}/><span><strong>{item.name}</strong><small>{item.path}</small></span></button>)}</>}
      </div>}</div></div>
      <div className="project-title" title={projectPath || "尚未保存"}><FileCode2 size={15}/><span>{projectName}</span>{dirty ? <span className="dirty-dot" title="未保存"/> : <span className="saved-dot" title="已保存"/>}</div>
      <div className="toolbar">
        <button className="icon-button" title="打开工程" onClick={openProject}><FolderOpen size={17}/></button>
        <button className="icon-button" title="保存工程" onClick={() => void saveProject()}><Save size={17}/></button>
        <span className="toolbar-divider"/>
        <button className="icon-button" title="撤销" onClick={() => workspace.current?.undo(false)}><Undo2 size={17}/></button>
        <button className="icon-button" title="重做" onClick={() => workspace.current?.undo(true)}><Redo2 size={17}/></button>
        <button className="run-button" onClick={runCode} disabled={running}><Play size={15} fill="currentColor"/>{running ? "运行中" : "运行"}</button>
        <button className="stop-button" onClick={stopCode} disabled={!running} title="停止运行"><Square size={14} fill="currentColor"/>停止</button>
      </div>
    </header>
    <section className="workbench">
      <aside className="activity-rail">
        <button className="activity active" title="积木"><Blocks size={20}/></button>
        <button className="activity" title="项目"><FileCode2 size={20}/></button>
        <div className="rail-spacer"/><button className={`activity ${settingsOpen ? "active" : ""}`} title="设置" onClick={() => setSettingsOpen(true)}><Settings size={20}/></button>
      </aside>
      <section className="block-panel"><div ref={host} className="blockly-host"/></section>
      <aside className="right-panel">
        <div className="panel-head"><div className="panel-tab active"><Braces size={14}/> Python</div><span className="read-only">实时生成</span></div>
        <div className="editor-wrap"><Editor language="python" value={code} theme="vs" options={{ readOnly: true, minimap: { enabled: false }, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 13, lineHeight: 22, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, renderLineHighlight: "none" }}/></div>
        <div className="console-panel">
          <div className="console-tabs"><button className={activePanel === "output" ? "active" : ""} onClick={() => setActivePanel("output")}><Terminal size={13}/> 输出</button><button className={activePanel === "problems" ? "active" : ""} onClick={() => setActivePanel("problems")}>问题 <span className="count">{problems.length}</span></button><span className="console-spacer"/><button className="clear-output" onClick={() => { setOutput([]); setProblems([]); }} title="清空输出"><Trash2 size={13}/></button></div>
          <div className="console-content">
            {activePanel === "output" ? <pre>{output.map((entry) => <span key={entry.id} className={`output-${entry.stream}`}>{entry.data}</span>)}</pre> : <div className="problem-list">{problems.length ? problems.map((problem) => <div key={problem.id}><span className="problem-badge">!</span><span><strong>{problem.message}</strong><small>Python 第 {problem.line} 行</small></span></div>) : <div className="no-problems">没有检测到问题。</div>}</div>}
            {activePanel === "output" && <div className="stdin-row"><span className="stdin-prompt">›</span><input value={stdinValue} onChange={(event) => setStdinValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendInput(); }} placeholder={running ? "输入内容并按 Enter" : "程序运行时可输入"} disabled={!running}/><button onClick={sendInput} disabled={!running || !stdinValue.length} title="发送输入"><Send size={14}/></button></div>}
          </div>
        </div>
      </aside>
    </section>
    <footer className="statusbar"><button className="environment-status" onClick={() => setSettingsOpen(true)}>{pythonEnvironment ? `Python ${pythonEnvironment.version}` : "未选择 Python"}</button><span>Blockly 13</span><span className="status-spacer"/><span>{running ? "正在运行" : "就绪"}</span></footer>
    {settingsOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Python 环境设置">
      <header><div><span className="settings-icon"><Settings size={18}/></span><div><h2>Python 环境</h2><p>选择运行图形化代码使用的解释器</p></div></div><button className="dialog-close" onClick={() => setSettingsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="settings-actions"><button onClick={() => void detectPythonEnvironments()} disabled={detectingPython}><RefreshCw size={15} className={detectingPython ? "spin" : ""}/>{detectingPython ? "检测中" : "重新检测"}</button><button onClick={() => void choosePythonExecutable()}><FolderOpen size={15}/>选择解释器</button></div>
      <div className="environment-list">{pythonEnvironments.length ? pythonEnvironments.map((environment) => {
        const selected = pythonEnvironment?.path.toLowerCase() === environment.path.toLowerCase();
        return <button key={environment.path} className={`environment-item ${selected ? "selected" : ""}`} onClick={() => selectPythonEnvironment(environment)}><span className="environment-check">{selected && <Check size={15}/>}</span><span className="environment-info"><strong>Python {environment.version}</strong><span>{environment.implementation}{environment.virtual_env ? " · 虚拟环境" : " · 系统环境"}</span><code>{environment.path}</code></span></button>;
      }) : <div className="empty-environments"><Braces size={24}/><strong>未检测到 Python</strong><span>安装 Python 3，或手动选择 python.exe</span></div>}</div>
      {pythonEnvironment && <footer><span>当前解释器</span><code>{pythonEnvironment.path}</code></footer>}
    </section></div>}
  </main>;
}
