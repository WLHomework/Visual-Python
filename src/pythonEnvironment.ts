export const supportedPythonMin = "3.11";
export const supportedPythonMax = "3.14";
export const supportedPythonRangeLabel = `Python ${supportedPythonMin}-${supportedPythonMax}`;

export type PythonEnvironment = {
  path: string;
  version: string;
  implementation: string;
  virtual_env: boolean;
};

export type PythonInstalledPackage = {
  name: string;
  version: string;
};

const versionParts = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
};

export function isSupportedPythonVersion(version: string): boolean {
  const parts = versionParts(version);
  return Boolean(parts && parts[0] === 3 && parts[1] >= 11 && parts[1] <= 14);
}

const isPythonEnvironment = (value: unknown): value is PythonEnvironment => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PythonEnvironment>;
  return typeof candidate.path === "string" && candidate.path.length > 0
    && typeof candidate.version === "string" && isSupportedPythonVersion(candidate.version)
    && typeof candidate.implementation === "string"
    && typeof candidate.virtual_env === "boolean";
};

export function readStoredPythonEnvironment(source: string | null): PythonEnvironment | null {
  if (!source) return null;
  try {
    const value: unknown = JSON.parse(source);
    return isPythonEnvironment(value) ? value : null;
  } catch {
    return null;
  }
}

