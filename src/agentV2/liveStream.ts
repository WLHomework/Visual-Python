type LiveStreamListener = (text: string) => void;

const latest = new Map<string, string>();
const listeners = new Map<string, Set<LiveStreamListener>>();
const pending = new Map<string, string>();
// 实时文本按时间片合并刷新而不是每帧刷新：订阅方（Markdown+KaTeX）对全量文本
// 重新解析的成本随文本增长而上升，60fps 全量重解析会占满主线程，停止等用户输入
// 会被积压阻塞。120ms ≈ 8 次/秒，视觉上仍有连续输出感，配合逐字揭示平滑追帧。
const flushIntervalMs = 120;
let flushTimer: number | null = null;
let lastFlushAt = 0;

export function nextStreamRevealLength(shown: number, target: number): number {
  const backlog = target - shown;
  if (backlog <= 0) return shown;
  if (backlog <= 4) return target;
  if (backlog > 240) return shown + Math.ceil(backlog / 8);
  if (backlog > 80) return shown + 12;
  return shown + 5;
}

function flushLiveStreams() {
  flushTimer = null;
  lastFlushAt = Date.now();
  for (const [id, text] of pending) {
    const subs = listeners.get(id);
    if (!subs?.size) continue;
    for (const listener of subs) listener(text);
  }
  pending.clear();
}

function scheduleLiveStreamFlush() {
  if (flushTimer !== null) return;
  const wait = Math.max(0, flushIntervalMs - (Date.now() - lastFlushAt));
  const start = () => {
    flushTimer = (typeof window !== "undefined" ? window.setTimeout : setTimeout)(flushLiveStreams, wait) as unknown as number;
  };
  if (typeof requestAnimationFrame === "function") {
    // 顺带等一帧，避免与正在进行的渲染争抢。
    requestAnimationFrame(start);
  } else {
    start();
  }
}

export function publishLiveStream(id: string, text: string) {
  latest.set(id, text);
  pending.set(id, text);
  scheduleLiveStreamFlush();
}

export function subscribeLiveStream(id: string, listener: LiveStreamListener) {
  const subs = listeners.get(id) ?? new Set<LiveStreamListener>();
  subs.add(listener);
  listeners.set(id, subs);
  const current = latest.get(id);
  if (current !== undefined) listener(current);
  return () => {
    subs.delete(listener);
    if (!subs.size) listeners.delete(id);
  };
}

export function clearLiveStream(id: string) {
  latest.delete(id);
  pending.delete(id);
  listeners.delete(id);
}
