const BASE64_BLOCK_SIZE = 4;

export type CodexAccountInfo = {
  accountEmail?: string | undefined;
  chatgptAccountId?: string | undefined;
  chatgptPlanType?: string | undefined;
  jwtExp?: number | undefined;
};

export function decodeJwtPayload(jwt: string | null | undefined): Record<string, unknown> | null {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const missingPadding = (BASE64_BLOCK_SIZE - (base64.length % BASE64_BLOCK_SIZE)) % BASE64_BLOCK_SIZE;
    const padded = base64 + "=".repeat(missingPadding);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function extractCodexAccountInfo(token: string | null | undefined): CodexAccountInfo {
  const payload = decodeJwtPayload(token);
  if (!payload) return {};
  const auth = payload["https://api.openai.com/auth"];
  const authClaims = auth && typeof auth === "object" && !Array.isArray(auth) ? auth as Record<string, unknown> : {};
  const accountEmail = typeof payload.email === "string"
    ? payload.email
    : typeof payload.preferred_username === "string"
      ? payload.preferred_username
      : undefined;
  return {
    ...(accountEmail ? { accountEmail } : {}),
    ...(typeof authClaims.chatgpt_account_id === "string"
      ? { chatgptAccountId: authClaims.chatgpt_account_id }
      : typeof payload.account_id === "string"
        ? { chatgptAccountId: payload.account_id }
        : {}),
    ...(typeof authClaims.chatgpt_plan_type === "string"
      ? { chatgptPlanType: authClaims.chatgpt_plan_type }
      : typeof payload.plan_type === "string"
        ? { chatgptPlanType: payload.plan_type }
        : {}),
    ...(typeof payload.exp === "number" ? { jwtExp: payload.exp } : {}),
  };
}
