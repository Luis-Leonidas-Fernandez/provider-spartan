import { extractCodexAccountInfo } from "../../../shared/oauth/codex-account-info.js";

export function buildCodexConnectionMetadata(input: {
  accessToken: string;
  idToken: string | null;
  scopes?: string[];
}) {
  const extracted = extractCodexAccountInfo(input.idToken ?? input.accessToken);
  return {
    ...(extracted.accountEmail ? { accountEmail: extracted.accountEmail } : {}),
    ...(extracted.chatgptAccountId ? { chatgptAccountId: extracted.chatgptAccountId } : {}),
    ...(extracted.chatgptPlanType ? { chatgptPlanType: extracted.chatgptPlanType } : {}),
    ...(typeof extracted.jwtExp === "number" ? { jwtExp: extracted.jwtExp } : {}),
    ...(input.scopes?.length ? { scopes: input.scopes } : {}),
  };
}

