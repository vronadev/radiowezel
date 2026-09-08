import type { IDatabase } from "../interfaces/IDatabase.js";
import { EmailTokenRepository } from "../repositories/emailTokenRepository.js";
import { PlaylistRepository } from "../repositories/playlistRepository.js";
import { PlaylistScheduleRepository } from "../repositories/playlistScheduleRepository.js";
import { SettingsRepository } from "../repositories/settingsRepository.js";
import { SongRepository } from "../repositories/songRepository.js";
import { SongRequestRepository } from "../repositories/songRequestRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { VoteRepository } from "../repositories/voteRepository.js";
import { EmailTokenService } from "../services/emailTokenService.js";
import { PlaylistService } from "../services/playlistService.js";
import { ScheduleService } from "../services/scheduleService.js";
import { SettingsService } from "../services/settingsService.js";
import { SongRequestService } from "../services/songRequestService.js";
import { SongService } from "../services/songService.js";
import { UserService } from "../services/userService.js";
import { VoteService } from "../services/voteService.js";

export interface DataLayer {
  database: IDatabase;
  settingsService: SettingsService;
  scheduleService: ScheduleService;
  playlistService: PlaylistService;
  songService: SongService;
  songRequestService: SongRequestService;
  voteService: VoteService;
  userService: UserService;
  emailTokenService: EmailTokenService;
}

export class DataLayerFactory {
  static create(database: IDatabase): DataLayer {
    const settingsRepository = new SettingsRepository(database);
    const playlistRepository = new PlaylistRepository(database);
    const playlistScheduleRepository = new PlaylistScheduleRepository(database);
    const songRepository = new SongRepository(database);
    const songRequestRepository = new SongRequestRepository(database);
    const voteRepository = new VoteRepository(database);
    const userRepository = new UserRepository(database);
    const emailTokenRepository = new EmailTokenRepository(database);

    const settingsService = new SettingsService(settingsRepository);
    const scheduleService = new ScheduleService(playlistScheduleRepository);
    const playlistService = new PlaylistService(playlistRepository, scheduleService, settingsService);
    const songService = new SongService(
      songRepository,
      playlistRepository,
      voteRepository,
      songRequestRepository,
      playlistService,
      database,
    );
    const songRequestService = new SongRequestService(songRequestRepository);
    const voteService = new VoteService(voteRepository, songRepository, settingsService, database);
    const userService = new UserService(userRepository);
    const emailTokenService = new EmailTokenService(emailTokenRepository);

    return {
      database,
      settingsService,
      scheduleService,
      playlistService,
      songService,
      songRequestService,
      voteService,
      userService,
      emailTokenService,
    };
  }
}
