// 基准运行前置：必须在应用模块求值前提供 localStorage（plugins 偏好读写依赖）。
const memoryStorage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void memoryStorage.set(key, String(value)),
  removeItem: (key: string) => void memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};
