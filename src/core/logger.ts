type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

export function createLogger(level: Level): Logger {
  const write = (target: Level, message: string, meta?: Record<string, unknown>) => {
    if (order[target] < order[level]) return;
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    console[target === "debug" ? "log" : target](`[${target.toUpperCase()}] ${message}${payload}`);
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}
