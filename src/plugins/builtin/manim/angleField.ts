import * as Blockly from "blockly/core";

type AngleFieldConfig = Blockly.FieldNumberConfig & { value?: number };

const FIELD_TYPE = "field_manim_angle";
const SIZE = 136;
const CENTER = SIZE / 2;
const RADIUS = 48;

const normalizeAngle = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return ((Math.round(numeric) % 360) + 360) % 360;
};

const polarPoint = (angle: number, radius: number) => {
  const radians = angle * Math.PI / 180;
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER - Math.sin(radians) * radius,
  };
};

const angleFromPointer = (event: PointerEvent, svg: SVGSVGElement) => {
  const rect = svg.getBoundingClientRect();
  const x = event.clientX - rect.left - CENTER;
  const y = CENTER - (event.clientY - rect.top);
  return normalizeAngle(Math.atan2(y, x) * 180 / Math.PI);
};

export class FieldManimAngle extends Blockly.FieldNumber {
  constructor(value = 90, validator?: Blockly.FieldNumberValidator | null, config?: AngleFieldConfig) {
    super(value, 0, 359, 1, validator, config);
  }

  static fromJson(options: AngleFieldConfig) {
    return new FieldManimAngle(options.value ?? 90, undefined, options);
  }

  protected showEditor_(event?: Event) {
    const sourceBlock = this.getSourceBlock();
    if (!sourceBlock || !sourceBlock.isEditable()) return;

    super.showEditor_(event, false, true);

    Blockly.DropDownDiv.clearContent();
    const content = Blockly.DropDownDiv.getContentDiv();
    const root = document.createElement("div");
    root.className = "manim-angle-picker";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute("width", String(SIZE));
    svg.setAttribute("height", String(SIZE));
    svg.classList.add("manim-angle-dial");

    const face = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    face.setAttribute("class", "manim-angle-face");
    face.setAttribute("cx", String(CENTER));
    face.setAttribute("cy", String(CENTER));
    face.setAttribute("r", "56");
    svg.appendChild(face);

    for (let angle = 0; angle < 360; angle += 15) {
      const outer = polarPoint(angle, 52);
      const inner = polarPoint(angle, angle % 45 === 0 ? 42 : 47);
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("class", angle % 45 === 0 ? "manim-angle-tick major" : "manim-angle-tick");
      tick.setAttribute("x1", String(inner.x));
      tick.setAttribute("y1", String(inner.y));
      tick.setAttribute("x2", String(outer.x));
      tick.setAttribute("y2", String(outer.y));
      svg.appendChild(tick);
    }

    const pointer = document.createElementNS("http://www.w3.org/2000/svg", "line");
    pointer.setAttribute("class", "manim-angle-pointer");
    pointer.setAttribute("x1", String(CENTER));
    pointer.setAttribute("y1", String(CENTER));
    svg.appendChild(pointer);

    const centerDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    centerDot.setAttribute("class", "manim-angle-center");
    centerDot.setAttribute("cx", String(CENTER));
    centerDot.setAttribute("cy", String(CENTER));
    centerDot.setAttribute("r", "4");
    svg.appendChild(centerDot);

    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.setAttribute("class", "manim-angle-handle");
    handle.setAttribute("r", "8");
    svg.appendChild(handle);

    root.appendChild(svg);
    content.appendChild(root);

    const currentEditorValue = () => normalizeAngle(this.htmlInput_?.value ?? this.getValue());
    const render = () => {
      const end = polarPoint(currentEditorValue(), RADIUS);
      pointer.setAttribute("x2", String(end.x));
      pointer.setAttribute("y2", String(end.y));
      handle.setAttribute("cx", String(end.x));
      handle.setAttribute("cy", String(end.y));
    };

    const setAngle = (angle: number) => {
      this.setEditorValue_(normalizeAngle(angle));
      render();
    };

    const onPointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      setAngle(angleFromPointer(pointerEvent, svg));
    };
    const stopPointer = (pointerEvent: PointerEvent) => {
      pointerEvent.stopPropagation();
      svg.releasePointerCapture?.(pointerEvent.pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopPointer);
    };
    svg.addEventListener("pointerdown", (pointerEvent) => {
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      svg.setPointerCapture?.(pointerEvent.pointerId);
      setAngle(angleFromPointer(pointerEvent, svg));
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopPointer, { once: true });
    });
    this.htmlInput_?.addEventListener("input", () => window.requestAnimationFrame(render));

    render();
    const colour = sourceBlock.getColour();
    const border = "getColourTertiary" in sourceBlock && typeof sourceBlock.getColourTertiary === "function"
      ? sourceBlock.getColourTertiary()
      : colour;
    Blockly.DropDownDiv.setColour(colour, border);
    Blockly.DropDownDiv.showPositionedByField(this, undefined, undefined, false);
    this.htmlInput_?.focus({ preventScroll: true });
    this.htmlInput_?.select();
  }

  getAriaTypeName() {
    return "angle";
  }
}

export const registerManimAngleField = () => {
  try {
    Blockly.fieldRegistry.register(FIELD_TYPE, FieldManimAngle);
  } catch (error) {
    if (!String(error).includes("already registered")) throw error;
  }
};
