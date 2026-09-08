export const ALLOWED_EMAIL_DOMAIN = "zsi.kielce.pl";

export interface ScheduleSlot {
  start: string; // "HH:mm"
  end: string;
}

export interface QueueItem {
  id: string;
  songId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  votes: number;
  position: number;
  estimatedPlayAt: string | null; // ISO datetime when song will play (next break)
  durationSeconds: number;
}

export interface NowPlaying extends QueueItem {
  startedAt: string; // ISO
}

export interface Song {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  youtubeUrl: string;
  durationSeconds: number;
  status: "pending" | "scheduled_for_download" | "verified" | "downloading" | "failed";
  localPath?: string | null;
  createdAt: string;
  voteCount?: number;
  totalVotes?: number;
  inEffectivePlaylist?: boolean;
  canVote?: boolean;
}

export interface SongRequestAggregate {
  songId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  youtubeUrl: string;
  status: string;
  requestCount: number;
  lastRequestedAt: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ScheduleConfig {
  slots: ScheduleSlot[];
  bellOffsetSeconds: number;
  fadeOutSecondsBeforeEnd: number;
}

export interface ScheduleContext {
  currentSlot: { start: string; end: string } | null;
  nextSlot: { start: string; end: string } | null;
  inBreak: boolean;
}
