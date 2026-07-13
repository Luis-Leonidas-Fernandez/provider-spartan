import { z } from "zod";
import { nonEmptyString } from "../../../shared/validation/common.js";

export const providerUsageParamsSchema = z.object({ providerId: nonEmptyString });
export const appUsageParamsSchema = z.object({ appClientId: nonEmptyString });
