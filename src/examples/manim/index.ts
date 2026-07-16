import type { ExampleCatalogItem } from "../types";
import { basicShapesExample } from "./basicShapes";
import { emphasisAnimationsExample } from "./emphasisAnimations";
import { entranceAndExitExample } from "./entranceAndExit";
import { helloManimExample } from "./helloManim";
import { groupsAndLayoutExample } from "./groupsAndLayout";
import { linesArrowsVectorsExample } from "./linesArrowsVectors";
import { motionRotateScaleExample } from "./motionRotateScale";
import { sceneObjectManagementExample } from "./sceneObjectManagement";
import { shapeTransformExample } from "./shapeTransform";
import { textAndFormulasExample } from "./textAndFormulas";
import { geometryAnnotationsExample } from "./geometryAnnotations";
import { matrixAndTableExample } from "./matrixAndTable";
import { axesAndFunctionsExample } from "./axesAndFunctions";
import { functionAreaExample } from "./functionArea";
import { valueTrackerExample } from "./valueTracker";
import { dynamicRedrawExample } from "./dynamicRedraw";
import { tracedPathExample } from "./tracedPath";
import { movingCameraExample } from "./movingCamera";
import { threeDObjectsExample } from "./threeDObjects";
import { threeDSurfaceExample } from "./threeDSurface";
import { arcsSectorsAnnulusExample } from "./arcsSectorsAnnulus";
import { polygonsAndVerticesExample } from "./polygonsAndVertices";
import { formulaTransformExample } from "./formulaTransform";
import { positionLayoutExample } from "./positionLayout";
import { objectStylesExample } from "./objectStyles";
import { growthAnimationsExample } from "./growthAnimations";
import { animationOrchestrationExample } from "./animationOrchestration";
import { numberLineAndGridExample } from "./numberLineAndGrid";
import { followTargetExample } from "./followTarget";
import { clearUpdaterExample } from "./clearUpdater";
import { dynamicCounterExample } from "./dynamicCounter";
import { threeDSolidCollectionExample } from "./threeDSolidCollection";
import { torusAndArrow3DExample } from "./torusAndArrow3D";
import { threeDCameraMotionExample } from "./threeDCameraMotion";

export { animationOrchestrationExample, arcsSectorsAnnulusExample, axesAndFunctionsExample, basicShapesExample, clearUpdaterExample, dynamicCounterExample, dynamicRedrawExample, emphasisAnimationsExample, entranceAndExitExample, followTargetExample, formulaTransformExample, functionAreaExample, geometryAnnotationsExample, groupsAndLayoutExample, growthAnimationsExample, helloManimExample, linesArrowsVectorsExample, matrixAndTableExample, motionRotateScaleExample, movingCameraExample, numberLineAndGridExample, objectStylesExample, polygonsAndVerticesExample, positionLayoutExample, sceneObjectManagementExample, shapeTransformExample, textAndFormulasExample, threeDCameraMotionExample, threeDObjectsExample, threeDSolidCollectionExample, threeDSurfaceExample, torusAndArrow3DExample, tracedPathExample, valueTrackerExample };

export const manimExamples = [helloManimExample, basicShapesExample, textAndFormulasExample, sceneObjectManagementExample, entranceAndExitExample, shapeTransformExample, motionRotateScaleExample, emphasisAnimationsExample, linesArrowsVectorsExample, groupsAndLayoutExample, geometryAnnotationsExample, matrixAndTableExample, axesAndFunctionsExample, functionAreaExample, valueTrackerExample, dynamicRedrawExample, tracedPathExample, movingCameraExample, threeDObjectsExample, threeDSurfaceExample, arcsSectorsAnnulusExample, polygonsAndVerticesExample, formulaTransformExample, positionLayoutExample, objectStylesExample, growthAnimationsExample, animationOrchestrationExample, numberLineAndGridExample, followTargetExample, clearUpdaterExample, dynamicCounterExample, threeDSolidCollectionExample, torusAndArrow3DExample, threeDCameraMotionExample] as const;

const exampleById = new Map<string, (typeof manimExamples)[number]>(manimExamples.map((example) => [example.id, example]));

export const manimDifficultyOrder = ["intro", "basic", "intermediate", "advanced"] as const;
export type ManimDifficulty = (typeof manimDifficultyOrder)[number];

export const manimDifficultyLabels: Record<ManimDifficulty, string> = {
  intro: "入门",
  basic: "基础",
  intermediate: "进阶",
  advanced: "高级",
};

const difficultyById: Record<string, ManimDifficulty> = {
  "manim-hello": "intro",
  "manim-basic-shapes": "intro",
  "manim-text-formulas": "intro",
  "manim-scene-objects": "intro",
  "manim-entrance-exit": "intro",
  "manim-transform": "basic",
  "manim-motion": "basic",
  "manim-emphasis": "basic",
  "manim-lines-arrows": "basic",
  "manim-groups": "basic",
  "manim-annotations": "basic",
  "manim-matrix-table": "basic",
  "manim-axes-functions": "intermediate",
  "manim-graph-area": "intermediate",
  "manim-value-tracker": "intermediate",
  "manim-always-redraw": "intermediate",
  "manim-traced-path": "intermediate",
  "manim-moving-camera": "intermediate",
  "manim-3d-objects": "advanced",
  "manim-3d-surface": "advanced",
  "manim-arcs-sectors-annulus": "basic",
  "manim-polygons-vertices": "basic",
  "manim-formula-transform": "basic",
  "manim-position-layout": "basic",
  "manim-object-styles": "basic",
  "manim-growth-animations": "basic",
  "manim-animation-orchestration": "intermediate",
  "manim-number-line-grid": "intermediate",
  "manim-follow-target": "intermediate",
  "manim-clear-updater": "intermediate",
  "manim-dynamic-counter": "intermediate",
  "manim-3d-solid-collection": "advanced",
  "manim-torus-arrow3d": "advanced",
  "manim-3d-camera-motion": "advanced",
};

const manimExamplePlan: ExampleCatalogItem[] = [
  { id: "manim-hello", title: "Hello Manim", example: helloManimExample },
  { id: "manim-basic-shapes", title: "基础几何图形", example: basicShapesExample },
  { id: "manim-text-formulas", title: "文本与数学公式", example: textAndFormulasExample },
  { id: "manim-scene-objects", title: "场景对象管理", example: sceneObjectManagementExample },
  { id: "manim-entrance-exit", title: "入场与出场动画", example: entranceAndExitExample },
  { id: "manim-transform", title: "图形变换", example: shapeTransformExample },
  { id: "manim-motion", title: "移动旋转缩放", example: motionRotateScaleExample },
  { id: "manim-emphasis", title: "强调动画", example: emphasisAnimationsExample },
  { id: "manim-lines-arrows", title: "线条箭头与向量", example: linesArrowsVectorsExample },
  { id: "manim-groups", title: "群组与排列", example: groupsAndLayoutExample },
  { id: "manim-annotations", title: "几何标注" },
  { id: "manim-matrix-table", title: "矩阵与表格" },
  { id: "manim-axes-functions", title: "坐标轴与函数图像" },
  { id: "manim-graph-area", title: "函数面积" },
  { id: "manim-value-tracker", title: "数值追踪器" },
  { id: "manim-always-redraw", title: "动态重绘" },
  { id: "manim-traced-path", title: "运动轨迹" },
  { id: "manim-moving-camera", title: "移动相机" },
  { id: "manim-3d-objects", title: "3D 图形与相机" },
  { id: "manim-3d-surface", title: "三维曲面" },
];

const additionalManimExamples: ExampleCatalogItem[] = [
  { id: "manim-arcs-sectors-annulus", title: "圆弧、扇形与圆环" },
  { id: "manim-polygons-vertices", title: "多边形与顶点" },
  { id: "manim-formula-transform", title: "LaTeX 公式变换" },
  { id: "manim-position-layout", title: "位置与相邻布局" },
  { id: "manim-object-styles", title: "颜色、填充与描边" },
  { id: "manim-growth-animations", title: "生长动画" },
  { id: "manim-animation-orchestration", title: "多动画编排" },
  { id: "manim-number-line-grid", title: "数轴与平面网格" },
  { id: "manim-follow-target", title: "对象跟随" },
  { id: "manim-clear-updater", title: "清除更新器" },
  { id: "manim-dynamic-counter", title: "动态数字计数" },
  { id: "manim-3d-solid-collection", title: "3D 实体组合" },
  { id: "manim-torus-arrow3d", title: "圆环面与 3D 箭头" },
  { id: "manim-3d-camera-motion", title: "3D 相机运动" },
];

export const manimExampleCatalog: ExampleCatalogItem[] = [...manimExamplePlan, ...additionalManimExamples].map((item) => ({
  ...item,
  example: exampleById.get(item.id),
  difficulty: difficultyById[item.id],
}));
