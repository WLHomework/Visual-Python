import { useCallback, useEffect, useRef, useState } from "react";
import { Braces, Check, Code2, Keyboard, Redo2, Sigma, Undo2, X } from "lucide-react";
import type { MathfieldElement } from "mathlive";
import type { FormulaEditorRequest } from "./formulaEditorBridge";

type FormulaEditorDialogProps = {
  request: FormulaEditorRequest;
  onClose(): void;
};

export default function FormulaEditorDialog({ request, onClose }: FormulaEditorDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const mathHostRef = useRef<HTMLDivElement>(null);
  const mathfieldRef = useRef<MathfieldElement | null>(null);
  const [latex, setLatex] = useState(request.value);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const hideVirtualKeyboard = useCallback(() => {
    window.mathVirtualKeyboard?.hide({ animate: true });
    setKeyboardVisible(false);
  }, []);

  const close = useCallback(() => {
    hideVirtualKeyboard();
    onClose();
  }, [hideVirtualKeyboard, onClose]);

  const apply = useCallback(() => {
    request.commit(latex.trim());
    close();
  }, [close, latex, request]);

  useEffect(() => {
    let disposed = false;
    let field: MathfieldElement | null = null;
    let keyboard: typeof window.mathVirtualKeyboard | undefined;
    let keyboardMeasureTimer: number | undefined;
    const previousBodyTheme = document.body.getAttribute("theme");
    const syncKeyboardHeight = () => setKeyboardHeight(Math.ceil(keyboard?.boundingRect.height ?? 0));
    const mount = async () => {
      try {
        const [mathlive] = await Promise.all([import("mathlive"), import("mathlive/fonts.css")]);
        if (disposed || !mathHostRef.current) return;
        mathlive.MathfieldElement.fontsDirectory = null;
        mathlive.MathfieldElement.soundsDirectory = null;
        mathlive.MathfieldElement.keypressSound = null;
        mathlive.MathfieldElement.plonkSound = null;
        field = new mathlive.MathfieldElement();
        field.className = "formula-mathfield";
        field.value = request.value;
        field.smartFence = true;
        field.smartSuperscript = true;
        field.mathVirtualKeyboardPolicy = "manual";
        field.setAttribute("aria-label", "数学公式");
        field.setAttribute("math-mode-space", "\\,");
        const updateValue = () => setLatex(field?.value ?? "");
        const updateHistory = () => setHistoryRevision((revision) => revision + 1);
        field.addEventListener("input", updateValue);
        field.addEventListener("undo-state-change", updateHistory);
        mathHostRef.current.replaceChildren(field);
        mathfieldRef.current = field;
        setLoading(false);
        window.requestAnimationFrame(() => {
          field?.focus();
          field?.executeCommand("moveToMathfieldEnd");
          keyboard = window.mathVirtualKeyboard;
          if (keyboard) {
            document.body.setAttribute("theme", document.documentElement.dataset.theme === "visual-light" ? "light" : "dark");
            keyboard.layouts = ["numeric", "symbols", "alphabetic", "greek"];
            keyboard.addEventListener("geometrychange", syncKeyboardHeight);
            keyboard.show({ animate: true });
            const numericLayer = keyboard.normalizedLayouts[0]?.layers[0]?.id;
            if (numericLayer) keyboard.executeCommand(["switchKeyboardLayer", numericLayer]);
            setKeyboardVisible(true);
            keyboardMeasureTimer = window.setTimeout(syncKeyboardHeight, 250);
          }
        });
      } catch (error) {
        if (!disposed) {
          setLoading(false);
          setLoadError(`公式编辑器加载失败：${String(error)}`);
        }
      }
    };
    void mount();
    return () => {
      disposed = true;
      if (keyboardMeasureTimer !== undefined) window.clearTimeout(keyboardMeasureTimer);
      keyboard?.removeEventListener("geometrychange", syncKeyboardHeight);
      window.mathVirtualKeyboard?.hide({ animate: false });
      if (previousBodyTheme === null) document.body.removeAttribute("theme");
      else document.body.setAttribute("theme", previousBodyTheme);
      field?.remove();
      mathfieldRef.current = null;
    };
  }, [request.id, request.value]);

  const updateSource = (value: string) => {
    setLatex(value);
    if (mathfieldRef.current) mathfieldRef.current.value = value;
  };

  const toggleKeyboard = () => {
    const keyboard = window.mathVirtualKeyboard;
    if (!keyboard || !mathfieldRef.current) return;
    mathfieldRef.current.focus();
    if (keyboard.visible) keyboard.hide({ animate: true });
    else keyboard.show({ animate: true });
    setKeyboardVisible(!keyboard.visible);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      apply();
      return;
    }
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, math-field, [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="formula-editor-backdrop" style={keyboardHeight ? { paddingBottom: keyboardHeight + 24 } : undefined} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} className="formula-editor-dialog" style={keyboardHeight ? { maxHeight: `calc(100vh - ${keyboardHeight + 48}px)` } : undefined} role="dialog" aria-modal="true" aria-labelledby="formula-editor-title" onKeyDown={handleDialogKeyDown}>
      <header>
        <div><span className="formula-editor-icon"><Sigma size={19}/></span><div><h2 id="formula-editor-title">数学公式编辑器</h2><p>Manim MathTex</p></div></div>
        <button className="dialog-close" onClick={close} title="关闭" aria-label="关闭公式编辑器"><X size={18}/></button>
      </header>
      <div className="formula-editor-content">
        <div className={`formula-editor-surface ${loadError ? "has-error" : ""}`}>
          {loading && <div className="formula-editor-loading"><Braces size={22}/><span>正在加载数学排版...</span></div>}
          {loadError && <div className="formula-editor-error" role="alert">{loadError}</div>}
          <div ref={mathHostRef} className="formula-mathfield-host"/>
        </div>
        {sourceOpen && <label className="formula-source-editor"><span>LaTeX</span><textarea value={latex} onChange={(event) => updateSource(event.target.value)} spellCheck={false} aria-label="LaTeX 源码"/></label>}
      </div>
      <footer>
        <div className="formula-editor-tools">
          <button onClick={() => { mathfieldRef.current?.executeCommand("undo"); setLatex(mathfieldRef.current?.value ?? latex); }} disabled={!mathfieldRef.current?.canUndo} title="撤销" aria-label="撤销"><Undo2 size={16}/></button>
          <button onClick={() => { mathfieldRef.current?.executeCommand("redo"); setLatex(mathfieldRef.current?.value ?? latex); }} disabled={!mathfieldRef.current?.canRedo} title="重做" aria-label="重做"><Redo2 size={16}/></button>
          <button className={keyboardVisible ? "active" : ""} onClick={toggleKeyboard} disabled={loading || Boolean(loadError)} title="数学符号键盘" aria-label="数学符号键盘"><Keyboard size={16}/></button>
          <button className={sourceOpen ? "active" : ""} onClick={() => setSourceOpen((open) => !open)} title="LaTeX 源码" aria-label="切换 LaTeX 源码"><Code2 size={16}/></button>
          <span className="formula-history-revision" aria-hidden="true">{historyRevision}</span>
        </div>
        <div className="formula-editor-actions"><button onClick={close}>取消</button><button className="primary" onClick={apply} disabled={loading || Boolean(loadError) || !latex.trim()}><Check size={15}/>应用公式</button></div>
      </footer>
    </section>
  </div>;
}
