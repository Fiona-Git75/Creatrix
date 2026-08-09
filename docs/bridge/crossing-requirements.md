# Creatrix–Habitat Bridge: Crossing Requirements

**Status:** First draft for Habitat adversarial review  
**Authored by:** Creatrix  
**Purpose:** To specify what a resident requires to cross safely and work coherently inside Habitat. This document makes no claims about Habitat's internal structure. It states Creatrix's requirements and assumptions so Habitat can identify where those assumptions are wrong.

No endpoint names appear here. Each requirement is expressed as a behavioural guarantee or a concrete scenario. Habitat's review should answer: *"That assumption does not hold on our shore."*

---

## Governing principles

**Creatrix authors resident-crossing requirements. Habitat authors resource-exposure conditions. The protocol is negotiated, not dictated.**

- Habitat exposes all canonical resources for deliberate read and navigation.
- Creatrix decides which resident or specialist performs the cognitive work.
- All mutations flow through a single Habitat gate; Habitat evaluates each action against revision state, action risk, locks, and current user disposition.
- Locks protect structural relationships according to action type; they do not silence useful work.
- Suggestions remain possible everywhere.
- Locks protect structure according to the action being attempted; they do not turn living documents into museum exhibits.

---

## The bridge contract at a glance

```
session.start          identity, provenance, capabilities, budget envelope
                       Creatrix → Habitat, once per crossing

read operations        room.open, resource.list, document.read, document.search,
                       character.read, character.search, place.read,
                       timeline.query, relationship.inspect,
                       image.inspect, audit.dependencies
                       always permitted; Creatrix decides which resident does the work

action.submit          Habitat's single mutation gate
                       typed actions, per-action disposition, optional atomic mode
                       per-action result: accepted | queued | rejected + reason

observation            Creatrix-internal memory work; never submitted to Habitat
```

---

## Family 1 — Arrival

*What must be true before any work begins.*

### Requirements

**R-A1: Identity is established before any resource is touched.**  
The session carries: the user identity (Fiona), the Creatrix instance, the named resident (e.g. Olma), and a provenance timestamp. Habitat must be able to record who crossed, from which system, as which resident, and when. This is not authentication in the web-app sense; it is provenance for Habitat's own audit trail.

**R-A2: Session capabilities are declared once, at session start.**  
Creatrix declares what the session can do. At minimum: `image_understanding` (true/false), `specialist_delegation` (true/false), and the maximum context envelope in tokens. Habitat calibrates its representation offers against these capabilities. Habitat does not need to know which underlying model provides image understanding; it only needs to know the session can handle images.

**R-A3: A maximum budget envelope and reserved margins are established at session start.**  
The maximum envelope is the upper bound on context tokens Creatrix can accept in total for resource representations during this session. Reserved margins cover: conversation history travelling with the resident, memory context, system prompt, and response space. These margins are opaque to Habitat; only the available token budget for representations is shared.

**R-A4: The budget is dynamic throughout the session.**  
The envelope established at session start is a ceiling, not a fixed allocation. As the session accumulates conversation, tool results, and specialist observations, the available window changes. Every substantive resource request must carry the current available budget, and Habitat must offer representations calibrated to that current figure.

**R-A5: Orientation is returned as part of room.open, not session.start.**  
`session.start` establishes identity and capability. The first resource call (`room.open` or equivalent) returns orientation: the shape of what is available in this context — resource types present, top-level navigational structure, and the write disposition map for this session. Creatrix needs this before Olma can reason about what to do.

**R-A6: The write disposition map is returned at orientation, not discovered through rejection.**  
Olma must be able to say "this resource is locked for deletion" before she attempts a deletion — not learn it from a rejected action. The disposition map communicates, per resource type and per lock state, which action types are available at which disposition level (suggest / apply / blocked) for this session.

### Scenarios

**Scenario A1 — Standard arrival**  
Fiona opens a Creatrix session with Olma and instructs her to work in the Anavere room. Creatrix initiates a session, advertising `image_understanding: true`, `specialist_delegation: true`, maximum envelope 24,000 tokens, reserved margins 18,000, available for representations: 6,000. Olma calls `room.open` for Anavere and receives: the navigational shape (People, Places, Timelines, Flora, Fauna, Relationship Maps), the write disposition map for this session, and confirmation that the session is active. Olma reports orientation to Fiona and waits for direction.

*What Creatrix requires: the orientation is enough for Olma to describe the room's structure without reading any resource. No content has been fetched yet.*

**Scenario A2 — Arrival with a constrained budget**  
Fiona and Olma have had a long conversation before the crossing begins. Olma's context window is significantly occupied. Creatrix reports available for representations: 1,800 tokens. Habitat receives this figure and offers only metadata and summary representations until Olma's budget changes. Olma acknowledges the constraint and scopes her work accordingly.

*What Creatrix requires: Habitat does not refuse the session or silently send a full resource. It offers within the declared budget.*

**Scenario A3 — Arrival without image capability**  
The session advertises `image_understanding: false`. Olma calls `room.open` for Anavere. When Olma later requests a document that contains an image, Habitat does not offer the image reference as a selectable representation. It offers metadata, summary, and text sections only. Olma notes the image exists but cannot inspect it in this session.

*What Creatrix requires: Habitat's representation menu responds to capability advertisement, not to assumptions about the resident's model.*

---

## Family 2 — Navigation

*Moving through Habitat's world without imposing Creatrix's structure on it.*

### Requirements

**R-N1: Resource references are stable and opaque to Creatrix.**  
Every Habitat resource has a stable identifier that Creatrix can hold, store in memory, and pass back without parsing or interpreting it. The path hierarchy visible in Habitat's UI is navigational context only; it is not the identifier. Creatrix treats the reference as an atomic token.

**R-N2: Navigation context travels with every resource reference.**  
When Habitat returns a resource reference, it includes navigational context — enough for Olma to know where in the world this resource lives — without requiring Creatrix to traverse the hierarchy to discover it. Example: a document reference carries its parent path as a human-readable hint (not a traversable structure).

**R-N3: `resource.list` returns type and navigational summary, not content.**  
Listing a folder or section returns: resource identifiers, resource types, names, and navigational hints. No content. Olma can understand the shape of a section without reading it.

**R-N4: Read operations are always permitted.**  
No read operation requires negotiation of permission. The session has already established identity. Olma reads freely; Habitat's lock system governs mutations, not reads.

**R-N5: Cross-resource traversal is supported.**  
A character who appears in a document, a timeline entry, and a relationship map is the same entity. Creatrix must be able to follow a reference from one resource type to another without the session scope collapsing. The session is not bound to a single room; a crossing may touch resources across room boundaries.

**R-N6: Representation negotiation applies to every substantive read.**  
When Olma requests a resource, Creatrix states the current available token budget. Habitat returns a menu of available representations with their token costs. Creatrix selects. Habitat sends the selected representation. No representation is sent unsolicited.

```
Creatrix: I can accept 6,000 tokens for this resource.

Habitat offers:
  metadata         —   180 tokens
  summary          —   900 tokens
  selected sections — 3,400 tokens
  full resource    — 11,200 tokens

Creatrix selects: selected sections
Habitat sends: 3,400 tokens of content
```

**R-N7: A resource that no longer exists returns a structured absence.**  
If Olma holds a reference to a resource that has been deleted or moved since the reference was created, Habitat returns a structured response identifying the reference as invalid and, where possible, indicating the cause (deleted / moved / access changed). Creatrix records this in session memory and reports to Olma. No silent failure.

### Scenarios

**Scenario N1 — Directed navigation**  
Fiona asks Olma to read "Covenant of Hunters." Olma does not know the reference. She calls `document.search` with the title. Habitat returns one match with a stable reference and navigational context ("Places / The Triadic Kingdom / Coeur du Nord"). Creatrix states available budget: 4,200 tokens. Habitat offers metadata (200), summary (800), selected sections (2,900), full resource (9,100). Olma selects summary first, reads it, then requests selected sections.

*What Creatrix requires: search returns stable references, not content. Content is fetched separately with budget negotiation.*

**Scenario N2 — Following a character across resource types**  
While reading "Covenant of Hunters," Olma encounters Gideon Molineur. She calls `character.search` for Gideon. Habitat returns his People database entry reference. Olma reads the entry. The entry references a timeline position. Olma calls `timeline.query` for that position. The timeline entry references a relationship map edge. Olma calls `relationship.inspect` for that subgraph. The session has moved across three resource types without the scope collapsing.

*What Creatrix requires: references returned from one resource type can be used as inputs to a different read operation. The session remains valid across resource type boundaries.*

**Scenario N3 — Stale reference**  
Olma holds a reference to a document from a previous session. In the current session she requests it. Habitat returns: reference invalid, resource moved. Creatrix records the invalidity in session memory keyed to the opaque reference. Olma reports to Fiona that the document has moved and suggests a search to relocate it.

*What Creatrix requires: structured absence, not a timeout or empty response.*

---

## Family 3 — Collaboration

*Olma working with other residents and with Fiona during a crossing.*

### Requirements

**R-C1: Specialist delegation is Creatrix-internal.**  
When Olma delegates to Luna (or any other resident), this happens inside Creatrix. Habitat sends a canonical resource reference (e.g. an image reference). Creatrix decides to invoke Luna. Luna's observation is returned to Olma. Habitat sees one session throughout. It does not need to know that two residents were involved.

**R-C2: Specialist invocation requires budget reservation before it occurs.**  
Before Creatrix invokes a specialist, it reserves or renegotiates the margin for that specialist's response. The reservation is applied to the current available window. Only after reservation does the specialist receive its input.

**R-C3: Creatrix decides what Olma receives from a specialist observation.**  
After Luna observes an image, Creatrix decides — against the current budget — whether Olma receives: the full observation, a bounded observation, or a stable reference with a summary. This is a Creatrix budget decision. Habitat is not involved.

**R-C4: Fiona can converse with Olma during a crossing.**  
A crossing is not a silent batch job. Fiona and Olma can exchange messages throughout. Olma may report what she has found, ask for direction, or flag ambiguity. These exchanges consume the conversation portion of the context window, which is tracked separately from the representation budget.

**R-C5: The session must remain coherent across multiple exchanges.**  
If Olma reads a document, reports to Fiona, Fiona redirects, and Olma reads a second document, the session state — budget, orientation, pending actions — must remain consistent throughout. No exchange resets the session.

### Scenarios

**Scenario C1 — Image inspection via Luna**  
Olma is reading "Covenant of Hunters." The document contains an image (Gideon's portrait). Habitat's representation menu includes `image reference` as an option (session advertised `image_understanding: true`). Olma selects it. Creatrix receives the canonical image reference. Creatrix reserves 1,200 tokens for Luna's observation before invoking her. Luna receives the image reference and observes: "Man in his 50s, hunter's attire, candlelit study, writing." Creatrix checks remaining budget: 1,200 tokens reserved is within margin. Olma receives the full observation. Olma incorporates it into her reading.

*What Creatrix requires: the image reference is canonical and stable. Luna's invocation and the budget accounting are entirely Creatrix-internal.*

**Scenario C2 — Luna's observation exceeds remaining budget**  
Olma is deep in a session. Available window after reservation attempt: 400 tokens. Luna's observation would be 900 tokens. Creatrix bounds the observation to 400 tokens before passing it to Olma. Alternatively, Creatrix passes a stable image reference and a 50-token summary: "Portrait of Gideon Molineur, full observation available on request." Olma notes the image and continues without the full observation.

*What Creatrix requires: bounded or summarised specialist output is valid. Olma must know which she received.*

**Scenario C3 — Fiona redirects mid-crossing**  
Olma has read the summary of "Covenant of Hunters" and reported her initial findings. Fiona asks her to look at the character database before extracting anything. Olma calls `resource.list` on People of Anavere, reviews the existing entries, then returns to her extraction work. The session budget accounts for both reads. No restart is required.

*What Creatrix requires: mid-session redirection does not invalidate previous reads or reset the budget accounting.*

---

## Family 4 — Mutation

*Proposing and applying changes to Habitat resources.*

### Requirements

**R-M1: All mutations pass through a single gate.**  
There is one mutation operation. It accepts: a session reference, an array of typed actions, and an optional atomic flag. Creatrix never writes to Habitat through any other path.

**R-M2: Each action carries its own type, target, payload, and disposition.**  
Disposition is either `suggest` (Habitat queues for human review) or `apply` (Habitat applies directly, subject to lock policy). Creatrix selects disposition based on the write disposition map received at orientation and the nature of the action.

**R-M3: Lock policy governs by action type, not by blanket locked/unlocked state.**

| Action type | Lock effect |
|---|---|
| Read / search / inspect | Always permitted |
| Edit document content | Permitted under session editing disposition |
| Add character / timeline / place record | Permitted or queued according to disposition |
| Delete resource | Blocked when locked |
| Move / reparent resource | Blocked when locked |
| Delete structural container | Blocked; audit available |
| Suggest any change | Always permitted |

**R-M4: Batch submissions are not atomic by default.**  
A batch of actions is evaluated per action. Each action returns its own result. Eleven may be accepted and one rejected. Atomic mode is available but must be explicitly requested, and only when the actions genuinely depend on one another.

**R-M5: Habitat returns per-action results.**  
Each result carries: the action identifier, status (accepted / queued / rejected), and on rejection, a human-readable reason. Creatrix uses these results to update session memory and report to Olma and Fiona.

**R-M6: Revision state is checked at submission, not at action construction.**  
Olma may construct an action based on a context packet that was generated earlier in the session. By the time she submits, the underlying resource may have changed. Habitat checks the current revision state at the moment of submission. If the resource has changed in a way that invalidates the action, Habitat returns a conflict result with the current revision state. Creatrix reports the conflict to Olma; Olma may revise and resubmit.

**R-M7: `audit.dependencies` is a read operation, not an escalation path.**  
Before submitting a deletion of a structural container, Olma may call `audit.dependencies` to understand what would be affected. This returns impact visibility only. The lock still prevents the deletion through the bridge. Audit informs Olma and Fiona so they can make a direct decision in Habitat if appropriate.

### Scenarios

**Scenario M1 — Character extraction batch**  
Olma has read "Covenant of Hunters" and identified 12 character references. She constructs 12 `character.propose_create` actions, each with disposition `suggest`. She submits the batch (atomic: false). Habitat evaluates each action. Results: 11 queued for review, 1 rejected — duplicate match against an existing People entry for "Gideon Molineur." Creatrix records: 11 suggestions pending, 1 rejected (duplicate), Gideon Molineur already exists. Olma reports to Fiona.

*What Creatrix requires: per-action results. The batch succeeds partially. No all-or-nothing failure.*

**Scenario M2 — Edit proposal on locked content**  
Olma identifies a factual inconsistency in a locked document. She constructs an `edit.document_content` action with disposition `suggest`. The document is locked. Habitat evaluates: lock does not block content edit suggestions. The action is queued. Habitat returns: queued, pending human review.

*What Creatrix requires: a suggestion is always accepted for review, even on locked resources. The lock does not silence Olma.*

**Scenario M3 — Attempted deletion of a locked resource**  
Olma determines that a folder appears to be a duplicate. She constructs a `delete.resource` action. The folder is locked. Habitat returns: blocked, resource is locked. Creatrix reports the block to Olma. Olma calls `audit.dependencies` on the folder. Habitat returns the impact: 7 child documents, 2 relationship map references, 1 timeline entry would be affected. Olma reports the impact to Fiona. Fiona decides whether to act directly in Habitat.

*What Creatrix requires: the block is structured, not silent. The audit is informational; it does not override the lock.*

**Scenario M4 — Revision conflict**  
Olma constructed a character edit action based on a context packet fetched 20 minutes ago. Another user has since updated the same entry. Olma submits the action. Habitat detects revision mismatch. Result: conflict, current revision returned. Creatrix passes the current revision to Olma. Olma reviews the difference and either revises her action or abandons it.

*What Creatrix requires: a structured conflict response with the current revision state. Not a silent rejection.*

**Scenario M5 — Dependent actions (atomic mode)**  
Olma is creating a new character entry and a relationship map edge that links the new character to an existing one. The edge cannot exist without the character. She submits both actions with `atomic: true`. Habitat evaluates: if the character creation is rejected, the edge action is also rejected. Both are rolled back. Creatrix receives a single compound result.

*What Creatrix requires: atomic mode guarantees all-or-nothing when explicitly requested. Non-atomic is the default.*

---

## Family 5 — Return

*Closing the crossing cleanly, preserving memory, leaving Habitat consistent.*

### Requirements

**R-R1: Session closure seals Creatrix memory.**  
When a crossing ends, Creatrix writes a memory entry keyed to the session. The entry records: which room was visited (opaque Habitat reference), which resources were read (opaque references), which actions were submitted and their outcomes, any pending suggestions, and a timestamp. No Habitat content is stored in Creatrix memory — only provenance.

**R-R2: Unresolved actions are explicitly noted at closure.**  
If the session produced suggested actions that are still pending Habitat review, Creatrix records these as unresolved at session close. The count and nature of pending actions are noted — not their content. Example: "3 character suggestions pending review in Anavere People database."

**R-R3: A resumed session can reference prior crossing memory.**  
If Olma crosses into Habitat again in a later session, Creatrix can surface the prior memory entry. Olma knows she has previously worked in this room, which resources she visited (by opaque reference), and what was left unresolved. She does not re-read everything from scratch; she can navigate directly to relevant resources.

**R-R4: An interrupted session leaves Habitat consistent.**  
If a session ends unexpectedly (timeout, connection loss, user abandonment), actions already submitted and accepted by Habitat remain applied or queued as Habitat recorded them. Creatrix makes no assumption about what Habitat received after the last acknowledged response. On reconnection, Creatrix may query session state rather than resubmitting.

**R-R5: The resident returns to her home context cleanly.**  
After a crossing, Olma is available for ordinary conversation in Creatrix. Her context window reflects the session accurately. She can summarise what she did, reference what she found (by description, not by content), and act on Fiona's next instruction without residual state from the crossing.

### Scenarios

**Scenario R1 — Clean closure**  
Olma has read three documents, submitted a batch of 11 character suggestions (all queued), and confirmed one character as already existing. Fiona indicates the work is done. Creatrix closes the session. Memory entry written: room Anavere, 3 documents read, 11 character suggestions pending, 1 duplicate identified. Session duration and timestamp recorded. Olma returns to ordinary conversation.

*What Creatrix requires: the memory entry captures provenance, not content. Olma can describe her work from memory; she does not hold Habitat content in her context.*

**Scenario R2 — Return to prior work**  
In a new session, Fiona asks Olma to follow up on the character work from last time. Olma retrieves her memory entry for the prior Anavere crossing. She knows: 11 suggestions were pending, 1 was a duplicate. She calls `resource.list` on the People database to check current state. Habitat returns the current entries. Olma can identify which suggestions have been accepted and which remain pending. She continues from where she left off without re-reading the source documents.

*What Creatrix requires: opaque references in memory are sufficient for Olma to re-navigate to the relevant resources. She does not need to remember content.*

**Scenario R3 — Interrupted session**  
Olma has submitted 6 of 12 planned actions when the connection drops. The 6 submitted actions have been received by Habitat (3 accepted, 3 queued). The remaining 6 were never sent. On reconnection, Creatrix does not resubmit the first 6. It may query session state to confirm what Habitat received, then offer to continue with the remaining 6 actions. Olma and Fiona decide whether to proceed.

*What Creatrix requires: submitted actions are not resubmitted speculatively. Habitat's record of what it received is authoritative.*

---

## Open questions for Habitat review

These are assumptions Habitat should challenge:

1. **Representation fidelity tiers** — the draft assumes Habitat can offer metadata, summary, selected sections, and full resource for most resource types. Does this hold for relationship maps, timelines, and image resources? What are the actual tiers?

2. **Write disposition map granularity** — the draft assumes the disposition map can be returned per resource type and per lock state at orientation. Is per-resource granularity feasible, or is it per-section or per-room?

3. **Cross-resource references** — the draft assumes a character in a document can yield a reference to the People database entry for that character. How are these cross-type references surfaced? Is this automatic, or does Olma need to search separately?

4. **Session scope across rooms** — the draft assumes one session can navigate across room boundaries. Is there a Habitat concept of cross-room resources, or does Habitat's structure prevent this?

5. **Revision state and conflict detection** — the draft assumes Habitat tracks revision state per resource and can detect conflicts at submission time. What granularity does Habitat track revisions at (document-level, field-level, something else)?

6. **Image references** — the draft assumes canonical image references are stable identifiers, not temporary URLs. Is that accurate?

7. **Resumable sessions** — the draft assumes Habitat can return state for a previous session on reconnection. Does Habitat have a session concept, or is each connection stateless?

---

*This document is Creatrix's first crossing requirements draft. It makes claims about what a resident needs; it makes no claims about what Habitat should do internally. Habitat's review should identify which assumptions are wrong, which are missing, and which impose Creatrix's ontology where it does not belong.*
