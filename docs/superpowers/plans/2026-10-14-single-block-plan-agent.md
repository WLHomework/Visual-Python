# Single Block Plan Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current multi-tool Blockly Agent with one declarative `apply_block_plan` write protocol that can create, modify, delete, connect, validate, and commit blocks for Python, built-in plugins, and external plugins.

**Architecture:** The model only returns a versioned semantic block plan through one Function Calling tool. The host resolves registered block metadata, constructs blocks in an isolated Blockly workspace, validates fields, connections, generated code, and plugin validators, then commits the complete state once. Read-only discovery remains available, but all legacy Blockly mutation tools and compatibility routes are removed.

**Tech Stack:** TypeScript, React, Blockly 13, Vitest, existing Visual Python plugin registry and Agent host adapter.

**Spec:** The user-approved single-protocol design: model produces a simplified block-edit plan; Visual Python deterministically compiles and validates it; only the new plan protocol writes the workspace.

## Global Constraints

- There is exactly one graphical Agent write entry point: `apply_block_plan`.
- Do not expose or execute `add_workspace_block`, `append_workspace_blocks`, `replace_workspace`, or `apply_workspace` after migration.
- Do not let the model submit raw Blockly serialized state, `next`, `shadow`, generated IDs, or coordinates.
- The protocol must not contain Manim, Turtle, NumPy, Pandas, Matplotlib, or `python_*` special cases.
- Read-only directory and contract discovery may remain, but normal generation must use the plan directly after one task-oriented discovery result.
- A failed plan is never committed; validation must run against an isolated workspace.
- Existing saved project/workspace data remains valid. This is storage compatibility, not an AI protocol compatibility path.
- Every changed behavior must have a focused Vitest test before the implementation is considered complete.

---

### Task 1: Freeze the current graphical Agent baseline

**Files:**
- Modify: `src/agentV2/blocklyHost.test.ts`
- Modify: `src/agentV2.test.ts`
- Modify: `src/agentCore.ts`
- Create: `docs/superpowers/plans/2026-10-14-single-block-plan-agent-baseline.md`

**Interfaces:**
- Consumes: current `blocklyAgentTools`, `blocklyCompatibilityTools`, `compose_workspace`, and `createBlocklyToolExecutor`.
- Produces: a checked baseline describing the current tool list, request route, and regression cases that the new protocol must preserve.

- [ ] **Step 1: Add a failing contract test for the intended final tool list**

Add a test that expects the graphical tool list to contain the read-only discovery tools plus `apply_block_plan`, and rejects all four legacy mutation names.

- [ ] **Step 2: Run the focused test and record the current failure**

Run:

```powershell
npx vitest run src/agentV2/blocklyHost.test.ts src/agentV2.test.ts
```

Expected: the new final-contract assertion fails because the current implementation still exposes `compose_workspace` and compatibility mutation routes.

- [ ] **Step 3: Record baseline scenarios without changing behavior**

Document the current expected behavior for: a new Python print block, a nested Manim animation, a Turtle statement chain, an existing-workspace local edit, an invalid input connection, and a failed generated-code validation. Include current tool-call counts where the existing tests already expose them.

- [ ] **Step 4: Verify the baseline document and existing tests**

Run the focused tests again and confirm that only the newly added final-contract assertion fails. Do not weaken existing tests to make the baseline pass.

---

### Task 2: Define the single semantic block-plan schema

**Files:**
- Create: `src/agentV2/blockPlan.ts`
- Create: `src/agentV2/blockPlan.test.ts`
- Modify: `src/agentV2/types.ts`

**Interfaces:**
- Consumes: registered Blockly block types and current workspace block IDs.
- Produces: `BlockPlan`, `BlockPlanOperation`, `BlockPlanBlock`, `BlockPlanInput`, `BlockPlanTarget`, schema validation, and stable error objects.

- [ ] **Step 1: Write schema tests before implementation**

Cover these exact cases:

```ts
expect(parseBlockPlan({ version: 1, mode: "append", operations: [{ action: "create", block: "python_print", ref: "print1", fields: { TEXT: "你好" } }] })).toEqual(...);
expect(() => parseBlockPlan({ version: 1, mode: "append", operations: [] })).toThrow();
expect(() => parseBlockPlan({ version: 1, operations: [{ action: "create", block: "python_print", next: [] }] })).toThrow();
```

Also reject unknown top-level keys, raw Blockly keys (`id`, `shadow`, `next`, `x`, `y`), duplicate refs, and references to unknown refs.

- [ ] **Step 2: Implement a versioned schema with no raw Blockly state**

Use this shape as the only write contract:

```ts
export type BlockPlan = {
  version: 1;
  mode: "append" | "replace" | "patch";
  operations: BlockPlanOperation[];
};

export type BlockPlanOperation =
  | { action: "create"; ref: string; block: string; fields?: Record<string, string | number | boolean>; inputs?: Record<string, BlockPlanInput> }
  | { action: "update"; target: BlockPlanTarget; fields?: Record<string, string | number | boolean>; inputs?: Record<string, BlockPlanInput> }
  | { action: "delete"; target: BlockPlanTarget }
  | { action: "connect"; from: BlockPlanReference; to: BlockPlanTarget };

export type BlockPlanInput = string | number | boolean | { ref: string } | { refs: string[] };
```

`BlockPlanTarget` must identify either a stable existing `blockId` or a plan-local `ref`; `BlockPlanReference` must identify a plan-local `ref`. No operation may carry serialized Blockly state.

- [ ] **Step 3: Add deterministic normalization and errors**

Normalize operation order without reordering user-visible statement order, reject duplicate targets, and return errors with `operationIndex`, `fieldName` or `inputName`, and a stable `code` such as `INVALID_FIELD`, `UNKNOWN_REF`, or `RAW_BLOCKLY_STATE`.

- [ ] **Step 4: Run the schema tests**

Run:

```powershell
npx vitest run src/agentV2/blockPlan.test.ts
```

Expected: all schema, rejection, and error-location tests pass.

---

### Task 3: Build the deterministic plan compiler

**Files:**
- Create: `src/agentV2/blockPlanCompiler.ts`
- Create: `src/agentV2/blockPlanCompiler.test.ts`
- Modify: `src/agentV2/blocklyHost.ts`

**Interfaces:**
- Consumes: parsed `BlockPlan`, `BlockTemplate`, current Blockly workspace, plugin validators, `generateCode`, and `validateCode`.
- Produces: `compileBlockPlan(plan, services): Promise<BlockPlanCompilation>` with `state`, `code`, `issues`, `changedBlockIds`, and no side effects on failure.

- [ ] **Step 1: Write isolated-workspace tests**

Test that a valid `python_print` plan creates the expected Blockly block and generated Python; an invalid field fails; a value block connected to a statement slot fails; an unknown block type fails; and the original workspace serialization is unchanged after every failure.

- [ ] **Step 2: Implement template resolution from runtime Blockly definitions**

Resolve the requested registered block type using the existing `getBlockTemplates` and `describeBlocklyBlockContract` paths. Validate fields against actual fields and options. Resolve inputs against actual input names and `check` types. Do not infer contracts from type-name prefixes.

- [ ] **Step 3: Implement create, update, delete, and connect operations**

Create all new blocks in a temporary `Blockly.Workspace`, map plan refs to temporary blocks, connect only through real Blockly connections, and resolve existing targets by block ID. Use Blockly’s own connection checks as the source of truth.

- [ ] **Step 4: Implement the validation pipeline**

Run, in order: schema validity, block existence, field validity, reference validity, Blockly connection checks, context validators, generated-code validation, and registered plugin workspace validators. Return all actionable issues while keeping the formal structure stable.

- [ ] **Step 5: Commit only after all checks pass**

Call `services.commit(state, code)` exactly once on success. Never call it on a failed compilation. Return a concise result containing `changedBlockIds`, generated code summary, and validation status rather than serialized workspace internals.

- [ ] **Step 6: Run compiler tests**

Run:

```powershell
npx vitest run src/agentV2/blockPlanCompiler.test.ts src/agentV2/blocklyHost.test.ts
```

Expected: valid plans commit once; invalid plans commit zero times and report the exact failing operation.

---

### Task 4: Make plugin metadata sufficient for generic planning

**Files:**
- Modify: `src/plugins/api/types.ts`
- Modify: `src/plugins/core/pluginRegistry.ts`
- Modify: `src/blockSearch.ts`
- Modify: `src/agentV2/blocklyHost.ts`
- Modify: `src/plugins/core/pluginGeneratedCodeValidation.ts`
- Modify: plugin tests under `src/plugins/builtin/*/*.test.ts`

**Interfaces:**
- Consumes: current optional `PluginBlockAgentMetadata` and `PluginWorkspaceValidator` APIs.
- Produces: one normalized catalog entry format for every registered block, including category, label, aliases, keywords, examples, fields, inputs, output/statement checks, and validator ownership.

- [ ] **Step 1: Add metadata normalization tests**

Verify that built-in Python, Manim, Turtle, NumPy, Pandas, Matplotlib, and a synthetic third-party plugin all produce the same catalog shape. Verify that missing optional metadata falls back to the registered label and actual Blockly contract.

- [ ] **Step 2: Implement generic catalog normalization**

Build catalog entries from registration records and runtime Blockly definitions. Remove all discovery, policy, and validation checks based on `python_*`, `visual_python_manim_*`, or other naming prefixes.

- [ ] **Step 3: Add plugin-level plan validation contribution**

Expose the existing workspace validator contributions through the plan compiler. A plugin validator may reject a candidate workspace but may not mutate the committed workspace.

- [ ] **Step 4: Run the cross-plugin catalog tests**

Run:

```powershell
npx vitest run src/blockSearch.test.ts src/plugins/core/pluginRegistry.test.ts src/plugins/builtin/numpy/numpyPlugin.test.ts src/plugins/builtin/pandas/pandasPlugin.test.ts src/plugins/builtin/matplotlib/matplotlibPlugin.test.ts src/agentV2/blockPlanCompiler.test.ts
```

Expected: all tested plugins use the same generic metadata path and no test depends on a plugin-name prefix.

---

### Task 5: Replace the graphical tool surface with one write tool

**Files:**
- Modify: `src/agentV2/blocklyHost.ts`
- Modify: `src/agentV2/hostAdapter.ts`
- Modify: `src/agentCore.ts`
- Modify: `src/agentV2/toolRegistry.ts`
- Modify: `src/agentV2/blocklyHost.test.ts`
- Modify: `src/agentV2.test.ts`

**Interfaces:**
- Consumes: `compileBlockPlan` and normalized catalog services.
- Produces: the sole graphical mutation tool `apply_block_plan` and an executor that routes every graphical write through the isolated compiler.

- [ ] **Step 1: Add the Function Calling schema test**

Assert that `apply_block_plan` has `version`, `mode`, and `operations`, rejects additional properties, and cannot express raw Blockly JSON. Assert that the graphical tool set has no old mutation names.

- [ ] **Step 2: Replace `compose_workspace` with `apply_block_plan`**

Use one tool definition for create, append, patch, replace, connect, and delete. `mode: "replace"` is allowed only when the workspace is empty or the user request explicitly states that the current workspace should be replaced; otherwise the executor returns a permission-style plan error without mutation.

- [ ] **Step 3: Delete legacy mutation definitions and routes**

Remove `blocklyCompatibilityTools`, `blocklyCompatibilityToolNames`, and execution branches for `add_workspace_block`, `append_workspace_blocks`, `replace_workspace`, `apply_workspace`, and `compose_workspace`. Do not leave aliases or fallback parsing.

- [ ] **Step 4: Simplify Agent routing rules**

Update the graphical system prompt to say: discover once, produce one `apply_block_plan`, wait for validation, and repair only the reported operation if validation fails. Remove all instructions mentioning old tools, compatibility paths, full workspace JSON, template batching, or repeated search fallback.

- [ ] **Step 5: Run Agent routing tests**

Run:

```powershell
npx vitest run src/agentV2/blocklyHost.test.ts src/agentV2.test.ts src/codexPrompt.test.ts
```

Expected: the model-facing graphical tool list contains one mutation tool, and the executor never dispatches removed names.

---

### Task 6: Reduce context and tool-call latency

**Files:**
- Modify: `src/agentV2/context.ts`
- Modify: `src/agentCore.ts`
- Modify: `src/blockSearch.ts`
- Modify: `src/agentV2/tokenLedger.ts`
- Create: `src/agentV2/blockPlanMetrics.test.ts`

**Interfaces:**
- Consumes: task prompt, normalized block catalog, current workspace summary, and `apply_block_plan` results.
- Produces: bounded task-specific catalog context and measurements for first valid plan, total calls, input tokens, output tokens, and validation retries.

- [ ] **Step 1: Add metrics tests**

Verify that a simple print, a Manim circle, and a Turtle star receive only the task-relevant catalog entries; verify that the full catalog is never inserted into the initial request.

- [ ] **Step 2: Implement deterministic candidate retrieval**

Normalize the user prompt, rank block entries by exact aliases, keywords, category, and examples, deduplicate by block type, and cap the result by a fixed count. Keep ordering deterministic so provider prompt caching can reuse the stable prefix.

- [ ] **Step 3: Make the initial prompt stable**

Keep fixed system instructions, schema, and plugin capability declarations before dynamic task context. Include only the current task, compact workspace summary, and ranked candidates after the stable prefix.

- [ ] **Step 4: Limit repairs to failed operations**

Return `operationIndex`, block ref, field/input name, and issue code from the compiler. The next model turn must receive the failed plan and targeted issues, not a new full workspace dump.

- [ ] **Step 5: Run metrics tests**

Run:

```powershell
npx vitest run src/agentV2/blockPlanMetrics.test.ts src/agentV2/context.test.ts src/agentV2/tokenLedger.test.ts
```

Expected: repeated simple tasks have stable request prefixes, bounded catalog size, and no duplicate full-state reads.

---

### Task 7: Update UI activity and error presentation

**Files:**
- Modify: `src/AiAssistantPanel.tsx`
- Modify: `src/AiAssistantPanel.test.tsx`
- Modify: `src/agentV2/types.ts`

**Interfaces:**
- Consumes: `apply_block_plan` structured success and validation-error results.
- Produces: concise activity entries showing plan creation, validation, commit, or the exact failed operation without displaying raw Blockly JSON.

- [ ] **Step 1: Add UI tests for success and failure**

Assert that successful graphical generation displays one plan/application activity, while a failed plan displays the operation location and human-readable issue. Assert that raw `workspaceJson`, `next`, `shadow`, and internal block IDs are not rendered as assistant text.

- [ ] **Step 2: Implement result-specific presentation**

Use structured result fields for the activity label and error detail. Keep the assistant’s natural-language explanation separate from the tool execution record. Do not add a second graphical Agent UI flow.

- [ ] **Step 3: Run panel tests**

Run:

```powershell
npx vitest run src/AiAssistantPanel.test.tsx src/agentEvents.test.ts
```

Expected: the panel shows one concise plan execution and targeted errors.

---

### Task 8: Remove obsolete compatibility code and update plugin documentation

**Files:**
- Modify: `src/agentV2/blocklyHost.ts`
- Modify: `src/agentCore.ts`
- Modify: `src/agentV2/types.ts`
- Modify: `src/plugins/api/types.ts`
- Modify: plugin development documentation under `docs/` and `public/`
- Delete: tests and helpers whose only purpose is the removed legacy mutation routes

**Interfaces:**
- Consumes: the final `apply_block_plan` contract and generic plugin metadata.
- Produces: a documented single protocol for plugin authors and no dead compatibility symbols.

- [ ] **Step 1: Search for obsolete symbols**

Run:

```powershell
rg -n "compose_workspace|add_workspace_block|append_workspace_blocks|replace_workspace|apply_workspace|blocklyCompatibility|python_.*prefix|visual_python_manim" src docs public
```

Classify every match as either a required historical test fixture or code that must be removed. No runtime route may remain.

- [ ] **Step 2: Update the plugin contract documentation**

Document the required meaning of `agent.description`, aliases, keywords, examples, actual field/input contracts, and optional validators. Include one generic plugin example and one `apply_block_plan` payload; do not document legacy tools.

- [ ] **Step 3: Delete obsolete code and tests**

Remove only code made obsolete by this migration. Keep tests for native Blockly storage, serialization, rendering, and plugin activation because those are not AI compatibility paths.

- [ ] **Step 4: Run the obsolete-symbol check**

Run the search again. Expected: no old graphical mutation function, tool schema, routing branch, or compatibility export remains. Historical migration notes may mention old names only in a clearly non-runtime section.

---

### Task 9: End-to-end regression and performance validation

**Files:**
- Create: `src/agentV2/blockPlan.integration.test.ts`
- Modify: `src/agentV2.test.ts`
- Modify: `src/agentV2/blocklyHost.test.ts`
- Modify: `docs/superpowers/plans/2026-10-14-single-block-plan-agent-baseline.md`

**Interfaces:**
- Consumes: the completed single-protocol Agent, all registered built-in plugins, and the test third-party plugin.
- Produces: acceptance evidence for correctness, latency, and tool-call reduction.

- [ ] **Step 1: Add the acceptance task matrix**

Cover:

```text
Python: print, list, dictionary, condition, loop, function
Manim: circle, axes, animation sequence, local modification
Turtle: move/turn/pen/color and nested repeat
NumPy: array creation and reshape
Pandas: CSV read and column selection
Matplotlib: figure, plot, labels, show
Third-party plugin: one custom statement and one custom value block
```

- [ ] **Step 2: Verify failure isolation**

For each category, submit an invalid field, invalid input type, unknown ref, and plugin validator failure. Assert no partial commit and an operation-local error.

- [ ] **Step 3: Verify no repeated search loop**

Use a deterministic mocked model response and assert that a normal task performs one discovery read at most, one `apply_block_plan`, and zero legacy tool calls. A validation repair must include only the failed operation.

- [ ] **Step 4: Run the full relevant suite and build**

Run:

```powershell
npx vitest run src/agentV2 src/plugins src/blockSearch.test.ts src/AiAssistantPanel.test.tsx
npm run build
```

Expected: all relevant tests and the TypeScript/Vite build pass. Record unrelated pre-existing failures separately rather than hiding them.

- [ ] **Step 5: Record acceptance metrics**

Compare the baseline and new implementation for first valid plan latency, number of model/tool calls, request and response token totals, first-pass success rate, repair success rate, and commit count. The new path must never commit a failed plan and must not regress existing project/plugin behavior.

---

## Self-review

- The plan replaces the existing `compose_workspace`/compatibility split with one `apply_block_plan` tool.
- It covers generic metadata for Python, built-in plugins, and third-party plugins without type-name prefixes.
- It includes isolated construction, Blockly connection validation, generated-code validation, plugin validation, and atomic commit.
- It covers context reduction, stable prompt prefixes, targeted repair, UI output, documentation, and acceptance metrics.
- It explicitly preserves project storage and Blockly runtime while removing AI protocol compatibility routes.

