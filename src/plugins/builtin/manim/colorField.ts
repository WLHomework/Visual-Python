import * as Blockly from "blockly/core";
import { colorOptions } from "./constants";

type ManimColorFieldConfig = Blockly.FieldDropdownConfig & { value?: string };

const FIELD_TYPE = "field_manim_color";
const CUSTOM_OPTION = "__MANIM_CUSTOM_COLOR__";
const CUSTOM_COLOR_PATTERN = /^ManimColor\("(#[0-9A-F]{6})"\)$/i;
const RECENT_COLOURS_STORAGE_KEY = "visual-python:manim-recent-colours";
const MAX_RECENT_COLOURS = 6;
const MENU_SEPARATOR: Blockly.MenuOption = "separator";
const PRESET_OPTIONS = colorOptions as Blockly.MenuOption[];
const PRESET_VALUES = new Set(colorOptions.map(([, value]) => value));
const PRESET_HEX: Record<string, string> = {
  WHITE: "#FFFFFF",
  BLACK: "#000000",
  RED: "#FC6255",
  GREEN: "#83C167",
  BLUE: "#58C4DD",
  YELLOW: "#FFFF00",
  PURPLE: "#9A72AC",
  ORANGE: "#FF862F",
  GRAY: "#888888",
  TEAL: "#5CD0B3",
};

type HsvColour = { hue: number; saturation: number; value: number };

let closeActiveColourPicker: (() => void) | null = null;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const hexToHsv = (hex: string): HsvColour => {
  const normalized = /^#[0-9A-F]{6}$/i.test(hex) ? hex.slice(1) : "58C4DD";
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return {
    hue: (hue + 360) % 360,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  };
};

export const hsvToHex = ({ hue, saturation, value }: HsvColour) => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const part = chroma * (1 - Math.abs((normalizedHue / 60) % 2 - 1));
  const offset = value - chroma;
  const [red, green, blue] = normalizedHue < 60 ? [chroma, part, 0]
    : normalizedHue < 120 ? [part, chroma, 0]
      : normalizedHue < 180 ? [0, chroma, part]
        : normalizedHue < 240 ? [0, part, chroma]
          : normalizedHue < 300 ? [part, 0, chroma]
            : [chroma, 0, part];
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
};

export const customColorExpression = (hex: string) => {
  const normalized = String(hex || "").trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return null;
  return `ManimColor("${normalized}")`;
};

export const customColorHex = (value: unknown) =>
  CUSTOM_COLOR_PATTERN.exec(String(value || ""))?.[1].toUpperCase() ?? null;

export const parseRecentColours = (raw: string | null): string[] => {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => /^#[0-9A-F]{6}$/.test(value)))]
      .slice(0, MAX_RECENT_COLOURS);
  } catch {
    return [];
  }
};

const readRecentColours = () => {
  try {
    return typeof localStorage === "undefined"
      ? []
      : parseRecentColours(localStorage.getItem(RECENT_COLOURS_STORAGE_KEY));
  } catch {
    return [];
  }
};

const writeRecentColours = (colours: string[]) => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RECENT_COLOURS_STORAGE_KEY, JSON.stringify(colours.slice(0, MAX_RECENT_COLOURS)));
    }
  } catch {
    // Storage can be unavailable in restricted webviews; colour selection still works.
  }
};

const rememberRecentColour = (hex: string) => {
  const normalized = String(hex || "").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
  try {
    if (typeof localStorage === "undefined") return;
    const next = [normalized, ...readRecentColours().filter((value) => value !== normalized)]
      .slice(0, MAX_RECENT_COLOURS);
    writeRecentColours(next);
  } catch {
    // Storage can be unavailable in restricted webviews; colour selection still works.
  }
};

const forgetRecentColour = (hex: string) =>
  writeRecentColours(readRecentColours().filter((value) => value !== hex));

const clearRecentColours = () => writeRecentColours([]);

const colourMenuOption = (label: string, value: string, hex?: string): Blockly.MenuOption => {
  if (typeof document === "undefined") return [label, value];
  const content = document.createElement("span");
  content.className = "manim-colour-menu-option";
  content.title = label;
  content.setAttribute("aria-label", label);
  const swatch = document.createElement("span");
  swatch.className = `manim-colour-menu-swatch${hex ? "" : " custom"}`;
  if (hex) swatch.style.background = hex;
  const text = document.createElement("span");
  text.textContent = label;
  content.append(swatch, text);
  return [content, value, label];
};

const showColourPicker = (field: FieldManimColor) => {
  const sourceBlock = field.getSourceBlock();
  const fieldRoot = field.getSvgRoot();
  if (!sourceBlock?.isEditable() || !fieldRoot) return;

  closeActiveColourPicker?.();

  let colour = hexToHsv(customColorHex(field.getValue())
    ?? PRESET_HEX[String(field.getValue())]
    ?? "#58C4DD");
  const panel = document.createElement("div");
  panel.className = "manim-colour-picker";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "自定义颜色");
  panel.innerHTML = `
    <div class="manim-colour-picker-head">
      <strong>自定义颜色</strong>
      <button type="button" aria-label="关闭颜色选择器" title="关闭">&times;</button>
    </div>
    <div class="manim-colour-picker-body">
      <div class="manim-colour-saturation" role="slider" aria-label="饱和度和明度" tabindex="0"><span></span></div>
      <div class="manim-colour-hue" role="slider" aria-label="色相" tabindex="0"><span></span></div>
      <div class="manim-colour-value-row">
        <span class="manim-colour-swatch" aria-hidden="true"></span>
        <input type="text" maxlength="7" spellcheck="false" aria-label="十六进制颜色" />
      </div>
      <section class="manim-colour-recents" hidden>
        <div class="manim-colour-recents-head"><span>最近使用</span><button type="button">清空</button></div>
        <div class="manim-colour-recents-list"></div>
      </section>
    </div>`;
  document.body.appendChild(panel);

  const header = panel.querySelector<HTMLElement>(".manim-colour-picker-head")!;
  const closeButton = header.querySelector<HTMLButtonElement>("button")!;
  const saturation = panel.querySelector<HTMLElement>(".manim-colour-saturation")!;
  const saturationHandle = saturation.querySelector<HTMLElement>("span")!;
  const hue = panel.querySelector<HTMLElement>(".manim-colour-hue")!;
  const hueHandle = hue.querySelector<HTMLElement>("span")!;
  const swatch = panel.querySelector<HTMLElement>(".manim-colour-swatch")!;
  const hexInput = panel.querySelector<HTMLInputElement>("input")!;
  const recentSection = panel.querySelector<HTMLElement>(".manim-colour-recents")!;
  const recentList = panel.querySelector<HTMLElement>(".manim-colour-recents-list")!;
  const clearRecentsButton = panel.querySelector<HTMLButtonElement>(".manim-colour-recents-head button")!;

  const render = () => {
    const hex = hsvToHex(colour);
    saturation.style.setProperty("--manim-colour-hue", `hsl(${colour.hue} 100% 50%)`);
    saturationHandle.style.left = `${colour.saturation * 100}%`;
    saturationHandle.style.top = `${(1 - colour.value) * 100}%`;
    hueHandle.style.left = `${colour.hue / 360 * 100}%`;
    swatch.style.background = hex;
    hexInput.value = hex;
    saturation.setAttribute("aria-valuetext", `饱和度 ${Math.round(colour.saturation * 100)}%，明度 ${Math.round(colour.value * 100)}%`);
    hue.setAttribute("aria-valuenow", String(Math.round(colour.hue)));
  };
  const apply = () => {
    const hex = hsvToHex(colour);
    const expression = customColorExpression(hex);
    if (expression && !field.disposed && field.getSourceBlock()) field.setValue(expression);
    appliedHex = hex;
    render();
  };

  let appliedHex: string | null = null;
  const renderRecentColours = () => {
    const currentHex = hsvToHex(colour);
    const presetHexes = new Set(Object.values(PRESET_HEX));
    const recents = readRecentColours()
      .filter((hex) => hex !== currentHex && !presetHexes.has(hex));
    recentSection.hidden = recents.length === 0;
    recentList.replaceChildren();
    for (const hex of recents) {
      const item = document.createElement("div");
      item.className = "manim-colour-recent-item";
      const select = document.createElement("button");
      select.type = "button";
      select.className = "manim-colour-recent-select";
      select.style.background = hex;
      select.title = `使用 ${hex}`;
      select.setAttribute("aria-label", `使用最近颜色 ${hex}`);
      select.addEventListener("click", () => {
        colour = hexToHsv(hex);
        apply();
        renderRecentColours();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "manim-colour-recent-remove";
      remove.textContent = "×";
      remove.title = `删除 ${hex}`;
      remove.setAttribute("aria-label", `删除最近颜色 ${hex}`);
      remove.addEventListener("click", () => {
        forgetRecentColour(hex);
        renderRecentColours();
      });
      item.append(select, remove);
      recentList.appendChild(item);
    }
  };
  let finishActiveDrag: (() => void) | null = null;
  const startPointerDrag = (
    event: PointerEvent,
    element: HTMLElement,
    update: (pointerEvent: PointerEvent) => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    finishActiveDrag?.();
    const ownsEventGroup = !Blockly.Events.getGroup();
    if (ownsEventGroup) Blockly.Events.setGroup(true);
    element.setPointerCapture?.(event.pointerId);
    const move = (pointerEvent: PointerEvent) => update(pointerEvent);
    const finish = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
      if (ownsEventGroup) Blockly.Events.setGroup(false);
      finishActiveDrag = null;
    };
    finishActiveDrag = finish;
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
    update(event);
  };
  const updateSaturation = (event: PointerEvent) => {
    const bounds = saturation.getBoundingClientRect();
    colour.saturation = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    colour.value = 1 - clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    apply();
  };
  const updateHue = (event: PointerEvent) => {
    const bounds = hue.getBoundingClientRect();
    colour.hue = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * 360;
    apply();
  };
  saturation.addEventListener("pointerdown", (event) => startPointerDrag(event, saturation, updateSaturation));
  hue.addEventListener("pointerdown", (event) => startPointerDrag(event, hue, updateHue));
  saturation.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft") colour.saturation = clamp(colour.saturation - step, 0, 1);
    else if (event.key === "ArrowRight") colour.saturation = clamp(colour.saturation + step, 0, 1);
    else if (event.key === "ArrowUp") colour.value = clamp(colour.value + step, 0, 1);
    else if (event.key === "ArrowDown") colour.value = clamp(colour.value - step, 0, 1);
    else return;
    event.preventDefault();
    event.stopPropagation();
    apply();
  });
  hue.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 15 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") colour.hue = (colour.hue - step + 360) % 360;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") colour.hue = (colour.hue + step) % 360;
    else if (event.key === "Home") colour.hue = 0;
    else if (event.key === "End") colour.hue = 359;
    else return;
    event.preventDefault();
    event.stopPropagation();
    apply();
  });

  hexInput.addEventListener("input", () => {
    const value = hexInput.value.trim();
    if (!/^#[0-9A-F]{6}$/i.test(value)) return;
    colour = hexToHsv(value);
    apply();
  });
  hexInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") hexInput.blur();
  });
  clearRecentsButton.addEventListener("click", () => {
    clearRecentColours();
    renderRecentColours();
  });

  renderRecentColours();

  const keepInViewport = (left: number, top: number) => ({
    left: clamp(left, 8, Math.max(8, window.innerWidth - panel.offsetWidth - 8)),
    top: clamp(top, 8, Math.max(8, window.innerHeight - panel.offsetHeight - 8)),
  });
  const fieldBounds = fieldRoot.getBoundingClientRect();
  const preferredTop = fieldBounds.bottom + 8;
  const top = preferredTop + panel.offsetHeight <= window.innerHeight - 8
    ? preferredTop
    : fieldBounds.top - panel.offsetHeight - 8;
  const position = keepInViewport(fieldBounds.left, top);
  panel.style.left = `${position.left}px`;
  panel.style.top = `${position.top}px`;

  header.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const bounds = panel.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    startPointerDrag(event, header, (pointerEvent) => {
      const next = keepInViewport(pointerEvent.clientX - offsetX, pointerEvent.clientY - offsetY);
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
    });
  });

  let outsideListening = false;
  let closed = false;
  let outsideTimer: number | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    finishActiveDrag?.();
    if (outsideTimer !== null) window.clearTimeout(outsideTimer);
    if (appliedHex) rememberRecentColour(appliedHex);
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    panel.remove();
    if (closeActiveColourPicker === close) closeActiveColourPicker = null;
  };
  const onOutsidePointerDown = (event: PointerEvent) => {
    if (outsideListening && !panel.contains(event.target as Node)) close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  closeButton.addEventListener("click", close);
  document.addEventListener("keydown", onKeyDown, true);
  outsideTimer = window.setTimeout(() => {
    if (closed) return;
    outsideListening = true;
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
  }, 0);
  closeActiveColourPicker = close;
  render();
};

export class FieldManimColor extends Blockly.FieldDropdown {
  constructor(value = "WHITE", validator?: Blockly.FieldDropdownValidator, config?: ManimColorFieldConfig) {
    super(PRESET_OPTIONS, validator, config);
    this.setValue(value);
  }

  static fromJson(options: ManimColorFieldConfig) {
    return new FieldManimColor(options.value ?? "WHITE", undefined, options);
  }

  getOptions(_useCache?: boolean): Blockly.MenuOption[] {
    const customHex = customColorHex(this.getValue());
    const presetOptions = colorOptions.map(([label, value]) =>
      colourMenuOption(label, value, PRESET_HEX[value]));
    const presetHexes = new Set(Object.values(PRESET_HEX));
    const recentOptions = readRecentColours()
      .filter((hex) => hex !== customHex && !presetHexes.has(hex))
      .map((hex) => colourMenuOption(`最近 ${hex}`, customColorExpression(hex)!, hex));
    const customOption = customHex
      ? colourMenuOption(`自定义 ${customHex}`, customColorExpression(customHex)!, customHex)
      : colourMenuOption("自定义...", CUSTOM_OPTION);
    return [
      ...presetOptions,
      ...(recentOptions.length ? [MENU_SEPARATOR, ...recentOptions] : []),
      MENU_SEPARATOR,
      customOption,
    ];
  }

  protected doClassValidation_(newValue?: string): string | null {
    const value = String(newValue || "");
    if (PRESET_VALUES.has(value) || customColorHex(value)) return value;
    return null;
  }

  protected onItemSelected_(menu: Blockly.Menu, menuItem: Blockly.MenuItem): void {
    const selectedValue = String(menuItem.getValue());
    const selectedHex = customColorHex(selectedValue);
    const opensPicker = selectedValue === CUSTOM_OPTION
      || Boolean(selectedHex && selectedValue === this.getValue());
    if (!opensPicker) {
      if (selectedHex) rememberRecentColour(selectedHex);
      super.onItemSelected_(menu, menuItem);
      return;
    }
    showColourPicker(this);
  }

  getAriaTypeName() {
    return "颜色";
  }
}

export const registerManimColorField = () => {
  try {
    Blockly.fieldRegistry.register(FIELD_TYPE, FieldManimColor);
  } catch (error) {
    if (!String(error).includes("already registered")) throw error;
  }
};
