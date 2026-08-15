import type { AiChatToolDefinition } from "../../../aiConfig";
import type { PluginAgentRuntime, PluginAgentTool, PluginContext } from "../../api/types";

const objectSchema = (properties: Record<string, unknown> = {}) => ({
  type: "object",
  properties,
  additionalProperties: false,
});

const tool = (name: string, description: string, properties: Record<string, unknown> = {}): AiChatToolDefinition => ({
  type: "function",
  function: { name, description, parameters: objectSchema(properties) },
});

const runCapability = (name: string) => (args: Record<string, unknown>, runtime: PluginAgentRuntime, signal: AbortSignal) => runtime.executeCapability(name, args, signal);

export const manimAgentTools: PluginAgentTool[] = [
  {
    id: "visual-python.manim.agent.list-scenes",
    definition: tool("list_scenes", "列出工程中的 Manim 场景文档及当前场景。"),
    label: "查看 Manim 场景",
    workspaceModes: ["code"],
    readOnly: true,
    execute: runCapability("list_scenes"),
  },
  {
    id: "visual-python.manim.agent.get-scene",
    definition: tool("get_scene", "读取指定 Manim 场景文档的完整 Python 源码。", { sceneId: { type: "string" } }),
    label: "读取 Manim 场景",
    workspaceModes: ["code"],
    readOnly: true,
    execute: runCapability("get_scene"),
  },
  {
    id: "visual-python.manim.agent.switch-scene",
    definition: tool("switch_scene", "切换当前编辑的 Manim 场景文档。", { sceneId: { type: "string" } }),
    label: "切换 Manim 场景",
    workspaceModes: ["code"],
    changesState: true,
    execute: runCapability("switch_scene"),
  },
  {
    id: "visual-python.manim.agent.create-scene",
    definition: tool("create_scene", "创建并切换到一个完整、可独立运行的 Manim 场景文档。", { name: { type: "string" } }),
    label: "创建 Manim 场景",
    workspaceModes: ["code"],
    changesState: true,
    execute: runCapability("create_scene"),
  },
  {
    id: "visual-python.manim.agent.rename-scene",
    definition: tool("rename_scene", "重命名 Manim 场景文档及其场景类。", { sceneId: { type: "string" }, name: { type: "string" } }),
    label: "重命名 Manim 场景",
    workspaceModes: ["code"],
    changesState: true,
    mutation: true,
    verificationTool: "check_code",
    execute: runCapability("rename_scene"),
  },
  {
    id: "visual-python.manim.agent.delete-scene",
    definition: tool("delete_scene", "删除指定 Manim 场景。只有用户明确要求删除时使用。", { sceneId: { type: "string" } }),
    label: "删除 Manim 场景",
    workspaceModes: ["code"],
    changesState: true,
    requiresPermission: true,
    execute: runCapability("delete_scene"),
  },
  {
    id: "visual-python.manim.agent.validate-scene",
    definition: tool("validate_scene", "检查当前 Manim 文档或图形化工作区的场景结构、语法和资源引用。只有当前内容属于 Manim 时使用。"),
    label: "验证 Manim 场景",
    workspaceModes: ["code", "visual", "split"],
    readOnly: true,
    execute: runCapability("validate_scene"),
  },
  {
    id: "visual-python.manim.agent.render",
    definition: tool("render_manim", "将当前 Manim 场景渲染为视频或图片。用户明确要求渲染时直接调用，由宿主处理唯一确认；不要先用 ask_user 询问是否渲染。", {
      outputType: { type: "string", enum: ["video", "image"] },
      transparentBackground: { type: "boolean" },
      imageWidth: { type: "integer", minimum: 64, maximum: 8192 },
      imageHeight: { type: "integer", minimum: 64, maximum: 8192 },
      imageCaptureMode: { type: "string", enum: ["final", "animation"] },
      imageAnimationStep: { type: "integer", minimum: 1, maximum: 10000 },
    }),
    label: "渲染 Manim",
    workspaceModes: ["code", "visual", "split"],
    requiresPermission: true,
    longRunning: true,
    changesState: true,
    executionLabels: { running: "渲染 Manim", success: "渲染 Manim 通过", failure: "渲染 Manim 失败" },
    execution: { stateField: "visual-python.manim.rendering", verificationTool: "inspect_rendered_output" },
    execute: runCapability("render_manim"),
  },
  {
    id: "visual-python.manim.agent.inspect-render",
    definition: tool("inspect_rendered_output", "检查最近一次 Manim 渲染是否产生有效视频或图片。"),
    label: "检查渲染结果",
    workspaceModes: ["code", "visual", "split"],
    readOnly: true,
    execute: runCapability("inspect_rendered_output"),
  },
  {
    id: "visual-python.manim.agent.voice-context",
    definition: tool("get_voiceover_context", "读取当前 Manim 配音配置、角色和可用音色。"),
    label: "读取配音配置",
    workspaceModes: ["code", "visual", "split"],
    readOnly: true,
    execute: runCapability("get_voiceover_context"),
  },
  {
    id: "visual-python.manim.agent.voiceover",
    definition: tool("add_voiceover", "在指定代码锚点前后插入独立 Manim 配音。", {
      summary: { type: "string" },
      anchorText: { type: "string", minLength: 1 },
      text: { type: "string", minLength: 1 },
      roleId: { type: "string" },
      placement: { type: "string", enum: ["before", "after"] },
    }),
    label: "添加配音",
    workspaceModes: ["code"],
    changesState: true,
    mutation: true,
    verificationTool: "check_code",
    execute: runCapability("add_voiceover"),
  },
  {
    id: "visual-python.manim.agent.synchronized-voiceover",
    definition: tool("add_synchronized_voiceover", "为指定 Manim 动画代码添加同步配音。", {
      summary: { type: "string" },
      targetText: { type: "string", minLength: 1 },
      text: { type: "string", minLength: 1 },
      roleId: { type: "string" },
    }),
    label: "添加同步配音",
    workspaceModes: ["code"],
    changesState: true,
    mutation: true,
    verificationTool: "check_code",
    execute: runCapability("add_synchronized_voiceover"),
  },
  {
    id: "visual-python.manim.agent.check-voiceover",
    definition: tool("check_voiceover", "检查 Manim 配音标记、角色、文本和同步时间轴。"),
    label: "检查配音配置",
    workspaceModes: ["code", "split"],
    readOnly: true,
    execute: runCapability("check_voiceover"),
  },
];

export const manimAgentToolNames = new Set(manimAgentTools.map((item) => item.definition.function.name));

export function registerManimAgentTools(context: PluginContext) {
  for (const tool of manimAgentTools) context.registerAgentTool(tool);
}
