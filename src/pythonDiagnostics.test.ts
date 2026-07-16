import { describe, expect, it } from "vitest";
import { diagnosePythonError } from "./pythonDiagnostics";

describe("Python error diagnostics", () => {
  it("diagnoses undefined and unbound names", () => {
    expect(diagnosePythonError("NameError: name 'total' is not defined").suggestion).toContain("先创建并赋值");
    expect(diagnosePythonError("UnboundLocalError: cannot access local variable 'count' where it is not associated with a value").suggestion).toContain("赋值前被使用");
  });

  it("diagnoses collection access errors", () => {
    expect(diagnosePythonError("IndexError: list index out of range").suggestion).toContain("小于列表长度");
    expect(diagnosePythonError("KeyError: 'name'").suggestion).toContain("字典中不存在键“name”");
  });

  it("diagnoses type and conversion errors", () => {
    expect(diagnosePythonError("TypeError: unsupported operand type(s) for +: 'int' and 'str'").suggestion).toContain("类型不兼容");
    expect(diagnosePythonError("TypeError: render() missing 1 required positional argument: 'scene'").suggestion).toContain("添加并连接对应参数");
    expect(diagnosePythonError("ValueError: invalid literal for int() with base 10: 'abc'").suggestion).toContain("不能转换");
  });

  it("diagnoses files, imports, attributes and arithmetic", () => {
    expect(diagnosePythonError("ModuleNotFoundError: No module named 'numpy'").suggestion).toContain("当前 Python 环境中安装");
    expect(diagnosePythonError("FileNotFoundError: [Errno 2] No such file or directory: 'data.txt'").suggestion).toContain("data.txt");
    expect(diagnosePythonError("AttributeError: 'list' object has no attribute 'push'").suggestion).toContain("push");
    expect(diagnosePythonError("ZeroDivisionError: division by zero").suggestion).toContain("除数不能为 0");
  });

  it("diagnoses common syntax placement errors", () => {
    expect(diagnosePythonError("SyntaxError: 'return' outside function").suggestion).toContain("函数体内部");
    expect(diagnosePythonError("SyntaxError: 'await' outside async function").suggestion).toContain("异步函数");
  });

  it("keeps unknown errors factual", () => {
    const diagnosis = diagnosePythonError("CustomException: something unusual");
    expect(diagnosis.message).toBe("CustomException: something unusual");
    expect(diagnosis.suggestion).toContain("输入连接和生成代码");
  });
});
