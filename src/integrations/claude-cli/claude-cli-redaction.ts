const URL_SECRET_KEYS = new Set([
  "code",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "authorization",
  "session",
]);

function redactUrlSecrets(value: string) {
  return value.replace(/https?:\/\/[^\s]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      for (const key of [...url.searchParams.keys()]) {
        if (URL_SECRET_KEYS.has(key.toLowerCase())) {
          url.searchParams.set(key, "[REDACTED]");
        }
      }
      return url.toString();
    } catch {
      return raw;
    }
  });
}

export function redactClaudeCliOutput(value: string) {
  return redactUrlSecrets(value)
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/((?:access_token|refresh_token|id_token|client_secret|authorization|code)\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]")
    .replace(/("?(?:access_token|refresh_token|id_token|client_secret|authorization|code)"?\s*[:=]\s*")([^"]+)(")/gi, "$1[REDACTED]$3");
}
