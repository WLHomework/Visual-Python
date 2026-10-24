import type { HardwareBoardId } from "./firmwareCatalog";

/**
 * 把硬件 Agent 生成的 MicroPython 子集转换成硬件积木。
 *
 * 这是 Phase B 的第一版，只覆盖能无损映射的常见写法：
 * - Pin 变量初始化；
 * - 引脚高低电平 / on / off；
 * - time.sleep / sleep_ms；
 * - while True；
 * - 单行 setup / print 等原始语句。
 *
 * 控制流嵌套、PWM、NeoPixel 等暂不支持，会明确报错，而不是静默丢失。
 */

type BlockState = {
  type: string;
  fields?: Record<string, string>;
  inputs?: Record<string, unknown>;
  extraState?: Record<string, unknown>;
  next?: { block: BlockState };
};

type SourceLine = { indent: number; text: string; lineNumber: number };

type PwmState = { pin: string; freq: number };

type SensorState = { pin: string; sensor: "DHT11" | "DHT22" };
type AdcState = { pin: string };
type ExpressionContext = {
  sensors: Map<string, SensorState>;
  adcs: Map<string, AdcState>;
  values: Map<string, BlockState>;
  oleds: Set<string>;
  servos: Map<string, string>;
};

export class MicroPythonConversionError extends Error {
  readonly lineNumber?: number;

  constructor(message: string, lineNumber?: number) {
    super(lineNumber ? `第 ${lineNumber} 行：${message}` : message);
    this.name = "MicroPythonConversionError";
    this.lineNumber = lineNumber;
  }
}

function stripComment(line: string): string {
  let quote: string | null = null;
  let escape = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote) {
      if (escape) escape = false;
      else if (character === "\\") escape = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "#") return line.slice(0, index);
  }
  return line;
}

function sourceLines(source: string): SourceLine[] {
  return source.replace(/\r\n/g, "\n").split("\n").flatMap((raw, index) => {
    const text = stripComment(raw).trimEnd();
    if (!text.trim()) return [];
    const indent = text.length - text.trimStart().length;
    return [{ indent, text: text.trim(), lineNumber: index + 1 }];
  });
}

function chain(blocks: BlockState[]): BlockState | null {
  for (let index = 0; index < blocks.length - 1; index += 1) {
    blocks[index]!.next = { block: blocks[index + 1]! };
  }
  return blocks[0] ?? null;
}

function literalNumber(value: number): unknown {
  return { block: { type: "math_number", fields: { NUM: value } } };
}

function rawStatement(text: string): BlockState {
  return { type: "python_raw_statement", fields: { CODE: text.replace(/\s+/g, " ").trim() } };
}

function pinValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function numberValue(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function levelValue(value: string): "1" | "0" | null {
  const normalized = value.trim();
  if (normalized === "1" || normalized === "True" || normalized === "true") return "1";
  if (normalized === "0" || normalized === "False" || normalized === "false") return "0";
  return null;
}

function pinWrite(pin: string, level: string): BlockState {
  return { type: "hardware_pin_write", fields: { PIN: pin, LEVEL: level } };
}

function pwmWrite(pin: string, freq: number, duty: number): BlockState {
  return { type: "hardware_pwm_write", fields: { PIN: pin }, inputs: { FREQ: literalNumber(freq), DUTY: literalNumber(duty) } };
}

function neopixelInit(pin: string, count: number): BlockState {
  return { type: "hardware_neopixel_init", fields: { PIN: pin }, inputs: { COUNT: literalNumber(Math.max(1, Math.round(count))) } };
}

function neopixelColor(r: number, g: number, b: number): Record<string, unknown> {
  return { R: literalNumber(Math.max(0, Math.min(255, Math.round(r)))), G: literalNumber(Math.max(0, Math.min(255, Math.round(g)))), B: literalNumber(Math.max(0, Math.min(255, Math.round(b)))) };
}

function servoWrite(pin: string, angle: number): BlockState {
  return { type: "hardware_servo_write", fields: { PIN: pin }, inputs: { ANGLE: literalNumber(Math.max(0, Math.min(180, Math.round(angle)))) } };
}

function rawNumber(value: number): BlockState {
  return { type: "math_number", fields: { NUM: String(value) } };
}

function rawText(value: string): BlockState {
  return { type: "text", fields: { TEXT: value } };
}

function rawExpression(code: string): BlockState {
  return { type: "python_raw_expression", fields: { CODE: code.replace(/\s+/g, " ").trim() } };
}

function splitArguments(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escape = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (escape) escape = false;
      else if (character === "\\") escape = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = source.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function stringLiteral(value: string): string | null {
  const match = value.trim().match(/^(['"])([\s\S]*)\1$/);
  if (!match) return null;
  return match[2]!.replace(/\\n/g, "\n").replace(/\\'/g, "'").replace(/\\"/g, '"');
}

function dhtBlock(sensor: SensorState, metric: "temperature" | "humidity"): BlockState {
  return {
    type: metric === "temperature" ? "hardware_dht_temperature" : "hardware_dht_humidity",
    fields: { SENSOR: sensor.sensor, PIN: sensor.pin },
  };
}

function analogBlock(pin: string): BlockState {
  return { type: "hardware_analog_read", fields: { PIN: pin } };
}

function parseValueExpression(source: string, context: ExpressionContext): BlockState {
  const code = source.trim();
  if (code.includes("+") && (code.includes("'") || code.includes('"') || code.includes("str("))) {
    const concat = splitTopLevelOperator(code, ["+"]);
    if (concat) {
      return {
        type: "text_join",
        extraState: { itemCount: 2 },
        inputs: {
          ADD0: { block: parseValueExpression(concat.left, context) },
          ADD1: { block: parseValueExpression(concat.right, context) },
        },
      };
    }
  }
  const wrapped = code.match(/^(?:str|int|float)\(([\s\S]*)\)$/);
  if (wrapped) return parseValueExpression(wrapped[1]!, context);
  const text = stringLiteral(code);
  if (text !== null) return rawText(text);
  const number = numberValue(code);
  if (number !== null) return rawNumber(number);

  const sensorRead = code.match(/^([A-Za-z_]\w*)\.(temperature|humidity)\(\s*\)$/);
  if (sensorRead) {
    const sensor = context.sensors.get(sensorRead[1]!);
    if (sensor) return dhtBlock(sensor, sensorRead[2] as "temperature" | "humidity");
  }

  const directSensorRead = code.match(/^(?:dht\.)?(DHT11|DHT22)\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)\s*\)\.(temperature|humidity)\(\s*\)$/);
  if (directSensorRead) {
    return dhtBlock({ sensor: directSensorRead[1] as "DHT11" | "DHT22", pin: pinValue(directSensorRead[2]!) }, directSensorRead[3] as "temperature" | "humidity");
  }

  const helperSensorRead = code.match(/^hardware_dht_read\(\s*([^,]+)\s*,\s*dht\.(DHT11|DHT22)\s*\)\s*\[\s*([01])\s*\]$/);
  if (helperSensorRead) {
    return dhtBlock({ sensor: helperSensorRead[2] as "DHT11" | "DHT22", pin: pinValue(helperSensorRead[1]!) }, helperSensorRead[3] === "0" ? "temperature" : "humidity");
  }

  const adcRead = code.match(/^([A-Za-z_]\w*)\.read\(\s*\)$/);
  if (adcRead) {
    const adc = context.adcs.get(adcRead[1]!);
    if (adc) return analogBlock(adc.pin);
  }

  const directAdcRead = code.match(/^(?:machine\.)?ADC\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)\s*\)\.read\(\s*\)$/);
  if (directAdcRead) return analogBlock(pinValue(directAdcRead[1]!));

  const zeroAdcRead = code.match(/^(?:machine\.)?ADC\(\s*0\s*\)\.read\(\s*\)$/);
  if (zeroAdcRead) return analogBlock("A0");

  const pinRead = code.match(/^(?:machine\.)?Pin\(\s*([^,)]+)\s*(?:,[^)]*)?\)\s*\.value\(\s*\)$/);
  if (pinRead) return { type: "hardware_pin_read", fields: { PIN: pinValue(pinRead[1]!), PULL: "none" } };

  const variable = context.values.get(code);
  if (variable) return structuredClone(variable);

  return rawExpression(code);
}

function printBlock(source: string, context: ExpressionContext): BlockState {
  const args = splitArguments(source).filter((arg) => arg && !/^[A-Za-z_]\w*\s*=/.test(arg));
  if (args.length <= 1) {
    return { type: "python_print", inputs: { VALUE: { block: args.length ? parseCondition(args[0]!, context) : rawText("") } } };
  }
  return {
    type: "python_print_many",
    extraState: { itemCount: args.length },
    fields: { SEP: " ", END: "\\n" },
    inputs: Object.fromEntries(args.map((arg, index) => [`ITEM${index}`, { block: parseCondition(arg, context) }])),
  };
}

function splitTopLevelOperator(source: string, operators: string[]): { left: string; operator: string; right: string } | null {
  let depth = 0;
  let quote: string | null = null;
  let escape = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (escape) escape = false;
      else if (character === "\\") escape = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      for (const operator of operators) {
        if (source.slice(index, index + operator.length) !== operator) continue;
        if (/^[a-z]+$/.test(operator)) {
          const before = source[index - 1];
          const after = source[index + operator.length];
          if (before && /[A-Za-z0-9_]/.test(before)) continue;
          if (after && /[A-Za-z0-9_]/.test(after)) continue;
        }
        const left = source.slice(0, index).trim();
        const right = source.slice(index + operator.length).trim();
        if (left && right) return { left, operator, right };
      }
    }
  }
  return null;
}

function parseCondition(source: string, context: ExpressionContext): BlockState {
  const code = source.trim();
  const compare = splitTopLevelOperator(code, [">=", "<=", "==", "!=", ">", "<"]);
  if (compare) {
    const op = ({ ">=": "GTE", "<=": "LTE", "==": "EQ", "!=": "NEQ", ">": "GT", "<": "LT" } as Record<string, string>)[compare.operator]!;
    return { type: "logic_compare", fields: { OP: op }, inputs: { A: { block: parseValueExpression(compare.left, context) }, B: { block: parseValueExpression(compare.right, context) } } };
  }
  const logical = splitTopLevelOperator(code, ["or", "and"]);
  if (logical) {
    return { type: "logic_operation", fields: { OP: logical.operator === "or" ? "OR" : "AND" }, inputs: { A: { block: parseCondition(logical.left, context) }, B: { block: parseCondition(logical.right, context) } } };
  }
  if (/^not\s+/.test(code)) {
    return { type: "logic_negate", inputs: { BOOL: { block: parseCondition(code.slice(4), context) } } };
  }
  if (code === "True" || code === "true") return { type: "logic_boolean", fields: { BOOL: "TRUE" } };
  if (code === "False" || code === "false") return { type: "logic_boolean", fields: { BOOL: "FALSE" } };
  return parseValueExpression(code, context);
}

const pwmDutyMax = 1023;

function dutyFromU16(value: number): number {
  return Math.max(0, Math.min(pwmDutyMax, Math.round((value * pwmDutyMax) / 65535)));
}

function sleepBlock(ms: number): BlockState {
  return { type: "hardware_sleep_ms", inputs: { MS: literalNumber(Math.max(0, Math.round(ms))) } };
}

function compileSimple(line: SourceLine, pins: Map<string, string>, pwms: Map<string, PwmState>, neopixels: Set<string>, context: ExpressionContext): BlockState | null {
  const { text, lineNumber } = line;

  if (/^(from\s+\S+\s+import\s+|import\s+)/.test(text)) return null;

  const dhtAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:dht\.)?(DHT11|DHT22)\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)\s*\)$/);
  if (dhtAssignment) {
    const pin = pinValue(dhtAssignment[3]!);
    if (!/^[A-Za-z0-9_]+$/.test(pin)) throw new MicroPythonConversionError(`无法识别 DHT 引脚：${dhtAssignment[3]}`, lineNumber);
    context.sensors.set(dhtAssignment[1]!, { pin, sensor: dhtAssignment[2] as "DHT11" | "DHT22" });
    return null;
  }

  if (/^([A-Za-z_]\w*)\.measure\(\s*\)$/.test(text)) return null;

  const adcAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:machine\.)?ADC\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)\s*\)$/);
  if (adcAssignment) {
    context.adcs.set(adcAssignment[1]!, { pin: pinValue(adcAssignment[2]!) });
    return null;
  }
  const zeroAdcAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:machine\.)?ADC\(\s*0\s*\)$/);
  if (zeroAdcAssignment) {
    context.adcs.set(zeroAdcAssignment[1]!, { pin: "A0" });
    return null;
  }

  const oledAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*ssd1306\.SSD1306_I2C\(\s*([^,]+)\s*,\s*([^,]+)\s*,[^)]*?(?:,\s*addr\s*=\s*([^,)]+))?\s*\)$/);
  if (oledAssignment) {
    const width = numberValue(oledAssignment[2]!);
    const height = numberValue(oledAssignment[3]!);
    if (width === null || height === null) throw new MicroPythonConversionError("OLED 初始化只支持数字宽高", lineNumber);
    context.oleds.add(oledAssignment[1]!);
    return {
      type: "hardware_oled_init",
      fields: { ADDRESS: pinValue(oledAssignment[4] ?? "0x3C") },
      inputs: { WIDTH: literalNumber(width), HEIGHT: literalNumber(height) },
    };
  }

  const oledClear = text.match(/^([A-Za-z_]\w*)\.fill\(\s*0\s*\)$/);
  if (oledClear && context.oleds.has(oledClear[1]!)) return { type: "hardware_oled_clear" };

  const oledWrite = text.match(/^([A-Za-z_]\w*)\.show\(\s*\)$/);
  if (oledWrite) {
    if (!context.oleds.has(oledWrite[1]!)) throw new MicroPythonConversionError(`变量 ${oledWrite[1]} 不是已知的 OLED`, lineNumber);
    return { type: "hardware_oled_write" };
  }

  const oledText = text.match(/^([A-Za-z_]\w*)\.text\((.*)\)$/);
  if (oledText) {
    if (!context.oleds.has(oledText[1]!)) throw new MicroPythonConversionError(`变量 ${oledText[1]} 不是已知的 OLED`, lineNumber);
    const args = splitArguments(oledText[2]!);
    if (args.length < 3) throw new MicroPythonConversionError("OLED.text() 需要文字、X、Y 三个参数", lineNumber);
    const x = numberValue(args[1]!);
    const y = numberValue(args[2]!);
    if (x === null || y === null) throw new MicroPythonConversionError("OLED.text() 只支持数字坐标", lineNumber);
    return { type: "hardware_oled_text", inputs: { TEXT: { block: parseValueExpression(args[0]!, context) }, X: literalNumber(x), Y: literalNumber(y) } };
  }

  const printCall = text.match(/^print\((.*)\)$/);
  if (printCall) return printBlock(printCall[1]!, context);

  const neopixelAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:neopixel\.)?NeoPixel\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)(?:\s*,\s*([^,)]+))?/);
  if (neopixelAssignment) {
    const pin = pinValue(neopixelAssignment[2]!);
    const count = neopixelAssignment[3] ? numberValue(neopixelAssignment[3]) : 1;
    if (!/^[A-Za-z0-9_]+$/.test(pin) || count === null) throw new MicroPythonConversionError("NeoPixel 只支持数字引脚和灯珠数量", lineNumber);
    neopixels.add(neopixelAssignment[1]!);
    return neopixelInit(pin, count);
  }

  const neopixelPixel = text.match(/^([A-Za-z_]\w*)\[([^\]]+)\]\s*=\s*\(([^)]*)\)$/);
  if (neopixelPixel) {
    if (!neopixels.has(neopixelPixel[1]!)) throw new MicroPythonConversionError(`变量 ${neopixelPixel[1]} 不是已知的 NeoPixel`, lineNumber);
    const index = numberValue(neopixelPixel[2]!);
    const colors = neopixelPixel[3]!.split(",").map((value) => numberValue(value));
    if (index === null || colors.length !== 3 || colors.some((value) => value === null)) throw new MicroPythonConversionError("NeoPixel 灯珠赋值只支持数字索引和 RGB 数字", lineNumber);
    return { type: "hardware_neopixel_set_pixel", inputs: { INDEX: literalNumber(index), ...neopixelColor(colors[0]!, colors[1]!, colors[2]!) } };
  }

  const neopixelFill = text.match(/^([A-Za-z_]\w*)\.fill\(\s*\(\s*([^,)]+)\s*,\s*([^,)]+)\s*,\s*([^)]+)\s*\)\s*\)$/);
  if (neopixelFill) {
    if (!neopixels.has(neopixelFill[1]!)) throw new MicroPythonConversionError(`变量 ${neopixelFill[1]} 不是已知的 NeoPixel`, lineNumber);
    const colors = [neopixelFill[2], neopixelFill[3], neopixelFill[4]].map((value) => numberValue(value!));
    if (colors.some((value) => value === null)) throw new MicroPythonConversionError("NeoPixel.fill() 只支持 RGB 数字", lineNumber);
    return { type: "hardware_neopixel_fill", inputs: neopixelColor(colors[0]!, colors[1]!, colors[2]!) };
  }

  const neopixelWrite = text.match(/^([A-Za-z_]\w*)\.write\(\s*\)$/);
  if (neopixelWrite) {
    if (!neopixels.has(neopixelWrite[1]!)) throw new MicroPythonConversionError(`变量 ${neopixelWrite[1]} 不是已知的 NeoPixel`, lineNumber);
    return { type: "hardware_neopixel_write" };
  }

  const servoAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:machine\.)?PWM\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)\s*,\s*freq\s*=\s*50\s*\)$/);
  if (servoAssignment) {
    const pin = pinValue(servoAssignment[2]!);
    if (!/^[A-Za-z0-9_]+$/.test(pin)) throw new MicroPythonConversionError(`无法识别舵机引脚：${servoAssignment[2]}`, lineNumber);
    context.servos.set(servoAssignment[1]!, pin);
    return null;
  }

  const servoAngle = text.match(/^([A-Za-z_]\w*)\.(?:angle|write)\(\s*([^)]*)\s*\)$/);
  if (servoAngle) {
    const pin = context.servos.get(servoAngle[1]!);
    const angle = numberValue(servoAngle[2]!);
    if (!pin || angle === null) throw new MicroPythonConversionError("舵机角度只支持已知舵机变量和数字角度", lineNumber);
    return servoWrite(pin, angle);
  }

  const pwmAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:machine\.)?PWM\(\s*(?:machine\.)?Pin\(\s*([^,)]+)\s*\)(?:\s*,\s*freq\s*=\s*([^,)]+))?/);
  if (pwmAssignment) {
    const pin = pinValue(pwmAssignment[2]!);
    const freq = numberValue(pwmAssignment[3] ?? "");
    if (!/^[A-Za-z0-9_]+$/.test(pin)) throw new MicroPythonConversionError(`无法识别 PWM 引脚：${pwmAssignment[2]}`, lineNumber);
    pwms.set(pwmAssignment[1]!, { pin, freq: freq ?? 1000 });
    return null;
  }

  const pinAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(?:machine\.)?Pin\(\s*([^,)]+)(?:\s*,[^)]*)?\)$/);
  if (pinAssignment) {
    const pin = pinValue(pinAssignment[2]!);
    if (!/^[A-Za-z0-9_]+$/.test(pin)) throw new MicroPythonConversionError(`无法识别引脚：${pinAssignment[2]}`, lineNumber);
    pins.set(pinAssignment[1]!, pin);
    return null;
  }

  const valueAssignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
  if (valueAssignment) {
    context.values.set(valueAssignment[1]!, parseValueExpression(valueAssignment[2]!, context));
    return null;
  }

  const pwmFrequency = text.match(/^([A-Za-z_]\w*)\.freq\(\s*([^)]*)\s*\)$/);
  if (pwmFrequency) {
    const pwm = pwms.get(pwmFrequency[1]!);
    if (!pwm) throw new MicroPythonConversionError(`变量 ${pwmFrequency[1]} 不是已知的 PWM`, lineNumber);
    const freq = numberValue(pwmFrequency[2]!);
    if (freq === null) throw new MicroPythonConversionError("PWM.freq() 只支持数字频率", lineNumber);
    pwm.freq = freq;
    return null;
  }

  const pwmDuty = text.match(/^([A-Za-z_]\w*)\.duty(?:_u16)?\(\s*([^)]*)\s*\)$/);
  if (pwmDuty) {
    const pwm = pwms.get(pwmDuty[1]!);
    if (!pwm) throw new MicroPythonConversionError(`变量 ${pwmDuty[1]} 不是已知的 PWM`, lineNumber);
    const duty = numberValue(pwmDuty[2]!);
    if (duty === null) throw new MicroPythonConversionError("PWM.duty() 只支持数字占空比", lineNumber);
    const normalized = text.includes(".duty_u16(") ? dutyFromU16(duty) : Math.max(0, Math.min(pwmDutyMax, Math.round(duty)));
    return pwmWrite(pwm.pin, pwm.freq, normalized);
  }

  const helperPwm = text.match(/^hardware_set_pwm\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
  if (helperPwm) {
    const pin = pinValue(helperPwm[1]!);
    const freq = numberValue(helperPwm[2]!);
    const duty = numberValue(helperPwm[3]!);
    if (!/^[A-Za-z0-9_]+$/.test(pin) || freq === null || duty === null) {
      throw new MicroPythonConversionError("hardware_set_pwm() 只支持数字引脚、频率和占空比", lineNumber);
    }
    return pwmWrite(pin, freq, Math.max(0, Math.min(pwmDutyMax, Math.round(duty))));
  }

  const sleepSeconds = text.match(/^(?:time\.)?sleep\(\s*([^)]*)\s*\)$/);
  if (sleepSeconds) {
    const seconds = numberValue(sleepSeconds[1]!);
    if (seconds === null) throw new MicroPythonConversionError("sleep() 只支持数字秒数", lineNumber);
    return sleepBlock(seconds * 1000);
  }

  const sleepMilliseconds = text.match(/^(?:time\.)?sleep_ms\(\s*([^)]*)\s*\)$/);
  if (sleepMilliseconds) {
    const ms = numberValue(sleepMilliseconds[1]!);
    if (ms === null) throw new MicroPythonConversionError("sleep_ms() 只支持数字毫秒数", lineNumber);
    return sleepBlock(ms);
  }

  const variableWrite = text.match(/^([A-Za-z_]\w*)\.(?:value\(\s*([^)]*)\s*\)|(on|off)\(\s*\))$/);
  if (variableWrite) {
    const pin = pins.get(variableWrite[1]!);
    if (!pin) throw new MicroPythonConversionError(`变量 ${variableWrite[1]} 不是已知的 Pin`, lineNumber);
    const level = variableWrite[3] === "on" ? "1" : variableWrite[3] === "off" ? "0" : levelValue(variableWrite[2] ?? "");
    if (!level) throw new MicroPythonConversionError(`无法识别 ${variableWrite[1]}.value() 的电平`, lineNumber);
    return pinWrite(pin, level);
  }

  const directWrite = text.match(/^(?:machine\.)?Pin\(\s*([^,)]+)\s*,\s*(?:machine\.)?Pin\.(?:OUT|IN)[^)]*\)\s*\.value\(\s*([^)]*)\s*\)$/);
  if (directWrite) {
    const level = levelValue(directWrite[2]!);
    if (!level) throw new MicroPythonConversionError("Pin.value() 只支持 0/1/True/False", lineNumber);
    return pinWrite(pinValue(directWrite[1]!), level);
  }

  if (/^(if|elif|else|for|while|try|except|finally|with|def|class)\b.*:$/.test(text)) {
    throw new MicroPythonConversionError("暂不支持嵌套控制流；请改用积木树，或把生成代码限制在 Pin / sleep / while True 子集", lineNumber);
  }

  return rawStatement(text);
}

function bodyIndent(lines: SourceLine[], start: number, headerIndent: number): number {
  return lines[start] && lines[start]!.indent > headerIndent ? lines[start]!.indent : headerIndent + 1;
}

function compileForever(lines: SourceLine[], start: number, pins: Map<string, string>, pwms: Map<string, PwmState>, neopixels: Set<string>, context: ExpressionContext): { block: BlockState; next: number } {
  const header = lines[start]!;
  if (!/^while\s+True\s*:$/.test(header.text)) throw new MicroPythonConversionError("只支持 while True:", header.lineNumber);
  const body = compileBody(lines, start + 1, bodyIndent(lines, start + 1, header.indent), pins, pwms, neopixels, context);
  return { block: { type: "hardware_forever", inputs: body.blocks.length ? { BODY: { block: chain(body.blocks)! } } : {} }, next: body.next };
}

function compileIf(lines: SourceLine[], start: number, pins: Map<string, string>, pwms: Map<string, PwmState>, neopixels: Set<string>, context: ExpressionContext): { block: BlockState; next: number } {  const header = lines[start]!;
  const match = header.text.match(/^if\s+(.+):$/);
  if (!match) throw new MicroPythonConversionError("只支持 if <条件>:", header.lineNumber);
  const condition = parseCondition(match[1]!, context);
  const body = compileBody(lines, start + 1, bodyIndent(lines, start + 1, header.indent), pins, pwms, neopixels, context);
  if (!body.blocks.length) throw new MicroPythonConversionError("if 分支不能为空", header.lineNumber);
  let next = body.next;
  let elseBody: BlockState[] | null = null;
  if (next < lines.length && lines[next]!.indent === header.indent && lines[next]!.text === "else:") {
    const elseResult = compileBody(lines, next + 1, bodyIndent(lines, next + 1, header.indent), pins, pwms, neopixels, context);
    elseBody = elseResult.blocks;
    next = elseResult.next;
  }
  return {
    block: {
      type: "controls_if",
      extraState: { hasElse: Boolean(elseBody?.length) },
      inputs: {
        IF0: { block: condition },
        DO0: { block: chain(body.blocks)! },
        ...(elseBody?.length ? { ELSE: { block: chain(elseBody)! } } : {}),
      },
    },
    next,
  };
}

function compileRepeat(lines: SourceLine[], start: number, pins: Map<string, string>, pwms: Map<string, PwmState>, neopixels: Set<string>, context: ExpressionContext): { block: BlockState; next: number } {
  const header = lines[start]!;
  const match = header.text.match(/^for\s+[A-Za-z_]\w*\s+in\s+range\(\s*([^)]*)\s*\)\s*:$/);
  if (!match) throw new MicroPythonConversionError("只支持 for 变量 in range(...):", header.lineNumber);
  const args = splitArguments(match[1]!).map((value) => numberValue(value));
  if (args.length === 0 || args.length > 2 || args.some((value) => value === null)) {
    throw new MicroPythonConversionError("for range() 只支持 1-2 个数字参数", header.lineNumber);
  }
  const startValue = args.length === 2 ? args[0]! : 0;
  const endValue = args.length === 2 ? args[1]! : args[0]!;
  const count = Math.max(0, endValue - startValue);
  const body = compileBody(lines, start + 1, bodyIndent(lines, start + 1, header.indent), pins, pwms, neopixels, context);
  return {
    block: { type: "controls_repeat_ext", inputs: { TIMES: literalNumber(count), DO: { block: chain(body.blocks)! } } },
    next: body.next,
  };
}

function compileBody(lines: SourceLine[], start: number, indent: number, pins: Map<string, string>, pwms: Map<string, PwmState>, neopixels: Set<string>, context: ExpressionContext): { blocks: BlockState[]; next: number } {
  const blocks: BlockState[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.indent < indent) break;
    if (line.indent > indent) throw new MicroPythonConversionError("缩进层级无法识别", line.lineNumber);
    if (line.text === "else:") break;
    if (/^elif\s+/.test(line.text)) throw new MicroPythonConversionError("暂不支持 elif；请使用嵌套 if 或积木树", line.lineNumber);
    if (/^if\s+/.test(line.text)) {
      const compiled = compileIf(lines, index, pins, pwms, neopixels, context);
      blocks.push(compiled.block);
      index = compiled.next;
      continue;
    }
    if (/^while\s+True\s*:$/.test(line.text)) {
      const compiled = compileForever(lines, index, pins, pwms, neopixels, context);
      blocks.push(compiled.block);
      index = compiled.next;
      continue;
    }
    if (/^for\s+/.test(line.text)) {
      const compiled = compileRepeat(lines, index, pins, pwms, neopixels, context);
      blocks.push(compiled.block);
      index = compiled.next;
      continue;
    }
    const block = compileSimple(line, pins, pwms, neopixels, context);
    if (block) blocks.push(block);
    index += 1;
  }
  return { blocks, next: index };
}

export function micropythonToWorkspace(source: string, _boardId?: HardwareBoardId): object {
  const lines = sourceLines(source);
  if (!lines.length) throw new MicroPythonConversionError("MicroPython 代码不能为空");
  const pins = new Map<string, string>();
  const pwms = new Map<string, PwmState>();
  const neopixels = new Set<string>();
  const context: ExpressionContext = { sensors: new Map(), adcs: new Map(), values: new Map(), oleds: new Set(), servos: new Map() };
  const roots = compileBody(lines, 0, 0, pins, pwms, neopixels, context);
  if (!roots.blocks.length) throw new MicroPythonConversionError("没有可转换的 MicroPython 语句");
  return { blocks: { languageVersion: 0, blocks: [chain(roots.blocks)!] } };
}
