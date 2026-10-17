# Repository Guidelines

## Project Structure & Module Organization

Visual Python is a Vite/React TypeScript frontend packaged as a Tauri desktop app.

- `src/`: React UI, TypeScript application logic, plugin implementations, and colocated tests.
- `src-tauri/`: Rust desktop commands, filesystem/runtime integration, and Tauri configuration.
- `public/`: static assets such as Blockly media, icons, and audio.
- `examples/`: built-in and external plugin examples.
- `scripts/`: Node and PowerShell build/documentation helpers.
- `docs/`: Manim/plugin documentation and research material; `vendor/` contains path dependencies.

Keep new tests beside the module they cover (for example, `src/projectFile.test.ts`).

## Build, Test, and Development Commands

Run these from the repository root:

- `npm install`: install JavaScript dependencies.
- `npm run dev`: start the Vite frontend at `http://127.0.0.1:43127`.
- `npm run tauri dev`: run the desktop application in development mode.
- `npm test`: run the Vitest suite once.
- `npm run build`: type-check with `tsc` and create the Vite production build.
- `npm run build:desktop`: build the frontend and prepare the language-server resources.
- `npm run docs:manim`: regenerate Manim documentation from the current source metadata.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, and the existing TypeScript/React style. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and descriptive test names inside `describe`/`it` blocks. Keep imports explicit and remove unused locals or parameters; the TypeScript configuration treats them as errors. Format Rust changes with `rustfmt` and follow the existing module boundaries.

## Testing Guidelines

Tests use Vitest and are named `*.test.ts` or `*.test.tsx`. Add focused tests for changed behavior, then run `npm test`; run `npm run build` when TypeScript or bundling is affected. No repository-wide coverage threshold is configured.

## Commit & Pull Request Guidelines

Recent commits use short, action-oriented subject lines, often in Chinese and without prefixes. Keep commits focused and describe the behavior changed. Pull requests should explain the user-visible change, list validation commands, link an issue when one exists, and include screenshots or recordings for UI changes. Call out desktop/Tauri or generated-documentation effects when relevant.
