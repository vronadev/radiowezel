export const ErrorMessages = {
  missingToken: "Brak tokenu",
  sessionExpired: "Sesja wygasła. Zaloguj się ponownie.",
  invalidToken: "Nieprawidłowy token",
  forbidden: "Brak uprawnień",
  emailRequired: "Email jest wymagany",
  emailAndPasswordRequired: "Email i hasło są wymagane",
  plusInEmail: "Adres e-mail nie może zawierać znaku +",
  invalidCredentials: "Nieprawidłowy email lub hasło",
  userNotFound: "Użytkownik nie istnieje",
  accountNotFound: "Brak konta z tym adresem. Zarejestruj się najpierw.",
  linkExpired: "Link wygasł lub jest nieprawidłowy",
  notFound: "Nie znaleziono",
  fileNotFound: "Plik nie znaleziony",
  songNotFound: "Piosenka nie znaleziona",
  songMissing: "Nie znaleziono piosenki",
  playlistNotFound: "Nie znaleziono playlisty",
  songNotVerified: "Piosenka nie jest jeszcze zweryfikowana",
  cannotVoteNow:
    "Na tę piosenkę nie można teraz głosować (nie w obowiązującej playliście lub playlista wykluczona z głosowania).",
  invalidYoutubeUrl: "Nieprawidłowy link YouTube",
  invalidYoutubePlaylistUrl: "Nieprawidłowy link playlisty YouTube",
  playlistMissingYoutubeUrl: "Playlista nie ma ustawionego linku YouTube",
  voteTargetRequired: "Podaj songId lub youtubeUrl",
  playlistNameRequired: "Podaj nazwę playlisty",
  downloadInProgress: "Pobieranie w toku",
  alreadyVerified: "Piosenka już zweryfikowana",
  verifiedNeedsPermanentDelete: "Użyj „Usuń z dysku i bazy” dla zweryfikowanych piosenek.",
  onlyVerifiedPermanentDelete: "Tylko zweryfikowane piosenki można usunąć z dysku i bazy.",
} as const;

export function allowedEmailDomainMessage(domain: string): string {
  return `Dozwolone tylko adresy @${domain}`;
}

export function voteQuotaMessage(perUser: number, periodHours: number): string {
  return `Limit głosów: ${perUser} na ${periodHours}h. Spróbuj później.`;
}
