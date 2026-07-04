---
name: SQLite migration
description: Details of the PostgreSQL → SQLite migration using @libsql/client
---

## What changed
PostgreSQL (pg + connect-pg-simple + drizzle-orm/node-postgres) replaced by SQLite via `@libsql/client` and `drizzle-orm/libsql`. Database file at `./data/creatrix.db` (env var `SQLITE_PATH` overrides).

## Why @libsql/client (not better-sqlite3)
`better-sqlite3` is a native Node module requiring Python/node-gyp to compile. Replit's NixOS sandbox has no Python, so compilation fails. `@libsql/client` ships pre-built binaries and installs cleanly.

## Key schema changes
- `pgTable` → `sqliteTable` (drizzle-orm/sqlite-core)
- `boolean` → `integer({ mode: 'boolean' })`
- `jsonb` → `text` — manual JSON.stringify/parse in storage layer
- `text().array()` → `text` — same manual JSON approach
- `serial().primaryKey()` → `integer().primaryKey({ autoIncrement: true })` (system_logs only)
- `timestamp().defaultNow()` → `integer({ mode: 'timestamp_ms' }).$defaultFn(...)` (system_logs only)
- `varchar` → `text` (no length limits in SQLite)

## JSON columns requiring manual serialize/deserialize
- `conversations.messages` — Message[]
- `knowledgeDocuments.chunks` — DocumentChunk[]
- `settings.libraryPaths` — string[]
- `libraryItems.tags` — string[]

## Raw SQL in storage.ts
Use `this.db.$client.execute({ sql, args })` for raw SQL (initVectorStore, storeChunkEmbeddings, deleteChunkEmbeddings). The drizzle-orm/libsql TypeScript types don't expose `.execute()` on the db object itself.

## Session store
`connect-pg-simple` removed entirely. Express session uses the default in-memory store — acceptable for single-user local use (session resets on server restart only).

## Vector store (pgvector)
pgvector queries removed from `searchDocuments()`. `initVectorStore()` creates a plain text `chunk_embeddings` table. Semantic search degrades gracefully to keyword search.

## Service runtime
`PostgresService` replaced by `SqliteService` in `server/runtime/services/sqlite.ts`. The probe uses `db.$client.execute()` via a dynamic import of `../../storage`.

**Why:** SQLite is file-embedded — no daemon, no TCP connection. The service probe verifies the file exists and can execute queries.
