import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_http_get",
    message0: "HTTP GET 地址 %1",
    args0: [{ type: "input_value", name: "URL", check: "String" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.network,
    tooltip:
      "读取网址的响应正文。需要先连接 Wi-Fi。支持 http 和 https；HTTPS 不校验证书，响应内容过大时会占用设备内存。超时或网络错误返回空字符串。",
  },
  {
    type: "hardware_http_post",
    message0: "HTTP POST 地址 %1 内容 %2",
    args0: [
      { type: "input_value", name: "URL", check: "String" },
      { type: "input_value", name: "BODY", check: "String" },
    ],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.network,
    tooltip:
      "向网址发送文本内容并返回响应正文。需要先连接 Wi-Fi。支持 http 和 https；HTTPS 不校验证书。超时或网络错误返回空字符串。",
  },
  {
    type: "hardware_http_download",
    message0: "HTTP 下载 %1 保存到 %2",
    args0: [
      { type: "input_value", name: "URL", check: "String" },
      { type: "input_value", name: "PATH", check: "String" },
    ],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.network,
    tooltip: "把网址内容保存为开发板文件，返回写入的字节数。网络失败返回 -1，文件写入失败返回 -2。需要先连接 Wi-Fi；大文件会占用设备内存，请确认剩余空间。不要在运行中覆盖 /main.py。",
  },
  {
    type: "hardware_http_status",
    message0: "最近 HTTP 状态码",
    output: "Number",
    colour: hardwareColours.network,
    tooltip: "返回最近一次 HTTP GET、POST 或下载的状态码；还没有发过请求或请求失败时返回 0。",
  },
  {
    type: "hardware_ntp_sync",
    message0: "NTP 校时",
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.network,
    tooltip: "通过 pool.ntp.org 把设备 RTC 校准为 UTC 时间，需要先连接 Wi-Fi；不会自动处理本地时区。失败时保持原时间，不抛未捕获异常。",
  },
  {
    type: "hardware_ntp_now",
    message0: "设备当前时间（UTC）",
    output: "String",
    colour: hardwareColours.network,
    tooltip: "返回格式为 年-月-日 时:分:秒 的 UTC 时间。先运行「NTP 校时」；没有校准时从固件默认时间开始。",
  },
  {
    type: "hardware_ntp_local",
    message0: "设备本地时间（时区偏移 %1 小时）",
    args0: [{ type: "input_value", name: "OFFSET", check: "Number" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.network,
    tooltip:
      "按固定时区偏移返回本地时间，格式与 UTC 时间相同。中国填 8，UTC 填 0，西半球用负数；只做固定偏移，不处理夏令时。先运行「NTP 校时」校准 UTC。",
  },
];

const advancedGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.advancedWireless) return `${profile.displayName} 不支持 HTTP / NTP 积木（仅 ESP32-S3）`;
  return undefined;
};

const ensureHttpGetHelper = (): string =>
  hardwareInternals().provideFunction_("hardware_http_get", [
    `def ${hardwareInternals().FUNCTION_NAME_PLACEHOLDER_}(url):`,
    "  try:",
    "    response = requests.get(str(url), timeout=5)",
    '    globals()["_http_status"] = response.status_code',
    "    data = response.text",
    "    response.close()",
    "    return data",
    "  except (OSError, ValueError, UnicodeError):",
    '    globals()["_http_status"] = 0',
    '    return ""',
  ]);

const ensureHttpPostHelper = (): string =>
  hardwareInternals().provideFunction_("hardware_http_post", [
    `def ${hardwareInternals().FUNCTION_NAME_PLACEHOLDER_}(url, body):`,
    "  try:",
    "    response = requests.post(str(url), data=str(body), timeout=5)",
    '    globals()["_http_status"] = response.status_code',
    "    data = response.text",
    "    response.close()",
    "    return data",
    "  except (OSError, ValueError, UnicodeError):",
    '    globals()["_http_status"] = 0',
    '    return ""',
  ]);

/** NTP 校时失败时保持原时间，避免没有 Wi-Fi 时抛未捕获异常。 */
const ensureNtpSyncHelper = (): string =>
  hardwareInternals().provideFunction_("hardware_ntp_sync", [
    `def ${hardwareInternals().FUNCTION_NAME_PLACEHOLDER_}():`,
    "  try:",
    "    ntptime.settime()",
    "  except OSError:",
    "    pass",
  ]);

const ensureHttpDownloadHelper = (): string =>
  hardwareInternals().provideFunction_("hardware_http_download", [
    `def ${hardwareInternals().FUNCTION_NAME_PLACEHOLDER_}(url, path):`,
    "  try:",
    "    response = requests.get(str(url), timeout=10)",
    '    globals()["_http_status"] = response.status_code',
    "    data = response.content",
    "    response.close()",
    "  except (OSError, ValueError, UnicodeError):",
    '    globals()["_http_status"] = 0',
    "    return -1",
    "  try:",
    '    with open(str(path), "wb") as file:',
    "      file.write(data)",
    "  except OSError:",
    "    return -2",
    "  return len(data)",
  ]);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_http_get = (block, generator) => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureImport("requests");
    const helper = ensureHttpGetHelper();
    const url = generator.valueToCode(block, "URL", pythonOrder.NONE) || '""';
    return [`${helper}(${url})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_http_post = (block, generator) => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureImport("requests");
    const helper = ensureHttpPostHelper();
    const url = generator.valueToCode(block, "URL", pythonOrder.NONE) || '""';
    const body = generator.valueToCode(block, "BODY", pythonOrder.NONE) || '""';
    return [`${helper}(${url}, ${body})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_ntp_sync = () => {
    const problem = advancedGuard();
    if (problem) return unavailable(problem);
    ensureImport("ntptime");
    return `${ensureNtpSyncHelper()}()\n`;
  };

  hardwareGenerator.forBlock.hardware_http_download = (block, generator) => {
    if (advancedGuard()) return ["-1", pythonOrder.ATOMIC];
    ensureImport("requests");
    const helper = ensureHttpDownloadHelper();
    const url = generator.valueToCode(block, "URL", pythonOrder.NONE) || '""';
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '"/download.bin"';
    return [`${helper}(${url}, ${path})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_http_status = () => {
    if (advancedGuard()) return ["0", pythonOrder.ATOMIC];
    return ['globals().get("_http_status", 0)', pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_ntp_now = () => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureImport("time");
    return ['time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())', pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_ntp_local = (block, generator) => {
    if (advancedGuard()) return ['""', pythonOrder.ATOMIC];
    ensureImport("time");
    const offset = generator.valueToCode(block, "OFFSET", pythonOrder.NONE) || "8";
    return [
      `time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + int(float(${offset}) * 3600)))`,
      pythonOrder.FUNCTION_CALL,
    ];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless) return [];
  const contents: unknown[] = [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("HTTP 与校时"),
    {
      kind: "block",
      type: "hardware_http_get",
      inputs: { URL: { shadow: { type: "text", fields: { TEXT: "http://example.com" } } } },
    },
    {
      kind: "block",
      type: "hardware_http_post",
      inputs: {
        URL: { shadow: { type: "text", fields: { TEXT: "http://example.com" } } },
        BODY: { shadow: { type: "text", fields: { TEXT: "hello" } } },
      },
    },
  ];
  if (profile.p2Modules) {
    contents.push({
      kind: "block",
      type: "hardware_http_download",
      inputs: {
        URL: { shadow: { type: "text", fields: { TEXT: "http://example.com/data.txt" } } },
        PATH: { shadow: { type: "text", fields: { TEXT: "/data.txt" } } },
      },
    });
    contents.push({ kind: "block", type: "hardware_http_status" });
  }
  contents.push(
    { kind: "block", type: "hardware_ntp_sync" },
    { kind: "block", type: "hardware_ntp_now" },
    { kind: "block", type: "hardware_ntp_local", inputs: { OFFSET: numberShadow(8) } },
  );
  return contents as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}

// provideFunction_ 需要生成器的内部接口；集中在 shared.ts 里没有导出，这里复用同一组字段。
const hardwareInternals = () => hardwareGenerator as unknown as {
  definitions_: Record<string, string>;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
};
