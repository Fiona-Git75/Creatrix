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
 *   C) Appear in the FOUNDING_COLUMNS allowlist in
 *      client/src/__tests__/schema-upgrade-safety.test.tsx
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

// ── Mirror of the FOUNDING_COLUMNS set in the test file ───────────────────────
// Keep this in sync with client/src/__tests__/schema-upgrade-safety.test.tsx.
// When you add a new entry there, add the same entry here so the script stays
// accurate about what is "already registered" vs "newly unregistered".
const FOUNDING_COLUMNS = new Set<string>([
  "users.username",
  "users.password",
  "connections.name",
  "connections.provider",
  "connections.endpoint",
  "connections.defaultModel",
  "projects.name",
  "projects.createdAt",
  "conversations.title",
  "conversations.model",
  "conversations.createdAt",
  "conversations.updatedAt",
  "memoryEntries.scope",
  "memoryEntries.content",
  "memoryEntries.createdAt",
  "knowledgeDocuments.title",
  "knowledgeDocuments.source",
  "knowledgeDocuments.content",
  "knowledgeDocuments.createdAt",
  "systemLogs.timestamp",
  "systemLogs.level",
  "systemLogs.category",
  "systemLogs.message",
  "libraryFolders.name",
  "libraryFolders.createdAt",
  "libraryItems.title",
  "libraryItems.source",
  "libraryItems.createdAt",
  "journalEntries.type",
  "journalEntries.title",
  "journalEntries.createdAt",
  "conversationFlags.conversationId",
  "conversationFlags.conversationTitle",
  "conversationFlags.pivotSentence",
  "conversationFlags.createdAt",
  "workspaceDocs.title",
  "workspaceDocs.updatedAt",
  "workspaceDocs.createdAt",
  "consultants.projectId",
  "consultants.name",
  "consultants.description",
  "consultants.connectionId",
  "consultants.model",
  "consultants.systemPrompt",
  "consultants.createdAt",
]);

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
      `  client/src/__tests__/schema-upgrade-safety.test.tsx\n` +
      `  AND to the FOUNDING_COLUMNS set in this script (scripts/check-founding-columns.ts).`
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
