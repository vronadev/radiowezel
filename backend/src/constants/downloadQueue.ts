export const DEFAULT_DOWNLOAD_MAX_CONCURRENCY = 2;
export const DEFAULT_DOWNLOAD_MAX_ATTEMPTS = 3;
export const DEFAULT_DOWNLOAD_RETRY_DELAY_MS = 2000;

const UNRECOVERABLE_YOUTUBE_ERROR_PATTERNS = [
  /private video/i,
  /video unavailable/i,
];

export function isUnrecoverableYoutubeError(message: string): boolean {
  return UNRECOVERABLE_YOUTUBE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
