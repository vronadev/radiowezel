import type { NowPlaying, PlayerStatus } from "../@types/models.js";

export type { NowPlaying, PlayerStatus };

export interface IAudioPlayer {
  play(): Promise<void> | void;
  stop(): void;
  skip(): void;
  pause(paused: boolean): void;
  getStatus(): PlayerStatus;
}
