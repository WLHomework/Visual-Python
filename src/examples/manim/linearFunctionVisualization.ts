import type { ExampleProject } from "../types";
import projectSource from "./projects/linearFunctionVisualization.vpy?raw";
import { upgradeMathFormulaInputs } from "./formulaWorkspace";

type SavedProject = {
  workspace: object;
};

const savedProject = JSON.parse(projectSource) as SavedProject;

export const linearFunctionVisualizationExample: ExampleProject = {
  id: "manim-linear-function-visualization",
  title: "一次函数动态讲解",
  projectName: "linear-function-visualization.vpy",
  requiredPlugins: ["visual-python.manim"],
  workspace: upgradeMathFormulaInputs(savedProject.workspace),
};
