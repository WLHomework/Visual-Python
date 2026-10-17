import { describe, expect, it } from "vitest";
import { createBlockSearchIndex, createTaskBlockDirectory } from "./blockSearch";

describe("block capability retrieval", () => {
  it("expands a task capability into native list and loop blocks", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [{ kind: "category", name: "list", contents: [
        { kind: "block", type: "python_list_index" },
        { kind: "block", type: "python_for_in" },
      ] }],
    } as any, (type) => type === "python_list_index" ? "read list index" : "iterate list");

    const directory = createTaskBlockDirectory(entries, "bubble sort");
    expect(directory.candidates.map((candidate) => candidate.type)).toEqual(["python_list_index", "python_for_in"]);
  });

  it("returns the complete native capability set needed for bubble sort", () => {
    const entries = createBlockSearchIndex({
      kind: "categoryToolbox",
      contents: [
        { kind: "category", name: "变量", contents: [
          { kind: "block", type: "variables_get" },
          { kind: "block", type: "python_assign_target" },
        ] },
        { kind: "category", name: "循环", contents: [
          { kind: "block", type: "controls_for" },
          { kind: "block", type: "python_for_in" },
        ] },
        { kind: "category", name: "逻辑", contents: [
          { kind: "block", type: "logic_compare" },
          { kind: "block", type: "controls_if" },
        ] },
        { kind: "category", name: "集合", contents: [
          { kind: "block", type: "python_list_collection" },
          { kind: "block", type: "python_index_target" },
          { kind: "block", type: "python_list_set" },
        ] },
      ],
    } as any, (type) => type);

    const types = createTaskBlockDirectory(entries, "bubble sort").candidates.map((candidate) => candidate.type);
    expect(types).toEqual(expect.arrayContaining([
      "variables_get",
      "python_assign_target",
      "controls_for",
      "python_for_in",
      "logic_compare",
      "controls_if",
      "python_list_collection",
      "python_index_target",
      "python_list_set",
    ]));
  });
});
