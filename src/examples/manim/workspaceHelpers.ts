export const input = (block: object) => ({ block });
export const number = (value: number) => input({ type: "math_number", fields: { NUM: value } });
export const text = (value: string) => input({ type: "text", fields: { TEXT: value } });
export const formula = (value: string) => input({ type: "visual_python_manim_formula_value", fields: { LATEX: value } });
export const raw = (code: string) => input({ type: "python_raw_expression", fields: { CODE: code } });
export const ref = (name: string) => input({ type: "visual_python_manim_object_ref", fields: { VAR: name } });
export const direction = (value: string) => input({ type: "visual_python_manim_direction_constant", fields: { VALUE: value } });
export const scaledDirection = (value: string, scale: number) => input({ type: "visual_python_manim_scaled_direction", fields: { DIRECTION: value }, inputs: { SCALE: number(scale) } });
export const degrees = (value: number) => input({ type: "visual_python_manim_degrees", fields: { VALUE: value } });
export const point = (x: number, y: number, z = 0) => ({ type: "visual_python_manim_point", inputs: { X: number(x), Y: number(y), Z: number(z) } });
export const range = (start: number, end: number, step?: number) => input({
  type: step === undefined ? "visual_python_manim_range_min_max" : "visual_python_manim_range",
  inputs: step === undefined ? { START: number(start), END: number(end) } : { START: number(start), END: number(end), STEP: number(step) },
});
export const list = (...items: object[]) => input({
  type: "python_list_collection",
  extraState: { itemCount: items.length },
  inputs: Object.fromEntries(items.map((block, index) => [`ITEM${index}`, input(block)])),
});
export const assign = (name: string, block: object) => ({ type: "visual_python_manim_assign", fields: { VAR: name }, inputs: { MOBJECT: input(block) } });
export const chain = (...blocks: any[]) => {
  blocks.slice(0, -1).forEach((block, index) => { block.next = { block: blocks[index + 1] }; });
  return blocks[0];
};
export const sceneWorkspace = (name: string, sceneType: string, body: object) => ({
  blocks: { languageVersion: 0, blocks: [{ type: "visual_python_manim_scene", x: 96, y: 72, fields: { NAME: name, SCENE_TYPE: sceneType }, inputs: { BODY: { block: body } } }] },
});
export const play = (animation: object) => ({ type: "visual_python_manim_play", inputs: { ANIMATION: input(animation) } });
export const create = (name: string, seconds = 1) => ({ type: "visual_python_manim_create_object_animation", inputs: { MOBJECT: ref(name), RUN_TIME: number(seconds) } });
export const wait = (seconds = 1) => ({ type: "visual_python_manim_wait", inputs: { SECONDS: number(seconds) } });
export const voiceover = (content: string, role = "default", id?: string) => ({ type: "visual_python_manim_voiceover", ...(id ? { id } : {}), fields: { ROLE: role }, inputs: { TEXT: text(content) } });
export const voiceoverWithAnimation = (content: string, body: object, role = "default", id?: string) => ({ type: "visual_python_manim_voiceover_with_animation", ...(id ? { id } : {}), fields: { ROLE: role }, inputs: { TEXT: text(content), BODY: input(body) } });
