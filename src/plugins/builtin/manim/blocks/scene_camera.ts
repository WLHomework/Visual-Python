import type { PluginContext } from "../../../api/types";
import { Order } from "blockly/python";
import { colour } from "../constants";
import { addManimImport, value } from "../helpers";

export const registerSceneCameraBlocks = (context: PluginContext) => {
  context.registerBlock({
    type: "visual_python_manim_camera_frame_animation",
    message0: "相机画面 聚焦对象 %1 缩放 %2 时间 %3",
    args0: [
      { type: "input_value", name: "TARGET", check: "ManimObject" },
      { type: "input_value", name: "SCALE", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    output: "ManimAnimation",
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const target = value(generator, block, "TARGET", "ORIGIN");
    const scale = value(generator, block, "SCALE", "0.6");
    const runTime = value(generator, block, "RUN_TIME", "2");
    return [`self.camera.frame.animate(run_time=${runTime}).scale(${scale}).move_to(${target})`, Order.FUNCTION_CALL];
  });

  context.registerBlock({
    type: "visual_python_manim_3d_camera_orientation",
    message0: "三维视角 垂直角 %1 水平角 %2 距离 %3",
    args0: [
      { type: "input_value", name: "PHI", check: ["ManimAngle", "Number"] },
      { type: "input_value", name: "THETA", check: ["ManimAngle", "Number"] },
      { type: "input_value", name: "DISTANCE", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const phi = value(generator, block, "PHI", "75 * DEGREES");
    const theta = value(generator, block, "THETA", "30 * DEGREES");
    const distance = value(generator, block, "DISTANCE", "8");
    return `self.set_camera_orientation(phi=${phi}, theta=${theta}, distance=${distance})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_3d_move_camera",
    message0: "移动三维相机 垂直角 %1 水平角 %2 距离 %3 时间 %4",
    args0: [
      { type: "input_value", name: "PHI", check: ["ManimAngle", "Number"] },
      { type: "input_value", name: "THETA", check: ["ManimAngle", "Number"] },
      { type: "input_value", name: "DISTANCE", check: "Number" },
      { type: "input_value", name: "RUN_TIME", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const phi = value(generator, block, "PHI", "75 * DEGREES");
    const theta = value(generator, block, "THETA", "30 * DEGREES");
    const distance = value(generator, block, "DISTANCE", "8");
    const runTime = value(generator, block, "RUN_TIME", "2");
    return `self.move_camera(phi=${phi}, theta=${theta}, distance=${distance}, run_time=${runTime})\n`;
  });

  context.registerBlock({
    type: "visual_python_manim_3d_ambient_rotation",
    message0: "三维相机旋转 %1 速度 %2",
    args0: [
      { type: "field_dropdown", name: "ACTION", options: [["开始", "begin"], ["停止", "stop"]] },
      { type: "input_value", name: "RATE", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour,
  }, (block, generator) => {
    addManimImport(generator);
    const action = String(block.getFieldValue("ACTION") || "begin");
    if (action === "stop") return "self.stop_ambient_camera_rotation()\n";
    return `self.begin_ambient_camera_rotation(rate=${value(generator, block, "RATE", "0.1")})\n`;
  });
};
