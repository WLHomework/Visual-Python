import { describe, expect, it } from "vitest";
import type { AiModelConfig } from "./aiConfig";
import { isResponsesProtocolUnsupported, selectAiProviderProtocol } from "./aiProtocol";

const config = (baseUrl: string): AiModelConfig => ({ baseUrl, model: "test-model" });

describe("AI provider protocol selection", () => {
  it("honors an explicit protocol preference before any cached result", () => {
    expect(selectAiProviderProtocol({ ...config("https://custom.example/v1"), protocol: "responses" }, "chat-completions")).toEqual({
      protocol: "responses",
      source: "manual",
    });
    expect(selectAiProviderProtocol({ ...config("https://custom.example/v1"), protocol: "chat-completions" }, "responses")).toEqual({
      protocol: "chat-completions",
      source: "manual",
    });
  });

  it("does not infer a protocol from the vendor, host, or URL path", () => {
    for (const baseUrl of [
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1",
      "https://api.openai.com/v1",
      "https://api.openai.com/v1/responses",
      "https://custom.example/v1",
    ]) {
      expect(selectAiProviderProtocol(config(baseUrl), "unknown")).toEqual({
        protocol: "unknown",
        source: "probe",
      });
    }
  });

  it("uses a cached protocol for an unknown provider", () => {
    expect(selectAiProviderProtocol(config("https://custom.example/v1"), "chat-completions")).toEqual({
      protocol: "chat-completions",
      source: "cache",
    });
  });

  it("uses the real request result to classify every unknown service", () => {
    expect(selectAiProviderProtocol(config("https://custom.example/v1"), "unknown")).toEqual({
      protocol: "unknown",
      source: "probe",
    });
  });
});

describe("Responses protocol failure classification", () => {
  it.each([
    { status: 404, message: "Not Found" },
    { status: 405, message: "Method Not Allowed" },
    { status: 400, message: "Responses endpoint is not supported" },
    { status: undefined, message: "unknown endpoint: /responses" },
    { status: undefined, message: "AI request failed (HTTP 404): Not support" },
  ])("recognizes an unsupported Responses endpoint ($status)", ({ status, message }) => {
    expect(isResponsesProtocolUnsupported({ status, message })).toBe(true);
  });

  it.each([
    { status: 401, message: "Unauthorized" },
    { status: 403, message: "Forbidden" },
    { status: 408, message: "Request timeout" },
    { status: 500, message: "Internal server error" },
    { status: undefined, message: "AI request failed (HTTP 400): invalid request" },
  ])("does not classify a transport or authorization failure as protocol mismatch ($status)", ({ status, message }) => {
    expect(isResponsesProtocolUnsupported({ status, message })).toBe(false);
  });
});
