export type SubscriptionPlan = {
  id: string;
  name: string;
  monthlyRequestLimit: number;
  monthlyTokenLimit: number;
  monthlyBudgetUsd: number;
  allowedProvidersJson: string;
  allowedModelsJson: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppSubscriptionStatus = "active" | "inactive" | "expired" | "cancelled";

export type AppSubscription = {
  id: string;
  appClientId: string;
  planId: string;
  status: AppSubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};
