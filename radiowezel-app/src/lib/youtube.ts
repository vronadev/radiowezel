export function extractYoutubeVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function youtubeEmbedPreviewUrl(videoId: string, startSeconds: number): string {
  const params = new URLSearchParams({
    autoplay: "1",
    start: String(Math.max(0, Math.floor(startSeconds))),
    controls: "0",
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}
