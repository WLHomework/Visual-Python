import { describe, expect, it } from "vitest";
import { diagnosePythonError } from "./pythonDiagnostics";

describe("Python error diagnostics", () => {
  const diagnoseBlocks = (traceback: string) => diagnosePythonError(traceback, { mode: "blocks" });
  const diagnoseCode = (traceback: string) => diagnosePythonError(traceback, { mode: "code" });

  it("diagnoses undefined and unbound names", () => {
    expect(diagnoseBlocks("NameError: name 'total' is not defined").suggestion).toContain("先创建并赋值");
    expect(diagnoseBlocks("UnboundLocalError: cannot access local variable 'count' where it is not associated with a value").suggestion).toContain("赋值前被使用");
  });

  it("diagnoses collection access errors", () => {
    expect(diagnoseBlocks("IndexError: list index out of range").suggestion).toContain("小于列表长度");
    expect(diagnoseBlocks("KeyError: 'name'").suggestion).toContain("字典中不存在键“name”");
  });

  it("diagnoses type and conversion errors", () => {
    expect(diagnoseBlocks("TypeError: unsupported operand type(s) for +: 'int' and 'str'").suggestion).toContain("类型不兼容");
    expect(diagnoseBlocks("TypeError: render() missing 1 required positional argument: 'scene'").suggestion).toContain("添加并连接对应参数");
    expect(diagnoseBlocks("ValueError: invalid literal for int() with base 10: 'abc'").suggestion).toContain("不能转换");
  });

  it("diagnoses files, imports, attributes and arithmetic", () => {
    expect(diagnoseBlocks("ModuleNotFoundError: No module named 'numpy'").suggestion).toContain("当前 Python 环境中安装");
    expect(diagnoseBlocks("FileNotFoundError: [Errno 2] No such file or directory: 'data.txt'").suggestion).toContain("data.txt");
    expect(diagnoseBlocks("AttributeError: 'list' object has no attribute 'push'").suggestion).toContain("push");
    expect(diagnoseBlocks("ZeroDivisionError: division by zero").suggestion).toContain("除数不能为 0");
    expect(diagnoseBlocks("IsADirectoryError: [Errno 21] Is a directory: 'data'").suggestion).toContain("需要文件路径");
    expect(diagnoseBlocks("OSError: [Errno 39] Directory not empty: 'data'").suggestion).toContain("连同全部内容");
  });

  it("diagnoses common syntax placement errors", () => {
    expect(diagnoseBlocks("SyntaxError: 'return' outside function").suggestion).toContain("函数体内部");
    expect(diagnoseBlocks("SyntaxError: 'await' outside async function").suggestion).toContain("异步函数");
  });

  it("keeps unknown errors factual", () => {
    const diagnosis = diagnoseBlocks("CustomException: something unusual");
    expect(diagnosis.message).toBe("CustomException: something unusual");
    expect(diagnosis.suggestion).toContain("输入连接和生成代码");
  });

  it("uses code-oriented fallback guidance in code mode", () => {
    const tracebacks = [
      "CustomException: something unusual",
      "TypeError: render() missing 1 required positional argument: 'scene'",
      "IsADirectoryError: [Errno 21] Is a directory: 'data'",
      "SyntaxError: expected an indented block",
    ];

    for (const traceback of tracebacks) {
      expect(diagnoseCode(traceback).suggestion).not.toMatch(/积木|输入槽|高亮|连接/);
    }
    expect(diagnoseCode(tracebacks[1]).suggestion).toContain("函数调用");
  });
});
