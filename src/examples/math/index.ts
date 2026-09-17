import type { ExampleCatalogItem } from "../types";
import { algebraTilesExample } from "./algebraTiles";
import { intersectingAndParallelExample } from "./intersectingAndParallel";
import { likeTermsExample } from "./likeTerms";
import { parallelLineAnglesExample } from "./parallelLineAngles";

export { algebraTilesExample, intersectingAndParallelExample, likeTermsExample, parallelLineAnglesExample };

export const mathExamples = [
  likeTermsExample,
  algebraTilesExample,
  parallelLineAnglesExample,
  intersectingAndParallelExample,
] as const;

export const mathDifficultyOrder = ["algebra", "geometry"] as const;
export type MathDifficulty = (typeof mathDifficultyOrder)[number];

export const mathDifficultyLabels: Record<MathDifficulty, string> = {
  algebra: "代数",
  geometry: "相交线与平行线",
};

const difficultyById: Record<string, MathDifficulty> = {
  "math-like-terms": "algebra",
  "math-algebra-tiles": "algebra",
  "math-parallel-line-angles": "algebra",
  "math-intersecting-and-parallel": "geometry",
};

const mathExamplePlan: ExampleCatalogItem[] = [
  { id: "math-like-terms", title: "单项式、多项式与同类项", example: likeTermsExample },
  { id: "math-algebra-tiles", title: "整式乘法：代数瓷砖", example: algebraTilesExample },
  { id: "math-parallel-line-angles", title: "平行线的同位角、内错角、同旁内角", example: parallelLineAnglesExample },
  { id: "math-intersecting-and-parallel", title: "相交线与平行线", example: intersectingAndParallelExample },
];

export const mathExampleCatalog: ExampleCatalogItem[] = mathExamplePlan.map((item) => ({
  ...item,
  difficulty: difficultyById[item.id],
}));
