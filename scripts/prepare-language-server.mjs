import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePyright = path.join(appRoot, "node_modules", "pyright");
const targetRoot = path.join(appRoot, "src-tauri", "resources", "language-server");
const nodeName = process.platform === "win32" ? "node.exe" : "node";

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
await copyFile(process.execPath, path.join(targetRoot, nodeName));
await cp(sourcePyright, path.join(targetRoot, "pyright"), { recursive: true });

console.log(`Prepared Pyright language server resources in ${targetRoot}`);
