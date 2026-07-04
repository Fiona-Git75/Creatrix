/**
 * founding-columns.ts
 *
 * Single source of truth for the FOUNDING_COLUMNS allowlist.
 *
 * These are columns that are legitimately NOT NULL without a SQL-level DEFAULT.
 * They exist in the original CREATE TABLE statement for their table — they are
 * safe there because the application always supplies a value at INSERT time.
 *
 * They would be UNSAFE if added to an existing table via ALTER TABLE ADD COLUMN
 * (SQLite rejects adding a NOT NULL column without a default when rows exist).
 *
 * HOW TO MAINTAIN THIS LIST:
 *  - If you add a new NOT NULL column WITH a default or nullable, do nothing.
 *  - If you add a new NOT NULL column WITHOUT a default that is part of the
 *    original table definition (i.e. it will never be ALTER TABLE'd onto an
 *    existing DB), add it here with a comment explaining why it is safe.
 *  - NEVER add a column here just to make the test pass if the real intent is
 *    to ALTER TABLE onto an existing production database that has rows.
 *
 * Consumed by:
 *  - client/src/__tests__/schema-upgrade-safety.test.tsx  (static audit test)
 *  - scripts/check-founding-columns.ts                    (developer helper script)
 */
export const FOUNDING_COLUMNS = new Set<string>([
  // users
  "users.username",
  "users.password",

  // connections
  "connections.name",
  "connections.provider",
  "connections.endpoint",
  "connections.defaultModel",

  // projects
  "projects.name",
  "projects.createdAt",

  // conversations
  "conversations.title",
  "conversations.model",
  "conversations.createdAt",
  "conversations.updatedAt",

  // memoryEntries
  "memoryEntries.scope",
  "memoryEntries.content",
  "memoryEntries.createdAt",

  // knowledgeDocuments
  "knowledgeDocuments.title",
  "knowledgeDocuments.source",
  "knowledgeDocuments.content",
  "knowledgeDocuments.createdAt",

  // systemLogs — timestamp uses $defaultFn (JS-side, not a SQL DEFAULT). It is safe here
  // because it has been part of the CREATE TABLE statement from the start, not added via
  // ALTER TABLE. $defaultFn does NOT produce a SQL DEFAULT clause, so SQLite would reject
  // adding this column to an existing table with rows — hence it must live in the allowlist.
  "systemLogs.timestamp",
  "systemLogs.level",
  "systemLogs.category",
  "systemLogs.message",

  // libraryFolders
  "libraryFolders.name",
  "libraryFolders.createdAt",

  // libraryItems
  "libraryItems.title",
  "libraryItems.source",
  "libraryItems.createdAt",

  // journalEntries
  "journalEntries.type",
  "journalEntries.title",
  "journalEntries.createdAt",

  // conversationFlags
  "conversationFlags.conversationId",
  "conversationFlags.conversationTitle",
  "conversationFlags.pivotSentence",
  "conversationFlags.createdAt",

  // workspaceDocs
  "workspaceDocs.title",
  "workspaceDocs.updatedAt",
  "workspaceDocs.createdAt",

  // consultants
  "consultants.projectId",
  "consultants.name",
  "consultants.description",
  "consultants.connectionId",
  "consultants.model",
  "consultants.systemPrompt",
  "consultants.createdAt",
]);
