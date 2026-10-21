/**
 * 输出/问题面板的“跟随最新内容”判断。放在这里而不是组件里，
 * 是为了让这条容易写错的规则能在没有 DOM 的环境下被测试（仓库里没有 jsdom 测试环境）。
 */

/** 距离底部多少像素以内仍算“停在底部”。 */
export const consoleStickThreshold = 32;

export type ConsoleStickInput = {
  /** 上一次判断的结果。 */
  stick: boolean;
  /** 上一次的 scrollTop。 */
  previousTop: number;
  /** 现在的 scrollTop。 */
  top: number;
  /** `scrollHeight - scrollTop - clientHeight`，即离底部还有多远。 */
  distanceToBottom: number;
};

/**
 * 只有“用户往上滚”才停止跟随。内容变长、程序自己滚到底部，都只会让 scrollTop 变大；
 * 若只看“离底部多远”，一次输出灌进来就会被当成用户离开了底部，面板从此不再自动滚动。
 */
export function nextConsoleStickToLatest(input: ConsoleStickInput): boolean {
  if (input.distanceToBottom <= consoleStickThreshold) return true;
  if (input.top < input.previousTop) return false;
  return input.stick;
}
