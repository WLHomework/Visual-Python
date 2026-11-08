import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, CheckCircle2, CircleDashed, Download, LoaderCircle, Package, RefreshCw, Search, Trash2 } from "lucide-react";
import type { PythonEnvironment, PythonInstalledPackage } from "./pythonEnvironment";

type PythonPackageStatus = {
  name: string;
  installed: boolean;
};

export type PythonLibraryCheck = {
  name: string;
  installed: boolean;
  version: string | null;
};

export type PythonLibraryManagerProps = {
  pythonEnvironment: PythonEnvironment | null;
  installing: boolean;
  onInstall: (packages: string[]) => Promise<boolean>;
  onUninstall: (packages: string[]) => Promise<boolean>;
};

export function parsePythonRequirements(value: string): string[] {
  return [...new Set(value.trim().split(/\s+/).filter(Boolean))];
}

export function normalizePythonPackageName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

export function requirementPackageName(requirement: string): string {
  return /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(requirement.trim())?.[1] ?? "";
}

export function validatePythonRequirements(requirements: string[]): string | null {
  if (!requirements.length) return "请输入要安装的库名。";
  if (requirements.some((requirement) => requirement.startsWith("-"))) {
    return "库名不能以 - 开头；这里只接受包名或 pip 需求字符串。";
  }
  return null;
}

export function filterPythonPackages(packages: PythonInstalledPackage[], query: string): PythonInstalledPackage[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return packages;
  return packages.filter((item) => item.name.toLowerCase().includes(normalized) || item.version.toLowerCase().includes(normalized));
}

export function PythonLibraryManager({ pythonEnvironment, installing, onInstall, onUninstall }: PythonLibraryManagerProps) {
  const [packages, setPackages] = useState<PythonInstalledPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, PythonLibraryCheck>>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const wasInstalling = useRef(installing);
  const checkCache = useRef(new Map<string, boolean>());
  const checkSequence = useRef(0);

  const requirementNames = useMemo(
    () => [...new Set(parsePythonRequirements(draft).map(requirementPackageName).map(normalizePythonPackageName).filter(Boolean))],
    [draft],
  );

  const inspectRequirements = useCallback(
    async (names: string[]): Promise<Record<string, PythonLibraryCheck>> => {
      const pythonPath = pythonEnvironment?.path;
      const sequence = ++checkSequence.current;
      if (!pythonPath || !names.length) return {};
      const next: Record<string, PythonLibraryCheck> = {};
      const missing: string[] = [];
      for (const key of names) {
        const installed = packages.find((item) => normalizePythonPackageName(item.name) === key);
        if (installed) {
          next[key] = { name: installed.name, installed: true, version: installed.version || null };
        } else if (checkCache.current.has(key)) {
          next[key] = { name: key, installed: checkCache.current.get(key) === true, version: null };
        } else {
          missing.push(key);
        }
      }
      if (!missing.length) {
        if (sequence === checkSequence.current) {
          setChecking(false);
          setCheckError(null);
        }
        return next;
      }
      if (sequence === checkSequence.current) {
        setChecking(true);
        setCheckError(null);
      }
      try {
        const statuses = await invoke<PythonPackageStatus[]>("check_python_packages", { pythonPath, packages: missing });
        const found = new Map(statuses.map((status) => [normalizePythonPackageName(status.name), status.installed]));
        for (const key of missing) {
          const installed = found.get(key) === true;
          checkCache.current.set(key, installed);
          next[key] = { name: key, installed, version: null };
        }
      } catch {
        if (sequence === checkSequence.current) {
          setCheckError("环境检查未完成，安装时会交给 pip 判断。");
        }
      } finally {
        if (sequence === checkSequence.current) setChecking(false);
      }
      return next;
    },
    [packages, pythonEnvironment?.path],
  );

  useEffect(() => {
    checkCache.current.clear();
  }, [pythonEnvironment?.path]);

  useEffect(() => {
    if (!requirementNames.length) {
      setChecks({});
      setChecking(false);
      setCheckError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void inspectRequirements(requirementNames).then(setChecks);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [inspectRequirements, requirementNames]);

  const refresh = useCallback(async () => {
    const pythonPath = pythonEnvironment?.path;
    const sequence = ++refreshSequence.current;
    setError(null);
    if (!pythonPath) {
      setPackages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await invoke<PythonInstalledPackage[]>("list_python_packages", { pythonPath });
      if (sequence !== refreshSequence.current) return;
      setPackages(
        [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
      );
      checkCache.current.clear();
    } catch (reason) {
      if (sequence !== refreshSequence.current) return;
      setError(`读取已安装库失败：${reason instanceof Error ? reason.message : String(reason)}`);
      setPackages([]);
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [pythonEnvironment?.path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (wasInstalling.current && !installing) {
      setRemoving(null);
      void refresh();
    }
    wasInstalling.current = installing;
  }, [installing, refresh]);

  const filteredPackages = filterPythonPackages(packages, query);
  const busy = installing || submitting || removing !== null;
  const allRequirementsInstalled =
    requirementNames.length > 0 && requirementNames.every((name) => checks[name]?.installed === true);

  const submit = async () => {
    if (busy) return;
    const requirements = parsePythonRequirements(draft);
    const validation = validatePythonRequirements(requirements);
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const names = [...new Set(requirements.map(requirementPackageName).map(normalizePythonPackageName).filter(Boolean))];
      const nextChecks = await inspectRequirements(names);
      setChecks(nextChecks);
      if (await onInstall(requirements)) {
        setDraft("");
        setChecks({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  const uninstall = async (item: PythonInstalledPackage) => {
    if (busy) return;
    setRemoving(item.name);
    setError(null);
    try {
      if (!(await onUninstall([item.name]))) setRemoving(null);
    } catch {
      setRemoving(null);
    }
  };

  return (
    <section className="python-library-section" aria-label="Python 库管理">
      <div className="python-library-header">
        <div>
          <h4>库管理</h4>
          <p>查看当前解释器已安装的库，安装新库，或卸载不再需要的库。</p>
        </div>
        <button
          type="button"
          className="python-library-refresh"
          onClick={() => void refresh()}
          disabled={!pythonEnvironment || loading || installing}
        >
          {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
          刷新
        </button>
      </div>

      {!pythonEnvironment ? (
        <div className="python-library-empty">
          <Package size={20} />
          <strong>先选择一个 Python 解释器</strong>
          <span>选择后即可查看该环境中已安装的库。</span>
        </div>
      ) : (
        <>
          <div className="python-library-install">
            <input
              aria-label="要安装的库"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="输入包名，例如 requests 或 numpy==2.1.0"
              disabled={busy}
              spellCheck={false}
            />
            <button type="button" className="python-library-install-button" onClick={() => void submit()} disabled={busy || !draft.trim()}>
              {busy ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}
              {removing ? "卸载中…" : installing ? "安装中…" : allRequirementsInstalled ? "重新安装" : "安装"}
            </button>
          </div>

          {requirementNames.length ? (
            <div className="python-library-preflight" role="status" aria-live="polite">
              {checking ? (
                <span className="python-library-check">
                  <LoaderCircle className="spin" size={13} />
                  正在检查环境…
                </span>
              ) : (
                requirementNames.map((key) => {
                  const check = checks[key];
                  return (
                    <span className={`python-library-check ${check ? (check.installed ? "is-installed" : "is-missing") : "is-pending"}`} key={key}>
                      {check?.installed ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
                      {check ? check.name : key}
                      {check ? (check.installed ? (check.version ? ` 已安装 ${check.version}` : " 已安装") : " 未安装") : checkError ? " 待确认" : " 待检查"}
                    </span>
                  );
                })
              )}
              {checkError ? <span className="python-library-check-warning">{checkError}</span> : null}
            </div>
          ) : null}

          <div className="python-library-toolbar">
            <label className="python-library-search">
              <Search size={14} />
              <input
                aria-label="搜索已安装的库"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索已安装的库"
                spellCheck={false}
              />
            </label>
            <span className="python-library-count">
              {filteredPackages.length} / {packages.length} 个库
            </span>
          </div>

          {error ? (
            <div className="python-library-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
              <button type="button" onClick={() => void refresh()} disabled={loading}>
                重试
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="python-library-empty">
              <LoaderCircle className="spin" size={20} />
              <strong>正在读取库列表</strong>
              <span>从当前 Python 环境读取已安装的包。</span>
            </div>
          ) : packages.length === 0 ? (
            <div className="python-library-empty">
              <Package size={20} />
              <strong>{error ? "暂时无法读取库列表" : "当前环境还没有第三方库"}</strong>
              <span>在上方输入库名安装，安装完成后会自动刷新。</span>
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="python-library-empty">
              <Search size={20} />
              <strong>没有匹配的库</strong>
              <span>换个关键词试试。</span>
            </div>
          ) : (
            <div className="python-library-list" role="list">
              {filteredPackages.map((item) => (
                <div className="python-library-row" role="listitem" key={item.name} title={`${item.name} ${item.version}`}>
                  <Package size={15} />
                  <span className="python-library-name">{item.name}</span>
                  <span className="python-library-version">{item.version || "未知版本"}</span>
                  <button
                    type="button"
                    className="python-library-remove"
                    onClick={() => void uninstall(item)}
                    disabled={busy}
                    title={`卸载 ${item.name}`}
                    aria-label={`卸载 ${item.name}`}
                  >
                    {removing === item.name ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}
                    卸载
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
