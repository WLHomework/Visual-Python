import { assign, chain, formula, input, list, number, ref, scaledDirection, sceneWorkspace, text, wait } from "./examples/manim/workspaceHelpers";

const textObjectTypes: Record<string, string> = {
  Text: "visual_python_manim_plain_text_object",
  Tex: "visual_python_manim_tex_object",
  MathTex: "visual_python_manim_mathtex_object",
};

function splitTopLevel(source: string, delimiter = ",") {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escape = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (character === "\\") {
        escape = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth = Math.max(0, depth - 1);
    else if (character === delimiter && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = source.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function unwrapCall(source: string, name: string) {
  const match = source.trim().match(new RegExp(`^${name}\\s*\\(([\\s\\S]*)\\)$`));
  return match ? match[1].trim() : null;
}

function parseStringLiteral(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(['"])([\s\S]*)\1$/);
  if (!match) return null;
  return match[2].replace(/\\n/g, "\n").replace(/\\'/g, "'").replace(/\\"/g, '"');
}

function parseNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKwargs(args: string[]) {
  const positional: string[] = [];
  const kwargs: Record<string, string> = {};
  for (const part of args) {
    const match = part.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
    if (match) kwargs[match[1]] = match[2].trim();
    else positional.push(part);
  }
  return { positional, kwargs };
}

function parseShift(source: string) {
  const match = source.trim().match(/^(UP|DOWN|LEFT|RIGHT|UL|UR|DL|DR|ORIGIN)(?:\s*\*\s*([\d.]+))?$/);
  if (!match) return null;
  return { direction: match[1], scale: match[2] ? Number(match[2]) : 1 };
}

function shiftObject(mobject: object, vector: { direction: string; scale: number }) {
  return {
    type: "visual_python_manim_shift",
    inputs: {
      MOBJECT: input(mobject),
      VECTOR: vector.scale === 1
        ? input({ type: "visual_python_manim_direction_constant", fields: { VALUE: vector.direction } })
        : scaledDirection(vector.direction, vector.scale),
    },
  };
}

function textObject(kind: string, content: string, fontSize: number, color: string) {
  return {
    type: textObjectTypes[kind] || textObjectTypes.Text,
    fields: { COLOR: color },
    inputs: {
      CONTENT: kind === "MathTex" ? formula(content) : text(content),
      FONT_SIZE: number(fontSize),
    },
  };
}

function writeAnimation(name: string, runTime = 1) {
  return {
    type: "visual_python_manim_write_animation",
    inputs: { MOBJECT: ref(name), RUN_TIME: number(runTime) },
  };
}

function createAnimation(name: string, runTime = 1) {
  return {
    type: "visual_python_manim_create_object_animation",
    inputs: { MOBJECT: ref(name), RUN_TIME: number(runTime) },
  };
}

function fadeAnimation(kind: "FadeIn" | "FadeOut", name: string) {
  return {
    type: "visual_python_manim_fade_animation",
    fields: { ANIMATION: kind },
    inputs: { MOBJECT: ref(name) },
  };
}

function extractConstruct(code: string) {
  const classMatch = code.match(/class\s+([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*)\s*\)\s*:/);
  const defMatch = code.match(/def\s+construct\s*\(\s*self\s*\)\s*:/);
  if (!classMatch || !defMatch || defMatch.index === undefined) return null;
  const after = code.slice(code.indexOf(":", defMatch.index) + 1);
  const lines = after.split("\n");
  const body: string[] = [];
  let bodyIndent: number | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      if (body.length) body.push("");
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (bodyIndent === null) bodyIndent = indent;
    if (indent < bodyIndent) break;
    body.push(line.slice(bodyIndent));
  }
  return { className: classMatch[1], sceneType: classMatch[2], body: body.join("\n") };
}

function splitStatements(body: string) {
  const statements: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escape = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (character === "\\") {
        escape = true;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth = Math.max(0, depth - 1);
    else if (character === "\n" && depth === 0) {
      const piece = body.slice(start, index).trim();
      if (piece && !piece.startsWith("#")) statements.push(piece);
      start = index + 1;
    }
  }
  const last = body.slice(start).trim();
  if (last && !last.startsWith("#")) statements.push(last);
  return statements.map((statement) => statement.replace(/\s*\n\s*/g, " "));
}

function splitShift(expression: string) {
  const marker = ".shift(";
  const index = expression.lastIndexOf(marker);
  if (index < 0 || !expression.endsWith(")")) return { head: expression, shiftArgs: null as string | null };
  return { head: expression.slice(0, index).trim(), shiftArgs: expression.slice(index + marker.length, -1) };
}

function compileShape(kind: string, callArgs: string) {
  const { positional, kwargs } = parseKwargs(splitTopLevel(callArgs));
  const color = kwargs.color || "WHITE";
  if (kind === "Circle") {
    return {
      type: "visual_python_manim_circle_object",
      fields: { COLOR: color },
      inputs: { RADIUS: number(parseNumber(kwargs.radius || positional[0] || "1") ?? 1) },
    };
  }
  if (kind === "Square") {
    return {
      type: "visual_python_manim_square_object",
      fields: { COLOR: color },
      inputs: { SIDE_LENGTH: number(parseNumber(kwargs.side_length || positional[0] || "2") ?? 2) },
    };
  }
  if (kind === "Rectangle") {
    return {
      type: "visual_python_manim_rectangle_object",
      fields: { COLOR: color },
      inputs: {
        WIDTH: number(parseNumber(kwargs.width || positional[0] || "3") ?? 3),
        HEIGHT: number(parseNumber(kwargs.height || positional[1] || "2") ?? 2),
      },
    };
  }
  return null;
}

function compileAssignment(statement: string) {
  const match = statement.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
  if (!match) return null;
  const name = match[1];
  const { head, shiftArgs } = splitShift(match[2].trim());
  const call = head.match(/^(Text|Tex|MathTex|Circle|Square|Rectangle)\s*\(([\s\S]*)\)$/);
  if (!call) return null;
  let object: object | null = null;
  if (call[1] === "Text" || call[1] === "Tex" || call[1] === "MathTex") {
    const { positional, kwargs } = parseKwargs(splitTopLevel(call[2]));
    const content = positional[0] ? parseStringLiteral(positional[0]) : null;
    if (content === null) return null;
    object = textObject(call[1], content, parseNumber(kwargs.font_size || "") ?? 48, kwargs.color || "WHITE");
  } else {
    object = compileShape(call[1], call[2]);
  }
  if (!object) return null;
  if (shiftArgs) {
    const vector = parseShift(shiftArgs);
    if (!vector) return null;
    object = shiftObject(object, vector);
  }
  return assign(name, object);
}

function compileWait(statement: string) {
  const args = unwrapCall(statement, "self\\.wait");
  if (args === null) return null;
  const seconds = parseNumber(splitTopLevel(args)[0] || "1") ?? 1;
  return wait(seconds);
}

function compileAnimation(source: string) {
  const trimmed = source.trim();
  const animate = trimmed.match(/^([A-Za-z_]\w*)\.animate(?:\s*\(\s*run_time\s*=\s*([\d.]+)\s*\))?\.(scale|shift)\s*\(\s*([^)]*)\s*\)$/);
  if (animate) {
    const name = animate[1]!;
    const runTime = animate[2] ? Number(animate[2]) : 1;
    if (animate[3] === "scale") {
      const factor = parseNumber(animate[4] || "2");
      if (factor === null) return null;
      return {
        type: "visual_python_manim_animate_scale",
        inputs: { MOBJECT: ref(name), FACTOR: number(factor), RUN_TIME: number(runTime) },
      };
    }
    const vector = parseShift(animate[4] || "");
    if (!vector) return null;
    return {
      type: "visual_python_manim_animate_shift",
      inputs: {
        MOBJECT: ref(name),
        VECTOR: input(vector.scale === 1
          ? { type: "visual_python_manim_direction_constant", fields: { VALUE: vector.direction } }
          : scaledDirection(vector.direction, vector.scale)),
        RUN_TIME: number(runTime),
      },
    };
  }
  for (const [kind, build] of [
    ["Write", (name: string, runTime: number) => writeAnimation(name, runTime)],
    ["Create", (name: string, runTime: number) => createAnimation(name, runTime)],
    ["FadeIn", (name: string) => fadeAnimation("FadeIn", name)],
    ["FadeOut", (name: string) => fadeAnimation("FadeOut", name)],
  ] as Array<[string, (name: string, runTime: number) => object]>) {
    const args = unwrapCall(trimmed, kind);
    if (args === null) continue;
    const { positional, kwargs } = parseKwargs(splitTopLevel(args));
    const name = positional[0]?.trim();
    if (!name || !/^[A-Za-z_]\w*$/.test(name)) return null;
    return build(name, parseNumber(kwargs.run_time || "") ?? 1);
  }
  return null;
}

function compileAdd(statement: string) {
  const args = unwrapCall(statement, "self\\.add");
  if (args === null) return null;
  const names = splitTopLevel(args).map((part) => part.trim()).filter((name) => /^[A-Za-z_]\w*$/.test(name));
  if (!names.length) return null;
  if (names.length === 1) return { type: "visual_python_manim_add", inputs: { MOBJECT: ref(names[0]) } };
  if (names.length === 2) return { type: "visual_python_manim_add_two", inputs: { FIRST: ref(names[0]), SECOND: ref(names[1]) } };
  return null;
}

function compilePlay(statement: string) {
  const args = unwrapCall(statement, "self\\.play");
  if (args === null) return null;
  const { positional, kwargs } = parseKwargs(splitTopLevel(args));
  const animationArgs = positional.flatMap((part) => {
    const trimmed = part.replace(/^\*/, "").trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) return splitTopLevel(trimmed.slice(1, -1));
    return [trimmed];
  });
  const animations = animationArgs.map(compileAnimation);
  if (!animations.length || animations.some((item) => !item)) return null;
  const runTime = parseNumber(kwargs.run_time || "") ?? 1;
  const lagRatio = parseNumber(kwargs.lag_ratio || "") ?? 0;
  if (animations.length === 1) {
    return {
      type: "visual_python_manim_play_with_options",
      inputs: { ANIMATION: input(animations[0]!), RUN_TIME: number(runTime), LAG_RATIO: number(lagRatio) },
    };
  }
  if (animations.length === 2) {
    return {
      type: "visual_python_manim_play_two",
      inputs: { FIRST: input(animations[0]!), SECOND: input(animations[1]!), RUN_TIME: number(runTime), LAG_RATIO: number(lagRatio) },
    };
  }
  return {
    type: "visual_python_manim_play_list",
    inputs: { ANIMATIONS: list(...animations as object[]), RUN_TIME: number(runTime), LAG_RATIO: number(lagRatio) },
  };
}

function rawStatement(code: string) {
  return { type: "python_raw_statement", fields: { CODE: code.replace(/\s+/g, " ").trim() } };
}

function compileStatement(statement: string) {
  return compileAssignment(statement) || compileWait(statement) || compilePlay(statement) || compileAdd(statement) || rawStatement(statement);
}

export function manimPythonToWorkspace(code: string) {
  const source = code.replace(/\r\n/g, "\n").trim();
  if (!source) throw new Error("Python 代码不能为空");
  const scene = extractConstruct(source);
  const statements = (scene ? splitStatements(scene.body) : splitStatements(source).filter((statement) => !/^from\s+manim\s+import|^import\s+manim/.test(statement)));
  if (!statements.length) throw new Error(scene ? "construct 方法是空的" : "没有可转换成积木的 Python 语句");
  const body = chain(...statements.map(compileStatement));
  return scene ? sceneWorkspace(scene.className, scene.sceneType, body) : { blocks: { languageVersion: 0, blocks: [body] } };
}
