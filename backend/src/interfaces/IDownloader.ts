export interface DownloadOptions {
  ffmpegLocation?: string;
}

export interface DownloadResult {
  filePath: string;
  title: string;
  author: string;
  coverUrl: string | null;
  durationSeconds: number;
}

export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
}

export interface IDownloader {
  downloadAsMp3(
    youtubeUrl: string,
    outDir: string,
    options?: DownloadOptions,
  ): Promise<DownloadResult>;
  getPlaylistEntries(playlistUrl: string, options?: DownloadOptions): Promise<PlaylistEntry[]>;
}
