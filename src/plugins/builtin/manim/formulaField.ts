import * as Blockly from "blockly/core";
import { requestFormulaEdit } from "../../../formulaEditorBridge";

type FormulaFieldConfig = Blockly.FieldTextInputConfig & { value?: string };

const FIELD_TYPE = "field_manim_formula";

const symbolReplacements: Array<[RegExp, string]> = [
  [/\\left|\\right/g, ""],
  [/\\,/g, " "],
  [/\\(?:mathrm|text)\{([^{}]*)\}/g, "$1"],
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)"],
  [/\\sqrt\{([^{}]*)\}/g, "sqrt($1)"],
  [/\\int/g, "∫"],
  [/\\sum/g, "Σ"],
  [/\\prod/g, "Π"],
  [/\\infty/g, "∞"],
  [/\\pi/g, "π"],
  [/\\theta/g, "θ"],
  [/\\alpha/g, "α"],
  [/\\beta/g, "β"],
  [/\\gamma/g, "γ"],
  [/\\Delta/g, "Δ"],
  [/\\cdot|\\times/g, "×"],
  [/\\leq/g, "≤"],
  [/\\geq/g, "≥"],
  [/\\neq/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\perp/g, "⟂"],
  [/\\to|\\rightarrow/g, "→"],
];

export const formatFormulaPreview = (latex: string) => {
  let preview = String(latex || "").trim();
  for (const [pattern, replacement] of symbolReplacements) preview = preview.replace(pattern, replacement);
  preview = preview
    .replace(/\^\{([^{}]*)\}/g, "^$1")
    .replace(/_\{([^{}]*)\}/g, "_$1")
    .replace(/[{}]/g, "")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return preview || "点击编辑公式";
};

export class FieldManimFormula extends Blockly.FieldTextInput {
  constructor(value = "x^2 + y^2 = z^2", validator?: Blockly.FieldTextInputValidator | null, config?: FormulaFieldConfig) {
    super(value, validator, config);
    this.maxDisplayLength = 34;
  }

  static fromJson(options: FormulaFieldConfig) {
    return new FieldManimFormula(options.value ?? "x^2 + y^2 = z^2", undefined, options);
  }

  protected getDisplayText_() {
    return formatFormulaPreview(String(this.getValue() || ""));
  }

  protected showEditor_(event?: Event) {
    const sourceBlock = this.getSourceBlock();
    if (!sourceBlock || !sourceBlock.isEditable()) return;
    event?.preventDefault();
    event?.stopPropagation();
    requestFormulaEdit(String(this.getValue() || ""), (value) => {
      if (this.disposed || !this.getSourceBlock()) return;
      this.setValue(value);
    });
  }

  getAriaTypeName() {
    return "数学公式";
  }
}

export const registerManimFormulaField = () => {
  try {
    Blockly.fieldRegistry.register(FIELD_TYPE, FieldManimFormula);
  } catch (error) {
    if (!String(error).includes("already registered")) throw error;
  }
};
