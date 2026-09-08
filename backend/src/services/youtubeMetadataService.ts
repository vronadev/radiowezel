import type { YoutubeVideoMetadata } from "../@types/models.js";
import type { IYoutubeMetadataService } from "../interfaces/IYoutubeMetadata.js";

export class YoutubeMetadataService implements IYoutubeMetadataService {
  constructor(private readonly httpFetch: typeof fetch = fetch) {}

  async fetchYouTubeMetadata(youtubeUrl: string): Promise<YoutubeVideoMetadata | null> {
    const encoded = encodeURIComponent(youtubeUrl);
    const oembedUrl = `https://www.youtube.com/oembed?url=${encoded}&format=json`;
    try {
      const response = await this.httpFetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      return {
        title: data.title || "Unknown",
        author: data.author_name || "-",
        coverUrl: data.thumbnail_url || null,
      };
    } catch {
      return null;
    }
  }
}
