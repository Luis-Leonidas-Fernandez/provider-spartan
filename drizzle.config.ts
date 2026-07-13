import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

loadEnv();

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./provider_gateway.db",
  },
});
