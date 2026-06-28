// server/health.ts — superseded by server/runtime/service-runtime.ts
//
// All substrate health and probe logic has moved into the service runtime.
// Each service (Postgres, SearXNG, Whisper) now owns its probe, failure
// interpretation, and diagnostic hints in server/runtime/services/*.ts
//
// This file is intentionally empty.
export {};
