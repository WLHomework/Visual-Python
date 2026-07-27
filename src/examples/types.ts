import type { PluginProjectState } from "../plugins/api/types";

export type ExampleProject = {
  id: string;
  title: string;
  projectName: string;
  workspace: object;
  requiredPlugins?: string[];
  plugins?: PluginProjectState;
};

export type ExampleCatalogItem = {
  id: string;
  title: string;
  example?: ExampleProject;
  difficulty?: "intro" | "basic" | "intermediate" | "advanced" | "practical" | "narrated";
};
