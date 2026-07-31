import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { getFileBlockPickerConfigs, projectRelativePath } from "./fileBlockPicker";
import "./pythonBlocks";

describe("file block picker", () => {
  it("uses project-relative paths for files in a saved Windows project", () => {
    expect(projectRelativePath("D:\\Course\\Demo\\data\\input.txt", "D:\\Course\\Demo\\lesson.vpy"))
      .toBe("data/input.txt");
  });

  it("matches Windows project directories without case sensitivity", () => {
    expect(projectRelativePath("d:\\course\\demo\\Data.txt", "D:\\Course\\Demo\\lesson.vpy"))
      .toBe("Data.txt");
  });

  it("keeps absolute paths outside the project or on another drive", () => {
    expect(projectRelativePath("E:\\shared\\input.txt", "D:\\Course\\Demo\\lesson.vpy"))
      .toBe("E:/shared/input.txt");
    expect(projectRelativePath("D:\\Course\\other\\input.txt", "D:\\Course\\Demo\\lesson.vpy"))
      .toBe("D:/Course/other/input.txt");
  });

  it("keeps absolute paths for unsaved projects", () => {
    expect(projectRelativePath("/home/ada/data.txt", null)).toBe("/home/ada/data.txt");
  });

  it("uses the correct picker modes for common file and directory blocks", () => {
    expect(getFileBlockPickerConfigs("python_file_read_text")[0]).toMatchObject({ inputName: "PATH", mode: "open-file" });
    expect(getFileBlockPickerConfigs("python_file_write_text")[0]).toMatchObject({ inputName: "PATH", mode: "save-file" });
    expect(getFileBlockPickerConfigs("python_os_listdir")[0]).toMatchObject({ inputName: "PATH", mode: "directory" });
  });

  it("adds visible picker fields to file and directory path inputs", () => {
    const workspace = new Blockly.Workspace();
    expect(workspace.newBlock("python_file_read_text").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("python_file_copy").getField("FILE_PICKER_SOURCE")).not.toBeNull();
    expect(workspace.newBlock("python_file_copy").getField("FILE_PICKER_TARGET")).not.toBeNull();
    expect(workspace.newBlock("python_os_listdir").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("python_directory_find").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("python_directory_exists").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("python_path_info").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("python_directory_move").getField("FILE_PICKER_SOURCE")).not.toBeNull();
    expect(workspace.newBlock("python_directory_move").getField("FILE_PICKER_TARGET")).not.toBeNull();
    const move = workspace.newBlock("python_file_move");
    expect(move.getField("FILE_PICKER_SOURCE")).not.toBeNull();
    expect(move.getField("FILE_PICKER_TARGET")).not.toBeNull();
    workspace.dispose();
  });

  it("covers every direct file-system path block", () => {
    const expected = [
      "python_file_read_text", "python_file_write_text", "python_open_file", "python_file_exists",
      "python_directory_exists", "python_path_info", "python_file_copy", "python_file_move",
      "python_file_delete", "python_directory_copy", "python_directory_move", "python_directory_find",
      "python_directory_remove", "python_path_create", "python_path_check", "python_path_read_text",
      "python_path_write_text", "python_os_listdir", "python_os_makedirs",
    ];
    expect(expected.filter((type) => getFileBlockPickerConfigs(type).length === 0)).toEqual([]);
  });

  it("switches move pickers between file and directory dialogs", () => {
    const workspace = new Blockly.Workspace();
    const move = workspace.newBlock("python_file_move");
    const [source, target] = getFileBlockPickerConfigs(move.type);
    const mode = (config: typeof source) => typeof config.mode === "function" ? config.mode(move) : config.mode;
    expect(mode(source)).toBe("open-file");
    expect(mode(target)).toBe("save-file");
    move.setFieldValue("directory", "PATH_KIND");
    expect(mode(source)).toBe("directory");
    expect(mode(target)).toBe("directory");
    workspace.dispose();
  });
});
