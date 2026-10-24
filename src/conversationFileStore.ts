/**
 * AI 对话的文件存储层（Tauri app-data/ai-conversations/）。
 *
 * localStorage 只有 ~5MB 且与草稿共享配额，对话记录迁移到文件后：
 * - 桌面（Tauri）环境：文件是权威存储，localStorage 仅作浏览器开发模式的回退；
 * - 读写都经 Rust 命令，文件名被限制在 ai-conversations/ 子目录内。
 */
import { invoke } from "@tauri-apps/api/core";

export const aiConversationsAvailable = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** scope -> 安全文件名（encodeURIComponent 产出的字符集 + .json 后缀）。 */
export function aiConversationFileName(scope: string): string {
  return `${encodeURIComponent(scope)}.json`;
}

export async function readAiConversationStore(scope: string): Promise<string | null> {
  if (!aiConversationsAvailable()) return null;
  try {
    return await invoke<string | null>("read_ai_conversation_store", { fileName: aiConversationFileName(scope) });
  } catch {
    // 读失败按“没有文件”处理：面板会继续用 localStorage 的数据。
    return null;
  }
}

export async function writeAiConversationStore(scope: string, contents: string): Promise<boolean> {
  if (!aiConversationsAvailable()) return false;
  try {
    await invoke("write_ai_conversation_store", { fileName: aiConversationFileName(scope), contents });
    return true;
  } catch {
    return false;
  }
}

export async function deleteAiConversationStore(scope: string): Promise<void> {
  if (!aiConversationsAvailable()) return;
  try {
    await invoke("delete_ai_conversation_store", { fileName: aiConversationFileName(scope) });
  } catch {
    // 删除失败不影响主流程；遗留文件会在下次写入时被覆盖。
  }
}

export async function clearAllAiConversationStores(): Promise<boolean> {
  if (!aiConversationsAvailable()) return false;
  try {
    await invoke("clear_ai_conversation_stores");
    return true;
  } catch {
    return false;
  }
}
