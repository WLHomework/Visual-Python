# AI Plugin Authoring Implementation Plan

> **For agentic workers:** Use this plan task-by-task with focused verification.

**Goal:** Let the Visual Python Agent create, validate, and install a standard external plugin through a permission-gated workflow.

**Architecture:** Keep plugin authoring in a standalone draft store and validator. The Agent receives four high-level tools: create, update, validate, and install. Installation remains a host operation and requires the existing Agent permission flow before writing to the application plugin directory and activating local JavaScript.

**Tech Stack:** TypeScript, Vitest, Blockly plugin API, Tauri Rust commands.

---

### Task 1: Plugin draft model and validator

**Files:**
- Create: `src/agentV2/pluginAuthoring.ts`
- Test: `src/agentV2/pluginAuthoring.test.ts`

- [x] Add a draft store with safe relative file paths, a standard manifest/index/README scaffold, update support, and validation for required files, manifest fields, API version, entry path, file limits, and plugin namespace.
- [x] Add tests for scaffold creation, file updates, valid drafts, and invalid manifest/entry/path cases.

### Task 2: Agent authoring tools

**Files:**
- Modify: `src/agentV2/toolRegistry.ts`
- Modify: `src/agentV2/visualPythonHost.ts`
- Modify: `src/agentV2/hostAdapter.ts` only if the service contract requires it
- Test: `src/agentV2/visualPythonHost.test.ts`

- [x] Define four compact OpenAI function tools: `create_plugin_draft`, `update_plugin_draft`, `validate_plugin_draft`, and `install_plugin_draft`.
- [x] Route the first three to the draft store and route install through an injected host callback.
- [x] Mark install as state-changing and permission-required; keep all authoring tools available in code, split, and visual workspaces.

### Task 3: Permission-gated installation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri` existing plugin command tests and Agent host tests

- [x] Add a Tauri command that safely writes validated draft files into the application plugin directory using a temporary directory and recoverable replacement.
- [x] Refresh discovery, trust, register, and activate the installed plugin only after Agent permission is granted.
- [x] Reuse the existing external-plugin trust state without showing a second confirmation for the same install action.

### Task 4: Verification

- [x] Run focused plugin authoring tests.
- [x] Run the full Vitest suite and TypeScript check.
- [x] Run Rust formatting/checks if the local toolchain is available.
- [x] Run `git diff --check` and inspect only task-related changes.
