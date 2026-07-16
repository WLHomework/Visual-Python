import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generatePython, generateWorkspacePythonWithBlockMap } from "../../pythonBlocks";
import { validatePythonBlockContexts } from "../../pythonSyntaxBlocks";
import { manimPlugin } from "../../plugins/builtin/manim";
import { PluginRegistry } from "../../plugins/core/pluginRegistry";
import { animationOrchestrationExample, arcsSectorsAnnulusExample, axesAndFunctionsExample, basicShapesExample, clearUpdaterExample, dynamicCounterExample, dynamicRedrawExample, emphasisAnimationsExample, entranceAndExitExample, followTargetExample, formulaTransformExample, functionAreaExample, geometryAnnotationsExample, groupsAndLayoutExample, growthAnimationsExample, helloManimExample, linesArrowsVectorsExample, manimExampleCatalog, manimExamples, matrixAndTableExample, motionRotateScaleExample, movingCameraExample, numberLineAndGridExample, objectStylesExample, polygonsAndVerticesExample, positionLayoutExample, sceneObjectManagementExample, shapeTransformExample, textAndFormulasExample, threeDCameraMotionExample, threeDObjectsExample, threeDSolidCollectionExample, threeDSurfaceExample, torusAndArrow3DExample, tracedPathExample, valueTrackerExample } from ".";

beforeAll(async () => {
  const registry = new PluginRegistry();
  registry.register(manimPlugin);
  await registry.activate(manimPlugin.manifest.id);
});

describe("Manim examples", () => {
  it("keeps every Manim example free of Python editor validation problems", () => {
    for (const example of manimExamples) {
      const workspace = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(example.workspace, workspace);
      expect(validatePythonBlockContexts(workspace), example.title).toEqual([]);
      const mapped = generateWorkspacePythonWithBlockMap(workspace);
      const withoutMarkers = mapped.code.split("\n").filter((line) => !line.trimStart().startsWith("# __visual_python_block_")).join("\n");
      expect(withoutMarkers, `${example.title} mapped code`).toBe(generatePython(example.workspace));
      workspace.dispose();
    }
  });

  it("registers the complete 20-example plan", () => {
    expect(manimExampleCatalog).toHaveLength(34);
    expect(manimExamples).toHaveLength(34);
    expect(manimExampleCatalog.filter((item) => item.example)).toHaveLength(34);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "intro")).toHaveLength(5);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "basic")).toHaveLength(13);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "intermediate")).toHaveLength(11);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "advanced")).toHaveLength(5);
    expect(manimExampleCatalog.every((item) => item.difficulty)).toBe(true);
  });

  it("generates a runnable Hello Manim scene", () => {
    const code = generatePython(helloManimExample.workspace);
    expect(code).toContain("from manim import *");
    expect(code).toContain("class HelloManim(Scene):");
    expect(code).toContain("title = Text(\n        'Hello Manim',\n        font_size=56,\n        color=BLUE,\n    )");
    expect(code).toContain("self.play(Write(title, run_time=1.5))");
    expect(code).toContain("self.wait(1)");
  });

  it("generates three positioned geometric shapes", () => {
    const code = generatePython(basicShapesExample.workspace);
    expect(code).toContain("class BasicShapes(Scene):");
    expect(code).toContain("circle = Circle(radius=1, color=BLUE).shift(LEFT * 3)");
    expect(code).toContain("square = Square(side_length=2, color=GREEN)");
    expect(code).toContain("triangle = Triangle(color=YELLOW).shift(RIGHT * 3)");
    expect(code).toContain("*[Create(circle, run_time=1), Create(square, run_time=1), Create(triangle, run_time=1)]");
  });

  it("generates Text, Tex, and MathTex objects", () => {
    const code = generatePython(textAndFormulasExample.workspace);
    expect(code).toContain("class TextAndFormulas(Scene):");
    expect(code).toContain("Text(\n        'Visual Python',\n        font_size=48,\n        color=BLUE,\n    ).shift(UP * 2)");
    expect(code).toContain("Tex(\n        'Manim with LaTeX',\n        font_size=42,\n        color=GREEN,\n    )");
    expect(code).toContain("MathTex(\n        'x^2 + y^2 = z^2',\n        font_size=48,\n        color=YELLOW,\n    ).shift(DOWN * 2)");
    expect(code).toContain("*[Write(title, run_time=1), Write(tex_line, run_time=1), Write(formula, run_time=1)]");
  });

  it("generates add, remove, and clear scene operations", () => {
    const code = generatePython(sceneObjectManagementExample.workspace);
    expect(code).toContain("class SceneObjects(Scene):");
    expect(code).toMatch(/self\.add\(\s+circle,\s+square,\s+\)/);
    expect(code).toContain("self.remove(circle)");
    expect(code).toContain("self.add(circle)");
    expect(code).toContain("self.clear()");
  });

  it("generates paired entrance and exit animations", () => {
    const code = generatePython(entranceAndExitExample.workspace);
    expect(code).toContain("class EntranceAndExit(Scene):");
    expect(code).toContain("Create(circle, run_time=1)");
    expect(code).toContain("FadeIn(square, shift=UP, scale=0.5, run_time=1)");
    expect(code).toContain("FadeOut(circle, shift=DOWN, scale=0.5, run_time=1)");
    expect(code).toContain("Uncreate(square, run_time=1)");
  });

  it("generates transform and replacement transform animations", () => {
    const code = generatePython(shapeTransformExample.workspace);
    expect(code).toContain("class ShapeTransform(Scene):");
    expect(code).toContain("Transform(circle, square, run_time=1.5)");
    expect(code).toContain("ReplacementTransform(circle, triangle, run_time=1.5)");
  });

  it("generates animate shift, rotate, and scale operations", () => {
    const code = generatePython(motionRotateScaleExample.workspace);
    expect(code).toContain("class MotionRotateScale(Scene):");
    expect(code).toContain("square.animate(run_time=1.5).shift(RIGHT * 6)");
    expect(code).toContain("square.animate(run_time=1).rotate(90 * DEGREES)");
    expect(code).toContain("square.animate(run_time=1).scale(0.5)");
  });

  it("generates indicate, circumscribe, and wiggle emphasis animations", () => {
    const code = generatePython(emphasisAnimationsExample.workspace);
    expect(code).toContain("class EmphasisAnimations(Scene):");
    expect(code).toContain("Indicate(label, scale_factor=1.25, color=YELLOW, run_time=1)");
    expect(code).toContain("Circumscribe(label, shape=Rectangle, buff=0.15, color=BLUE, run_time=1)");
    expect(code).toContain("Wiggle(label, scale_value=1.1, rotation_angle=8 * DEGREES, n_wiggles=6, run_time=1.5)");
  });

  it("generates line, arrow, and vector objects", () => {
    const code = generatePython(linesArrowsVectorsExample.workspace);
    expect(code).toContain("class LinesArrowsVectors(Scene):");
    expect(code).toContain("Line([-2, 0, 0], [2, 0, 0], color=BLUE).shift(UP * 2)");
    expect(code).toContain("Arrow(\n        [-2, 0, 0],\n        [2, 0, 0],\n        buff=0,\n        color=GREEN,");
    expect(code).toContain("Vector([2, 1, 0], color=YELLOW).shift(DOWN * 2)");
  });

  it("generates a VGroup with arrange and next_to layout", () => {
    const code = generatePython(groupsAndLayoutExample.workspace);
    expect(code).toContain("class GroupsAndLayout(Scene):");
    expect(code).toContain("VGroup(*[Circle(radius=0.8, color=BLUE), Square(side_length=1.6, color=GREEN), Triangle(color=YELLOW)]).arrange(");
    expect(code).toContain("RIGHT,\n        buff=0.75,\n        center=True,");
    expect(code).toContain(".next_to(\n        shapes,\n        UP,\n        buff=0.6,");
  });

  it("generates geometry annotation objects", () => {
    const code = generatePython(geometryAnnotationsExample.workspace);
    expect(code).toContain("class GeometryAnnotations(Scene):");
    expect(code).toContain("RightAngle(base, vertical, length=0.35, color=YELLOW)");
    expect(code).toContain("BraceLabel(base, '3 units', brace_direction=DOWN)");
  });

  it("generates native list data for matrix and table objects", () => {
    const code = generatePython(matrixAndTableExample.workspace);
    expect(code).toContain("matrix = Matrix([[1, 2], [3, 4]])");
    expect(code).toContain("table = Table([['A', 'B'], ['C', 'D']])");
    expect(code).toContain("add_highlighted_cell((2, 1), color=YELLOW)");
  });

  it("generates axes, function graph, labels, and area", () => {
    const axesCode = generatePython(axesAndFunctionsExample.workspace);
    expect(axesCode).toContain("axes.plot(lambda x: 0.5 * x**2, x_range=[-3, 3], color=BLUE)");
    expect(axesCode).toContain("axes.get_axis_labels(x_label='x', y_label='y')");
    const areaCode = generatePython(functionAreaExample.workspace);
    expect(areaCode).toContain("axes.get_area(graph, x_range=[-2, 2], color=BLUE)");
  });

  it("generates tracker and dynamic redraw examples", () => {
    const trackerCode = generatePython(valueTrackerExample.workspace);
    expect(trackerCode).toContain("tracker = ValueTracker(0)");
    expect(trackerCode).toContain("tracker.animate.set_value(10)");
    const redrawCode = generatePython(dynamicRedrawExample.workspace);
    expect(redrawCode).toContain("always_redraw(lambda: Dot(RIGHT * tracker.get_value(), color=YELLOW))");
  });

  it("generates traced path and moving camera examples", () => {
    const pathCode = generatePython(tracedPathExample.workspace);
    expect(pathCode).toContain("TracedPath(dot.get_center, stroke_color=YELLOW, stroke_width=4)");
    const cameraCode = generatePython(movingCameraExample.workspace);
    expect(cameraCode).toContain("class MovingCameraDemo(MovingCameraScene):");
    expect(cameraCode).toContain("self.camera.frame.animate(run_time=2).scale(0.6).move_to(square)");
  });

  it("generates 3D objects, camera controls, and a parametric surface", () => {
    const objectsCode = generatePython(threeDObjectsExample.workspace);
    expect(objectsCode).toContain("class ThreeDObjects(ThreeDScene):");
    expect(objectsCode).toContain("self.begin_ambient_camera_rotation(rate=0.15)");
    expect(objectsCode).toContain("self.stop_ambient_camera_rotation()");
    const surfaceCode = generatePython(threeDSurfaceExample.workspace);
    expect(surfaceCode).toContain("Surface(");
    expect(surfaceCode).toContain("lambda u, v: np.array([u, v, 0.5 * np.sin(u) * np.cos(v)])");
    expect(surfaceCode).toContain("resolution=(24, 24)");
  });

  it("generates arc, sector, and annulus objects", () => {
    const code = generatePython(arcsSectorsAnnulusExample.workspace);
    expect(code).toContain("Arc(");
    expect(code).toContain("angle=240 * DEGREES");
    expect(code).toContain("Sector(");
    expect(code).toContain("radius=1.2");
    expect(code).not.toContain("Sector(\n        outer_radius=");
    expect(code).toContain("Annulus(");
    expect(code).toContain(".shift(LEFT * 3)");
    expect(code).toContain(".shift(RIGHT * 3)");
  });

  it("generates regular and custom vertex polygons", () => {
    const code = generatePython(polygonsAndVerticesExample.workspace);
    expect(code).toContain("RegularPolygon(");
    expect(code).toContain("Polygon(*[[-1, -1, 0], [0, 1.4, 0], [1.4, 0.5, 0], [1, -1, 0]], color=YELLOW)");
  });

  it("generates a LaTeX formula transform", () => {
    const code = generatePython(formulaTransformExample.workspace);
    expect(code).toContain("'a^2 + b^2 = c^2'");
    expect(code).toContain("'c = \\\\sqrt{a^2 + b^2}'");
    expect(code).toContain("Transform(formula, target, run_time=2)");
  });

  it("generates edge, corner, and adjacent positioning", () => {
    const code = generatePython(positionLayoutExample.workspace);
    expect(code).toContain(".to_edge(UP, buff=0.4)");
    expect(code).toContain(".next_to(");
    expect(code).toContain(".to_corner(UR, buff=0.4)");
  });

  it("generates chained fill, stroke, and opacity styles", () => {
    const code = generatePython(objectStylesExample.workspace);
    expect(code).toContain(".set_fill(");
    expect(code).toContain(".set_stroke(");
    expect(code).toContain(".set_opacity(0.9)");
  });

  it("generates three distinct growth animations", () => {
    const code = generatePython(growthAnimationsExample.workspace);
    expect(code).toContain("GrowFromCenter(circle, run_time=1)");
    expect(code).toContain("SpinInFromNothing(square, angle=180 * DEGREES, run_time=1)");
    expect(code).toContain("GrowArrow(arrow, run_time=1.5)");
  });

  it("generates staggered animation orchestration", () => {
    const code = generatePython(animationOrchestrationExample.workspace);
    expect(code).toContain("*[GrowFromCenter(circle, run_time=1), SpinInFromNothing(square, angle=180 * DEGREES, run_time=1), FadeIn(triangle, shift=UP * 1, scale=0.5, run_time=1)]");
    expect(code).toContain("lag_ratio=0.4");
  });

  it("generates a number line over a plane grid", () => {
    const code = generatePython(numberLineAndGridExample.workspace);
    expect(code).toContain("NumberPlane(");
    expect(code).toContain("NumberLine(");
    expect(code).toContain(".shift(DOWN * 2.3)");
  });

  it("generates a target-following updater", () => {
    const code = generatePython(followTargetExample.workspace);
    expect(code).toContain("label.add_updater(lambda m: m.next_to(dot, UP))");
    expect(code).toContain("dot.animate(run_time=3).shift(RIGHT * 6)");
  });

  it("generates updater removal before continued movement", () => {
    const code = generatePython(clearUpdaterExample.workspace);
    expect(code).toContain("label.clear_updaters()");
    expect(code.indexOf("label.clear_updaters()")).toBeGreaterThan(code.indexOf("dot.animate(run_time=1.5).shift(RIGHT * 3)"));
  });

  it("generates a dynamic integer counter", () => {
    const code = generatePython(dynamicCounterExample.workspace);
    expect(code).toContain("DecimalNumber(tracker.get_value(), num_decimal_places=0)");
    expect(code).toContain("tracker.animate.set_value(100)");
  });

  it("generates a spaced collection of 3D solids", () => {
    const code = generatePython(threeDSolidCollectionExample.workspace);
    expect(code).toContain("Cube(");
    expect(code).toContain("Sphere(");
    expect(code).toContain("Cone(");
    expect(code).toContain(".shift(LEFT * 3)");
    expect(code).toContain(".shift(RIGHT * 3)");
  });

  it("generates a torus and a 3D arrow", () => {
    const code = generatePython(torusAndArrow3DExample.workspace);
    expect(code).toContain("Torus(");
    expect(code).toContain("major_radius=1.6");
    expect(code).toContain("Arrow3D(");
    expect(code).toContain("[2.5, 1.5, 2]");
  });

  it("generates a complete 3D camera movement sequence", () => {
    const code = generatePython(threeDCameraMotionExample.workspace);
    expect(code).toContain("self.set_camera_orientation(phi=60 * DEGREES, theta=-45 * DEGREES, distance=9)");
    expect(code).toContain("self.move_camera(phi=75 * DEGREES, theta=45 * DEGREES, distance=7, run_time=3)");
    expect(code).toContain("self.begin_ambient_camera_rotation(rate=0.15)");
    expect(code).toContain("self.stop_ambient_camera_rotation()");
  });

  it("keeps connected scene classes at the Python top level", () => {
    const workspace = { blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_manim_scene", fields: { NAME: "FirstScene", SCENE_TYPE: "Scene" },
      next: { block: { type: "visual_python_manim_scene", fields: { NAME: "SecondScene", SCENE_TYPE: "Scene" } } },
    }] } };
    const code = generatePython(workspace);
    expect(code).toContain("class FirstScene(Scene):");
    expect(code).toContain("\n\nclass SecondScene(Scene):");
    expect(code).not.toContain("\n  class SecondScene");
  });
});
