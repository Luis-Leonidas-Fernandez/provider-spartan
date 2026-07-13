const CLAUDE_SUBSCRIPTION_BLOCKED_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
] as const;

export type SanitizedClaudeSubscriptionEnvironment = {
  childEnv: NodeJS.ProcessEnv;
  removedKeys: string[];
};

export function sanitizeClaudeSubscriptionEnvironment(
  sourceEnv: NodeJS.ProcessEnv,
  additionalEnv?: NodeJS.ProcessEnv,
): SanitizedClaudeSubscriptionEnvironment {
  const childEnv: NodeJS.ProcessEnv = {
    ...sourceEnv,
    ...(additionalEnv ?? {}),
  };
  const removedKeys: string[] = [];

  for (const key of CLAUDE_SUBSCRIPTION_BLOCKED_ENV_KEYS) {
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
