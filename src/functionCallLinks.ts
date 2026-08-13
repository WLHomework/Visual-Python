import * as Blockly from "blockly/core";
import {
  buildFunctionReferenceIndex,
  findFunctionReferencesForDefinition,
  isBlocklyInsertionMarkerBlock,
  isFunctionDefinitionBlock,
} from "./functionReferences";
import { buildFunctionCallBlockInfo } from "./pythonBlocks";

export type BlockBounds = { x: number; y: number; width: number; height: number; anchorY?: number };
export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type FunctionCallLinkEndpoints = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};
export type AffineTransform = { a: number; b: number; c: number; d: number; e: number; f: number };

export const surfacePointFromScreenMatrix = (
  point: { x: number; y: number },
  inverseCanvasMatrix: AffineTransform,
) => ({
  x: inverseCanvasMatrix.a * point.x + inverseCanvasMatrix.c * point.y + inverseCanvasMatrix.e,
  y: inverseCanvasMatrix.b * point.x + inverseCanvasMatrix.d * point.y + inverseCanvasMatrix.f,
});

export const surfaceBoundsFromScreenRect = (
  rect: ScreenRect,
  inverseCanvasMatrix: AffineTransform,
): BlockBounds => {
  const topLeft = surfacePointFromScreenMatrix(
    { x: rect.left, y: rect.top },
    inverseCanvasMatrix,
  );
  const bottomRight = surfacePointFromScreenMatrix(
    { x: rect.right, y: rect.bottom },
    inverseCanvasMatrix,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
};

export const functionCallLinkEndpoints = (
  definition: BlockBounds,
  call: BlockBounds,
): FunctionCallLinkEndpoints => ({
  start: { x: definition.x + definition.width, y: definition.anchorY ?? definition.y + definition.height / 2 },
  end: { x: call.x, y: call.anchorY ?? call.y + call.height / 2 },
});

export const functionCallLinkMenuMode = (
  isDefinition: boolean,
  blockId: string,
  activeDefinitionId: string | null,
  relatedCallIds: ReadonlySet<string>,
): "show" | "hide" | null => {
  if (blockId === activeDefinitionId || relatedCallIds.has(blockId)) return "hide";
  return isDefinition ? "show" : null;
};

export const isSettledFunctionCallLinkRefreshEvent = (eventKind: "move" | "drag-end" | "viewport") =>
  eventKind === "move" || eventKind === "drag-end";

export const isLiveFunctionCallLinkRefreshEvent = (eventKind: "drag-start" | "move" | "drag-end") =>
  eventKind === "drag-start" || eventKind === "move";

export const buildFunctionCallPath = ({ start, end }: FunctionCallLinkEndpoints) => {
  const controlX = (start.x + end.x) / 2;
  return `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`;
};

export type FunctionCallLinksController = {
  clear(): void;
  createCall(block: Blockly.BlockSvg): void;
  dispose(): void;
  menuMode(block: Blockly.BlockSvg): "show" | "hide" | null;
  refresh(): void;
  toggle(block: Blockly.BlockSvg): void;
};

const svgNamespace = "http://www.w3.org/2000/svg";
const contextMenuId = "visualPythonFunctionCallLinks";
const createCallContextMenuId = "visualPythonCreateFunctionCall";
const definitionClass = "blocklyFunctionReferenceDefinition";
const callClass = "blocklyFunctionReferenceCall";
const controllers = new WeakMap<Blockly.WorkspaceSvg, FunctionCallLinksController>();

export function createFunctionCallForDefinition(definition: Blockly.Block): Blockly.Block | null {
  const info = buildFunctionCallBlockInfo(definition);
  if (!info || info.kind !== "block" || !info.type) return null;
  const call = definition.workspace.newBlock(info.type);
  if (info.extraState && "loadExtraState" in call && typeof call.loadExtraState === "function") {
    call.loadExtraState(info.extraState as Record<string, unknown>);
  }
  for (const [name, value] of Object.entries(info.fields ?? {})) call.setFieldValue(value, name);
  return call;
}

const renderedBlock = (block: Blockly.Block): Blockly.BlockSvg | null => {
  if (
    !block.rendered
    || isBlocklyInsertionMarkerBlock(block)
    || (typeof block.isDeadOrDying === "function" && block.isDeadOrDying())
    || !(block as Blockly.BlockSvg).getSvgRoot()?.isConnected
  ) return null;
  let visible = block as Blockly.BlockSvg;
  let parent = block.getParent();
  while (parent) {
    if (parent.isCollapsed() && parent.rendered) visible = parent as Blockly.BlockSvg;
    parent = parent.getParent();
  }
  return visible;
};

const fieldAnchorY = (
  block: Blockly.BlockSvg,
  fieldName: string | undefined,
  inverseCanvasMatrix: AffineTransform | null,
) => {
  const field = fieldName ? block.getField(fieldName) : null;
  const fieldRoot = field?.getSvgRoot();
  if (!fieldRoot || !inverseCanvasMatrix) return undefined;
  const fieldBounds = fieldRoot.getBoundingClientRect();
  const surfaceRect = surfaceBoundsFromScreenRect({
    left: fieldBounds.left,
    top: fieldBounds.top,
    right: fieldBounds.right,
    bottom: fieldBounds.bottom,
  }, inverseCanvasMatrix);
  return surfaceRect.y + surfaceRect.height / 2;
};

const blockBounds = (
  block: Blockly.BlockSvg,
  fieldName: string | undefined,
  inverseCanvasMatrix: AffineTransform | null,
): BlockBounds => {
  const fallbackPosition = block.getRelativeToSurfaceXY();
  const rootBounds = block.getSvgRoot().getBoundingClientRect();
  const renderedBounds = inverseCanvasMatrix
    ? surfaceBoundsFromScreenRect({
      left: rootBounds.left,
      top: rootBounds.top,
      right: rootBounds.right,
      bottom: rootBounds.bottom,
    }, inverseCanvasMatrix)
    : { ...fallbackPosition, width: block.getHeightWidth().width, height: block.getHeightWidth().height };
  return {
    ...renderedBounds,
    anchorY: fieldAnchorY(block, fieldName, inverseCanvasMatrix),
  };
};

const ensureContextMenu = () => {
  if (!Blockly.ContextMenuRegistry.registry.getItem(createCallContextMenuId)) {
    Blockly.ContextMenuRegistry.registry.register({
      id: createCallContextMenuId,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 4,
      displayText: "生成函数调用",
      preconditionFn: (scope) => {
        const block = scope.block;
        return block && isFunctionDefinitionBlock(block) ? "enabled" : "hidden";
      },
      callback: (scope) => {
        const block = scope.block;
        if (block) controllers.get(block.workspace)?.createCall(block);
      },
    });
  }
  if (Blockly.ContextMenuRegistry.registry.getItem(contextMenuId)) return;
  Blockly.ContextMenuRegistry.registry.register({
    id: contextMenuId,
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 5,
    displayText: (scope) => {
      const block = scope.block;
      if (!block) return "显示调用关系";
      return controllers.get(block.workspace)?.menuMode(block) === "hide" ? "隐藏调用关系" : "显示调用关系";
    },
    preconditionFn: (scope) => {
      const block = scope.block;
      return block && controllers.get(block.workspace)?.menuMode(block) ? "enabled" : "hidden";
    },
    callback: (scope) => {
      const block = scope.block;
      if (block) controllers.get(block.workspace)?.toggle(block);
    },
  });
};

export function installFunctionCallLinks(workspace: Blockly.WorkspaceSvg): FunctionCallLinksController {
  controllers.get(workspace)?.dispose();
  ensureContextMenu();
  const linkLayer = document.createElementNS(svgNamespace, "g");
  linkLayer.classList.add("function-call-links");
  linkLayer.setAttribute("aria-hidden", "true");
  workspace.getCanvas().insertBefore(linkLayer, workspace.getCanvas().firstChild);

  let activeDefinitionId: string | null = null;
  let relatedCallIds = new Set<string>();
  let refreshFrame: number | null = null;
  let settledRefreshVersion = 0;
  let blockDragInProgress = false;
  let highlightedRoots: SVGGElement[] = [];
  let disposed = false;

  const clearHighlights = () => {
    for (const root of highlightedRoots) {
      root.classList.remove(definitionClass, callClass);
    }
    highlightedRoots = [];
  };

  const clear = () => {
    activeDefinitionId = null;
    relatedCallIds.clear();
    settledRefreshVersion += 1;
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    refreshFrame = null;
    clearHighlights();
    linkLayer.replaceChildren();
  };

  const refresh = () => {
    refreshFrame = null;
    clearHighlights();
    linkLayer.replaceChildren();
    if (!activeDefinitionId) return;

    const definition = workspace.getBlockById(activeDefinitionId);
    if (!definition) {
      activeDefinitionId = null;
      relatedCallIds.clear();
      return;
    }
    const references = findFunctionReferencesForDefinition(definition, buildFunctionReferenceIndex(workspace));
    const visibleDefinition = references ? renderedBlock(references.definition) : null;
    if (!references || !visibleDefinition) {
      activeDefinitionId = null;
      relatedCallIds.clear();
      return;
    }

    relatedCallIds = new Set(references.calls.map((call) => call.id));
    const canvasMatrix = linkLayer.getScreenCTM()?.inverse() ?? workspace.getCanvas().getScreenCTM()?.inverse();
    if (!canvasMatrix) return;

    const definitionRoot = visibleDefinition.getSvgRoot();
    definitionRoot.classList.add(definitionClass);
    highlightedRoots.push(definitionRoot);
    const definitionBounds = blockBounds(
      visibleDefinition,
      visibleDefinition.id === references.definition.id ? "NAME" : undefined,
      canvasMatrix,
    );
    const seenVisibleCalls = new Set<string>();

    for (const call of references.calls) {
      const visibleCall = renderedBlock(call);
      if (!visibleCall || visibleCall.id === visibleDefinition.id || seenVisibleCalls.has(visibleCall.id)) continue;
      seenVisibleCalls.add(visibleCall.id);
      const callRoot = visibleCall.getSvgRoot();
      callRoot.classList.add(callClass);
      highlightedRoots.push(callRoot);

      const path = document.createElementNS(svgNamespace, "path");
      path.classList.add("function-call-link");
      const callFieldName = call.type.endsWith("_structured") ? "TARGET" : "NAME";
      const callBounds = blockBounds(
        visibleCall,
        visibleCall.id === call.id ? callFieldName : undefined,
        canvasMatrix,
      );
      path.setAttribute("d", buildFunctionCallPath(functionCallLinkEndpoints(definitionBounds, callBounds)));
      linkLayer.append(path);
    }
  };

  const scheduleRefresh = () => {
    if (!activeDefinitionId || refreshFrame !== null) return;
    refreshFrame = requestAnimationFrame(refresh);
  };

  const scheduleSettledRefresh = () => {
    if (!activeDefinitionId) return;
    const version = ++settledRefreshVersion;
    void Blockly.renderManagement.finishQueuedRenders().then(() => {
      if (disposed || version !== settledRefreshVersion || !activeDefinitionId) return;
      let previousSignature: string | null = null;
      let stableFrames = 0;
      let attempts = 0;
      const waitForLayout = () => {
        requestAnimationFrame(() => {
          if (disposed || version !== settledRefreshVersion || !activeDefinitionId) return;
          const transientBlock = workspace.getAllBlocks(false).some((block) => (
            isBlocklyInsertionMarkerBlock(block)
            || (typeof block.isDeadOrDying === "function" && block.isDeadOrDying())
            || !block.rendered
            || !block.getSvgRoot()?.isConnected
          ));
          const signature = workspace.getAllBlocks(false).map((block) => {
            const bounds = block.getSvgRoot()?.getBoundingClientRect();
            return bounds
              ? `${block.id}:${bounds.left}:${bounds.top}:${bounds.right}:${bounds.bottom}`
              : `${block.id}:missing`;
          }).join("|");
          if (!transientBlock && signature === previousSignature) stableFrames += 1;
          else stableFrames = 0;
          previousSignature = signature;
          attempts += 1;
          if (stableFrames < 1 && attempts < 60) {
            waitForLayout();
            return;
          }
          if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
          refreshFrame = requestAnimationFrame(refresh);
        });
      };
      waitForLayout();
    });
  };

  const controller: FunctionCallLinksController = {
    clear,
    createCall: (definition) => {
      const call = createFunctionCallForDefinition(definition);
      if (!call) return;
      const definitionPosition = definition.getRelativeToSurfaceXY();
      const definitionSize = definition.getHeightWidth();
      const callSvg = call as Blockly.BlockSvg;
      Blockly.Events.setGroup(true);
      try {
        callSvg.initSvg();
        callSvg.render();
        callSvg.moveBy(definitionPosition.x + definitionSize.width + 32, definitionPosition.y);
        callSvg.select();
      } finally {
        Blockly.Events.setGroup(false);
      }
    },
    dispose: () => {},
    menuMode: (block) => functionCallLinkMenuMode(
      isFunctionDefinitionBlock(block),
      block.id,
      activeDefinitionId,
      relatedCallIds,
    ),
    refresh,
    toggle: (block) => {
      const mode = functionCallLinkMenuMode(
        isFunctionDefinitionBlock(block),
        block.id,
        activeDefinitionId,
        relatedCallIds,
      );
      if (mode === "hide") {
        clear();
        return;
      }
      if (mode !== "show") return;
      activeDefinitionId = block.id;
      refresh();
    },
  };

  const handleWorkspaceChange = (event: Blockly.Events.Abstract) => {
    if (event.type === Blockly.Events.BLOCK_DRAG) {
      const dragEvent = event as Blockly.Events.BlockDrag;
      blockDragInProgress = Boolean(dragEvent.isStart);
      if (dragEvent.isStart) {
        settledRefreshVersion += 1;
        if (refreshFrame !== null) {
          cancelAnimationFrame(refreshFrame);
          refreshFrame = null;
        }
      }
      if (dragEvent.isStart && isLiveFunctionCallLinkRefreshEvent("drag-start")) scheduleRefresh();
      if (!dragEvent.isStart) scheduleSettledRefresh();
      return;
    }
    if (event.type === Blockly.Events.BLOCK_MOVE) {
      if (isLiveFunctionCallLinkRefreshEvent("move")) scheduleRefresh();
      if (!blockDragInProgress) scheduleSettledRefresh();
      return;
    }
    scheduleRefresh();
  };
  const handlePointerMove = () => scheduleRefresh();
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") clear();
  };
  const handleResize = () => scheduleRefresh();

  workspace.addChangeListener(handleWorkspaceChange);
  workspace.getInjectionDiv().addEventListener("pointermove", handlePointerMove);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleResize);
  controllers.set(workspace, controller);

  controller.dispose = () => {
    disposed = true;
    clear();
    workspace.removeChangeListener(handleWorkspaceChange);
    workspace.getInjectionDiv().removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("resize", handleResize);
    linkLayer.remove();
    if (controllers.get(workspace) === controller) controllers.delete(workspace);
  };
  return controller;
}
