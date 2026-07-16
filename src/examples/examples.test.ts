import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generatePython, generateWorkspacePythonWithBlockMap } from "../pythonBlocks";
import { validatePythonBlockContexts } from "../pythonSyntaxBlocks";
import { arithmeticExample, helloPythonExample, inputAndVariableExample, pythonExampleCatalog, pythonExamples, typeConversionExample } from "./python";

const expectedPython: Record<string, string> = {
  "python-hello": "print('Hello, Python!')\n",
  "python-input-variable": "name = input('请输入你的名字：')\nprint(name)\n",
  "python-type-conversion": "age_text = input('请输入年龄：')\nage = int(age_text)\nprint(age)\n",
  "python-arithmetic": "a = 17\nb = 5\nprint(a + b)\nprint(a - b)\nprint(a * b)\nprint(a / b)\nprint(a // b)\nprint(a % b)\nprint(a ** b)\n",
  "python-comparison-logic": "age = 18\nhas_ticket = True\nprint(age >= 18 and has_ticket)\nprint(not age < 18)\n",
  "python-condition": "score = input('请输入成绩：')\nscore = int(score)\nif score >= 60:\n  print('及格')\nelse:\n  print('需要继续努力')\n",
  "python-multi-branch": "score = 85\nif score >= 90:\n  print('优秀')\nelif score >= 60:\n  print('及格')\nelse:\n  print('不及格')\n",
  "python-repeat": "for count in range(5):\n  print('Python')\n",
  "python-list-iteration": "fruits = ['苹果', '香蕉', '橙子']\nfor fruit in fruits:\n  print(fruit)\n",
  "python-while": "count = 3\nwhile count > 0:\n  print(count)\n  count = count - 1\nprint(0)\n",
  "python-loop-control": "for number in range(1, 11, 1):\n  if number == 3:\n    continue\n  if number == 8:\n    break\n  print(number)\n",
  "python-list-operations": "items = [3, 1, 2]\nitems.append(4)\nitems.sort()\nprint(items[0])\nprint(items)\n",
  "python-tuple-set": "point = (3, 4)\nvalues = [1, 1, 2, 3]\nunique_values = set(values)\nprint(point)\nprint(unique_values)\nprint(2 in unique_values)\n",
  "python-dictionary": "student = {'name': 'Ada', 'score': 95}\nprint(student.get('name'))\nfor pair in student.items():\n  print(pair)\n",
  "python-string": "message = '  Hello Python  '\nprint(message.strip())\nprint(message.upper())\nprint(message.split())\nprint('-'.join(['visual', 'python']))\n",
  "python-functions": "def add(a, b):\n  return a + b\nprint(add(2, 3))\n",
  "python-advanced-functions": "def collect(value, count=1, *args, **kwargs):\n  return value\nprint(collect('Python', count=3))\n",
  "python-exceptions": "try:\n  print(int('abc'))\nexcept ValueError as error:\n  print(error)\nelse:\n  print('转换成功')\nfinally:\n  print('处理完成')\n",
  "python-files": "with open('hello.txt', \"w\", encoding=\"utf-8\") as handle:\n  handle.write('Hello, Python!')\nwith open('hello.txt', \"r\", encoding=\"utf-8\") as handle:\n  print(handle.read())\n",
  "python-classes": "class Person(object):\n  def __init__(self, name):\n    self.name = name\n  def greet(self):\n    return self.name\nperson = Person('Ada')\nprint(person.greet())\n",
  "python-assignment-unpacking": "items = [1, 2, 3]\nitems[0] = 10\ntotal = 0\ntotal += items[0]\n(head, *tail) = items\nprint(total)\nprint(head)\nprint(tail)\n",
  "python-formatted-text": "score = 95.5\nprint(f\"分数：{score:.1f} 分\")\nprint(\"\"\"第一行\n第二行\"\"\")\nprint(\"Python\".encode(\"utf-8\"))\n",
  "python-generators": "def repeat(items):\n  yield from items\nnumbers = [-1, 1, 2, 3]\ndoubled = (item * 2 for item in numbers if item > 0)\nprint(list(doubled))\nprint(list(repeat(numbers)))\n",
  "python-pattern-matching": "status = 'ready'\nmatch status:\n  case 'ready':\n    print('开始')\n  case 'waiting':\n    print('等待')\n  case _:\n    print('未知状态')\n",
  "python-typed-functions": "def clamp(value: int, /, *, minimum: int=0) -> int:\n  if value < minimum:\n    return minimum\n  else:\n    return value\nprint(clamp(3, minimum=5))\n",
  "python-async-basics": "import asyncio\nasync def main():\n  print(await asyncio.sleep(0, result='完成'))\nasyncio.run(main())\n",
  "python-imports-contexts": "import os, sys\nfrom contextlib import nullcontext as scope\nwith scope('A') as first, scope('B') as second:\n  print(first)\n  print(second)\n",
};

describe("Python examples", () => {
  it("generates runnable Hello Python code", () => {
    expect(generatePython(helloPythonExample.workspace)).toBe("print('Hello, Python!')\n");
  });

  it("stores input in a variable and prints it", () => {
    expect(generatePython(inputAndVariableExample.workspace)).toBe("name = input('请输入你的名字：')\nprint(name)\n");
  });

  it("converts text input to an integer", () => {
    expect(generatePython(typeConversionExample.workspace)).toBe("age_text = input('请输入年龄：')\nage = int(age_text)\nprint(age)\n");
  });

  it("covers the basic arithmetic operators", () => {
    expect(generatePython(arithmeticExample.workspace)).toBe("a = 17\nb = 5\nprint(a + b)\nprint(a - b)\nprint(a * b)\nprint(a / b)\nprint(a // b)\nprint(a % b)\nprint(a ** b)\n");
  });

  it("registers all 27 planned Python examples as runnable projects", () => {
    expect(pythonExamples).toHaveLength(27);
    expect(pythonExampleCatalog).toHaveLength(27);
    expect(pythonExampleCatalog.every((item) => item.example)).toBe(true);
    expect(pythonExampleCatalog.filter((item) => item.difficulty === "intro")).toHaveLength(6);
    expect(pythonExampleCatalog.filter((item) => item.difficulty === "basic")).toHaveLength(12);
    expect(pythonExampleCatalog.filter((item) => item.difficulty === "intermediate")).toHaveLength(8);
    expect(pythonExampleCatalog.filter((item) => item.difficulty === "advanced")).toHaveLength(1);
    expect(pythonExampleCatalog.every((item) => item.difficulty)).toBe(true);
    expect(new Set(pythonExamples.map((example) => example.id)).size).toBe(27);
    for (const example of pythonExamples) {
      expect(generatePython(example.workspace), example.title).toBe(expectedPython[example.id]);
    }
  });

  it("keeps every Python example free of editor validation problems", () => {
    for (const example of pythonExamples) {
      const workspace = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(example.workspace, workspace);
      expect(validatePythonBlockContexts(workspace), example.title).toEqual([]);
      const mapped = generateWorkspacePythonWithBlockMap(workspace);
      const withoutMarkers = mapped.code.split("\n").filter((line) => !line.trimStart().startsWith("# __visual_python_block_")).join("\n");
      expect(withoutMarkers, `${example.title} mapped code`).toBe(generatePython(example.workspace));
      workspace.dispose();
    }
  });
});
