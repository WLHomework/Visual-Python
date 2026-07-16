import type { Config } from "@wasm-fmt/ruff_fmt";

type RuffFormat = (input: string, path?: string | null, config?: Config | null) => string;

let formatterPromise: Promise<RuffFormat> | null = null;

const loadFormatter = () => {
  formatterPromise ??= import("@wasm-fmt/ruff_fmt/vite").then(async (module) => {
    await module.default();
    return module.format;
  });
  return formatterPromise;
};

export function formatPythonWith(source: string, fileName: string, formatter: RuffFormat, indentWidth = 4) {
  if (!source.trim()) return source;
  return formatter(source, fileName, {
    indent_style: "space",
    indent_width: indentWidth,
    line_width: 88,
    line_ending: source.includes("\r\n") ? "crlf" : "lf",
    quote_style: "preserve",
    magic_trailing_comma: "respect",
  });
}

export async function formatPythonSource(source: string, fileName = "main.py", indentWidth = 4) {
  return formatPythonWith(source, fileName, await loadFormatter(), indentWidth);
}
