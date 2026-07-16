type SerializedRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is SerializedRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const replaceTextInput = (input: unknown) => {
  if (!isRecord(input)) return;
  for (const key of ["block", "shadow"] as const) {
    const child = input[key];
    if (!isRecord(child) || child.type !== "text" || !isRecord(child.fields)) continue;
    const latex = child.fields.TEXT;
    if (typeof latex !== "string") continue;
    input[key] = { type: "visual_python_manim_formula_value", fields: { LATEX: latex } };
  }
};

export const upgradeMathFormulaInputs = (workspace: object) => {
  const upgraded = structuredClone(workspace) as SerializedRecord;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const inputs = isRecord(value.inputs) ? value.inputs : null;
    if (inputs && value.type === "visual_python_manim_mathtex_object") replaceTextInput(inputs.CONTENT);
    if (inputs && isRecord(value.fields) && value.fields.TARGET === "MathTex") replaceTextInput(inputs.ARG0);
    Object.values(value).forEach(visit);
  };
  visit(upgraded);
  return upgraded;
};
