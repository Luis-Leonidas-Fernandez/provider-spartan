import type { ProviderCredentialMetadata } from "../../core/provider-auth.types.js";
import type { GeminiCodeAssistProbeResult, GeminiUserInfo } from "./gemini-oauth-client.js";

export function buildGeminiConnectionMetadata(input: {
  userInfo?: GeminiUserInfo | null;
  scopes?: string[] | null;
  codeAssist?: GeminiCodeAssistProbeResult | null;
  previousMetadata?: ProviderCredentialMetadata;
}) {
  const previousMetadata = input.previousMetadata ?? {};
  const userInfo = input.userInfo ?? {};
  const codeAssist = input.codeAssist ?? null;

  return {
    ...previousMetadata,
    provider: "gemini",
    integrationVariant: "gemini-cli-code-assist",
    authMethod: "oauth",
    ...(typeof userInfo.email === "string" && userInfo.email.trim() ? { accountEmail: userInfo.email.trim() } : {}),
    ...(typeof userInfo.name === "string" && userInfo.name.trim() ? { accountName: userInfo.name.trim() } : {}),
    ...(typeof userInfo.id === "string" && userInfo.id.trim() ? { googleSubject: userInfo.id.trim() } : {}),
    ...(typeof userInfo.picture === "string" && userInfo.picture.trim() ? { avatarUrl: userInfo.picture.trim() } : {}),
    ...(input.scopes?.length ? { scopes: [...input.scopes] } : {}),
    codeAssist: {
      probeStatus: codeAssist?.probeStatus ?? "failed",
      eligibility: codeAssist?.eligibility ?? "unknown",
      runtimeStatus: "untested",
      ...(codeAssist?.projectId ? { projectId: codeAssist.projectId } : {}),
      ...(codeAssist?.checkedAt ? { checkedAt: codeAssist.checkedAt } : {}),
      ...(codeAssist?.error ? { error: codeAssist.error } : {}),
    },
  } satisfies ProviderCredentialMetadata;
}
