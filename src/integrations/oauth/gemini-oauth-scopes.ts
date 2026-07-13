export const GEMINI_GENERATIVE_LANGUAGE_SCOPE = "https://www.googleapis.com/auth/generative-language.retriever";

export const DEFAULT_GEMINI_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

export const GEMINI_OAUTH_REST_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  GEMINI_GENERATIVE_LANGUAGE_SCOPE,
] as const;
