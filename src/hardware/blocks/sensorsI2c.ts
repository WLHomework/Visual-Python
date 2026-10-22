import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { BoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureHardwareGlobal,
  ensureI2cBus,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareFunctionPlaceholder,
  hardwareGenerator,
  hardwareSectionLabel,
  provideHardwareFunction,
  pythonOrder,
} from "./shared";

const definitions = [
  {
    type: "hardware_bh1750_lux",
    message0: "BH1750 光照 地址 %1 (lux)",
    args0: [
      { type: "field_dropdown", name: "ADDRESS", options: [["0x23", "0x23"], ["0x5C", "0x5C"]] },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 BH1750 环境光照，单位为 lux。传感器使用连续高分辨率测量；首次读取会等待约 180 毫秒。ADDR 引脚接地时地址为 0x23，接高电平时为 0x5C。",
  },
  {
    type: "hardware_bmp280_read",
    message0: "BMP280 读取 %1 地址 %2",
    args0: [
      {
        type: "field_dropdown",
        name: "FIELD",
        options: [["温度", "temperature"], ["气压", "pressure"], ["海拔", "altitude"]],
      },
      { type: "field_dropdown", name: "ADDRESS", options: [["0x76", "0x76"], ["0x77", "0x77"]] },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 BMP280 的温度（°C）、气压（Pa）或按标准海平面估算的海拔（米）。SDO 接地时地址为 0x76，接高电平时为 0x77；读取失败返回 -999。",
  },
  {
    type: "hardware_sht30_read",
    message0: "SHT30 读取 %1 地址 %2",
    args0: [
      { type: "field_dropdown", name: "FIELD", options: [["温度", "temperature"], ["湿度", "humidity"]] },
      { type: "field_dropdown", name: "ADDRESS", options: [["0x44", "0x44"], ["0x45", "0x45"]] },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 SHT30 的温度（°C）或相对湿度（%）。每次读取都会校验 CRC；ADDR 接地时地址为 0x44，接高电平时为 0x45；读取失败返回 -999。",
  },
  {
    type: "hardware_mpu6050_read",
    message0: "MPU6050 读取 %1 地址 %2",
    args0: [
      {
        type: "field_dropdown",
        name: "READING",
        options: [
          ["加速度 X (g)", "accel_x"],
          ["加速度 Y (g)", "accel_y"],
          ["加速度 Z (g)", "accel_z"],
          ["角速度 X (°/s)", "gyro_x"],
          ["角速度 Y (°/s)", "gyro_y"],
          ["角速度 Z (°/s)", "gyro_z"],
          ["温度 (°C)", "temperature"],
        ],
      },
      { type: "field_dropdown", name: "ADDRESS", options: [["0x68", "0x68"], ["0x69", "0x69"]] },
    ],
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 MPU6050 的加速度（±2 g）、角速度（±250 °/s）或芯片温度。AD0 接地时地址为 0x68，接高电平时为 0x69；读取失败返回 -999。",
  },
  {
    type: "hardware_vl53l0x_distance",
    message0: "VL53L0X 距离 (毫米)",
    output: "Number",
    colour: hardwareColours.sensor,
    tooltip: "读取 VL53L0X 激光测距，返回毫米。有效范围约 30–2000 毫米；I2C 地址固定为 0x29，需要稳定的 3.3 V 供电。读取失败返回 -1。",
  },
];

/**
 * 按地址缓存传感器对象：循环里反复读取时不会每次都重新初始化和等待测量。
 * 如果用户切换地址，则重新创建对象。
 */
const ensureBh1750Helper = (profile: BoardProfile): string => {
  ensureImport("bh1750");
  const bus = ensureI2cBus(profile);
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_bh1750_read", [
    `def ${placeholder}(address):`,
    '  if globals().get("_bh1750_address", -1) != address:',
    `    globals()["_bh1750"] = bh1750.BH1750(${bus}(), address=address)`,
    '    globals()["_bh1750_address"] = address',
    '  return globals()["_bh1750"].read_lux()',
  ]);
};

const ensureBmp280Helper = (profile: BoardProfile): string => {
  ensureImport("bmp280");
  const bus = ensureI2cBus(profile);
  ensureHardwareGlobal("hardware_bmp280_sensors", "_bmp280_sensors = {}");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_bmp280_read", [
    `def ${placeholder}(address, field):`,
    "  sensor = _bmp280_sensors.get(address)",
    "  if sensor is None:",
    `    sensor = bmp280.BMP280(${bus}(), address=address)`,
    "    _bmp280_sensors[address] = sensor",
    "  try:",
    '    if field == "pressure":',
    "      return sensor.read_pressure()",
    '    if field == "altitude":',
    "      return sensor.read_altitude()",
    "    return sensor.read_temperature()",
    "  except OSError:",
    "    return -999.0",
  ]);
};

const ensureSht30Helper = (profile: BoardProfile): string => {
  ensureImport("sht30");
  const bus = ensureI2cBus(profile);
  ensureHardwareGlobal("hardware_sht30_sensors", "_sht30_sensors = {}");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_sht30_read", [
    `def ${placeholder}(address, field):`,
    "  sensor = _sht30_sensors.get(address)",
    "  if sensor is None:",
    `    sensor = sht30.SHT30(${bus}(), address=address)`,
    "    _sht30_sensors[address] = sensor",
    "  try:",
    '    if field == "humidity":',
    "      return sensor.read_humidity()",
    "    return sensor.read_temperature()",
    "  except OSError:",
    "    return -999.0",
  ]);
};

const ensureMpu6050Helper = (profile: BoardProfile): string => {
  ensureImport("mpu6050");
  const bus = ensureI2cBus(profile);
  ensureHardwareGlobal("hardware_mpu6050_sensors", "_mpu6050_sensors = {}");
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_mpu6050_read", [
    `def ${placeholder}(address, reading):`,
    "  sensor = _mpu6050_sensors.get(address)",
    "  if sensor is None:",
    `    sensor = mpu6050.MPU6050(${bus}(), address=address)`,
    "    _mpu6050_sensors[address] = sensor",
    "  try:",
    '    if reading == "temperature":',
    "      return sensor.read_temperature()",
    '    if reading[:4] == "gyro":',
    "      values = sensor.read_gyro()",
    "    else:",
    "      values = sensor.read_acceleration()",
    "    axis = reading[-1]",
    '    if axis == "x":',
    "      return values[0]",
    '    if axis == "y":',
    "      return values[1]",
    "    return values[2]",
    "  except OSError:",
    "    return -999.0",
  ]);
};

const ensureVl53l0xHelper = (profile: BoardProfile): string => {
  ensureImport("vl53l0x");
  ensureHardwareGlobal("hardware_vl53l0x_sensor", "_vl53l0x = None");
  const bus = ensureI2cBus(profile);
  const placeholder = hardwareFunctionPlaceholder();
  return provideHardwareFunction("hardware_vl53l0x_read", [
    `def ${placeholder}():`,
    "  global _vl53l0x",
    "  if _vl53l0x is None:",
    `    _vl53l0x = vl53l0x.VL53L0X(${bus}())`,
    "  try:",
    "    return _vl53l0x.read_mm()",
    "  except OSError:",
    "    return -1",
  ]);
};

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_bh1750_lux = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ["0", pythonOrder.ATOMIC];
    const address = String(block.getFieldValue("ADDRESS") || "0x23");
    const helper = ensureBh1750Helper(profile);
    return [`${helper}(${address})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_bmp280_read = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ["0", pythonOrder.ATOMIC];
    const address = String(block.getFieldValue("ADDRESS") || "0x76");
    const field = String(block.getFieldValue("FIELD") || "temperature");
    const helper = ensureBmp280Helper(profile);
    return [`${helper}(${address}, "${field}")`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_sht30_read = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ["0", pythonOrder.ATOMIC];
    const address = String(block.getFieldValue("ADDRESS") || "0x44");
    const field = String(block.getFieldValue("FIELD") || "temperature");
    const helper = ensureSht30Helper(profile);
    return [`${helper}(${address}, "${field}")`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_mpu6050_read = (block) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ["0", pythonOrder.ATOMIC];
    const address = String(block.getFieldValue("ADDRESS") || "0x68");
    const reading = String(block.getFieldValue("READING") || "accel_x");
    const helper = ensureMpu6050Helper(profile);
    return [`${helper}(${address}, "${reading}")`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_vl53l0x_distance = () => {
    const profile = getActiveHardwareBoard();
    if (!profile) return ["0", pythonOrder.ATOMIC];
    const helper = ensureVl53l0xHelper(profile);
    return [`${helper}()`, pythonOrder.FUNCTION_CALL];
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile) return [];
  const contents: unknown[] = [];
  if (profile.p0Modules) {
    contents.push(
      hardwareSectionLabel("I2C 传感器"),
      {
        kind: "block",
        type: "hardware_bh1750_lux",
        fields: { ADDRESS: "0x23" },
      },
    );
  }
  if (profile.p1Modules) {
    if (!contents.length) contents.push(hardwareSectionLabel("I2C 传感器"));
    contents.push(
      { kind: "block", type: "hardware_bmp280_read", fields: { FIELD: "temperature", ADDRESS: "0x76" } },
      { kind: "block", type: "hardware_sht30_read", fields: { FIELD: "temperature", ADDRESS: "0x44" } },
      { kind: "block", type: "hardware_mpu6050_read", fields: { READING: "accel_x", ADDRESS: "0x68" } },
    );
  }
  if (profile.p2Modules) {
    if (!contents.length) contents.push(hardwareSectionLabel("I2C 传感器"));
    contents.push({ kind: "block", type: "hardware_vl53l0x_distance" });
  }
  return contents as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
