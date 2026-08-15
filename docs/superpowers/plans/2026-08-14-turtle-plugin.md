# Turtle Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a Chinese teaching-oriented Turtle plugin that generates standalone Python and exposes its capabilities to the Visual Python Agent.

**Architecture:** Ship an external plugin with `plugin.json`, one dependency-free ES module, and a README. The module registers namespaced Blockly JSON definitions, Python generators, one toolbox category, and one read-only Agent tool; a PowerShell script validates and packages those files at the ZIP root.

**Tech Stack:** JavaScript ES modules, Blockly plugin context API, Python standard-library `turtle`, Vitest, PowerShell ZIP APIs, existing Rust external-plugin installer tests.

---

### Task 1: Contract tests

**Files:**
- Create: `src/plugins/core/turtleExternalPlugin.test.ts`
- Test: `src/plugins/core/turtleExternalPlugin.test.ts`

- [ ] Write a source-presence test that expects `examples/plugins/turtle/plugin.json`, `index.js`, and `README.md`.
- [ ] Run `npx vitest run src/plugins/core/turtleExternalPlugin.test.ts` and verify it fails because the files do not exist.
- [ ] Add conditional contract tests that, once sources exist, parse the manifest and dynamically import the actual ES module from a data URL.
- [ ] Capture `registerBlock`, `registerToolboxCategory`, and `registerAgentTool` calls with a fake plugin context.
- [ ] Assert the manifest uses ID `visual-python.turtle`, API `1`, entry `index.js`, no Python packages, and declares `inspect_turtle_capabilities`.
- [ ] Assert 40 required block types, Chinese display text, namespace compliance, toolbox registration, and the read-only Agent tool.
- [ ] Assert representative program, movement, colour, polygon, text, event, screen, and state generators return expected standalone Python fragments.

### Task 2: Minimal package skeleton

**Files:**
- Create: `examples/plugins/turtle/plugin.json`
- Create: `examples/plugins/turtle/index.js`
- Create: `examples/plugins/turtle/README.md`

- [ ] Create a valid manifest:

```json
{
  "id": "visual-python.turtle",
  "name": "Turtle 海龟绘图",
  "version": "1.0.0",
  "apiVersion": "1",
  "description": "使用中文积木学习 Python Turtle 绘图与交互。",
  "entry": "index.js",
  "agent": {
    "description": "创建和修改 Python Turtle 教学绘图、动画与交互程序。",
    "tools": ["inspect_turtle_capabilities"],
    "fileTypes": [".py"],
    "detect": "imports"
  }
}
```

- [ ] Create an ES module exporting `activate(context)` with no contributions, plus a README describing installation.
- [ ] Run the focused test and verify source presence passes while contribution tests fail.

### Task 3: Blocks and generators

**Files:**
- Modify: `examples/plugins/turtle/index.js`
- Test: `src/plugins/core/turtleExternalPlugin.test.ts`

- [ ] Define the 40 namespaced blocks listed in the design specification, using statement/value connections and Chinese labels.
- [ ] Implement shared `value`, `suite`, `handlerName`, and command-generator helpers without external imports.
- [ ] Generate a complete Turtle file from the entry block:

```python
import turtle

def main():
    screen = turtle.Screen()
    pen = turtle.Turtle()
    pass
    screen.mainloop()

if __name__ == "__main__":
    main()
```

- [ ] Generate event handlers inside `main()` with unique sanitized names and escaped key values.
- [ ] Clamp polygon sides with `max(3, int(...))` and speed with `max(0, min(10, int(...)))`.
- [ ] Register all definitions and generators through `context.registerBlock`.
- [ ] Register one “海龟绘图” toolbox category with default number, text, and colour shadows.
- [ ] Run the focused test until all block and generator assertions pass.

### Task 4: Agent capability and documentation

**Files:**
- Modify: `examples/plugins/turtle/index.js`
- Modify: `examples/plugins/turtle/README.md`
- Test: `src/plugins/core/turtleExternalPlugin.test.ts`

- [ ] Register `visual-python.turtle.agent.inspect` with function name `inspect_turtle_capabilities`, all three workspace modes, and `readOnly: true`.
- [ ] Return structured rules covering the required entry block, `screen`/`pen` variables, events, standard-library dependency, and the generic Blockly tools the model should use.
- [ ] Document installation, block groups, AI use, standalone Python output, three teaching examples, and the requirement for a graphical desktop Python environment.
- [ ] Run the focused test and verify all tests pass.

### Task 5: Reproducible ZIP packaging

**Files:**
- Create: `scripts/package-turtle-plugin.ps1`
- Create: `artifacts/visual-python-turtle-plugin-1.0.0.zip`

- [ ] Validate manifest ID, version, API version, entry file, and required source files in PowerShell.
- [ ] Create a temporary staging directory containing only `plugin.json`, `index.js`, and `README.md`.
- [ ] Compress the staging contents so `plugin.json` is at the ZIP root.
- [ ] Reopen the archive and assert exactly one root `plugin.json`, the declared entry, and README are present.
- [ ] Run `powershell -ExecutionPolicy Bypass -File scripts/package-turtle-plugin.ps1` and verify it prints the absolute ZIP path.
- [ ] Run the existing Rust external-plugin ZIP installer tests to verify the application installer remains valid.

### Task 6: Full verification

**Files:**
- Verify all files above.

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm test -- --run` and record test counts.
- [ ] Run `npm run build`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
- [ ] Run `git diff --check`.
- [ ] Inspect the final ZIP file list and SHA-256 hash, then report installation and manual AI test steps.

This plan intentionally creates no Git commits because the shared worktree already contains unrelated uncommitted application changes.
