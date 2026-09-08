export interface FfplayFadeOut {
  startSeconds: number;
  durationSeconds: number;
}

export interface FfplayPlaybackPlan {
  filePath: string;
  startSeconds: number;
  limitSeconds: number | null;
  fadeOut: FfplayFadeOut | null;
}

export interface PlanFfplayPlaybackInput {
  filePath: string;
  startSeconds?: number;
  songDurationSeconds: number;
  remainingSlotSeconds: number | null;
  fadeOutSecondsBeforeEnd: number;
}

export function formatFfplaySeconds(value: number): string {
  return String(Math.round(Math.max(0, value) * 1000) / 1000);
}

export function planFfplayPlayback(input: PlanFfplayPlaybackInput): FfplayPlaybackPlan {
  const startSeconds = Math.max(0, input.startSeconds ?? 0);
  const remainingInSong = Math.max(0, input.songDurationSeconds - startSeconds);
  const fadeBudget = Math.max(0, input.fadeOutSecondsBeforeEnd);
  const remainingSlot = input.remainingSlotSeconds;

  if (remainingSlot == null || remainingSlot > remainingInSong) {
    return {
      filePath: input.filePath,
      startSeconds,
      limitSeconds: null,
      fadeOut: null,
    };
  }

  const playWindow = Math.max(0, Math.min(remainingInSong, remainingSlot));
  const fadeDuration = Math.min(fadeBudget, playWindow);
  const fadeOut =
    fadeDuration > 0
      ? { startSeconds: Math.max(0, playWindow - fadeDuration), durationSeconds: fadeDuration }
      : null;

  return {
    filePath: input.filePath,
    startSeconds,
    limitSeconds: playWindow,
    fadeOut,
  };
}

export function buildFfplayArgs(plan: FfplayPlaybackPlan): string[] {
  const args = ["-nodisp", "-autoexit", "-loglevel", "quiet", "-hide_banner"];
  if (plan.startSeconds > 0) {
    args.push("-ss", formatFfplaySeconds(plan.startSeconds));
  }
  if (plan.limitSeconds != null && plan.limitSeconds > 0) {
    args.push("-t", formatFfplaySeconds(plan.limitSeconds));
  }
  if (plan.fadeOut && plan.fadeOut.durationSeconds > 0) {
    args.push(
      "-af",
      `afade=t=out:st=${formatFfplaySeconds(plan.fadeOut.startSeconds)}:d=${formatFfplaySeconds(plan.fadeOut.durationSeconds)}`,
    );
  }
  args.push(plan.filePath);
  return args;
}
