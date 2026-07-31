import { useEffect, useState } from "react";
import { Check, KeyRound, RefreshCw, RotateCcw, ShieldCheck, ShieldQuestion, Trash2 } from "lucide-react";
import { clearAiApiKey, defaultAiModelConfig, getAiAgentPermissionMode, getAiModelConfig, hasAiApiKey, saveAiAgentPermissionMode, saveAiModelConfig, testAiConnection, type AiAgentPermissionMode, type AiModelConfig } from "./aiConfig";

type ConnectionState = { kind: "success" | "error"; message: string } | null;

export function AiModelSettings() {
  const [config, setConfig] = useState<AiModelConfig>(() => getAiModelConfig());
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(null);
  const [agentPermissionMode, setAgentPermissionMode] = useState<AiAgentPermissionMode>(() => getAiAgentPermissionMode());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void hasAiApiKey(config.baseUrl).then(setHasStoredKey).catch(() => setHasStoredKey(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [config.baseUrl]);

  const updateConfig = (patch: Partial<AiModelConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setConnectionState(null);
    if (next.baseUrl.trim() && next.model.trim()) saveAiModelConfig(next);
  };

  const resetToDefault = () => {
    const next = saveAiModelConfig(defaultAiModelConfig);
    setConfig(next);
    setApiKey("");
    setConnectionState(null);
    setAgentPermissionMode(saveAiAgentPermissionMode("auto"));
  };

  const testConnection = async () => {
    if (!config.baseUrl.trim() || !config.model.trim()) return;
    setTesting(true);
    setConnectionState(null);
    try {
      const normalized = saveAiModelConfig(config);
      setConfig(normalized);
      const result = await testAiConnection(normalized, apiKey);
      setApiKey("");
      setHasStoredKey(await hasAiApiKey(normalized.baseUrl));
      setConnectionState({ kind: "success", message: `连接成功，服务返回模型 ${result.model || normalized.model}` });
    } catch (error) {
      setConnectionState({ kind: "error", message: String(error) });
    } finally {
      setTesting(false);
    }
  };

  const forgetApiKey = async () => {
    try {
      await clearAiApiKey(config.baseUrl);
      setApiKey("");
      setHasStoredKey(false);
      setConnectionState(null);
    } catch (error) {
      setConnectionState({ kind: "error", message: String(error) });
    }
  };

  return <section className="ai-model-settings">
    <div className="ai-settings-header"><div className="settings-pane-header"><h3>AI 模型</h3><p>配置兼容 OpenAI Chat Completions 的模型服务。</p></div><button onClick={resetToDefault}><RotateCcw size={14}/>默认设置</button></div>
    <div className="ai-settings-fields">
      <label><span>API 请求地址</span><input value={config.baseUrl} onChange={(event) => updateConfig({ baseUrl: event.currentTarget.value })} onBlur={() => setConfig(saveAiModelConfig(config))} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" spellCheck={false}/><small>可填写服务根地址、以 /v1 结尾的兼容地址，或完整的 /chat/completions 地址</small></label>
      <label><span>模型名称</span><input value={config.model} onChange={(event) => updateConfig({ model: event.currentTarget.value })} onBlur={() => setConfig(saveAiModelConfig(config))} placeholder="qwen3.7-flash" spellCheck={false}/><small>填写服务商提供的模型标识，例如 qwen3.7-flash</small></label>
      <label className="ai-api-key-field"><span>API Key</span><div className={hasStoredKey ? "has-key" : ""}><KeyRound size={15}/><input type="password" value={apiKey} onChange={(event) => { setApiKey(event.currentTarget.value); setConnectionState(null); }} placeholder={hasStoredKey ? "已安全保存，留空继续使用" : "输入 API Key"} autoComplete="off" spellCheck={false}/>{hasStoredKey && <button onClick={() => void forgetApiKey()} title="删除 API Key" aria-label="删除 API Key"><Trash2 size={15}/></button>}</div><small>连接成功后保存到 Windows 凭据管理器，不写入工程文件</small></label>
    </div>
    <section className="ai-agent-permission-settings">
      <div><strong>Agent 权限</strong><small>控制运行、渲染、安装依赖、删除场景和保存工程</small></div>
      <div className="ai-agent-permission-options" role="group" aria-label="Agent 权限模式">
        <button type="button" className={agentPermissionMode === "auto" ? "selected" : ""} aria-pressed={agentPermissionMode === "auto"} onClick={() => setAgentPermissionMode(saveAiAgentPermissionMode("auto"))}><ShieldCheck size={16}/><span><strong>自动执行</strong><small>由 Agent 自主完成</small></span></button>
        <button type="button" className={agentPermissionMode === "confirm" ? "selected" : ""} aria-pressed={agentPermissionMode === "confirm"} onClick={() => setAgentPermissionMode(saveAiAgentPermissionMode("confirm"))}><ShieldQuestion size={16}/><span><strong>执行前确认</strong><small>高影响操作先询问</small></span></button>
      </div>
    </section>
    <div className="ai-settings-test">
      <button className="ai-test-connection" onClick={() => void testConnection()} disabled={testing || !config.baseUrl.trim() || !config.model.trim()}>{testing ? <RefreshCw className="spin" size={15}/> : <Check size={15}/>}<span>{testing ? "正在连接" : "保存并测试连接"}</span></button>
      {connectionState && <p className={connectionState.kind} role={connectionState.kind === "error" ? "alert" : "status"}>{connectionState.kind === "success" && <Check size={14}/>}<span>{connectionState.message}</span></p>}
    </div>
  </section>;
}
