import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  provideHardwareFunction,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_webserver_serve",
    message0: "处理一次网页请求 端口 %1 响应内容 %2",
    args0: [
      { type: "input_value", name: "PORT", check: "Number" },
      { type: "input_value", name: "BODY", check: "String" },
    ],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.network,
    tooltip:
      "第一次调用时在指定端口启动 HTTP 服务，之后复用同一个服务；阻塞等待一次请求并返回请求路径（如 /），没有 Wi-Fi、端口被占用或请求异常时返回空字符串。响应固定为 text/html，请在「永远重复」里调用；需要先连接 Wi-Fi。",
  },
];

const ensureWebServerHelper = (): string => {
  ensureImport("socket");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_webserver_serve", [
    `def ${placeholder}(port, body):`,
    '  server = globals().get("_web_server")',
    "  if server is None:",
    "    server = socket.socket()",
    "    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)",
    "    try:",
    '      server.bind(("", int(port)))',
    "      server.listen(1)",
    "    except OSError:",
    "      server.close()",
    '      return ""',
    '    globals()["_web_server"] = server',
    "  try:",
    "    client, address = server.accept()",
    "  except OSError:",
    '    return ""',
    "  try:",
    "    request = client.recv(1024)",
    "    try:",
    '      path = request.decode().split(" ")[1]',
    "    except (AttributeError, IndexError, UnicodeError):",
    '      path = "/"',
    '    response = "HTTP/1.0 200 OK\\r\\nContent-Type: text/html; charset=utf-8\\r\\nConnection: close\\r\\n\\r\\n" + str(body)',
    "    client.send(response.encode())",
    "  except OSError:",
    '    path = ""',
    "  finally:",
    "    client.close()",
    "  return path",
  ]);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_webserver_serve = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile?.advancedWireless) return ['""', pythonOrder.ATOMIC];
    const port = generator.valueToCode(block, "PORT", pythonOrder.NONE) || "80";
    const body = generator.valueToCode(block, "BODY", pythonOrder.NONE) || '"<h1>Visual Python</h1>"';
    const helper = ensureWebServerHelper();
    return [`${helper}(${port}, ${body})`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.advancedWireless || !profile.p2Modules) return [];
  return [
    hardwareSectionLabel("网页服务器"),
    {
      kind: "block",
      type: "hardware_webserver_serve",
      inputs: {
        PORT: numberShadow(80),
        BODY: { shadow: { type: "text", fields: { TEXT: "<h1>Visual Python</h1>" } } },
      },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
