---
name: SQLite migration
description: Architectural decisions from PostgreSQL → SQLite migration
---

## Why @libsql/client (not better-sqlite3)
`better-sqlite3` is a native Node module requiring Python/node-gyp to compile. Replit's NixOS sandbox has no Python, so compilation fails. `@libsql/client` ships pre-built binaries and installs cleanly.
**How to apply:** Any future native-module dependency needs the same check — prefer pure-JS or pre-built binaries.

## JSON columns: serialize manually
SQLite has no jsonb type. Arrays and objects in schema must be stored as `text` with explicit JSON.stringify/parse in the storage layer. `text().array()` is also not supported — same manual approach.
**How to apply:** Adding new array/object fields to the schema → always `text`, always serialize/deserialize in storage.ts.

## Raw SQL path
Use `this.db.$client.execute({ sql, args })` for raw SQL (initVectorStore, etc). The drizzle-orm/libsql TypeScript types don't expose `.execute()` on the db object directly.

## Session store: in-memory by design
Express session uses the default in-memory store. Intentional for local-first single-user use — session resets on server restart, which is acceptable. A SQLite-backed store (e.g. better-sqlite3-session-store) would be needed only for multi-user or zero-downtime deployments.
**Why:** Avoids a native module dependency (better-sqlite3) and matches the single-machine use case.

## PostgreSQL backup scripts removed
`scripts/services/postgres-backup.sh/.service/.timer` deleted — no PostgreSQL to back up. SQLite backup is a file copy (`cp ./data/creatrix.db ./data/creatrix.db.bak`), no equivalent scripts added yet.

## Service probe
`PostgresService` → `SqliteService`. Probe uses `db.$client.execute()` via dynamic import of `../../storage`. SQLite is file-embedded — no daemon, no TCP. Probe verifies file open + query execution.
