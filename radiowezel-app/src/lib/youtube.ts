const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/** Watch links from youtube.com, music.youtube.com, m.youtube.com, and youtu.be. */
export function extractYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "youtube.com" && host !== "music.youtube.com" && host !== "m.youtube.com" && host !== "youtu.be" && host !== "youtube-nocookie.com") {
    return null;
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID.test(id) ? id : null;
  }
  const fromQuery = parsed.searchParams.get("v");
  if (fromQuery && VIDEO_ID.test(fromQuery)) {
    return fromQuery;
  }
  const fromPath = parsed.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
  return fromPath?.[1] ?? null;
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
