import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generatePython, generateWorkspacePythonWithBlockMap } from "../../pythonBlocks";
import { validatePythonBlockContexts } from "../../pythonSyntaxBlocks";
import { manimPlugin } from "../../plugins/builtin/manim";
import { parseVoiceoverMarker } from "../../plugins/builtin/manim/voiceoverMarkers";
import { PluginRegistry } from "../../plugins/core/pluginRegistry";
import { animationOrchestrationExample, arcsSectorsAnnulusExample, axesAndFunctionsExample, basicShapesExample, bubbleSortVisualizationExample, circleTangentTheoremExample, clearUpdaterExample, definiteIntegralAreaExample, dynamicCounterExample, dynamicRedrawExample, emphasisAnimationsExample, entranceAndExitExample, followTargetExample, formulaTransformExample, functionAreaExample, geometryAnnotationsExample, groupsAndLayoutExample, growthAnimationsExample, helloManimExample, linearFunctionVisualizationExample, linesArrowsVectorsExample, manimExampleCatalog, manimExamples, matrixAndTableExample, motionRotateScaleExample, movingCameraExample, narratedBinarySearchExample, narratedCircleAreaExample, narratedCompoundInterestExample, narratedDayNightCycleExample, narratedDerivativeGeometryExample, narratedDiceFrequencyExample, narratedDnaReplicationExample, narratedElectronShellsExample, narratedEulerFormulaExample, narratedGradientDescentExample, narratedHarmonicMotionExample, narratedLeverTorqueExample, narratedLimitDialogueExample, narratedLinearFunctionExample, narratedMatrixTransformationExample, narratedMeanAndOutlierExample, narratedPacketEncapsulationExample, narratedPerfectSquareFormulaExample, narratedPlanetaryOrbitExample, narratedProjectileMotionExample, narratedPythagoreanTheoremExample, narratedQuadraticVertexExample, narratedReflectionRefractionExample, narratedRiemannSumExample, narratedSeriesParallelCircuitsExample, narratedStackOperationsExample, narratedSupplyDemandExample, narratedTriangleAngleSumExample, narratedUnitCircleExample, narratedVectorAdditionExample, numberLineAndGridExample, objectStylesExample, polygonsAndVerticesExample, positionLayoutExample, pythagoreanTheoremExample, quadraticFunctionParametersExample, sceneObjectManagementExample, shapeTransformExample, textAndFormulasExample, threeDCameraMotionExample, threeDObjectsExample, threeDSolidCollectionExample, threeDSurfaceExample, torusAndArrow3DExample, tracedPathExample, valueTrackerExample, vectorAdditionExample } from ".";

const registry = new PluginRegistry();

beforeAll(async () => {
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
    expect(manimExampleCatalog).toHaveLength(71);
    expect(manimExamples).toHaveLength(71);
    expect(manimExampleCatalog.filter((item) => item.example)).toHaveLength(71);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "intro")).toHaveLength(5);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "basic")).toHaveLength(13);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "intermediate")).toHaveLength(11);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "advanced")).toHaveLength(5);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "practical")).toHaveLength(7);
    expect(manimExampleCatalog.filter((item) => item.difficulty === "narrated")).toHaveLength(30);
    expect(manimExampleCatalog.every((item) => item.difficulty)).toBe(true);
  });

  it("generates the narrated circle-area teaching case", () => {
    const code = generatePython(narratedCircleAreaExample.workspace);
    expect(code).toContain("class NarratedCircleArea(Scene):");
    expect(code).toContain("S=\\\\pi r^2");
    expect(code).toContain("visual-python-tts:begin:");
    expect(code).toContain("visual-python-tts:cue:");
  });

  it("generates the narrated linear-function teaching case", () => {
    const code = generatePython(narratedLinearFunctionExample.workspace);
    expect(code).toContain("class NarratedLinearFunction(Scene):");
    expect(code).toContain("lambda x: x + 1");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
    expect(code).toContain("visual-python-tts:cue:");
  });

  it("generates the narrated Pythagorean-theorem teaching case", () => {
    const code = generatePython(narratedPythagoreanTheoremExample.workspace);
    expect(code).toContain("class NarratedPythagoreanTheorem(Scene):");
    expect(code).toContain("a^2+b^2=c^2");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code).toContain("visual-python-tts:cue:");
  });

  it("generates the narrated quadratic-vertex teaching case", () => {
    const code = generatePython(narratedQuadraticVertexExample.workspace);
    expect(code).toContain("class NarratedQuadraticVertex(Scene):");
    expect(code).toContain("lambda x: (x - 1)**2 + 2");
    expect(code).toContain("x_range=[-1.3, 3.3]");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(3);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(2);
  });

  it("generates the narrated limit-dialogue teaching case with both roles", () => {
    registry.clearProjectData();
    registry.loadProjectData(narratedLimitDialogueExample.plugins);
    const code = generatePython(narratedLimitDialogueExample.workspace);
    const markers = code.split("\n").map(parseVoiceoverMarker).filter((marker) => marker !== null);
    expect(code).toContain("class NarratedLimitDialogue(Scene):");
    expect(code).toContain("lambda x: x + 1");
    expect(code).toContain("\\\\lim_{x\\\\to1}(x+1)=2");
    expect(markers.some((marker) => marker?.payload?.roleId === "teacher")).toBe(true);
    expect(markers.some((marker) => marker?.payload?.roleId === "student")).toBe(true);
    registry.clearProjectData();
  });

  it("generates the narrated compound-interest teaching case", () => {
    const code = generatePython(narratedCompoundInterestExample.workspace);
    expect(code).toContain("class NarratedCompoundInterest(Scene):");
    expect(code).toContain("A=P(1+r)^n");
    expect(code).toContain("height=2.928");
    expect(code).toContain("1464.1");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated projectile-motion teaching case", () => {
    const code = generatePython(narratedProjectileMotionExample.workspace);
    expect(code).toContain("class NarratedProjectileMotion(Scene):");
    expect(code).toContain("lambda x: -0.25 * x**2 + 2.5");
    expect(code).toContain("v_x");
    expect(code).toContain("v_y=0");
    expect(code).toContain("ball.animate(run_time=1.2).move_to(axes.c2p(4, -1.5))");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated mean-and-outlier teaching case", () => {
    const code = generatePython(narratedMeanAndOutlierExample.workspace);
    expect(code).toContain("class NarratedMeanAndOutlier(Scene):");
    expect(code).toContain("height=4");
    expect(code).toContain("\\\\bar{x}=\\\\frac{4+5+5+6+5}{5}=5");
    expect(code).toContain("\\\\bar{x}=\\\\frac{4+5+5+6+5+20}{6}=7.5");
    expect(code).toContain("Transform(mean_before, mean_after, run_time=1.2)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated dice-frequency teaching case", () => {
    const code = generatePython(narratedDiceFrequencyExample.workspace);
    expect(code).toContain("class NarratedDiceFrequency(Scene):");
    expect(code).toContain("lambda x: 1 / 6");
    expect(code).toContain("P(6)=\\\\frac{1}{6}\\\\approx0.167");
    expect(code).toContain("axes.c2p(5, 0.168)");
    expect(code).toContain("0.168");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated triangle-angle-sum proof", () => {
    const code = generatePython(narratedTriangleAngleSumExample.workspace);
    expect(code).toContain("class NarratedTriangleAngleSum(Scene):");
    expect(code).toContain("Arc(\n        radius=1.25,\n        angle=42.6 * DEGREES");
    expect(code).toContain(".rotate(42.6 * DEGREES)");
    expect(code).toContain(".rotate(100.5 * DEGREES)");
    expect(code).toContain("\\\\alpha+\\\\beta+\\\\gamma=180^\\\\circ");
    expect(code.match(/TransformFromCopy/g)).toHaveLength(3);
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated perfect-square-formula proof", () => {
    const code = generatePython(narratedPerfectSquareFormulaExample.workspace);
    expect(code).toContain("class NarratedPerfectSquareFormula(Scene):");
    expect(code).toContain("side_length=4");
    expect(code).toContain("width=2.6");
    expect(code).toContain("height=1.4");
    expect(code).toContain("(a+b)^2=a^2+2ab+b^2");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated Riemann-sum teaching case", () => {
    const code = generatePython(narratedRiemannSumExample.workspace);
    expect(code).toContain("class NarratedRiemannSum(Scene):");
    expect(code).toContain("lambda x: 0.25 * x**2 + 1");
    expect(code).toContain("coarse_rectangles = VGroup(");
    expect(code).toContain("fine_rectangles = VGroup(");
    expect(code).toContain("Transform(coarse_rectangles, fine_rectangles, run_time=1.5)");
    expect(code).toContain("axes.get_area(graph, x_range=[0, 4], color=PURPLE)");
    expect(code).toContain("\\\\int_0^4 f(x)\\\\,dx");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(2);
  });

  it("generates the narrated matrix-transformation teaching case", () => {
    const code = generatePython(narratedMatrixTransformationExample.workspace);
    expect(code).toContain("class NarratedMatrixTransformation(Scene):");
    expect(code).toContain(".apply_matrix([[1, 0.7], [0, 1]])");
    expect(code).toContain("Transform(original_plane, transformed_plane, run_time=1.8)");
    expect(code).toContain("Transform(original_vector, transformed_vector, run_time=1.2)");
    expect(code).toContain("A\\\\vec v=\\\\begin{bmatrix}2.7");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated Euler-formula teaching case", () => {
    const code = generatePython(narratedEulerFormulaExample.workspace);
    expect(code).toContain("class NarratedEulerFormula(Scene):");
    expect(code).toContain("e^{i\\\\theta}=\\\\cos\\\\theta+i\\\\sin\\\\theta");
    expect(code).toContain("e^{i\\\\pi}=-1");
    expect(code).toContain("Transform(vector_0, vector_180, run_time=1.2)");
    expect(code).toContain("Transform(point_0, point_180, run_time=0.5)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g) ?? []).toHaveLength(0);
  });

  it("generates the narrated harmonic-motion teaching case", () => {
    const code = generatePython(narratedHarmonicMotionExample.workspace);
    expect(code).toContain("class NarratedHarmonicMotion(Scene):");
    expect(code).toContain("lambda x: 1.5 * np.sin(x)");
    expect(code).toContain("y=A\\\\sin(\\\\omega t+\\\\varphi)");
    expect(code).toContain("Transform(oscillator_0, oscillator_270, run_time=0.4)");
    expect(code).toContain("Transform(circle_dot_0, circle_dot_270, run_time=0.4)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated binary-search teaching case", () => {
    const code = generatePython(narratedBinarySearchExample.workspace);
    expect(code).toContain("class NarratedBinarySearch(Scene):");
    expect(code).toContain("target}=31");
    expect(code).toContain("mid=15");
    expect(code).toContain("mid=31");
    expect(code).toContain("Transform(range_all, range_target, run_time=0.9)");
    expect(code).toContain("Transform(pointer_15, pointer_31, run_time=0.7)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated stack-operations teaching case", () => {
    const code = generatePython(narratedStackOperationsExample.workspace);
    expect(code).toContain("class NarratedStackOperations(Scene):");
    expect(code).toContain("push}(A),\\\\ push(B),\\\\ push(C)");
    expect(code).toContain("pop}()\\\\Rightarrow C");
    expect(code).toContain("Transform(item_c, popped_c, run_time=1.1)");
    expect(code).toContain("Transform(top_a, top_after_pop, run_time=0.6)");
    expect(code).not.toContain("popped_c = item_c.shift");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated packet-encapsulation teaching case", () => {
    const code = generatePython(narratedPacketEncapsulationExample.workspace);
    expect(code).toContain("class NarratedPacketEncapsulation(Scene):");
    expect(code).toContain("\\\\text{TCP}");
    expect(code).toContain("\\\\text{IP}");
    expect(code).toContain("\\\\text{ETH}");
    expect(code).toContain("Transform(application_data, link_frame, run_time=1.1)");
    expect(code).toContain("Transform(application_data, received_data, run_time=1.4)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated gradient-descent teaching case", () => {
    const code = generatePython(narratedGradientDescentExample.workspace);
    expect(code).toContain("class NarratedGradientDescent(Scene):");
    expect(code).toContain("lambda w: 0.25 * w**2");
    expect(code).toContain("w\\\\leftarrow w-\\\\eta\\\\frac{dJ}{dw}");
    expect(code).toContain("Transform(point_0, point_4, run_time=0.9)");
    expect(code).toContain("Transform(loss_0, loss_4, run_time=0.5)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated planetary-orbit teaching case", () => {
    const code = generatePython(narratedPlanetaryOrbitExample.workspace);
    expect(code).toContain("class NarratedPlanetaryOrbit(Scene):");
    expect(code).toContain("Ellipse(width=7, height=4, color=WHITE)");
    expect(code).toContain("v_{\\\\rm peri}>v_{\\\\rm ap}");
    expect(code).toContain("\\\\frac{dA}{dt}=\\\\text{constant}");
    expect(code).toContain("Transform(planet_peri, planet_return, run_time=1.2)");
    expect(code).toContain("Transform(speed_peri, speed_return, run_time=0.8)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated electron-shell teaching case", () => {
    const code = generatePython(narratedElectronShellsExample.workspace);
    expect(code).toContain("class NarratedElectronShells(Scene):");
    expect(code).toContain("\\\\mathrm{Na}\\\\rightarrow\\\\mathrm{Na}^{+}+e^{-}");
    expect(code).toContain("Transform(valence_electron, free_electron, run_time=1.4)");
    expect(code).toContain("FadeOut(shell_3, shift=[0, 0, 0], scale=0.8, run_time=0.7)");
    expect(code).toContain("Transform(atom_label, ion_label, run_time=0.8)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated DNA-replication teaching case", () => {
    const code = generatePython(narratedDnaReplicationExample.workspace);
    expect(code).toContain("class NarratedDnaReplication(Scene):");
    expect(code).toContain("A\\\\leftrightarrow T\\\\qquad C\\\\leftrightarrow G");
    expect(code).toContain("Transform(left_strand, left_template, run_time=1.1)");
    expect(code).toContain("Transform(right_strand, right_template, run_time=1.1)");
    expect(code).toContain("Create(left_complement, run_time=1.2)");
    expect(code).toContain("Create(right_complement, run_time=1.2)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated supply-and-demand teaching case", () => {
    const code = generatePython(narratedSupplyDemandExample.workspace);
    expect(code).toContain("class NarratedSupplyDemand(Scene):");
    expect(code).toContain("lambda q: -0.6 * q + 5");
    expect(code).toContain("lambda q: 0.6 * q + 1");
    expect(code).toContain("Transform(price_high, price_eq, run_time=0.9)");
    expect(code).toContain("Q_s=Q_d");
    expect(code).toContain("P^*=3,\\\\quad Q^*=3.33");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated day-and-night-cycle teaching case", () => {
    const code = generatePython(narratedDayNightCycleExample.workspace);
    expect(code).toContain("class NarratedDayNightCycle(Scene):");
    expect(code).toContain("Sector(\n        radius=2,\n        angle=180 * DEGREES");
    expect(code).toContain("Transform(point_noon, point_midnight, run_time=1)");
    expect(code).toContain("Transform(point_noon, point_return, run_time=1)");
    expect(code).toContain("Transform(noon_label, noon_return_label, run_time=0.6)");
    expect(code).toContain("24\\\\text{ h}\\\\rightarrow360^\\\\circ");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated series-and-parallel-circuits teaching case", () => {
    const code = generatePython(narratedSeriesParallelCircuitsExample.workspace);
    expect(code).toContain("class NarratedSeriesParallelCircuits(Scene):");
    expect(code).toContain("I=I_1=I_2");
    expect(code).toContain("V=V_1+V_2");
    expect(code).toContain("V=V_1=V_2");
    expect(code).toContain("I=I_1+I_2");
    expect(code).toContain("Create(series_current, run_time=0.8)");
    expect(code).toContain("Create(parallel_current, run_time=0.8)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated reflection-and-refraction teaching case", () => {
    const code = generatePython(narratedReflectionRefractionExample.workspace);
    expect(code).toContain("class NarratedReflectionRefraction(Scene):");
    expect(code).toContain("\\\\theta_i=\\\\theta_r");
    expect(code).toContain("n_1\\\\sin\\\\theta_i=n_2\\\\sin\\\\theta_t");
    expect(code).toContain("n_2>n_1\\\\Rightarrow\\\\theta_t<\\\\theta_i");
    expect(code).toContain("angle=53.1 * DEGREES");
    expect(code).toContain("angle=36.3 * DEGREES");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(6);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated lever-and-torque teaching case", () => {
    const code = generatePython(narratedLeverTorqueExample.workspace);
    expect(code).toContain("class NarratedLeverTorque(Scene):");
    expect(code).toContain("\\\\tau=F\\\\times r");
    expect(code).toContain("F_1\\\\cdot4>F_2\\\\cdot2");
    expect(code).toContain("F_1\\\\cdot4=(2F_1)\\\\cdot2");
    expect(code).toContain("Transform(beam_balanced, beam_tilted, run_time=1)");
    expect(code).toContain("Transform(beam_balanced, beam_return, run_time=1)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
    expect(code.match(/visual-python-tts:cue:/g)).toHaveLength(1);
  });

  it("generates the narrated derivative-geometry teaching case", () => {
    const code = generatePython(narratedDerivativeGeometryExample.workspace);
    expect(code).toContain("class NarratedDerivativeGeometry(Scene):");
    expect(code).toContain("lambda x: 0.5 * x**2");
    expect(code).toContain("Transform(secant, tangent, run_time=1.8)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(4);
  });

  it("generates the narrated vector-addition teaching case", () => {
    const code = generatePython(narratedVectorAdditionExample.workspace);
    expect(code).toContain("class NarratedVectorAddition(Scene):");
    expect(code).toContain("resultant = Arrow(");
    expect(code).toContain("\\\\vec{a}+\\\\vec{b}=(4,3)");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
  });

  it("generates the narrated unit-circle teaching case", () => {
    const code = generatePython(narratedUnitCircleExample.workspace);
    expect(code).toContain("class NarratedUnitCircle(Scene):");
    expect(code).toContain("\\\\sin60^\\\\circ=\\\\frac{\\\\sqrt3}{2}");
    expect(code).toContain("\\\\sin^2\\\\theta+\\\\cos^2\\\\theta=1");
    expect(code.match(/visual-python-tts:begin:/g)).toHaveLength(5);
  });

  it("generates the linear-function visualization project", () => {
    const code = generatePython(linearFunctionVisualizationExample.workspace);
    expect(code).toContain("class LinearFunctionVisualization(Scene):");
    expect(code).toContain("for k in k_values:");
    expect(code).toContain("for b in b_values:");
    expect(code).toContain("'stroke_color': GRAY");
    expect(code).toContain("-2: TEAL");
  });

  it("generates the practical teaching cases", () => {
    const pythagoreanCode = generatePython(pythagoreanTheoremExample.workspace);
    expect(pythagoreanCode).toContain("class PythagoreanTheorem(Scene):");
    expect(pythagoreanCode).toContain("Polygon(*[[-5, -2, 0], [-1, -2, 0], [-5, 1, 0]], color=YELLOW)");
    expect(pythagoreanCode).toContain("Transform(formula, result, run_time=1.5)");

    const vectorCode = generatePython(vectorAdditionExample.workspace);
    expect(vectorCode).toContain("class VectorAddition(Scene):");
    expect(vectorCode).toContain("axes.c2p(0, 0)");
    expect(vectorCode).toContain("resultant = Arrow(");

    const quadraticCode = generatePython(quadraticFunctionParametersExample.workspace);
    expect(quadraticCode).toContain("class QuadraticFunctionParameters(Scene):");
    expect(quadraticCode).toContain("lambda x: 0.5 * x**2");
    expect(quadraticCode).toContain("Transform(graph, shifted_graph, run_time=1.8)");

    const bubbleSortCode = generatePython(bubbleSortVisualizationExample.workspace);
    expect(bubbleSortCode).toContain("class BubbleSortVisualization(Scene):");
    expect(bubbleSortCode).toContain("Transform(state, state_4, run_time=1)");

    const tangentCode = generatePython(circleTangentTheoremExample.workspace);
    expect(tangentCode).toContain("class CircleTangentTheorem(Scene):");
    expect(tangentCode).toContain("RightAngle(radius, tangent, length=0.35, color=WHITE)");

    const integralCode = generatePython(definiteIntegralAreaExample.workspace);
    expect(integralCode).toContain("class DefiniteIntegralArea(Scene):");
    expect(integralCode).toContain("lambda x: 0.5 * x**2 + 1");
    expect(integralCode).toContain("axes.get_area(graph, x_range=[-2, 2], color=BLUE)");
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
