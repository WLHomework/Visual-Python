import type { ExampleCatalogItem } from "../types";
import { advancedFunctionsExample } from "./advancedFunctions";
import { arithmeticExample } from "./arithmetic";
import { assignmentAndUnpackingExample } from "./assignmentAndUnpacking";
import { asyncBasicsExample } from "./asyncBasics";
import { classesExample } from "./classes";
import { comparisonLogicExample } from "./comparisonLogic";
import { conditionExample } from "./condition";
import { dictionaryExample } from "./dictionary";
import { exceptionsExample } from "./exceptions";
import { fileIoExample } from "./fileIo";
import { formattedTextExample } from "./formattedText";
import { functionsExample } from "./functions";
import { generatorsExample } from "./generators";
import { helloPythonExample } from "./helloPython";
import { inputAndVariableExample } from "./inputAndVariable";
import { importsAndContextsExample } from "./importsAndContexts";
import { listIterationExample } from "./listIteration";
import { listOperationsExample } from "./listOperations";
import { loopControlExample } from "./loopControl";
import { multiBranchExample } from "./multiBranch";
import { patternMatchingExample } from "./patternMatching";
import { repeatLoopExample } from "./repeatLoop";
import { stringProcessingExample } from "./stringProcessing";
import { tupleAndSetExample } from "./tupleAndSet";
import { typeConversionExample } from "./typeConversion";
import { typedFunctionsExample } from "./typedFunctions";
import { whileLoopExample } from "./whileLoop";

export {
  advancedFunctionsExample, arithmeticExample, assignmentAndUnpackingExample, asyncBasicsExample,
  classesExample, comparisonLogicExample, conditionExample,
  dictionaryExample, exceptionsExample, fileIoExample, functionsExample, helloPythonExample,
  formattedTextExample, generatorsExample, inputAndVariableExample, importsAndContextsExample,
  listIterationExample, listOperationsExample, loopControlExample, multiBranchExample,
  patternMatchingExample, repeatLoopExample, stringProcessingExample, tupleAndSetExample,
  typeConversionExample, typedFunctionsExample, whileLoopExample,
};

export const pythonExamples = [
  helloPythonExample, inputAndVariableExample, typeConversionExample, arithmeticExample,
  comparisonLogicExample, conditionExample, multiBranchExample, repeatLoopExample,
  listIterationExample, whileLoopExample, loopControlExample, listOperationsExample,
  tupleAndSetExample, dictionaryExample, stringProcessingExample, functionsExample,
  advancedFunctionsExample, exceptionsExample, fileIoExample, classesExample,
  assignmentAndUnpackingExample, formattedTextExample, generatorsExample, patternMatchingExample,
  typedFunctionsExample, asyncBasicsExample, importsAndContextsExample,
] as const;

export const pythonDifficultyOrder = ["intro", "basic", "intermediate", "advanced"] as const;
export type PythonDifficulty = (typeof pythonDifficultyOrder)[number];
export const pythonDifficultyLabels: Record<PythonDifficulty, string> = {
  intro: "入门",
  basic: "基础",
  intermediate: "进阶",
  advanced: "高级",
};

const pythonDifficultyById: Record<string, PythonDifficulty> = {
  "python-hello": "intro",
  "python-input-variable": "intro",
  "python-type-conversion": "intro",
  "python-arithmetic": "intro",
  "python-condition": "intro",
  "python-repeat": "intro",
  "python-comparison-logic": "basic",
  "python-multi-branch": "basic",
  "python-list-iteration": "basic",
  "python-while": "basic",
  "python-loop-control": "basic",
  "python-list-operations": "basic",
  "python-tuple-set": "basic",
  "python-dictionary": "basic",
  "python-string": "basic",
  "python-functions": "basic",
  "python-assignment-unpacking": "basic",
  "python-formatted-text": "basic",
  "python-advanced-functions": "intermediate",
  "python-exceptions": "intermediate",
  "python-files": "intermediate",
  "python-classes": "intermediate",
  "python-generators": "intermediate",
  "python-pattern-matching": "intermediate",
  "python-typed-functions": "intermediate",
  "python-imports-contexts": "intermediate",
  "python-async-basics": "advanced",
};

const pythonExamplePlan: ExampleCatalogItem[] = [
  { id: "python-hello", title: "Hello Python", example: helloPythonExample },
  { id: "python-input-variable", title: "输入与变量", example: inputAndVariableExample },
  { id: "python-type-conversion", title: "数据类型转换", example: typeConversionExample },
  { id: "python-arithmetic", title: "四则运算", example: arithmeticExample },
  { id: "python-comparison-logic", title: "比较与逻辑", example: comparisonLogicExample },
  { id: "python-condition", title: "条件判断", example: conditionExample },
  { id: "python-multi-branch", title: "多分支判断", example: multiBranchExample },
  { id: "python-repeat", title: "重复循环", example: repeatLoopExample },
  { id: "python-list-iteration", title: "遍历列表", example: listIterationExample },
  { id: "python-while", title: "while 循环", example: whileLoopExample },
  { id: "python-loop-control", title: "循环控制", example: loopControlExample },
  { id: "python-list-operations", title: "列表操作", example: listOperationsExample },
  { id: "python-tuple-set", title: "元组与集合", example: tupleAndSetExample },
  { id: "python-dictionary", title: "字典操作", example: dictionaryExample },
  { id: "python-string", title: "字符串处理", example: stringProcessingExample },
  { id: "python-functions", title: "定义与调用函数", example: functionsExample },
  { id: "python-advanced-functions", title: "函数进阶", example: advancedFunctionsExample },
  { id: "python-exceptions", title: "异常处理", example: exceptionsExample },
  { id: "python-files", title: "文件读写", example: fileIoExample },
  { id: "python-classes", title: "类与对象", example: classesExample },
  { id: "python-assignment-unpacking", title: "赋值与解包", example: assignmentAndUnpackingExample },
  { id: "python-formatted-text", title: "格式化与多行文本", example: formattedTextExample },
  { id: "python-generators", title: "生成器", example: generatorsExample },
  { id: "python-pattern-matching", title: "模式匹配", example: patternMatchingExample },
  { id: "python-typed-functions", title: "类型函数", example: typedFunctionsExample },
  { id: "python-async-basics", title: "异步基础", example: asyncBasicsExample },
  { id: "python-imports-contexts", title: "导入与上下文", example: importsAndContextsExample },
];

export const pythonExampleCatalog: ExampleCatalogItem[] = pythonExamplePlan.map((item) => ({
  ...item,
  difficulty: pythonDifficultyById[item.id],
}));
