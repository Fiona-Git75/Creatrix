import { defineConfig } from "drizzle-kit";

const dbPath = process.env.SQLITE_PATH ?? "./data/creatrix.db";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
