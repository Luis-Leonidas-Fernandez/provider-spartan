import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const credentialParamsSchema = z.object({ providerId: nonEmptyString });
export const storeApiKeyBodySchema = z.object({ apiKey: nonEmptyString, tokenExpiresAt: nonEmptyString.optional().nullable() });
export const storeTokenBodySchema = z.object({
  token: nonEmptyString,
  tokenExpiresAt: nonEmptyString.optional().nullable(),
  refreshTokenExists: z.boolean().default(false),
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});
export const storeOauthTokenBodySchema = z.object({
  accessToken: nonEmptyString,
  refreshToken: nonEmptyString.optional(),
  idToken: nonEmptyString.optional(),
  tokenExpiresAt: nonEmptyString.optional().nullable(),
  workspaceId: nonEmptyString.optional(),
  chatgptAccountId: nonEmptyString.optional(),
  accountEmail: z.string().email().optional(),
  planType: nonEmptyString.optional(),
  refreshTokenExists: z.boolean().default(false),
});
export const oauthCallbackQuerySchema = z.object({
  state: nonEmptyString,
  code: nonEmptyString,
});
