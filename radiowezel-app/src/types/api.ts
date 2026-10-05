export const ALLOWED_EMAIL_DOMAIN = "zsi.kielce.pl";

export interface ScheduleSlot {
  start: string; // "HH:mm"
  end: string;
  /** Playback loudness while this slot is active. Omitted means 100%. */
  volumePercentage?: number;
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
  bellStartOffsetSeconds: number;
  bellEndOffsetSeconds: number;
  fadeOutSecondsBeforeEnd: number;
  activeDays?: number[];
}

export interface ScheduleContext {
  currentSlot: { start: string; end: string } | null;
  nextSlot: { start: string; end: string } | null;
  inBreak: boolean;
}
