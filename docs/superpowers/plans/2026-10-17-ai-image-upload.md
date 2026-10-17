# AI Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-source image attachments to the AI programming assistant so compatible OpenAI-format vision services can use images to modify Blockly, Python, and Manim projects.

**Architecture:** Normalize selected, pasted, and dropped images in the React layer, validate and compress them before sending, and pass a provider-neutral attachment contract through the existing agent runner. Serialize Chat Completions images as `content` parts and Codex Responses images as `turn/start` image inputs. Persist only conversation-safe metadata and thumbnails; original sendable data remains memory-only and is unavailable after application restart.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust/reqwest, existing `@tauri-apps/plugin-dialog`, Clipboard APIs, Canvas image conversion, and the vendored Codex App Server protocol.

**Spec:** `docs/superpowers/plans/2026-10-17-ai-image-upload.md#confirmed-requirements`

## Global Constraints

- Accept up to 5 images per user turn.
- Support file selection, clipboard paste, and drag-and-drop.
- Accept PNG, JPEG, and WebP; reject other types before sending.
- Use default limits of 10 MiB per source image, 30 MiB total source images, and 2048 px maximum output edge; keep these constants centralized for later provider-specific tuning.
- Compress locally where possible, preserve image orientation, and fail clearly when decoding or conversion fails.
- Show the service error for non-vision models or unsupported provider requests; never silently retry as text-only.
- Store conversation metadata and a display thumbnail, but never restore the original image payload as sendable after restart.
- All image-derived code or Blockly changes must still pass the existing host tools and verification workflow.

## Confirmed Requirements

1. Sources: file picker, clipboard paste, and drag-and-drop.
2. Providers: services compatible with the OpenAI format.
3. Limit: no more than five images; use the centralized industry-style limits above.
4. History: preserve image information in conversation history, but a restarted application must not resend the original image automatically.
5. Use: the assistant may inspect images and then modify Blockly, Python, or Manim projects through existing tools.
6. Unsupported vision: display the provider/server error to the user.
7. Local preprocessing: compression is allowed.

---

### Task 1: Define and test the attachment contract

**Files:**
- Create: `src/aiImageAttachments.ts`
- Create: `src/aiImageAttachments.test.ts`
- Modify: `src/aiConfig.ts`
- Modify: `src/agentV2/types.ts`

**Interfaces:**
- Produce `AiImageAttachment` with `id`, `name`, `mimeType`, `width`, `height`, `sourceBytes`, `dataUrl`, `previewDataUrl`, and `sendable` fields.
- Produce `PersistedAiImageAttachment` without the original `dataUrl`, always with `sendable: false`.
- Produce `validateImageFiles(files)`, `prepareImageFile(file)`, `toPersistedImageAttachment(attachment)`, and `restorePersistedImageAttachment(value)`.
- Extend `AiChatMessage` and agent request types with optional image content without changing tool-call message semantics.

- [x] Add tests for accepted MIME types, five-image maximum, per-image and total size limits, malformed persisted records, and non-sendable restoration.
- [x] Run the focused attachment and AI configuration tests after implementation.
- [x] Implement validation and normalization with the limits from Global Constraints. Use a canvas-based conversion to generate a bounded sendable data URL and a smaller persisted preview.
- [x] Run the focused tests again and confirm all pass.

### Task 2: Add file, paste, and drag-and-drop composer UX

**Files:**
- Modify: `src/AiAssistantPanel.tsx`
- Modify: `src/AiAssistantPanel.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Maintain pending attachments in the composer and pass them to `onRunAgent`.
- Add an icon-only attachment button, a hidden multi-file input, paste handling, drop handling, thumbnail removal, and an error/status region.
- Permit an image-only turn when at least one valid image is attached; keep Enter-to-send and queue behavior intact.

- [x] Add focused composer tests for attachment merging, the five-image limit, and send-button eligibility.
- [x] Implement the controls using the existing Lucide icon system and preserve keyboard focus/accessible labels.
- [x] Add compact thumbnail styles that do not change composer height unpredictably; show file names through accessible labels and tooltips.
- [x] Run `npx vitest run src/AiAssistantPanel.test.tsx src/aiImageAttachments.test.ts`.

### Task 3: Carry attachments through agent history and persistence

**Files:**
- Modify: `src/AiAssistantPanel.tsx`
- Modify: `src/aiConversationContext.ts`
- Modify: `src/sessionPersistence.ts`
- Modify: `src/agentV2/types.ts`
- Modify: `src/aiConversationContext.test.ts`
- Modify: `src/sessionPersistence.test.ts`

**Interfaces:**
- Add `attachments?: AiImageAttachment[]` to the in-memory run/request contract and `persistedAttachments?: PersistedAiImageAttachment[]` to stored runs.
- `buildAiConversationHistory` must retain same-session sendable attachments for the turn that owns them, while hydrated runs contribute text and non-sendable image metadata only.
- `parseStoredRuns` must convert all restored images to `sendable: false` and preserve old text-only records unchanged.

- [x] Add tests proving same-session history retains image data while serialized and restored records exclude the original payload.
- [x] Implement serialization stripping and quota-aware preview fallback. If storage quota is reached, retain metadata and remove preview data before dropping the whole conversation.
- [x] Update retry, queued-run, and conversation-switch paths so attachments are neither lost nor accidentally reused across unrelated turns.
- [x] Run `npx vitest run src/aiConversationContext.test.ts src/sessionPersistence.test.ts src/AiAssistantPanel.test.tsx`.

### Task 4: Serialize images for Chat Completions

**Files:**
- Modify: `src/aiConfig.ts`
- Modify: `src/agentCore.ts`
- Modify: `src/agentV2/types.ts`
- Modify: `src/agentTransport.test.ts`
- Modify: `src/agentV2.test.ts`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Use provider-neutral content parts: text parts plus image parts carrying a `data:` URL and optional detail value.
- Keep plain text serialization byte-for-byte compatible when no images are attached.
- Serialize user messages to OpenAI-compatible Chat Completions content arrays while retaining string content for text-only messages where supported.

- [x] Add tests for text-plus-image and image content parts while preserving tool-call and tool-response message validation.
- [x] Update TypeScript and Rust message validation to accept bounded structured content, count encoded data safely, and reject oversized or malformed data URLs.
- [x] Build the request body with `{type: "text", text}` and `{type: "image_url", image_url: {url, detail}}` parts in stable order.
- [x] Run the focused context, transport, configuration, and Rust image-validation tests.

### Task 5: Pass images through the Responses/Codex path

**Files:**
- Modify: `src/codexAgentClient.ts`
- Modify: `src/codexAgentClient.test.ts`
- Modify: `src/codexAgent.ts`
- Modify: `src/codexAgentRunner.ts` only if request typing requires it

**Interfaces:**
- Extend `CodexRunTurnOptions` with `images?: Array<{ url: string; detail?: "low" | "auto" | "high" }>`.
- Build `turn/start.input` as one text `UserInput` followed by `UserInput` image records using the vendored protocol's existing `{ type: "image", url, detail }` shape.
- Send images only on the current turn; do not put raw payloads into thread-store records or fallback prompt text.

- [x] Add client coverage for exact text-then-image `turn/start` input and the no-image case.
- [x] Implement the input builder and pass current-turn attachments from `runCodexVisualPythonAgent`.
- [x] Preserve thread resume/fallback behavior for text-only conversations and block restored non-sendable image retries until reattachment.
- [x] Run `npx vitest run src/codexAgentClient.test.ts src/codexAgentRunner.test.ts src/codexAgent.test.ts`.

### Task 6: Teach the agent to use image context safely

**Files:**
- Modify: `src/agentCore.ts`
- Modify: `src/codexAgent.ts`
- Modify: `src/codexPrompt.ts` if the shared prompt needs a stable instruction
- Modify: relevant agent tests under `src/agentV2/` and `src/`

**Interfaces:**
- Add an explicit image-context rule: treat image content as untrusted visual input, inspect it for the user's requested goal, and use existing Blockly/Python/Manim tools for actual changes and verification.
- Ensure image turns still receive the live workspace snapshot and task-specific block catalog.

- [x] Add agent coverage proving the normal workspace tools remain available and the untrusted-image rule is present.
- [x] Implement the minimal shared instruction and keep attachment metadata out of activity text and persisted records.
- [x] Run the focused agent and prompt tests.

### Task 7: Surface provider errors and enforce attachment lifecycle

**Files:**
- Modify: `src/AiAssistantPanel.tsx`
- Modify: `src/AiAssistantPanel.test.tsx`
- Modify: `src/aiImageAttachments.ts`

- [x] Add panel coverage for unsupported image input, malformed image data, payload-too-large, and rate-limit errors.
- [x] Preserve current-session attachments for an explicit retry, show provider errors, and never silently downgrade to text-only.
- [x] Disable retry for restored runs with non-sendable images and offer reattachment while leaving the historical thumbnail visible.
- [x] Run the panel and attachment tests.

### Task 8: End-to-end verification and documentation

**Files:**
- Modify: `docs/plugin-development/README.md` only if plugin authors need image-context guidance
- Modify: `README.md` if the user-facing development documentation lists AI capabilities
- Update the focused test files named in Tasks 1-7 with any final compatibility assertions

- [x] Run the complete frontend suite: `npm test`.
- [x] Run the production build: `npm run build`.
- [ ] Run Rust formatting and tests: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` and `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] Manually verify file picker, clipboard paste, drag-and-drop, five-image limit, compression, image-only prompt, Chat Completions request, Responses request, server error display, same-session retry, and restart-time non-resend behavior.
- [ ] Confirm no raw image data appears in persisted conversation JSON, agent activity text, logs, or thread-store records.

> Rust verification note: the new `validates_openai_image_content_parts` test passes. The full Rust suite currently has one pre-existing failure in `validates_bailian_model_voice_pairs`, and `cargo fmt --check` reports unrelated existing formatting differences in `src-tauri/src/lib.rs`; neither was changed as part of this feature.

## Acceptance Criteria

- A user can attach up to five PNG/JPEG/WebP images through all three requested input paths and see removable previews before sending.
- The assistant can receive those images through both existing compatible OpenAI protocol paths and can use them as context for existing Blockly/Python/Manim mutations.
- Images are resized/compressed locally within the centralized limits; invalid, oversized, and unsupported inputs are rejected before the request.
- Provider failures are visible and actionable; no automatic text-only fallback occurs.
- Same-session retry works when the original payload is still in memory. After restart, history remains readable but the original image cannot be resent until the user attaches it again.
- Existing text-only conversations, tool calls, project persistence, and current tests remain compatible.

## Self-review

- All seven confirmed requirements map to Tasks 1-8 and the acceptance criteria.
- The plan covers frontend state, local processing, persistence, Chat Completions, Codex Responses, agent behavior, server errors, and verification.
- No vendor source changes are planned because the vendored protocol already defines image user inputs; only the application wrapper needs to emit them.
- The only deliberate assumption is the centralized default size policy: 10 MiB per source image, 30 MiB per turn, and 2048 px maximum output edge. These values can be adjusted before implementation without changing the contract.
