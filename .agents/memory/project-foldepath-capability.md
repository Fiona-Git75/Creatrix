---
name: Project folderPath in capability context
description: When invoking capabilities in the chat route, use project.folderPath over settings.rootFolder when a project is active.
---

# Project folderPath in Capability Context

## The Rule
In `server/routes.ts` chat route, when calling `invokeCapability`, pass `{ rootFolder: project?.folderPath || settings.rootFolder, storageRef: storage }`. The project's `folderPath` scopes filesystem operations to the project's directory.

## Why
Each project can have its own `folderPath` (set in ProjectsDialog). Filesystem capabilities (read_file, write_file, etc.) should operate relative to that folder when in a project context, not the global rootFolder from settings.

## How to Apply
The `project` variable is fetched early in the chat route handler (when projectId is present). Keep it accessible (declared with `let project`) so it's in scope when `invokeCapability` is called later in the same handler. Already implemented in current `server/routes.ts`.
