const ALREADY_EXISTS =
  "Există deja un cont cu această adresă de email. Conectează-te sau folosește altă adresă.";
const TOO_MANY_REQUESTS_STATUS = 429;

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email sau parolă incorecte. Verifică datele și încearcă din nou.",
  INVALID_PASSWORD: "Parola este incorectă. Încearcă din nou.",
  INVALID_EMAIL: "Adresa de email nu este validă.",
  USER_ALREADY_EXISTS: ALREADY_EXISTS,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: ALREADY_EXISTS,
  PASSWORD_TOO_SHORT: "Parola este prea scurtă. Folosește cel puțin 8 caractere.",
  PASSWORD_TOO_LONG: "Parola este prea lungă. Alege una mai scurtă.",
  EMAIL_NOT_VERIFIED: "Confirmă adresa de email înainte de a te conecta.",
};

export const NETWORK_ERROR_MESSAGE =
  "Nu ne-am putut conecta la server. Verifică conexiunea la internet și încearcă din nou.";

const FALLBACK_MESSAGE = "Ceva nu a mers bine. Încearcă din nou în câteva momente.";
const RATE_LIMIT_MESSAGE = "Prea multe încercări. Așteaptă puțin și încearcă din nou.";

/** Translates a Better Auth client error into a friendly Romanian message. */
export function getAuthErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code && Object.hasOwn(MESSAGES, error.code)) {
    return MESSAGES[error.code] ?? FALLBACK_MESSAGE;
  }
  if (error.status === TOO_MANY_REQUESTS_STATUS) {
    return RATE_LIMIT_MESSAGE;
  }
  return FALLBACK_MESSAGE;
}
