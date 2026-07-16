export type ExampleProject = {
  id: string;
  title: string;
  projectName: string;
  workspace: object;
  requiredPlugins?: string[];
};

export type ExampleCatalogItem = {
  id: string;
  title: string;
  example?: ExampleProject;
  difficulty?: "intro" | "basic" | "intermediate" | "advanced" | "practical";
};
