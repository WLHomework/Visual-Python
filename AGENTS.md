# Repository Guidelines

Visual Python: a Blockly-based Python/Manim workbench. Vite + React + TypeScript frontend in a Tauri 2 desktop shell (Windows is the primary target; NSIS/MSI bundles). Single package, no JS workspaces.

## Commands (run from repo root)

- `npm run tauri dev`: full desktop app. Its `beforeDevCommand` runs `prepare:language-server` then Vite.
- `npm run dev`: frontend only; Vite uses fixed `127.0.0.1:43127` with `strictPort`, so it fails if the port is taken.
- `npm test` (`vitest run`); single file: `npx vitest run src/projectFile.test.ts`.
- `npm run build`: `tsc && vite build`. Run this after TypeScript/bundling changes; there is no separate lint step.
- `npm run build:desktop`: build plus `prepare:language-server` (copies `node.exe` and `node_modules/pyright` into gitignored `src-tauri/resources/language-server/`; needs `npm install` first).
- `npm run docs:manim`: regenerates `docs/manim-plugin/` (catalog/html/assets) by launching the dev server and headless Edge/Chrome via `playwright-core` (override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`). Do not hand-edit generated files there.
- Rust: toolchain pinned to 1.95.0 in `rust-toolchain.toml`; format with `rustfmt`. Cargo commands run in `src-tauri/`.

## Layout

- `src/App.tsx`, `src/pythonBlocks.ts`, `src/pythonSyntaxBlocks.ts`: main UI and Blockly block definitions/Python generation.
- `src/agentV2/`: the AI assistant agent (block plans, plugin IR/authoring, tool registry, Blockly host adapter). `src/codexAgent*.ts` talks to the Codex backend in Rust.
- `src/plugins/`: plugin system (`core/` holds runtime and plugin docs handling). `src/examples/{manim,math,python}/`: built-in example projects.
- `src-tauri/src/lib.rs` (very large, holds most Tauri commands), `codex_agent.rs`, `hardware/` (serial/MicroPython/firmware).
- `vendor/codex-rs` and `vendor/codex-utils-pty` are vendored OpenAI Codex crates consumed as Cargo path dependencies. Do not edit them casually; `[patch.crates-io]` in `src-tauri/Cargo.toml` must stay in sync with the Codex fork revisions.
- `docs/manim-plugin/` and `docs/plugin-development/` are bundled into the app as resources (`tauri.conf.json`), and `src/plugins/core/pluginDevelopmentDocs.test.ts` imports `manim-plugin.html` and asserts on Rust source, so renaming those files breaks tests.
- `examples/external-plugins/*.zip` and `artifacts/*.zip` are packaged plugin outputs (`scripts/package-turtle-plugin.ps1`).

## Conventions and gotchas

- Two-space indent, semicolons. `tsconfig` enforces `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import type`), and `erasableSyntaxOnly` (no `enum`, namespaces, or parameter properties).
- Keep tests beside the module they cover (`src/foo.test.ts`).
- Vite's watcher ignores `*.py`, `*.vpy`, `*.mp4`, `*.wav`, `manim-*`, `media`, and `partial_movie_files`, so edits to these files will not trigger HMR.
- `tauri.conf.json` defines two windows (`main`, hidden until ready, and `splash`), so the build has two HTML entries: `index.html` and `splash.html`. Windows are frameless (`decorations: false`).
- Project files use the `.vpy` extension (registered as a file association).
- User-facing UI text and docs are mostly Chinese; keep new strings consistent with that.

## Commits and PRs

Short action-oriented subjects (Chinese is common, no prefixes). PRs should describe the user-visible change, list validation commands, and include screenshots for UI changes. Call out Tauri/desktop and generated-docs effects.
