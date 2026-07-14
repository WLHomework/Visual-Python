import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import * as Blockly from "blockly/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import Editor from "@monaco-editor/react";
import { Blocks, Braces, Check, ChevronDown, Copy, Download, FileCode2, FilePlus2, FolderOpen, Minus, PanelRightClose, PanelRightOpen, Play, RefreshCw, Save, SaveAll, Send, Settings, Square, Terminal, Trash2, Undo2, Redo2, X } from "lucide-react";
import { generateWorkspacePython, registerUsedVariablesToolbox, starterState, toolbox, visualPythonThemes, type VisualThemeId } from "./pythonBlocks";

type ProjectFile = { version: 1; name: string; workspace: object };
type DraftProject = ProjectFile & { path: string | null; savedAt: number };
type RecentProject = { path: string; name: string; openedAt: number };
type OutputEntry = { id: number; stream: "stdout" | "stderr" | "system" | "input"; data: string };
type PythonOutputEvent = { task_id: number; stream: OutputEntry["stream"]; data: string };
type PythonFinishedEvent = { task_id: number; exit_code: number; stopped: boolean; timed_out: boolean };
type PythonEnvironment = { path: string; version: string; implementation: string; virtual_env: boolean };
type ProblemKind = "syntax" | "runtime" | "timeout" | "environment";
type CodeProblem = { id: number; kind: ProblemKind; line: number; message: string };
const themeOptions: Array<{ id: VisualThemeId; label: string; description: string }> = [
  { id: "visual-dark", label: "Visual Dark", description: "默认深色" },
  { id: "visual-light", label: "Visual Light", description: "明亮环境" },
  { id: "one-dark", label: "One Dark", description: "柔和深色" },
  { id: "high-contrast", label: "High Contrast", description: "高对比度" },
];
const monacoThemes: Record<VisualThemeId, "vs" | "vs-dark" | "hc-black"> = {
  "visual-dark": "vs-dark", "visual-light": "vs", "one-dark": "vs-dark", "high-contrast": "hc-black",
};
const appWindow = getCurrentWindow();

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
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => JSON.parse(localStorage.getItem("visual-python:recent") || "[]"));
  const loadingWorkspace = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const [activePanel, setActivePanel] = useState<"output" | "problems">("output");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(() => localStorage.getItem("visual-python:right-panel-open") !== "false");
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("visual-python:right-panel-width"));
    return Number.isFinite(saved) && saved >= 360 && saved <= 720 ? saved : 480;
  });
  const [visualThemeId, setVisualThemeId] = useState<VisualThemeId>(() => {
    const saved = localStorage.getItem("visual-python:theme") as VisualThemeId | null;
    return saved && saved in visualPythonThemes ? saved : "visual-dark";
  });
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
      toolbox, renderer: "zelos", theme: visualPythonThemes[visualThemeId], trashcan: true,
      grid: { spacing: 24, length: 2, colour: "#3a424d", snap: true },
      zoom: { controls: true, wheel: true, startScale: .88, maxScale: 1.4, minScale: .45, scaleSpeed: 1.1 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    registerUsedVariablesToolbox(ws);
    let variablePruneScheduled = false;
    let pruningVariables = false;
    const pruneUnusedVariables = () => {
      if (pruningVariables) return;
      pruningVariables = true;
      const usedIds = new Set(Blockly.Variables.allUsedVarModels(ws).map((variable) => variable.getId()));
      const variableMap = ws.getVariableMap();
      for (const variable of variableMap.getAllVariables()) {
        if (!usedIds.has(variable.getId())) variableMap.deleteVariable(variable);
      }
      ws.getToolbox()?.refreshSelection();
      pruningVariables = false;
    };
    const scheduleVariablePrune = () => {
      if (variablePruneScheduled) return;
      variablePruneScheduled = true;
      queueMicrotask(() => {
        variablePruneScheduled = false;
        pruneUnusedVariables();
      });
    };
    const savedDraft = localStorage.getItem("visual-python:draft");
    let draft: DraftProject | null = null;
    try { draft = savedDraft ? JSON.parse(savedDraft) as DraftProject : null; } catch { localStorage.removeItem("visual-python:draft"); }
    loadingWorkspace.current = true;
    Blockly.serialization.workspaces.load(draft?.workspace || starterState, ws);
    pruneUnusedVariables();
    if (draft) { setProjectName(draft.name); setProjectPath(draft.path); setDirty(true); }
    queueMicrotask(() => { loadingWorkspace.current = false; });
    const update = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      scheduleVariablePrune();
      setCode(generateWorkspacePython(ws));
      if (!loadingWorkspace.current) {
        setDirty(true);
        setWorkspaceRevision((revision) => revision + 1);
      }
    };
    ws.addChangeListener(update);
    setCode(generateWorkspacePython(ws));
    workspace.current = ws;
    const observer = new ResizeObserver(() => Blockly.svgResize(ws));
    observer.observe(host.current);
    return () => { observer.disconnect(); ws.dispose(); };
  }, []);

  useEffect(() => { localStorage.setItem("visual-python:right-panel-open", String(rightPanelOpen)); }, [rightPanelOpen]);
  useEffect(() => { localStorage.setItem("visual-python:right-panel-width", String(rightPanelWidth)); }, [rightPanelWidth]);

  useEffect(() => {
    document.documentElement.dataset.theme = visualThemeId;
    localStorage.setItem("visual-python:theme", visualThemeId);
    workspace.current?.setTheme(visualPythonThemes[visualThemeId]);
  }, [visualThemeId]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const syncMaximized = () => { void appWindow.isMaximized().then((maximized) => { if (!disposed) setWindowMaximized(maximized); }); };
    syncMaximized();
    void appWindow.onResized(syncMaximized).then((listener) => { if (disposed) listener(); else unlisten = listener; });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const preventRefresh = (event: KeyboardEvent) => {
      if (event.key === "F5") event.preventDefault();
    };
    window.addEventListener("keydown", preventRefresh, true);
    return () => window.removeEventListener("keydown", preventRefresh, true);
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
  }, [dirty, projectName, projectPath, workspaceRevision]);

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
        }
      }),
      listen<PythonFinishedEvent>("python-finished", ({ payload }) => {
        if (taskId.current === 0) taskId.current = payload.task_id;
        if (taskId.current !== payload.task_id) return;
        if (payload.timed_out) {
          setProblems([{ id: problemId.current++, kind: "timeout", line: 0, message: "运行超过 60 秒，已终止。" }]);
          setActivePanel("problems");
        } else if (!payload.stopped && payload.exit_code !== 0) {
          const line = Number([...stderrBuffer.current.matchAll(/File "<string>", line (\d+)/g)].at(-1)?.[1] || 0);
          const message = stderrBuffer.current.trim().split("\n").at(-1) || `Python 进程退出代码：${payload.exit_code}`;
          setProblems([{ id: problemId.current++, kind: "runtime", line, message }]);
          setActivePanel("problems");
        }
        const status = payload.timed_out ? "运行超时" : payload.stopped ? "程序已停止" : `进程退出代码：${payload.exit_code}`;
        setOutput((entries) => [...entries, { id: outputId.current++, stream: "system", data: `${status}\n` }]);
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
    stderrBuffer.current = ""; setProblems([]);
    if (!pythonEnvironment) {
      setProblems([{ id: problemId.current++, kind: "environment", line: 0, message: "请先选择 Python 解释器。" }]);
      setActivePanel("problems"); setSettingsOpen(true);
      return;
    }
    try {
      await invoke("validate_python_code", { code, pythonPath: pythonEnvironment?.path || null });
    } catch (error) {
      const message = String(error);
      const line = Number(message.match(/line (\d+)/)?.[1] || 0);
      setProblems([{ id: problemId.current++, kind: "syntax", line, message: message.trim() || "Python 语法错误" }]);
      setActivePanel("problems");
      setOutput([{ id: outputId.current++, stream: "stderr", data: `${message}\n` }]);
      return;
    }
    taskId.current = 0;
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

  const closeWindow = useCallback(async () => {
    if (dirty && !window.confirm("当前工程有未保存修改，确定要关闭窗口吗？")) return;
    await appWindow.close();
  }, [dirty]);

  const startRightPanelResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!rightPanelOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightPanelWidth;
    document.body.classList.add("resizing-right-panel");
    const move = (moveEvent: PointerEvent) => {
      const availableMaximum = Math.max(360, Math.min(720, window.innerWidth - 540));
      setRightPanelWidth(Math.min(availableMaximum, Math.max(360, startWidth + startX - moveEvent.clientX)));
    };
    const stop = () => {
      document.body.classList.remove("resizing-right-panel");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [rightPanelOpen, rightPanelWidth]);

  return <main className="app-shell">
    <header className="topbar" data-tauri-drag-region onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button")) void appWindow.toggleMaximize(); }}>
      <div className="brand"><span className="brand-mark"><Braces size={17}/></span><strong>Visual Python</strong><div className="project-menu-wrap"><button className="project-menu-trigger" onClick={() => setProjectMenuOpen((open) => !open)}>工程 <ChevronDown size={13}/></button>{projectMenuOpen && <div className="project-menu">
        <button onClick={newProject}><FilePlus2 size={15}/><span>新建工程</span><kbd>Ctrl+N</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void openProject(); }}><FolderOpen size={15}/><span>打开工程</span><kbd>Ctrl+O</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProject(); }}><Save size={15}/><span>保存</span><kbd>Ctrl+S</kbd></button>
        <button onClick={() => { setProjectMenuOpen(false); void saveProjectAs(); }}><SaveAll size={15}/><span>另存为</span></button>
        <button onClick={() => { setProjectMenuOpen(false); void exportPython(); }}><Download size={15}/><span>导出 Python</span></button>
        {recentProjects.length > 0 && <><div className="menu-label">最近工程</div>{recentProjects.map((item) => <button className="recent-project" key={item.path} onClick={() => { setProjectMenuOpen(false); void loadProject(item.path); }}><FileCode2 size={15}/><span><strong>{item.name}</strong><small>{item.path}</small></span></button>)}</>}
      </div>}</div></div>
      <div className="project-title" data-tauri-drag-region title={projectPath || "尚未保存"}><FileCode2 size={15}/><span data-tauri-drag-region>{projectName}</span>{dirty ? <span className="dirty-dot" title="未保存"/> : <span className="saved-dot" title="已保存"/>}</div>
      <div className="toolbar">
        <button className="icon-button" title="打开工程" onClick={openProject}><FolderOpen size={17}/></button>
        <button className="icon-button" title="保存工程" onClick={() => void saveProject()}><Save size={17}/></button>
        <span className="toolbar-divider"/>
        <button className="icon-button" title="撤销" onClick={() => workspace.current?.undo(false)}><Undo2 size={17}/></button>
        <button className="icon-button" title="重做" onClick={() => workspace.current?.undo(true)}><Redo2 size={17}/></button>
        <button className="icon-button" title={rightPanelOpen ? "收起右侧面板" : "展开右侧面板"} onClick={() => setRightPanelOpen((open) => !open)}>{rightPanelOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}</button>
        <button className="run-button" onClick={runCode} disabled={running}><Play size={15} fill="currentColor"/>{running ? "运行中" : "运行"}</button>
        <button className="stop-button" onClick={stopCode} disabled={!running} title="停止运行"><Square size={14} fill="currentColor"/>停止</button>
        <span className="toolbar-divider window-divider"/>
        <div className="window-controls">
          <button className="window-control" title="最小化" onClick={() => void appWindow.minimize()}><Minus size={16}/></button>
          <button className="window-control" title={windowMaximized ? "还原" : "最大化"} onClick={() => void appWindow.toggleMaximize()}>{windowMaximized ? <Copy size={13}/> : <Square size={11}/>}</button>
          <button className="window-control close" title="关闭" onClick={() => void closeWindow()}><X size={17}/></button>
        </div>
      </div>
    </header>
    <section className={`workbench ${rightPanelOpen ? "" : "right-panel-hidden"}`} style={{ "--right-panel-width": `${rightPanelWidth}px` } as CSSProperties}>
      <aside className="activity-rail">
        <button className="activity active" title="积木"><Blocks size={20}/></button>
        <div className="rail-spacer"/><button className={`activity ${settingsOpen ? "active" : ""}`} title="设置" onClick={() => setSettingsOpen(true)}><Settings size={20}/></button>
      </aside>
      <section className="block-panel"><div ref={host} className="blockly-host"/></section>
      <div className={`panel-resizer ${rightPanelOpen ? "" : "collapsed"}`} onPointerDown={startRightPanelResize} role="separator" aria-label="调整右侧面板宽度" aria-orientation="vertical"/>
      <aside className={`right-panel ${rightPanelOpen ? "" : "collapsed"}`} aria-hidden={!rightPanelOpen}>
        <div className="panel-head"><div className="panel-tab active"><Braces size={14}/> Python</div><span className="read-only">实时生成</span></div>
        <div className="editor-wrap"><Editor language="python" value={code} theme={monacoThemes[visualThemeId]} options={{ readOnly: true, minimap: { enabled: false }, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 13, lineHeight: 22, padding: { top: 14 }, scrollBeyondLastLine: false, automaticLayout: true, renderLineHighlight: "none", wordWrap: "off", scrollbar: { horizontal: "auto", alwaysConsumeMouseWheel: false }, overviewRulerBorder: false }}/></div>
        <div className="console-panel">
          <div className="console-tabs"><button className={activePanel === "output" ? "active" : ""} onClick={() => setActivePanel("output")}><Terminal size={13}/> 输出</button><button className={activePanel === "problems" ? "active" : ""} onClick={() => setActivePanel("problems")}>问题 <span className="count">{problems.length}</span></button><span className="console-spacer"/><button className="clear-output" onClick={() => { setOutput([]); setProblems([]); }} title="清空输出"><Trash2 size={13}/></button></div>
          <div className="console-content">
            {activePanel === "output" ? <pre>{output.map((entry) => <span key={entry.id} className={`output-${entry.stream}`}>{entry.data}</span>)}</pre> : <div className="problem-list">{problems.length ? problems.map((problem) => <div key={problem.id} className={`problem-${problem.kind}`}><span className="problem-badge">{{ syntax: "语", runtime: "错", timeout: "超", environment: "环" }[problem.kind]}</span><span><strong>{problem.message}</strong><small>{problem.line ? `Python 第 ${problem.line} 行` : { syntax: "语法检查", runtime: "运行时错误", timeout: "执行超时", environment: "Python 环境" }[problem.kind]}</small></span></div>) : <div className="no-problems">没有检测到问题。</div>}</div>}
            {activePanel === "output" && <div className="stdin-row"><span className="stdin-prompt">›</span><input value={stdinValue} onChange={(event) => setStdinValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendInput(); }} placeholder={running ? "输入内容并按 Enter" : "程序运行时可输入"} disabled={!running}/><button onClick={sendInput} disabled={!running || !stdinValue.length} title="发送输入"><Send size={14}/></button></div>}
          </div>
        </div>
      </aside>
    </section>
    <footer className="statusbar"><button className="environment-status" onClick={() => setSettingsOpen(true)}>{pythonEnvironment ? `Python ${pythonEnvironment.version}` : "未选择 Python"}</button><span>Blockly 13</span><span className="status-spacer"/><span>{running ? "正在运行" : "就绪"}</span></footer>
    {settingsOpen && <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="应用设置">
      <header><div><span className="settings-icon"><Settings size={18}/></span><div><h2>设置</h2><p>界面主题与 Python 运行环境</p></div></div><button className="dialog-close" onClick={() => setSettingsOpen(false)} title="关闭"><X size={18}/></button></header>
      <div className="theme-section"><span className="settings-label">界面主题</span><div className="theme-picker">{themeOptions.map((theme) => <button key={theme.id} className={visualThemeId === theme.id ? "selected" : ""} onClick={() => setVisualThemeId(theme.id)}><span className={`theme-swatch swatch-${theme.id}`}/><span><strong>{theme.label}</strong><small>{theme.description}</small></span>{visualThemeId === theme.id && <Check size={14}/>}</button>)}</div></div>
      <section className="python-settings-section">
        <div className="python-settings-header"><div><span className="settings-label">Python 解释器</span><p>选择运行当前工程使用的 Python 环境</p></div><div className="settings-actions"><button onClick={() => void detectPythonEnvironments()} disabled={detectingPython}><RefreshCw size={15} className={detectingPython ? "spin" : ""}/>{detectingPython ? "检测中" : "重新检测"}</button><button onClick={() => void choosePythonExecutable()}><FolderOpen size={15}/>选择解释器</button></div></div>
        <div className="environment-list">{pythonEnvironments.length ? pythonEnvironments.map((environment) => {
          const selected = pythonEnvironment?.path.toLowerCase() === environment.path.toLowerCase();
          return <button key={environment.path} className={`environment-item ${selected ? "selected" : ""}`} onClick={() => selectPythonEnvironment(environment)}><span className="environment-check">{selected && <Check size={15}/>}</span><span className="environment-info"><strong>Python {environment.version}</strong><span>{environment.implementation}{environment.virtual_env ? " · 虚拟环境" : " · 系统环境"}</span><code>{environment.path}</code></span></button>;
        }) : <div className="empty-environments"><Braces size={24}/><strong>未检测到 Python</strong><span>安装 Python 3，或手动选择 python.exe</span></div>}</div>
      </section>
    </section></div>}
  </main>;
}
