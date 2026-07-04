import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";

const dbPath = process.env.SQLITE_PATH ?? "./data/creatrix.db";
mkdirSync("./data", { recursive: true });

const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client);

console.log(`Running pending migrations on ${dbPath}…`);

migrate(db, { migrationsFolder: "./migrations" })
  .then(() => {
    console.log("All migrations applied.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
