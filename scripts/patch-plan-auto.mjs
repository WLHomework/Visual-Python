import fs from "node:fs";

// ---------- agentCore.ts ----------
let s = fs.readFileSync("src/agentCore.ts", "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";

// 1) 系统提示词：模式声明换成自动规划规则（模板字符串内是字面 \n 转义）
const modeLiteral = String.raw`\n\n当前模式：${mode === "plan" ? "计划模式，只能读取和分析，不得修改工程" : "智能体模式，可以执行必要的工程操作"}`;
if (!s.includes(modeLiteral)) throw new Error("mode literal missing");
const planRule = [
  String.raw`\n\n任务规划（由你自主决策）：`,
  `- 简单任务（2-3 个工具调用内可完成）直接执行，不要列清单。`,
  `- 复杂、多步或需求含糊的任务：先调用 update_task_plan 登记 3-6 条编号步骤（首条 in_progress，其余 pending），然后立即在同一轮内开始执行；每完成一步就把对应步骤标为 completed、下一步标为 in_progress。不要列完计划就停下等待确认。`,
  `- 计划要具体可执行（包含对象名、参数、目标文件），不要空泛套话。`,
].join(eol);
s = s.replace(modeLiteral, planRule);

// 2) 工具过滤移除 plan 分支
const filter = `    return mode === "plan" ? activeTools.filter((tool) => tool.readOnly) : activeTools;`;
if (!s.includes(filter)) throw new Error("filter missing");
s = s.replace(filter, `    return activeTools;`);

// 3) 计划拦截分支移除
const denyOld = [
  `      if (mode === "plan" || permissionDenied) {`,
  `        const denied = { ok: false, error: mode === "plan" ? "计划模式禁止执行修改或运行操作" : "用户拒绝了这次操作" };`,
].join(eol);
const denyNew = [
  `      if (permissionDenied) {`,
  `        const denied = { ok: false, error: "用户拒绝了这次操作" };`,
].join(eol);
if (!s.includes(denyOld)) throw new Error("deny missing");
s = s.replace(denyOld, denyNew);

// 4) reportProgress 自动附带当前任务清单
const progressOld = `  const reportProgress = (progress: AgentProgress) => onProgress?.({ ...progress, tokenUsage: progress.tokenUsage || usage });`;
const progressNew = `  const reportProgress = (progress: AgentProgress) => onProgress?.({ ...progress, taskPlan: taskPlan.length ? taskPlan : undefined, tokenUsage: progress.tokenUsage || usage });`;
if (!s.includes(progressOld)) throw new Error("progress anchor missing");
s = s.replace(progressOld, progressNew);

// 5) 在 usage 声明后初始化 taskPlan（种子来自 initialPlan）
const usageAnchor = `  const usage = createAgentTokenUsage();`;
if (!s.includes(usageAnchor)) throw new Error("usage anchor missing");
s = s.replace(usageAnchor, usageAnchor + eol + `  const taskPlan: AiAgentPlanStep[] = (initialPlan ?? []).map((step) => ({ ...step }));`);

// 6) update_task_plan 工具处理：放在 ask_user 处理之前
const askAnchor = `        if (call.function.name === "ask_user") result = { ok: true, question: args.question, options: args.options };`;
if (!s.includes(askAnchor)) throw new Error("ask_user anchor missing");
const updatePlanHandler = [
  `        if (call.function.name === "update_task_plan") {`,
  `          const steps = Array.isArray(args.steps) ? args.steps.flatMap((candidate) => {`,
  `            const step = candidate as Partial<AiAgentPlanStep>;`,
  `            return typeof step?.step === "string" && step.step.trim() && (step.status === "pending" || step.status === "in_progress" || step.status === "completed")`,
  `              ? [{ step: step.step.trim().slice(0, 120), status: step.status }]`,
  `              : [];`,
  `          }) as AiAgentPlanStep[];`,
  `          if (!steps.length) {`,
  `            const denied = { ok: false, error: \"steps 至少需要一条有效的任务步骤（step + status）\" };`,
  `            recordFailure(fingerprint, call.function.name, denied.error, false);`,
  `            emit({ id: toolId, kind: \"tool\", status: \"error\", title: toolLabel(call.function.name), detail: denied.error, toolName: call.function.name, result: denied, resultText: JSON.stringify(denied) });`,
  `            pushToolResponse(turnMessages, call.id, JSON.stringify(denied));`,
  `            continue;`,
  `          }`,
  `          taskPlan.splice(0, taskPlan.length, ...steps);`,
  `          const result = { ok: true, changed: true, steps };`,
  `          reportProgress({ phase: \"thinking\", label: \"任务清单已更新\" });`,
  `          emit({ id: toolId, kind: \"decision\", status: \"done\", title: \"更新任务清单\", detail: steps.map((step) => \`\${step.status === \"completed\" ? \"✓\" : step.status === \"in_progress\" ? \"▶\" : \"·\"} \${step.step}\`).join(\"\\n\"), toolName: call.function.name, result, resultText: JSON.stringify(result) });`,
  `          pushToolResponse(turnMessages, call.id, JSON.stringify(result));`,
  `          continue;`,
  `        }`,
].join(eol);
s = s.replace(askAnchor, updatePlanHandler + eol + askAnchor);

// 7) 两处返回结果附带 taskPlan
const finalReturn = `      return { summary: finalSummary, toolCallCount, tokenUsage: usage, ...(finalResponse.suggestions.length ? { followUpSuggestions: finalResponse.suggestions } : {}) };`;
if (!s.includes(finalReturn)) throw new Error("final return missing");
s = s.replace(finalReturn, finalReturn.slice(0, -3) + `, ...(taskPlan.length ? { taskPlan } : {}) };`);
const clarifyReturn = `          return { summary: question.question, toolCallCount, tokenUsage: usage, clarification };`;
if (!s.includes(clarifyReturn)) throw new Error("clarify return missing");
s = s.replace(clarifyReturn, clarifyReturn.slice(0, -3) + `, ...(taskPlan.length ? { taskPlan } : {}) };`);

fs.writeFileSync("src/agentCore.ts", s);
console.log("agentCore updated");

// ---------- toolRegistry.ts：注册 update_task_plan ----------
let t = fs.readFileSync("src/agentV2/toolRegistry.ts", "utf8");
const askTool = t.match(/tool\("ask_user"[^\n]*\n/)?.[0];
if (!askTool) throw new Error("ask_user tool def missing");
const planToolDef = askTool.replace(
  /tool\("ask_user", /,
  'tool("update_task_plan", "创建或更新当前任务的执行清单，让用户实时看到进度。复杂任务开始时登记 3-6 条步骤，每完成一步就更新状态；简单任务不要使用。", objectSchema({ steps: { type: "array", minItems: 1, maxItems: 10, items: objectSchema({ step: text, status: { type: "string", enum: ["pending", "in_progress", "completed"] } }, ["step", "status"]) } }, ["steps"])),\n  ',
);
t = t.replace(askTool, planToolDef);
const labelAnchor = '  ask_user: "询问用户",';
if (!t.includes(labelAnchor)) throw new Error("label anchor missing");
t = t.replace(labelAnchor, '  update_task_plan: "更新任务清单",\n' + labelAnchor);
fs.writeFileSync("src/agentV2/toolRegistry.ts", t);
console.log("toolRegistry updated");
