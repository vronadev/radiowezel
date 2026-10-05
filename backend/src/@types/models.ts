import type { VoteTieBreakMode } from "../config/voteTieBreak.js";

export type SongStatus = "pending" | "scheduled_for_download" | "downloading" | "verified" | "failed";

export interface Song {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  youtubeUrl: string;
  durationSeconds: number;
  status: SongStatus;
  localPath: string | null;
  totalVotes: number;
  createdAt: string;
}

export type PollType = "WEEKLY_BELL" | "ONE_OFF";

export interface Bell {
  id: string;
  title: string;
  artist: string;
  youtubeUrl: string;
  startTimeSec: number;
  endTimeSec: number;
  isApproved: boolean;
  requestedById: string | null;
  createdAt: string;
}

export interface Poll {
  id: string;
  title: string;
  type: PollType;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface PollOption {
  id: string;
  pollId: string;
  bellId: string | null;
  title: string;
  youtubeUrl: string | null;
  startTimeSec: number;
  endTimeSec: number;
}

export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  pollOptionId: string;
  createdAt: string;
}

export interface PollOptionView {
  id: string;
  pollId: string;
  bellId: string | null;
  title: string;
  artist: string;
  youtubeUrl: string;
  startTimeSec: number;
  endTimeSec: number;
  isApproved: boolean;
  eligible: boolean;
  voteCount: number;
  firstVoteAt: string;
  lastVoteAt: string;
}

export interface PollView {
  id: string;
  title: string;
  type: PollType;
  startDate: string;
  endDate: string;
  isActive: boolean;
  myOptionId: string | null;
  winnerOptionId: string | null;
  options: PollOptionView[];
}

export interface Playlist {
  id: string;
  name: string;
  youtubePlaylistUrl: string | null;
  createdAt: string;
  excludeFromRandom: boolean;
  excludeFromVoting: boolean;
  songCount?: number;
}

/** GET /api/effective-playlist. `playlists` is the full set for the day. */
export interface EffectivePlaylistResponse {
  /**
   * @deprecated First effective playlist only. A day can include several playlists.
   * Read `playlists` instead.
   */
  playlistId: string | null;
  /**
   * @deprecated Name of `playlistId` only.
   * Read `playlists` instead.
   */
  playlistName: string | null;
  playlists: { id: string; name: string }[];
}

export interface PlaylistSongRow {
  playlistId: string;
  songId: string;
  source: string;
  banned: boolean;
}

export interface PlaylistSongWithMeta {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  status: SongStatus;
  source: string;
}

export interface PlaylistScheduleEntry {
  id: string;
  playlistId: string;
  type: "cyclic" | "one_off";
  dayOfWeek: number | null;
  scheduleDate: string | null;
}

export interface CyclicScheduleItem {
  id: string;
  playlistId: string;
  dayOfWeek: number;
}

export interface OneOffScheduleItem {
  id: string;
  playlistId: string;
  date: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface EmailToken {
  token: string;
  email: string;
  type: "register" | "login";
  expiresAt: string;
  createdAt: string;
}

export interface VoteCount {
  count: number;
  firstVoteAt: string;
  lastVoteAt: string;
}

export interface VoteQuota {
  perUser: number;
  periodHours: number;
}

export interface QueueOverride {
  songId: string;
  votes: number;
  updatedAt: string;
}

export interface ScheduleSlot {
  start: string;
  end: string;
  /** Playback loudness while this slot is active. Omitted means 100%. */
  volumePercentage?: number;
}

export interface BreakWindow {
  start: number;
  end: number;
  slot: ScheduleSlot;
}

export interface QueueItem {
  id: string;
  songId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  votes: number;
  position: number;
  estimatedPlayAt: string | null;
  durationSeconds: number;
}

export interface NowPlaying extends QueueItem {
  startedAt?: string;
}

export interface PlayerStatus {
  paused: boolean;
  nowPlaying: NowPlaying | null;
}

export interface QueueFileData {
  nowPlaying: NowPlaying | null;
  queue: QueueItem[];
  updatedAt: string | null;
  randomFillOrder?: string[];
}

export interface ScheduleContext {
  currentSlot: ScheduleSlot | null;
  nextSlot: ScheduleSlot | null;
  inBreak: boolean;
}

export interface BuiltQueue {
  queue: QueueItem[];
  data: QueueFileData;
  slots: ScheduleSlot[];
  needNewOrder: boolean;
}

export interface QueuePayload {
  nowPlaying: NowPlaying | null;
  queue: QueueItem[];
  schedule: ScheduleContext;
}

export interface YoutubeVideoMetadata {
  title: string;
  author: string;
  coverUrl: string | null;
}

export type MailTransport = "smtp" | "sendmail";

export interface SmtpConfig {
  transport: MailTransport;
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
  sendmailPath: string;
}

export interface AppConfig {
  allowedEmailDomain: string;
  adminEmails: string[];
  adminEmail?: string;
  adminPasswordHash?: string;
  jwtSecret: string;
  schedule: {
    slots: ScheduleSlot[];
    bellStartOffsetSeconds: number;
    bellEndOffsetSeconds: number;
    fadeOutSecondsBeforeEnd: number;
    activeDays: number[];
  };
  voteTieBreakMode: VoteTieBreakMode;
  dataDir: string;
  songsDir: string;
  queueFilePath: string;
  dbPath: string;
  port: number;
  frontendOrigin: string;
  frontendOrigins: string[];
  frontendDir: string;
  playerKey?: string;
  ffmpegLocation?: string;
  smtp: SmtpConfig;
  pulseAudioServer?: string;
  ffplayPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  queueRandomMinRemaining: number;
  queueRandomFillSize: number;
  downloadMaxConcurrency: number;
  downloadMaxAttempts: number;
  downloadRetryDelayMs: number;
}
