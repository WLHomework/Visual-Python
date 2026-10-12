import { describe, expect, it, vi } from "vitest";
import type { VisualPythonPlugin } from "../plugins/api/types";
import { restoreInstalledPluginFiles, restorePluginAfterFailure } from "./pluginRuntime";

const plugin = (id: string): VisualPythonPlugin => ({
  manifest: { id, name: id, version: "1.0.0", apiVersion: "1" },
  activate: vi.fn(),
});

describe("plugin runtime recovery", () => {
  it("restores the previous plugin files after a replacement fails", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const previousFiles = { "plugin.json": "old", "index.js": "old source" };

    await restoreInstalledPluginFiles({
      path: "C:/plugins/com.example.demo",
      previousFiles,
      install,
      remove,
    });

    expect(install).toHaveBeenCalledWith(previousFiles);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes a newly installed plugin when there was no previous version", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);

    await restoreInstalledPluginFiles({
      path: "C:/plugins/com.example.demo",
      install,
      remove,
    });

    expect(remove).toHaveBeenCalledWith("C:/plugins/com.example.demo");
    expect(install).not.toHaveBeenCalled();
  });

  it("does not replace a plugin that is already present", async () => {
    const register = vi.fn();
    const activate = vi.fn().mockResolvedValue(undefined);

    await expect(restorePluginAfterFailure({
      pluginId: "com.example.demo",
      previousPlugin: plugin("com.example.demo"),
      previousWasActive: true,
      hasCurrentPlugin: () => true,
      register,
      activate,
    })).resolves.toBe(false);

    expect(register).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it("restores and reactivates the previous active plugin after cleanup", async () => {
    const previousPlugin = plugin("com.example.demo");
    const register = vi.fn();
    const activate = vi.fn().mockResolvedValue(undefined);

    await expect(restorePluginAfterFailure({
      pluginId: "com.example.demo",
      previousPlugin,
      previousWasActive: true,
      hasCurrentPlugin: () => false,
      register,
      activate,
    })).resolves.toBe(true);

    expect(register).toHaveBeenCalledWith(previousPlugin);
    expect(activate).toHaveBeenCalledWith("com.example.demo");
  });

  it("restores a previously disabled plugin without activating it", async () => {
    const previousPlugin = plugin("com.example.demo");
    const register = vi.fn();
    const activate = vi.fn().mockResolvedValue(undefined);

    await expect(restorePluginAfterFailure({
      pluginId: "com.example.demo",
      previousPlugin,
      previousWasActive: false,
      hasCurrentPlugin: () => false,
      register,
      activate,
    })).resolves.toBe(true);

    expect(register).toHaveBeenCalledWith(previousPlugin);
    expect(activate).not.toHaveBeenCalled();
  });
});
