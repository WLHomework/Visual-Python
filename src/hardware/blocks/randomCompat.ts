import { getActiveHardwareBoard, hardwareGenerator, pythonOrder, unavailable } from "./shared";

interface UnsupportedRandomBlock {
  label: string;
  api: string;
}

/** ESP8266 构建关闭 MICROPY_PY_RANDOM_EXTRA_FUNCS，random 只剩 getrandbits/seed。 */
export const esp8266UnsupportedRandomBlocks: Record<string, UnsupportedRandomBlock> = {
  math_random_int: { label: "随机整数", api: "random.randint" },
  math_random_float: { label: "随机小数", api: "random.random" },
  python_random_randint: { label: "随机整数 random.randint", api: "random.randint" },
  python_random_uniform: { label: "随机小数 random.uniform", api: "random.uniform" },
  python_random_choice: { label: "随机选择 random.choice", api: "random.choice" },
};

export const esp8266RandomBlockIssue = (type: string): string | undefined => {
  const info = esp8266UnsupportedRandomBlocks[type];
  if (!info) return undefined;
  return `「${info.label}」积木：ESP8266 固件没有 ${info.api}，请改用 ESP32 / ESP32-S3，或删除该积木`;
};

const guardedTypes = new Set<string>();

/** 旧工程可能保留已移出工具箱的随机积木；在生成层替换掉，避免设备上出现 AttributeError。 */
export function installEsp8266RandomGuards(): void {
  for (const [type, info] of Object.entries(esp8266UnsupportedRandomBlocks)) {
    if (guardedTypes.has(type)) continue;
    const original = hardwareGenerator.forBlock[type];
    if (!original) continue;
    guardedTypes.add(type);
    hardwareGenerator.forBlock[type] = (block, generator) => {
      if (getActiveHardwareBoard()?.boardId === "esp8266-esp12e") {
        return block.outputConnection ? ["None", pythonOrder.ATOMIC] : unavailable(`ESP8266 固件没有 ${info.api}`);
      }
      return original(block, generator);
    };
  }
}
