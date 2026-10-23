import { describe, expect, it } from "vitest";
import { inferProfileFromCode, readLastCodeSession, writeLastCodeSession } from "./lastCodeSession";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

describe("last code session", () => {
  it("round-trips the last code and documents", () => {
    const storage = memoryStorage();
    writeLastCodeSession(storage, {
      code: "import machine\n",
      profile: "esp8266-esp12e",
      workspaceMode: "code",
      codeDocuments: [{ id: "scene-main", name: "main", code: "import machine\n" }],
      activeDocumentId: "scene-main",
    });
    const restored = readLastCodeSession(storage);
    expect(restored?.code).toBe("import machine\n");
    expect(restored?.profile).toBe("esp8266-esp12e");
    expect(restored?.codeDocuments).toHaveLength(1);
  });

  it("infers the workbench from the code content", () => {
    expect(inferProfileFromCode("print('hello')\n")).toBe("python");
    expect(inferProfileFromCode("import machine\nmachine.Pin(2).value(1)\n")).toBe("esp32-wroom");
    expect(inferProfileFromCode("import machine\nimport neopixel\n")).toBe("esp32-s3");
    expect(inferProfileFromCode("import network\n# ESP8266\n")).toBe("esp8266-esp12e");
    expect(inferProfileFromCode("import machine\n", "esp8266-esp12e")).toBe("esp8266-esp12e");
  });
});
