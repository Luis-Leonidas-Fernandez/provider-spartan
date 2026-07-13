const REDACTION_PATTERNS: RegExp[] = [
  /(access[_-]?token=)[^&\s]+/gi,
  /(refresh[_-]?token=)[^&\s]+/gi,
  /(code=)[^&\s]+/gi,
  /(token\b["'\s:=]+)[A-Za-z0-9._-]+/gi,
];

export function redactCursorCliOutput(value: string) {
  return REDACTION_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED]`),
    value,
  );
}
