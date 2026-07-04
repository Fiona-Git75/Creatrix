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
import * as schemaModule from "../shared/schema";
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

// ── Registry completeness check ────────────────────────────────────────────────
// Auto-detect every Drizzle SQLite table in the schema module by looking for the
// well-known internal symbol drizzle-orm stamps on every table instance.
// Fails loudly if a new table was added to shared/schema.ts but not registered here.

const DRIZZLE_TABLE_SYMBOL = Symbol.for("drizzle:Name");

function isDrizzleTable(val: unknown): boolean {
  return val !== null && typeof val === "object" && DRIZZLE_TABLE_SYMBOL in (val as object);
}

const schemaTableNames = Object.entries(schemaModule)
  .filter(([, val]) => isDrizzleTable(val))
  .map(([key]) => key);

// Fail-closed sanity guard: if detection finds zero baseline tables it means
// drizzle-orm changed its internal symbol and the check is silently broken.
const BASELINE_TABLES = ["users", "connections", "conversations"];
const brokenDetection = BASELINE_TABLES.filter(t => !schemaTableNames.includes(t));
if (brokenDetection.length > 0) {
  console.error("=".repeat(70));
  console.error("DETECTION BROKEN — baseline tables not found by isDrizzleTable():");
  console.error(`  ${brokenDetection.join(", ")}`);
  console.error(`Symbol.for("drizzle:Name") may have changed in a drizzle-orm upgrade.`);
  console.error("Update isDrizzleTable() in this file and in client/src/__tests__/schema-upgrade-safety.test.tsx.");
  console.error("=".repeat(70));
  process.exit(1);
}

const missingFromRegistry = schemaTableNames.filter(name => !(name in ALL_TABLES));

if (missingFromRegistry.length > 0) {
  console.error("=".repeat(70));
  console.error("REGISTRY INCOMPLETE — tables in shared/schema.ts not in ALL_TABLES:");
  console.error("=".repeat(70));
  missingFromRegistry.forEach(n => console.error(`  - ${n}`));
  console.error(
    "\nFix: add each missing table to ALL_TABLES in:\n" +
    "  scripts/check-founding-columns.ts\n" +
    "  client/src/__tests__/schema-upgrade-safety.test.tsx\n\n" +
    "Without this registration the column audit silently skips the new table's columns."
  );
  process.exit(1);
}

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
