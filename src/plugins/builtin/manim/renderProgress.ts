export type ManimRenderPhase = "preparing" | "rendering" | "combining" | "finalizing" | "stopping";

export type ManimRenderProgress = {
  scene: string;
  phase: ManimRenderPhase;
  label: string;
  animation?: number;
  percent?: number;
};

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");

export const initialManimRenderProgress = (scene: string): ManimRenderProgress => ({
  scene,
  phase: "preparing",
  label: "正在准备渲染",
});

export const parseManimRenderProgress = (output: string, current: ManimRenderProgress): ManimRenderProgress => {
  const lines = stripAnsi(output).split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  let progress = current;

  for (const line of lines) {
    if (/combining\s+(?:to\s+)?(?:movie|video)|writing\s+(?:the\s+)?movie/i.test(line)) {
      progress = { ...progress, phase: "combining", label: "正在合成视频", animation: undefined, percent: undefined };
      continue;
    }
    if (/file ready at|rendered\s+\w+/i.test(line)) {
      progress = { ...progress, phase: "finalizing", label: "正在整理输出", animation: undefined, percent: undefined };
      continue;
    }

    const animationMatch = line.match(/Animation\s+(\d+)/i);
    if (!animationMatch) continue;
    const animation = Number(animationMatch[1]) + 1;
    const percentMatch = line.match(/(?:^|\s)(\d{1,3})%(?=\||\s|$)/);
    const percent = percentMatch ? Math.min(100, Number(percentMatch[1])) : undefined;
    progress = {
      ...progress,
      phase: "rendering",
      label: `正在渲染动画 ${animation}`,
      animation,
      percent,
    };
  }

  return progress;
};

export const formatRenderElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};
