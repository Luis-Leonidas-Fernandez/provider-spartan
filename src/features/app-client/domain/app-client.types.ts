export type AppClient = {
  id: string;
  name: string;
  description: string | null;
  apiKeyHash: string;
  apiKeyPrefix: string;
  apiKeyLastFour: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAppClientInput = {
  name: string;
  description?: string | null | undefined;
};

export type UpdateAppClientInput = {
  id: string;
  name?: string | undefined;
  description?: string | null | undefined;
  isActive?: boolean | undefined;
};
