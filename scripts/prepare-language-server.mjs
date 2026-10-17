import { copyFile, cp, mkdir, readFile, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePyright = path.join(appRoot, "node_modules", "pyright");
const targetRoot = path.join(appRoot, "src-tauri", "resources", "language-server");
const targetPyright = path.join(targetRoot, "pyright");
const nodeName = process.platform === "win32" ? "node.exe" : "node";
const targetNode = path.join(targetRoot, nodeName);

async function statOrNull(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function readPyrightVersion(pyrightRoot) {
  try {
    const manifest = JSON.parse(await readFile(path.join(pyrightRoot, "package.json"), "utf8"));
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

const sourceNodeStat = await stat(process.execPath);
const sourcePyrightVersion = await readPyrightVersion(sourcePyright);
if (sourcePyrightVersion === null) {
  console.error(`Pyright not found in ${sourcePyright}. Run "npm install" first.`);
  process.exit(1);
}

await mkdir(targetRoot, { recursive: true });

// Copy the Node runtime only when size + mtime differ from the current executable.
// The target mtime mirrors the source so later runs can skip the 80+ MB copy.
const targetNodeStat = await statOrNull(targetNode);
const nodeUpToDate =
  targetNodeStat !== null &&
  targetNodeStat.size === sourceNodeStat.size &&
  Math.abs(targetNodeStat.mtimeMs - sourceNodeStat.mtimeMs) < 1;
if (!nodeUpToDate) {
  await copyFile(process.execPath, targetNode);
  await utimes(targetNode, sourceNodeStat.atime, sourceNodeStat.mtime);
  console.log(`Updated ${nodeName} in ${targetRoot}`);
}

// Copy pyright only when its version changed or the entry file is missing.
const targetPyrightVersion = await readPyrightVersion(targetPyright);
const pyrightEntryExists = (await statOrNull(path.join(targetPyright, "langserver.index.js"))) !== null;
const pyrightUpToDate = targetPyrightVersion === sourcePyrightVersion && pyrightEntryExists;
if (!pyrightUpToDate) {
  await rm(targetPyright, { recursive: true, force: true });
  await cp(sourcePyright, targetPyright, { recursive: true });
  console.log(`Updated pyright in ${targetRoot}`);
}

if (nodeUpToDate && pyrightUpToDate) {
  console.log(`Language server resources are up to date in ${targetRoot}`);
} else {
  console.log(`Prepared Pyright language server resources in ${targetRoot}`);
}
