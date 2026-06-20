---
name: Docker as capability substrate
description: Architectural principle — Docker services are the runtime grounding for Creatrix capabilities; the requires system is the contract, Docker is fulfillment.
---

## The principle

Docker in Creatrix is not containerization for its own sake. Each Docker service is a verifiable claim: "this thing the model says it can do has a stable, running process behind it."

The `requires` field on a CapabilityDefinition is the *contract* side.
The Docker container is the *fulfillment* side.

If no container is running, the endpoint 404s, the `requires` check fails, the tool goes inactive, and the model sees an accurate picture of what the system can actually do. This is the affordance boundary — reasoning must not exceed it.

## Established pattern

| Capability | Declares | Substrate |
|---|---|---|
| `transcribe_audio` | `requires.whisperEndpoint` | whisper.cpp Docker |
| `web_search` | `searchEndpoint` (optional) | SearXNG Docker |
| *(future)* `describe_image` | `requires.visionEndpoint` | LLaVA / llama.cpp Docker |

## Fallback policy

Lightweight fallbacks (e.g. DDG HTML for search) exist for zero-friction starts but are explicitly not the grounded version. The Docker path is the grounded version. Fallbacks should be labeled as such in tool descriptions and status UI.

## New capability rule

Every new "heavy" capability should have a Docker form. The pattern is:
1. User runs `docker run ...` (one command)
2. User points Settings at the endpoint
3. Tool lights up as active in the system prompt
4. Tool goes inactive if container is down

**Why:** "Truth is not an internal property of the model — it is a relationship between model and accessible evidence." Docker makes that relationship structurally verifiable, not just optimistic.
