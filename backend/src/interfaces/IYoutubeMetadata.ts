import type { YoutubeVideoMetadata } from "../@types/models.js";

export interface IYoutubeMetadataService {
  fetchYouTubeMetadata(youtubeUrl: string): Promise<YoutubeVideoMetadata | null>;
}
