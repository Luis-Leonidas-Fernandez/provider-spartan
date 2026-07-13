const CURSOR_SUBSCRIPTION_BLOCKED_ENV_KEYS = [
  "CURSOR_API_KEY",
  "CURSOR_BASE_URL",
  "CURSOR_MODEL",
  "CURSOR_FORCE_API_MODE",
] as const;

export type SanitizedCursorSubscriptionEnvironment = {
  childEnv: NodeJS.ProcessEnv;
  removedKeys: string[];
};

export function sanitizeCursorSubscriptionEnvironment(
  sourceEnv: NodeJS.ProcessEnv,
  additionalEnv?: NodeJS.ProcessEnv,
): SanitizedCursorSubscriptionEnvironment {
  const childEnv: NodeJS.ProcessEnv = {
    ...sourceEnv,
    ...(additionalEnv ?? {}),
  };
  const removedKeys: string[] = [];

  for (const key of CURSOR_SUBSCRIPTION_BLOCKED_ENV_KEYS) {
    if (key in childEnv) {
      removedKeys.push(key);
      delete childEnv[key];
    }
  }

  return {
    childEnv,
    removedKeys,
  };
}
