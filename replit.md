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
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` using Drizzle's table definitions
- **Validation**: Zod schemas generated from Drizzle schemas via `drizzle-zod`
- **Migrations**: Managed via `drizzle-kit push`

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
- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Uses `connect-pg-simple` for session storage

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

The project is hosted on GitHub at **https://github.com/Fiona-Git75/Creatrix**. Replit pushes every checkpoint there automatically.

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