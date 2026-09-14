type LiveStreamListener = (text: string) => void;

const latest = new Map<string, string>();
const listeners = new Map<string, Set<LiveStreamListener>>();
const pending = new Map<string, string>();
let frame: number | null = null;

export function nextStreamRevealLength(shown: number, target: number): number {
  const backlog = target - shown;
  if (backlog <= 0) return shown;
  if (backlog <= 4) return target;
  if (backlog > 240) return shown + Math.ceil(backlog / 8);
  if (backlog > 80) return shown + 12;
  return shown + 5;
}

function flushLiveStreams() {
  frame = null;
  for (const [id, text] of pending) {
    const subs = listeners.get(id);
    if (!subs?.size) continue;
    for (const listener of subs) listener(text);
  }
  pending.clear();
}

export function publishLiveStream(id: string, text: string) {
  latest.set(id, text);
  pending.set(id, text);
  if (typeof requestAnimationFrame !== "function") {
    flushLiveStreams();
    return;
  }
  if (frame !== null) return;
  frame = requestAnimationFrame(flushLiveStreams);
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
