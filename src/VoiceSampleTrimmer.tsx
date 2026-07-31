import { RotateCcw, Scissors } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type TrimRange = { start: number; end: number };

type VoiceSampleTrimmerProps = {
  peaks: number[];
  duration: number;
  range: TrimRange;
  onRangeChange: (range: TrimRange) => void;
  onApply: () => void;
  applying: boolean;
  playbackTime: number | null;
  playing: boolean;
  disabled?: boolean;
};

const minimumDuration = 10;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${Math.floor((seconds % 1) * 10)}`;

export function VoiceSampleTrimmer({ peaks, duration, range, onRangeChange, onApply, applying, playbackTime, playing, disabled = false }: VoiceSampleTrimmerProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLSpanElement | null>(null);
  const playbackLabelRef = useRef<HTMLSpanElement | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const effectiveMinimum = Math.min(minimumDuration, duration);
  const changed = range.start > 0.01 || range.end < duration - 0.01;
  const selectedDuration = Math.max(0, range.end - range.start);
  const startPercent = duration > 0 ? range.start / duration * 100 : 0;
  const endPercent = duration > 0 ? range.end / duration * 100 : 100;
  const playedSeconds = playbackTime === null ? 0 : Math.max(0, Math.min(selectedDuration, playbackTime - range.start));

  useEffect(() => {
    if (playbackTime === null) return;
    const startedAt = performance.now();
    const initialTime = playbackTime;
    let animationFrame = 0;
    const updateProgress = (now: number) => {
      const currentTime = Math.min(range.end, initialTime + (playing ? (now - startedAt) / 1000 : 0));
      const percent = duration > 0 ? Math.max(startPercent, Math.min(endPercent, currentTime / duration * 100)) : startPercent;
      if (playheadRef.current) playheadRef.current.style.left = `${percent}%`;
      if (playbackLabelRef.current) playbackLabelRef.current.textContent = `${formatTime(Math.max(0, currentTime - range.start))} / ${formatTime(selectedDuration)}`;
      if (playing && currentTime < range.end) animationFrame = requestAnimationFrame(updateProgress);
    };
    updateProgress(startedAt);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, endPercent, playbackTime, playing, range.end, range.start, selectedDuration, startPercent]);

  const updateHandle = useCallback((handle: "start" | "end", clientX: number) => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || disabled) return;
    const value = Math.max(0, Math.min(duration, (clientX - bounds.left) / bounds.width * duration));
    if (handle === "start") onRangeChange({ start: Math.min(value, range.end - effectiveMinimum), end: range.end });
    else onRangeChange({ start: range.start, end: Math.max(value, range.start + effectiveMinimum) });
  }, [disabled, duration, effectiveMinimum, onRangeChange, range.end, range.start]);

  const startDrag = (handle: "start" | "end", event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(handle);
    updateHandle(handle, event.clientX);
  };

  const moveDrag = (handle: "start" | "end", event: PointerEvent<HTMLButtonElement>) => {
    if (dragging === handle) updateHandle(handle, event.clientX);
  };

  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(null);
  };

  const moveWithKeyboard = (handle: "start" | "end", event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 0.1;
    if (handle === "start") onRangeChange({ start: Math.max(0, Math.min(range.end - effectiveMinimum, range.start + direction * step)), end: range.end });
    else onRangeChange({ start: range.start, end: Math.min(duration, Math.max(range.start + effectiveMinimum, range.end + direction * step)) });
  };

  return <section className="voice-sample-trimmer" aria-label="声音样本裁剪">
    <div className="voice-sample-waveform" ref={trackRef}>
      <svg viewBox={`0 0 ${Math.max(1, peaks.length)} 100`} preserveAspectRatio="none" aria-hidden="true">
        {peaks.map((peak, index) => <rect key={index} x={index + 0.12} y={50 - Math.max(2, peak * 46)} width={0.76} height={Math.max(4, peak * 92)} rx={0.25}/>) }
      </svg>
      <span className="voice-sample-dimmed before" style={{ width: `${startPercent}%` }}/>
      <span className="voice-sample-selection" style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}/>
      <span className="voice-sample-dimmed after" style={{ left: `${endPercent}%` }}/>
      {playbackTime !== null && (
        <span ref={playheadRef} className={`voice-sample-playhead ${playing ? "playing" : ""}`} style={{ left: `${duration > 0 ? playbackTime / duration * 100 : startPercent}%` }}/>
      )}
      <button type="button" className={`voice-sample-handle start ${dragging === "start" ? "dragging" : ""}`} style={{ left: `${startPercent}%` }} onPointerDown={(event) => startDrag("start", event)} onPointerMove={(event) => moveDrag("start", event)} onPointerUp={stopDrag} onPointerCancel={stopDrag} onKeyDown={(event) => moveWithKeyboard("start", event)} disabled={disabled} role="slider" aria-label="裁剪起点" aria-valuemin={0} aria-valuemax={Math.max(0, range.end - effectiveMinimum)} aria-valuenow={range.start}/>
      <button type="button" className={`voice-sample-handle end ${dragging === "end" ? "dragging" : ""}`} style={{ left: `${endPercent}%` }} onPointerDown={(event) => startDrag("end", event)} onPointerMove={(event) => moveDrag("end", event)} onPointerUp={stopDrag} onPointerCancel={stopDrag} onKeyDown={(event) => moveWithKeyboard("end", event)} disabled={disabled} role="slider" aria-label="裁剪终点" aria-valuemin={Math.min(duration, range.start + effectiveMinimum)} aria-valuemax={duration} aria-valuenow={range.end}/>
    </div>
    <div className="voice-sample-trim-toolbar">
      {playbackTime !== null ? <span ref={playbackLabelRef} className="playing">{formatTime(playedSeconds)} / {formatTime(selectedDuration)}</span> : <span>{formatTime(range.start)} - {formatTime(range.end)} <strong>{selectedDuration.toFixed(1)} 秒</strong></span>}
      <div>
        {changed && <button type="button" className="icon" onClick={() => onRangeChange({ start: 0, end: duration })} disabled={disabled} title="重置选区" aria-label="重置选区"><RotateCcw size={13}/></button>}
        <button type="button" onClick={onApply} disabled={disabled || applying || !changed || selectedDuration < effectiveMinimum}><Scissors size={13}/>{applying ? "正在裁剪" : "应用裁剪"}</button>
      </div>
    </div>
  </section>;
}
