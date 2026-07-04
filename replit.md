# AI Chat - Self-Hosted AI Interface

## Overview

A self-hosted AI chat interface that allows users to interact with multiple AI providers (OpenAI, Ollama, LM Studio, or custom endpoints). The application features a clean, modern design inspired by ChatGPT, Linear, and Notion, with support for multiple conversations, projects for organization, and configurable AI connections.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state, React hooks for local state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with React plugin
- **Theme**: Light/dark mode support with CSS variables

The frontend follows a component-based architecture with:
- Page components in `client/src/pages/`
- Reusable UI components in `client/src/components/`
- shadcn/ui primitives in `client/src/components/ui/`
- Custom hooks in `client/src/hooks/`

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **HTTP Server**: Node's built-in `http.createServer` wrapping Express
- **API Design**: RESTful JSON API with streaming support for chat completions

Key backend patterns:
- Routes registered in `server/routes.ts`
- Storage abstraction layer in `server/storage.ts` (interface-based for easy swapping)
- AI provider abstraction in `server/providers/` supporting multiple backends
- Development uses Vite middleware, production serves static files

### Data Storage
- **ORM**: Drizzle ORM with SQLite dialect (`drizzle-orm/libsql` + `@libsql/client`)
- **Database file**: `./data/creatrix.db` (override with `SQLITE_PATH` env var)
- **Schema**: Defined in `shared/schema.ts` using Drizzle's SQLite table definitions
- **Validation**: Zod schemas generated from Drizzle schemas via `drizzle-zod`
- **Migrations**: SQL files in `./migrations/`, generated with `npx drizzle-kit generate`

**Automatic migration on startup:** `DatabaseStorage.initialize()` runs a custom idempotent migration runner (`_runMigrations`) before any table access. It reads `migrations/meta/_journal.json`, tracks which files have been applied in a `__creatrix_migrations` table embedded in the SQLite file, and applies only new ones. `CREATE TABLE` / `CREATE INDEX` statements are rewritten to `IF NOT EXISTS` form so the runner is safe against existing databases created before migration tracking was introduced. No manual `drizzle-kit push` step is required — pulling a new release and restarting the server is sufficient to upgrade the schema.

Core data models:
- Users (authentication)
- Connections (AI provider configurations)
- Projects (conversation organization)
- Conversations (chat history with messages as JSONB)
- Memory entries (context persistence)
- Knowledge documents (project-specific context)

### AI Provider System
The application supports multiple AI providers through a unified interface:
- **OpenAI**: Standard OpenAI API
- **Ollama**: Local LLM server
- **LM Studio**: Local model hosting
- **Custom**: Any OpenAI-compatible endpoint

Providers implement streaming for real-time response delivery.

## External Dependencies

### AI Services
- OpenAI API (optional, requires API key)
- Ollama (optional, local installation at localhost:11434)
- LM Studio (optional, local installation at localhost:1234)
- Any OpenAI-compatible API endpoint

### Database
- SQLite via `@libsql/client` + `drizzle-orm/libsql`; database file at `./data/creatrix.db`
- Override the path with the `SQLITE_PATH` environment variable
- Schema migrations run automatically on every server startup — no manual step needed

### Frontend Libraries
- TanStack React Query for data fetching
- Radix UI primitives (via shadcn/ui) for accessible components
- Lucide React for icons
- class-variance-authority for component variants

### Build & Development
- Vite for frontend bundling and HMR
- esbuild for server bundling (production)
- tsx for TypeScript execution in development
- Replit-specific plugins for development overlay and cartographer

## Keeping Your Local Copy Up to Date

The project is hosted on GitHub at **https://github.com/Fiona-Git75/Creatrix**.

> ⚠️ **Platform issue (Replit support ticket open):** Replit's platform-level GitHub binding is incorrectly set to the non-existent `Kitt-Kaleen/Creatrix-UI`. This is a Replit-side configuration failure — automatic checkpoint sync to GitHub is not working until support resolves it. The correct repository is `Fiona-Git75/Creatrix`.

### First-time setup (one time only)

If you downloaded the files manually, open a terminal in your project folder on your desktop and run:

```bash
git init
git remote add origin https://github.com/Fiona-Git75/Creatrix.git
git fetch origin
git reset --hard origin/main
```

> **Note:** `git reset --hard` will overwrite your local files with the version from GitHub. Only do this if you haven't made local edits you want to keep.

### Getting future updates

After the first-time setup, every future update is just:

```bash
git pull origin main
```

Then restart your local server (`npm run dev`) and hard-refresh your browser.

### If you want a clean install instead

```bash
git clone https://github.com/Fiona-Git75/Creatrix.git
cd Creatrix
npm install
npm run dev
```

## Running Locally

The intended local architecture is fully native — every service runs directly on
the host with no Docker layer between it and Creatrix:

```
Host machine
├── Creatrix       (npm run dev)          ← SQLite DB auto-created at ./data/creatrix.db
├── Ollama         (ollama serve)
├── SearXNG        (systemctl start searxng)          ← optional: web search
└── Whisper        (faster-whisper-server --model base --port 9000)  ← optional: transcription
```

**Why native over Docker?** Docker health-checks confirm containers are managed —
not that services are accepting connections. Creatrix's coherence probes
(`SELECT 1`, `GET /search?format=json`, `GET /v1/models`) are the authoritative
readiness check; they work the same regardless of how the service was started,
and they give precise feedback when something is wrong.

### Quick start

```bash
# 1. Run Creatrix (no external database needed — SQLite is file-embedded)
npm install
npm run dev

# 2. Optional: start search and transcription
sudo systemctl start searxng             # or: python searx/webapp.py
faster-whisper-server --model base --host 0.0.0.0 --port 9000
```

> **Schema migrations run automatically** on every startup. After pulling a new
> release, just restart the server — the database schema is updated in place.

Then open Settings in Creatrix and set:
- Search endpoint: `http://localhost:8080`
- Whisper endpoint: `http://localhost:9000`

Creatrix auto-discovers Ollama at `localhost:11434` — no manual connection setup needed.

### Legacy: Docker backing services

A `docker-compose.yml` is still included if you prefer Docker for one or more services.
Note that Docker's green checks are not a reliable indicator of service reachability —
Creatrix will probe the actual connection regardless.

### Full server deployment (Creatrix in a container)

If you want to run Creatrix itself in a container (e.g. on a VPS), a `Dockerfile` is included.
See the **Docker Portability Note** below before running `docker compose` with a custom compose file that includes the app service.

## Docker Portability Note

`package-lock.json` exported from Replit contains `resolved` URLs pointing at Replit's internal package proxy (`http://package-firewall.replit.local/npm/...`). Those URLs are unreachable outside Replit, causing `npm ci` to hang on DNS retries and ultimately fail — which can look like a missing-binary or PATH problem.

The `Dockerfile` in this repo handles this automatically with a `sed` pass before `npm ci`:

```dockerfile
RUN sed -i 's|http://package-firewall.replit.local/npm|https://registry.npmjs.org|g' \
        package-lock.json
```

If you run `npm ci` locally from an exported copy rather than through Docker, run the same substitution first, or use `npm install` (which re-resolves from your configured registry and ignores the `resolved` field).

## Known Audit Warnings

These items appear in `npm audit` and have been consciously left in place. They are documented here so anyone deploying or forking the project can make an informed decision.

### xlsx (HIGH — no fix available)
**Advisory:** Prototype Pollution and ReDoS in SheetJS.
**Why it's here:** Used in `server/capabilities/filesystem.ts` to let the AI read `.xlsx` and `.xls` files from your notes folder.
**Why it's acceptable:** The vulnerability requires a maliciously crafted spreadsheet file. In a self-hosted personal environment where you control your own files, this attack vector does not exist. If you accept files from untrusted sources, consider removing xlsx support or replacing the library.
**To disable:** Remove the `.xlsx`/`.xls` branch in `server/capabilities/filesystem.ts`.

### drizzle-orm < 0.45.2 (HIGH)
**Advisory:** SQL injection via improperly escaped SQL identifiers.
**Why it's here:** Current version is 0.39.3. Upgrading to 0.45.2 is a breaking change across six minor versions of a library with frequent breaking changes.
**Why it's acceptable:** The vulnerability affects dynamic SQL identifiers (table/column names supplied at runtime). This application uses only static, schema-defined identifiers from `shared/schema.ts`. User input is passed exclusively as parameterized values, never as identifiers. The attack vector does not apply.
**To fix:** Run `npm audit fix --force` and test schema/query behaviour thoroughly after the upgrade.

### esbuild ≤ 0.24.2 / Vite ≤ 6.4.2 (MODERATE)
**Advisory:** esbuild's development server allows cross-origin requests.
**Why it's acceptable:** This is a development-server-only vulnerability with no production impact. Fixing it would require upgrading to Vite 8, a major breaking change. Safe to leave unless you expose your dev server to untrusted networks.