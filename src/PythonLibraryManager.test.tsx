import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  filterPythonPackages,
  normalizePythonPackageName,
  parsePythonRequirements,
  PythonLibraryManager,
  requirementPackageName,
  validatePythonRequirements,
} from "./PythonLibraryManager";

describe("Python library manager", () => {
  it("parses pip requirements from whitespace and removes duplicates", () => {
    expect(parsePythonRequirements("  requests   numpy==2.1.0 requests ")).toEqual(["requests", "numpy==2.1.0"]);
  });

  it("extracts and normalizes package names from requirement strings", () => {
    expect(requirementPackageName("requests")).toBe("requests");
    expect(requirementPackageName("numpy==2.1.0")).toBe("numpy");
    expect(requirementPackageName("requests[socks]>=2")).toBe("requests");
    expect(requirementPackageName("demo @ https://example.com/demo.whl")).toBe("demo");
    expect(normalizePythonPackageName("Pillow")).toBe("pillow");
    expect(normalizePythonPackageName("opencv_python")).toBe("opencv-python");
  });

  it("rejects pip options while accepting package specs", () => {
    expect(validatePythonRequirements(["requests"])).toBeNull();
    expect(validatePythonRequirements(["requests", "numpy>=2"])).toBeNull();
    expect(validatePythonRequirements(["--index-url"])).toContain("不能以 - 开头");
    expect(validatePythonRequirements([])).toContain("请输入");
  });

  it("filters installed libraries by name or version", () => {
    const packages = [
      { name: "numpy", version: "2.1.0" },
      { name: "requests", version: "2.32.3" },
    ];
    expect(filterPythonPackages(packages, "")).toHaveLength(2);
    expect(filterPythonPackages(packages, "NUM")).toEqual([packages[0]]);
    expect(filterPythonPackages(packages, "2.32")).toEqual([packages[1]]);
    expect(filterPythonPackages(packages, "missing")).toEqual([]);
  });

  it("asks for an interpreter before showing the library list", () => {
    const markup = renderToStaticMarkup(
      <PythonLibraryManager pythonEnvironment={null} installing={false} onInstall={async () => false} onUninstall={async () => false} />,
    );
    expect(markup).toContain("先选择一个 Python 解释器");
    expect(markup).not.toContain("搜索已安装的库");
  });
});
