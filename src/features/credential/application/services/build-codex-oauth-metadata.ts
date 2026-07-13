import { extractCodexAccountInfo } from "../../../../shared/oauth/codex-account-info.js";

type BuildCodexOauthMetadataInput = {
  accessToken: string;
  idToken?: string | undefined;
  workspaceId?: string | undefined;
  chatgptAccountId?: string | undefined;
  accountEmail?: string | undefined;
  planType?: string | undefined;
  refreshToken?: string | undefined;
  refreshTokenExists?: boolean | undefined;
};

export function buildCodexOauthMetadata(input: BuildCodexOauthMetadataInput) {
  const extracted = extractCodexAccountInfo(input.idToken ?? input.accessToken);
  const isRefreshableOauth = Boolean(input.refreshToken || input.refreshTokenExists);

  return {
    authMethod: isRefreshableOauth ? "oauth" : "access_token",
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.chatgptAccountId ? { chatgptAccountId: input.chatgptAccountId } : {}),
    ...(input.accountEmail ? { accountEmail: input.accountEmail } : {}),
    ...(input.planType ? { chatgptPlanType: input.planType } : {}),
    ...(extracted.accountEmail ? { accountEmail: extracted.accountEmail } : {}),
    ...(extracted.chatgptAccountId ? { chatgptAccountId: extracted.chatgptAccountId } : {}),
    ...(extracted.chatgptPlanType ? { chatgptPlanType: extracted.chatgptPlanType } : {}),
    ...(typeof extracted.jwtExp === "number" ? { jwtExp: extracted.jwtExp } : {}),
  };
}
