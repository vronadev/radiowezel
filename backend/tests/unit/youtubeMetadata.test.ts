import { describe, expect, it, vi } from "vitest";
import { YoutubeMetadataService } from "../../src/services/youtubeMetadataService.js";

describe("YoutubeMetadataService", () => {
  it("maps oEmbed JSON to title, author, and cover", async () => {
    const httpFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Song",
        author_name: "Artist",
        thumbnail_url: "https://img.example/cover.jpg",
      }),
    });
    const service = new YoutubeMetadataService(httpFetch as unknown as typeof fetch);
    const result = await service.fetchYouTubeMetadata("https://www.youtube.com/watch?v=dQw4w9wgGcQ");
    expect(result).toEqual({
      title: "Song",
      author: "Artist",
      coverUrl: "https://img.example/cover.jpg",
    });
    expect(httpFetch).toHaveBeenCalledOnce();
  });

  it("returns null when oEmbed fails", async () => {
    const httpFetch = vi.fn().mockRejectedValue(new Error("network"));
    const service = new YoutubeMetadataService(httpFetch as unknown as typeof fetch);
    await expect(service.fetchYouTubeMetadata("https://www.youtube.com/watch?v=dQw4w9wgGcQ")).resolves.toBeNull();
  });
});
