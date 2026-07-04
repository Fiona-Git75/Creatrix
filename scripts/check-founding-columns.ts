/**
 * check-founding-columns.ts
 *
 * Developer helper — run with:
 *   npx tsx scripts/check-founding-columns.ts
 *
 * Prints every NOT NULL, non-PK column in shared/schema.ts that has NO SQL-level
 * DEFAULT clause, grouped by table.  These are the columns that MUST either:
 *
 *   A) Get a .default(...) added in shared/schema.ts, OR
 *   B) Be made nullable, OR
 *   C) Appear in the FOUNDING_COLUMNS allowlist in shared/founding-columns.ts
 *      (only if the column is part of the original CREATE TABLE and will never
 *      be ALTER TABLE'd onto an existing database that already has rows).
 *
 * WHEN TO RUN THIS:
 *   - After adding a new table to shared/schema.ts
 *   - After the schema-upgrade-safety test fails with a FOUNDING_COLUMNS error
 *   - When onboarding — to understand which columns are safety-sensitive
 *
 * OUTPUT FORMAT:
 *   <tableName>.<columnKey>   [has $defaultFn]   ← columns to review
 *
 * Columns marked "[has $defaultFn]" use a JS-side default function. That does NOT
 * produce a SQL DEFAULT clause, so SQLite would reject adding them via ALTER TABLE
 * to a table that already has rows — they must be in FOUNDING_COLUMNS if they are
 * part of the original CREATE TABLE.
 */

import {
  users,
  connections,
  projects,
  conversations,
  memoryEntries,
  knowledgeDocuments,
  settings,
  libraryFolders,
  libraryItems,
  journalEntries,
  conversationFlags,
  workspaceDocs,
  consultants,
  systemLogs,
} from "../shared/schema";
import { FOUNDING_COLUMNS } from "../shared/founding-columns";

const ALL_TABLES: Record<string, Record<string, unknown>> = {
  users,
  connections,
  projects,
  conversations,
  memoryEntries,
  knowledgeDocuments,
  settings,
  libraryFolders,
  libraryItems,
  journalEntries,
  conversationFlags,
  workspaceDocs,
  consultants,
  systemLogs,
};

// ── Scan ──────────────────────────────────────────────────────────────────────

type ColMeta = { notNull?: boolean; hasDefault?: boolean; primary?: boolean; defaultFn?: unknown };

const unregistered: string[] = [];
const registered: string[] = [];

for (const [tableName, table] of Object.entries(ALL_TABLES)) {
  for (const [colKey, colDef] of Object.entries(table)) {
    const col = colDef as ColMeta;
    if (!col || typeof col !== "object") continue;
    if (!("notNull" in col)) continue;

    const isNotNull = col.notNull === true;
    const hasSqlDefault = col.hasDefault === true;
    const isPrimaryKey = col.primary === true;
    const hasDefaultFn = typeof col.defaultFn === "function";

    if (isNotNull && !hasSqlDefault && !isPrimaryKey) {
      const key = `${tableName}.${colKey}`;
      const suffix = hasDefaultFn ? "  [has $defaultFn — no SQL DEFAULT, must be in FOUNDING_COLUMNS]" : "";
      if (FOUNDING_COLUMNS.has(key)) {
        registered.push(`  ${key}${suffix}`);
      } else {
        unregistered.push(`  ${key}${suffix}  ← NOT in FOUNDING_COLUMNS — test will fail!`);
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("NOT NULL columns without a SQL DEFAULT");
console.log("=".repeat(70));

if (unregistered.length === 0 && registered.length === 0) {
  console.log("\n✓ No NOT NULL columns without a SQL DEFAULT found.");
} else {
  if (unregistered.length > 0) {
    console.log(`\n⚠  UNREGISTERED (schema-upgrade-safety test WILL FAIL):\n`);
    unregistered.forEach(l => console.log(l));
    console.log(
      `\n  To fix: add .default(...), make nullable, or add to FOUNDING_COLUMNS in\n` +
      `  shared/founding-columns.ts`
    );
  }

  if (registered.length > 0) {
    console.log(`\n✓  REGISTERED in FOUNDING_COLUMNS (test passes for these):\n`);
    registered.forEach(l => console.log(l));
  }
}

console.log("\n" + "=".repeat(70));

if (unregistered.length > 0) {
  process.exit(1);
}
