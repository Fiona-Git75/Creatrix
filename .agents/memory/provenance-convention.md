---
name: Provenance annotation convention
description: Standard comment block for documenting integration boundaries — where code originates, what it derives from, what it overrides.
---

# Provenance Annotation Convention

Explicitly annotates integration boundaries so troubleshooting has a single coherent causal path: symptom → source, no reconstruction required.

## Format

```typescript
// ── Provenance ──────────────────────────────────────────────────────────────
// canonical:   <file> → <symbol or route>      (authoritative definition)
// derives:     <file> → <symbol>               (what this was computed/sourced from)
// overrides:   none | <file> → <symbol>        (what this supersedes — most dangerous)
// consumed-by: <file> → <symbol>               (who depends on this — optional)
// contract:    one-line statement of the guarantee this code makes
// note:        anything a future engineer needs to know that isn't obvious from reading
```

## Rules

- Use **symbolic anchors** (function names, route paths, type names) — never line numbers.
  Line numbers shift with every edit; symbols are stable until intentionally renamed.
- Place at **integration boundaries only**: where two systems touch, where a contract
  is established, or where an override/derivation happens.
  Do NOT add to every function — noise destroys the signal.
- The `overrides` field is the most important one for troubleshooting.
  "none" is still worth stating explicitly — it rules out a class of failure.
- The `note` field is for things the code cannot tell you: format contracts,
  invariants that break silently, intentional non-idempotence, etc.

## When to add

- A type definition that is consumed by many files (e.g. LogCategory)
- A function that is the canonical source for a security contract (e.g. hashPassword)
- A new API route, especially one with ordering/precondition requirements
- Any place where you find yourself writing "see X for context" in a PR description

## When NOT to add

- Internal helpers with no external consumers
- Pure data transformation with no contract
- Anywhere the imports already make the derivation obvious

## Applied examples in this codebase

- `server/syslog.ts` → LogLevel, LogCategory type definitions
- `server/auth.ts` → hashPassword(), comparePasswords()
- `server/routes.ts` → POST /api/providers/probe (derives from discovery.ts → scanConnection)
- `server/routes.ts` → POST /api/services/probe
- `server/routes.ts` → POST /api/bootstrap/complete (birth certificate endpoint)

**Why:**
Repairability principle: a system is only well-designed if, under failure conditions,
a single coherent and directly accessible causal path exists from symptom → source
without requiring reconstruction of system state. Provenance annotations make that
path explicit and navigable at 2am without grep.
