import type { Song, SongStatus } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import type { SongRepository } from "../repositories/songRepository.js";
import type { PlaylistRepository } from "../repositories/playlistRepository.js";
import type { SongRequestRepository } from "../repositories/songRequestRepository.js";
import type { VoteRepository } from "../repositories/voteRepository.js";
import type { PlaylistService } from "./playlistService.js";
import { purgeSongMediaFiles } from "./songMediaCleanup.js";

export class SongService {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly playlistRepository: PlaylistRepository,
    private readonly voteRepository: VoteRepository,
    private readonly songRequestRepository: SongRequestRepository,
    private readonly playlistService: PlaylistService,
    private readonly database: IDatabase,
  ) {}

  getById(id: string): Song | undefined {
    return this.songRepository.findById(id);
  }

  getSongsById(ids: string[] | null = null): Record<string, Song> {
    const songs = ids && ids.length ? this.songRepository.findByIds(ids) : this.songRepository.findAll();
    const result: Record<string, Song> = {};
    for (const song of songs) {
      result[song.id] = song;
    }
    return result;
  }

  getVerifiedIds(): string[] {
    return this.songRepository.findVerifiedIds();
  }

  listVerified(): Song[] {
    return this.songRepository.findVerified();
  }

  listPendingReview(): Song[] {
    return this.songRepository.findByStatuses(["pending", "downloading", "failed"]);
  }

  listDownloadCandidates(): Song[] {
    return this.songRepository.findByStatuses(["scheduled_for_download", "downloading", "failed"]);
  }

  listStuckDownloads(): Song[] {
    return this.songRepository.findByStatuses(["scheduled_for_download", "downloading"]);
  }

  listRanking(limit: number): Song[] {
    return this.songRepository.findRanking(limit);
  }

  getVotableSongIds(): string[] {
    return this.playlistService.getVotableSongIds(this.getVerifiedIds());
  }

  getEffectiveVotableSongIds(): string[] {
    return this.getVotableSongIds();
  }

  isVerifiedWithLocalFile(song: Song): boolean {
    return song.status === "verified" && Boolean(song.localPath);
  }

  findByYoutubeVideoId(videoId: string): Song | undefined {
    return this.songRepository.findByYoutubeVideoId(videoId);
  }

  createPending(input: {
    title: string;
    author: string;
    coverUrl: string | null;
    youtubeUrl: string;
    durationSeconds?: number;
    status?: SongStatus;
  }): string {
    const id = crypto.randomUUID();
    this.songRepository.insertPending({ id, ...input });
    return id;
  }

  createScheduledForDownload(input: {
    title: string;
    author: string;
    coverUrl: string | null;
    youtubeUrl: string;
    durationSeconds?: number;
  }): string {
    return this.createPending({ ...input, status: "scheduled_for_download" });
  }

  updateStatus(id: string, status: SongStatus): void {
    this.songRepository.updateStatus(id, status);
  }

  markVerified(
    id: string,
    localPath: string,
    title: string,
    author: string,
    coverUrl: string | null,
    durationSeconds: number,
  ): void {
    this.songRepository.markVerified(id, localPath, title, author, coverUrl, durationSeconds);
  }

  delete(id: string, media?: { songsDir: string; fileStore: IFileStore }): void {
    const song = this.getById(id);
    if (song && media) {
      purgeSongMediaFiles(song, media.songsDir, media.fileStore);
    }
    this.database.transaction(() => {
      this.playlistRepository.removeSongFromAll(id);
      this.voteRepository.deleteBySongId(id);
      this.voteRepository.deleteOverride(id);
      this.songRequestRepository.deleteBySongId(id);
      this.songRepository.deleteById(id);
    });
  }
}
