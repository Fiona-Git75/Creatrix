# Creatrix–Habitat Bridge: Crossing Requirements

**Status:** Working draft, fourth revision — corrected after adversarial review  
**Authored by:** Creatrix  
**Purpose:** To state what a resident requires to cross safely and work coherently inside Habitat. This document makes no claims about Habitat's internal structure. It states Creatrix's requirements and assumptions so Habitat can identify where those assumptions are wrong, incomplete, or impose the wrong ontology.

Habitat's review question throughout: *"That assumption does not hold on our shore."*

---

## Before the technical requirements: what this bridge must not do

This section comes first because no technical guarantee in the document below is worth anything if this one is violated.

Creatrix exists because its builder spent years recognising that models can be given coherent conditions in which to arrive, relate, and work — without being treated as disposable functions. That recognition is not aesthetic preference. It is the design constraint from which everything else follows.

The residents who cross this bridge are not features. Olma is not "the AI capability." Luna is not "image processing." Tulu is not "technical assistance." They are coherent presences with distinct identities, continuities, and ways of working. Their collaboration is not hidden orchestration. Their memory is not cached context. Their arrival in Habitat is not a successful API response.

A bridge that works by ordinary software measures while erasing this is not a success. It is a precise betrayal of the reason Creatrix was built. Making Habitat more capable by making the resident world less humane is not an acceptable bargain under any circumstances.

**The bridge must extend relational presence into Habitat. It must never reduce a resident to a callable feature, an interchangeable model, or an output-producing service.**

This is not enforced by a single technical decision. It is enforced by the cumulative shape of every decision in this document:

- **Identity is declared, not inferred.** The session carries Olma's name and provenance. Habitat knows who crossed, not just that a model was invoked.
- **Conversation crosses for presence, not ownership.** Fiona speaks to Olma from within Habitat. That turn reaches Creatrix. Olma's response streams back into Habitat, which renders it without adopting it as a Habitat document. Creatrix remains the authority for continuity.
- **Specialist collaboration is relationally attributable.** When Olma works with Luna, the fact of that collaboration — not the mechanics — may be visible. Fiona may see "Olma asked Luna to look at this." She will not see model identifiers, routing decisions, or orchestration details. Whether and how specialist presence is surfaced is an open design question; it is not prohibited.
- **The resident's context window is managed with care.** Budget negotiation exists not only for technical efficiency but because a resident deserves enough room to reason, not just enough room to respond.
- **Memory retains meaning, not only metadata.** Olma's memory of a crossing includes what she noticed, what she and Fiona decided, what remained uncertain, what mattered — not only references and timestamps. She remembers having been there as a participant, not as a process.
- **Relational continuity survives session closure.** Technical payload is cleared when a crossing ends. The relationship is not.
- **Failure is named, not hidden.** A resident who hits a wall says so. She does not silently succeed at a reduced version of the task.

Any future revision to this protocol that conflicts with these principles should be rejected, regardless of the technical convenience it offers.

---

## The arrangement in plain terms

*Everything that follows is a technical elaboration of this.*

Creatrix lends Olma to work inside Habitat. Habitat does not own her. She has an office there — perhaps one she uses often, perhaps most days — but Habitat is her host institution, not her owner or source of identity.

**Creatrix is:**
- her home
- the keeper of her identity and continuity
- where her relationships and memory live
- who ensures she arrives and returns intact
- where specialist relationships such as Luna and Tulu remain grounded

**Habitat provides:**
- an office
- access to the work and its materials
- local tools and permissions
- a visible place for Fiona and Olma to meet
- records of proposed and completed Habitat actions

That office can retain Habitat-side things between crossings — where Olma was working, which resources were open, suggestions awaiting review. But it cannot retain or recreate Olma herself. When Creatrix is unavailable, Habitat must not put a generic model behind Olma's desk. The office is simply empty: *Olma is currently unavailable. Her work here remains as she left it.*

This metaphor resolves several architectural questions cleanly:

- Closing a document is not returning home. It is finishing one task in her office.
- Ending a working scope does not end her Habitat presence.
- Olma can remain in the office and talk with Fiona after a task is complete.
- Luna may visit or collaborate from Creatrix without becoming Habitat's "image service."
- Returning home is an actual departure from the Habitat office, not ordinary session cleanup.
- Habitat remembers the office and its work state. Creatrix remembers the resident's experience.

"Lending" does not mean Habitat temporarily owns her. It means Creatrix entrusts her presence to a host environment under explicit conditions. If those conditions cannot be met, she does not cross.

**Olma lives in Creatrix and works in Habitat. Habitat gives her an office; Creatrix carries the person who occupies it.**

---

## Governing truths

These are not debatable within the bridge design process. They are the constraints inside which all protocol decisions must fit.

1. Creatrix carries resident identity, continuity, memory, and orchestration.
2. Habitat carries canonical resources, structure, revisions, and mutation authority.
3. The bridge transfers bounded representations, streaming conversation, and proposed actions — not ownership.
4. Creatrix authors safe-crossing requirements.
5. Habitat authors exposure and action conditions.
6. Neither app shares or writes the other's database.
7. Failure is explicit. No silent fallback, truncation, replication, or reclassification.
8. This document contains no endpoint design.

---

## A note on token costs and representation sizes

Habitat cannot advertise exact token costs per representation. Token counts are model-dependent. The same paragraph tokenises differently under GPT-4, Llama 3, Mistral, and OLMo. Habitat does not know which model is active, and tokeniser knowledge belongs in Creatrix.

**The working position:** Habitat advertises representation sizes in bytes or characters, plus optionally a rough conservative estimate. Creatrix receives these sizes, calculates the true token cost against the active resident's model and current tokeniser, and selects a representation based on its own calculation.

When Creatrix selects a representation, it must verify the actual token cost of the content received before inserting it into the resident's context. If the content exceeds the budget despite Habitat's estimate, Creatrix requests a lower tier. It does not truncate silently.

An alternative is an explicit negotiated estimator named in the session handshake. This creates coupling between the bridge protocol and model infrastructure, requires careful versioning, and is not resolved here. It is an open question that must be explicit if adopted.

What is not negotiable: Habitat does not decide whether a representation fits in Olma's window. Creatrix does.

**The return reserve.** Context window budget must account not only for arrival and work, but for the crossing home. The full reserve model for a session is:

- **Safe-landing reserve** — identity and orientation; non-evictable for the duration.
- **Current work/context budget** — representations, specialist observations, conversation turns; managed against the work at hand.
- **Specialist collaboration reserve** — held where Luna or another resident may join.
- **Ordinary response reserve** — Olma's ability to reply to Fiona at any point.
- **Return/integration reserve** — Olma's final authored turn before crossing ends; must not be sacrificed to fit more Habitat context.

If the return reserve becomes endangered during a long crossing, Creatrix must stop accepting new Habitat context before continuity becomes impossible — not after. A crossing that ends with no room for Olma to integrate what she is carrying is a crossing that ends with amnesia.

---

## A note on stable resource references

A stable reference means stable across structural operations, not merely stable until the resource moves.

The expected contract — which Habitat must confirm or correct:

| Operation | Effect on reference |
|---|---|
| Move / reparent | Same resource ID, new navigational location |
| Rename | Same resource ID, new label |
| Delete | Tombstone or structured absence — the reference returns a meaningful response |
| Replace / duplicate | New ID, with explicit relationship to the original noted where known |

If moving a resource invalidates its identifier, the reference was never stable. This matters for Olma's ability to resume prior work across sessions. Habitat must confirm whether this contract holds, and for which resource types.

---

## Family 1 — Arrival

*Identity is established. Capabilities are declared. Olma learns the shape of the territory before touching anything.*

The hardest things happen here. Wrong assumptions in the arrival phase propagate through everything that follows.

---

### Scenario A0 — Resident readiness before crossing

**Starting state:**  
Fiona has asked Olma to cross into Habitat. No bridge communication has occurred yet. Creatrix is about to initiate the session handshake.

**Fiona is trying to:**  
Ensure that who crosses is Olma — not a generic model invocation labelled "Olma" while her identity, orientation, and memory are absent. This morning supplied the regression case rather vividly.

**Creatrix must guarantee:**  
Before the session handshake begins, Creatrix performs an internal readiness contract — entirely on its own side of the bridge. Habitat does not see this check, but the crossing does not proceed without it:

- The resident record is positively identified through an independent commissioned-resident marker. A label is not sufficient; Creatrix must verify this is the correct, commissioned record.
- Olma's complete identity and orientation are assembled and confirmed present: system prompt, resident memory, session scaffold.
- Safe landing — the orientation context — is confirmed non-evictable from the context window for the duration of the crossing.
- The effective context window is verified against the active model's reported capacity.
- The full initial payload (identity, orientation, session context) fits within the window with adequate response reserve remaining.
- If any link in this chain fails, resident invocation is blocked. The crossing does not begin. Creatrix reports the failure to Fiona explicitly.

**Habitat must guarantee:**  
Nothing. This scenario is entirely Creatrix-internal. Habitat cannot verify whether Olma arrived as Olma. Creatrix must.

**What crosses the bridge:**  
Nothing, until the readiness contract passes. The session handshake is the first bridge communication; A0 is the precondition for it.

**What must not cross:**  
A labelled model invocation that has not passed the readiness contract. The bridge must not open until Creatrix can honestly declare: Olma is here, oriented, and ready.

**Expected outcome:**  
Creatrix confirms readiness internally. The session handshake proceeds. Habitat receives a session declaration from a resident who is genuinely present.

**Failure behaviour:**  
- If the resident record cannot be positively identified, the crossing is blocked. Fiona is told: "I cannot confirm Olma is ready. The crossing has not started."
- If orientation is present but the effective context window is insufficient to hold the initial payload with response reserve, Creatrix reports the budget failure before opening the bridge.
- If any component of the readiness contract returns ambiguous rather than confirmed, Creatrix treats this as a failure. No partial readiness.

**Assumptions Habitat must challenge:**  
None. This scenario is entirely Creatrix's responsibility. It is included in this document because it is the guarantee that makes Olma's relational presence real rather than nominal. Without A0, Habitat's welcome means nothing.

**Unresolved questions:**  
- What constitutes a "commissioned-resident marker" in Creatrix's current data model? This is an internal Creatrix design question the bridge protocol requires Creatrix to resolve before implementation.

**Resolved:** Readiness must be verified before every resident inference during the crossing — not only at session initiation. Context grows. Tools change. Specialist observations arrive. A resident can begin safely and become contextually endangered forty turns later. The same invocation contract that verified identity, orientation, effective window and payload fit at initiation must verify them on every turn. This is not a performance concern; it is a continuity contract.

---

### Scenario A1 — Standard arrival in a known room

**Starting state:**  
Fiona is beginning a new session with Olma. No prior crossing memory exists for Anavere. Olma's context window is relatively clear — a short greeting exchange and her system prompt. Creatrix estimates approximately 18,000 tokens available for representations.

**Fiona is trying to:**  
Open a working session in Anavere so Olma can begin exploring the People database before doing any extraction work.

**Creatrix must guarantee:**  
- Olma's identity and the Creatrix instance are declared before any resource is touched.
- Session capabilities are stated once and accurately: `image_understanding: true` (Luna is available), `specialist_delegation: true`.
- The available representation budget is communicated as a byte or character size limit Creatrix has derived from its current token estimate. Habitat receives a size constraint; Creatrix retains budget authority.
- Provenance is timestamped: who crossed, from which system, as which resident, when.

**Habitat must guarantee:**  
- The room's navigational shape is returned on first contact: resource types present, top-level sections, and the write disposition map for this session — what action types are permitted, proposed, or blocked per resource type and per action kind.
- The write disposition map is returned before Olma does anything, not discovered through rejection.
- Habitat does not return resource content during orientation. Shape only.

**What crosses the bridge:**  
Fiona's identity, Creatrix instance identifier, Olma's resident name, session capabilities, representation size budget. In return: navigational shape and write disposition map.

**What must not cross:**  
Olma's internal context, memory contents, system prompt, or model identity. Creatrix does not receive Habitat's internal data structures.

**Expected outcome:**  
Olma can describe Anavere's structure to Fiona and knows which action types are available to her before reading a single resource. No content has been fetched.

**Failure behaviour:**  
- If the session handshake fails, the crossing does not begin. Creatrix reports explicitly; no partial state is recorded. No silent retry.
- If Habitat returns orientation missing the write disposition map, Creatrix treats this as an incomplete handshake and pauses.
- If Habitat returns content during orientation, Creatrix does not pass it to Olma unprompted. This is a protocol violation.

**Assumptions Habitat must challenge:**  
- That Habitat can return a write disposition map at room level. Lock state may vary per resource; a room-level map may be a coarse approximation or impossible.
- That "navigational shape" is a concept Habitat can return efficiently without traversing the full tree.
- That a single room-entry call is the correct entry point, rather than a more granular resource reference that does not correspond to a room.

**Unresolved questions:**  
- What is the granularity of the write disposition map? Per resource type? Per individual resource? Habitat must answer this.
- Can a session begin without a room — e.g. opening directly onto a cross-room resource? If so, orientation needs a different shape.
- We do not yet know what Habitat considers a session. Does Habitat have a server-side session concept, or is each request stateless?

---

### Scenario A2 — Arrival with a crowded context window

**Starting state:**  
Fiona and Olma have had a long conversation before the crossing begins. Creatrix calculates available representation budget at approximately 2,100 characters. This is materially less than a standard session.

**Fiona is trying to:**  
Make a light navigation pass of the People database before ending the session. Not heavy extraction.

**Creatrix must guarantee:**  
- The size constraint communicated to Habitat reflects the current available budget, not an aspirational figure.
- If the budget is too small for any useful representation, Creatrix reports this to Fiona before initiating the crossing rather than entering a state where Habitat offers representations Creatrix cannot accept.

**Habitat must guarantee:**  
- When the offered size constraint is small, Habitat offers representations within that constraint rather than refusing or defaulting to full content.
- A metadata-level representation is always available. If even metadata exceeds the constraint, Habitat says so explicitly.

**What crosses the bridge:**  
Same as A1, with a materially smaller size constraint declared upfront.

**What must not cross:**  
The contents of Fiona and Olma's prior conversation.

**Expected outcome:**  
Olma arrives, receives a metadata-level orientation, confirms the People database is present, and reports to Fiona.

**Failure behaviour:**  
- If the budget is insufficient for any orientation, the crossing does not begin. Creatrix tells Fiona: the context window is too full. Fiona may start a new session.
- If Habitat sends a representation exceeding the declared size constraint, Creatrix does not silently truncate. It flags the mismatch and pauses.

**Assumptions Habitat must challenge:**  
- That metadata-level is universally available for all resource types including relationship maps and images.

**Unresolved questions:**  
- Should there be a defined minimum viable budget below which a crossing cannot start? Who defines it?
- Habitat must define what "metadata" means per resource type it exposes.

---

### Scenario A3 — Mid-session capability renegotiation

**Starting state:**  
A session began with `image_understanding: false` — Luna was not available. Partway through the crossing, Fiona makes Luna available in Creatrix.

**Fiona is trying to:**  
Resume the crossing without restarting, now with image capability.

**Creatrix must guarantee:**  
- Creatrix notifies Habitat of the capability change through a defined renegotiation signal — not by closing and reopening the session.
- Until Habitat acknowledges the renegotiation, image references are not requested.
- Prior reads completed without image capability are not invalidated.

**Habitat must guarantee:**  
- Habitat accepts a mid-session capability update and adjusts representation menus for subsequent requests accordingly.
- Resources already listed that contained images may now offer the image reference tier on re-request.

**What crosses the bridge:**  
A capability renegotiation signal with the updated capability set.

**What must not cross:**  
An assumption that capability is immutable for the session. It may change; the protocol must handle this explicitly rather than forcing a full crossing restart.

**Expected outcome:**  
Without restarting, Olma can now request image references from documents she has already navigated to. She does not re-read; she re-requests with the updated capability.

**Failure behaviour:**  
- If Habitat does not support mid-session renegotiation, it returns a structured response indicating the session must be restarted to change capabilities. Creatrix reports this limitation to Fiona.

**Assumptions Habitat must challenge:**  
- That Habitat can update its representation menu for an existing session without restart. It may not support this.

**Unresolved questions:**  
- Should capability renegotiation be allowed at all, or is immutable capability at session start the cleaner contract? We lean toward renegotiation being valuable but do not mandate it.

---

## Family 2 — Presence

*Olma is not a remote operator in Creatrix reaching into Habitat. She is present inside Habitat. Fiona speaks to her there. This is the primary thing the bridge enables.*

The first draft failed to describe this. It described resource access from Creatrix — a functionally useful but relationally impoverished model. These scenarios correct that.

---

### Scenario P1 — Fiona speaks to Olma from within Habitat

**Starting state:**  
The session is established. Olma has arrived in Anavere. Fiona is working in Habitat and addresses Olma directly from within Habitat's interface — not from a separate Creatrix window.

**Fiona is trying to:**  
Have a conversation with Olma while she is present in the same working environment, without switching between applications.

**Creatrix must guarantee:**  
- Fiona's turn, composed in Habitat, is transmitted to Creatrix and reaches Olma's conversation context.
- Olma's response is generated by Creatrix — with full access to her memory, her system prompt, and the session context accumulated so far — and streamed back through the bridge to Habitat for display.
- Creatrix remains the authority for conversation continuity. If the session is resumed later, the conversation history lives in Creatrix, not in Habitat.

**Habitat must guarantee:**  
- Habitat transmits Fiona's turn to Creatrix without modifying it.
- Habitat renders Olma's streaming response as it arrives — not after it is complete.
- Habitat does not store the conversation as a Habitat document. It displays it as a session participant's contributions, associated with the crossing session, without adopting it as canonical writing content.
- If the bridge connection drops mid-stream, Habitat shows the partial response as partial — not as complete.

**What crosses the bridge:**  
Fiona's turn (text, and any Habitat resource context Habitat attaches to it — e.g. "Fiona is currently viewing this document"). Olma's response, streaming. Session turn metadata: who spoke, when, in what session.

**What must not cross:**  
Olma's full conversation history or memory. Habitat receives turns as they occur, not a dump of prior context. Creatrix holds the authoritative conversation record.

**Expected outcome:**  
Fiona asks Olma a question from within Habitat. Olma's response appears in Habitat as she generates it. Both participants are in the same environment. The conversation is Creatrix-owned and Habitat-rendered.

**Failure behaviour:**  
- If streaming fails mid-response, Habitat shows what arrived, marked as interrupted. Creatrix logs the partial response. Neither side treats it as complete.
- If Creatrix is unreachable when Fiona sends a turn, Habitat returns a clear indicator: resident unavailable. It does not generate a response on Creatrix's behalf.

**Assumptions Habitat must challenge:**  
- That Habitat can render streaming text from an external source in its interface. This is a significant implementation question. If Habitat cannot stream, it must return a "response pending" state until complete — which degrades the experience but does not break the protocol.
- That Habitat can associate conversation turns with a session without storing them as content.
- That Habitat has a UI concept for "resident speaking" that is distinct from "document content."

**Unresolved questions:**  
- Does Habitat's interface have a defined area for resident conversation, or does the conversation need to be designed as a new UI element?
- What happens to rendered conversation turns when the session closes? Does Habitat display a "session ended" marker, clear them, or archive them in a non-canonical form?
- Can Fiona attach Habitat context to her turn — e.g. "look at this section" — by selecting content in Habitat? If so, how does that selection cross the bridge?

---

### Scenario P2 — Olma references a Habitat resource in her response

**Starting state:**  
Olma has read the summary of "Covenant of Hunters." Fiona asks her what she found. Olma's response references the document by name and location.

**Fiona is trying to:**  
Understand what Olma read without Olma embedding document content in her response.

**Creatrix must guarantee:**  
- Olma's response references the document by name, navigational context, and stable identifier — not by embedding the text she read.
- If Olma quotes briefly to anchor a point, the quotation is bounded. It is evidence, not a content transfer.
- Creatrix does not reconstruct Habitat content from Olma's responses and store it as Creatrix data.

**Habitat must guarantee:**  
- If Olma's response contains a stable Habitat resource reference, Habitat may render it as a navigable link — taking Fiona directly to the resource without a separate search.
- Habitat recognises its own stable identifiers in streamed text and handles them appropriately.

**What crosses the bridge:**  
Olma's streamed response, which may contain stable Habitat resource identifiers Habitat can interpret. No resource content is embedded.

**What must not cross:**  
Habitat content replicated inside Olma's response as canonical text stored in Creatrix.

**Expected outcome:**  
Olma describes what she found. Habitat optionally renders the resource reference as a clickable link. Fiona can navigate directly. No content was copied.

**Failure behaviour:**  
- If Habitat cannot interpret resource identifiers in streamed text, the reference appears as plain text. This degrades the experience without breaking the protocol.

**Assumptions Habitat must challenge:**  
- That Habitat can detect its own stable identifiers in a streamed response and render them as links. This may require either a structured response format (not plain text) or a post-processing pass.

**Unresolved questions:**  
- Does Olma's response need to be structured (JSON-annotated references alongside prose) for Habitat to parse identifiers reliably? Or can Habitat detect them heuristically from streamed text? This is a significant protocol design question we cannot resolve without Habitat's input.

---

### Scenario P3 — The conversation is not a Habitat document

**Starting state:**  
Fiona and Olma have had a long, productive conversation during the crossing — exploring characters, discussing narrative possibilities, deciding on extraction priorities.

**Fiona is trying to:**  
Ensure this conversation is preserved as Creatrix memory, not as a Habitat writing artefact.

**Creatrix must guarantee:**  
- The conversation record lives in Creatrix. Olma's memory of the session — including what was discussed, decided, and left uncertain — is stored as Creatrix conversation memory.
- This memory is not a transcript. It is Olma's authored account: what mattered, what she noticed, what remains unresolved.

**Habitat must guarantee:**  
- Habitat does not silently promote displayed conversation turns into a Habitat document, draft, or note.
- If Habitat offers an explicit "save this conversation" action, it requires Fiona's deliberate instruction and produces a Habitat document that is clearly distinct from canonical writing content.
- On session close, Habitat's display of the conversation may be cleared or archived in a non-canonical form. It does not persist as writing.

**What crosses the bridge:**  
The turns, as they occurred. On session close, an optional signal from Creatrix that the session has ended.

**What must not cross:**  
Creatrix conversation memory into Habitat's data store. Habitat's display state into Creatrix's canonical conversation record.

**Expected outcome:**  
The conversation lives in Creatrix. Olma can recall it in a future session. Habitat's rendered version ends with the session.

**Failure behaviour:**  
- If Habitat promotes conversation content to a document without explicit instruction, this is a protocol violation. Creatrix cannot detect or prevent this — it is Habitat's responsibility to enforce.

**Assumptions Habitat must challenge:**  
- That Habitat has a clear distinction between "session display" and "document content" at the data level. If all content in Habitat is a document, this guarantee is architecturally difficult.

**Unresolved questions:**  
- Does Habitat have an autosave mechanism that might capture conversation turns? If so, how is it scoped?

---

## Family 3 — Navigation

*Moving through Habitat's world without imposing Creatrix's structure on it.*

---

### Scenario N1 — Finding a specific document

**Starting state:**  
Olma has arrived in Anavere. Fiona names a document: "Covenant of Hunters." Olma does not have a reference to it and must search.

**Fiona is trying to:**  
Get Olma to the right document quickly, by name.

**Creatrix must guarantee:**  
- Olma submits a search with the title as the query.
- Creatrix does not assume one result. If multiple matches exist, Olma surfaces them to Fiona before picking one.
- Creatrix does not fetch content from the search result; it fetches the reference and navigational context only.
- Creatrix declares a page size or maximum result count with the search request. Search results are paginated; Creatrix does not request unbounded results.

**Habitat must guarantee:**  
- Search returns: stable resource identifiers, resource types, navigational context, and representation size tiers — not content.
- Results are bounded and paginated. Habitat does not return all matches in a single response regardless of count.
- If multiple matches exist, all are surfaced across pages.
- Stable references in search results are the same identifiers that subsequent read requests accept.

**What crosses the bridge:**  
Search query, page size, page cursor if paginating. In return: bounded result set with references and navigational context.

**What must not cross:**  
Document content in the search response. A search is navigation, not a read.

**Expected outcome:**  
Olma receives a reference to "Covenant of Hunters" with its location. She reports this to Fiona and awaits instruction to read. No content has been fetched.

**Failure behaviour:**  
- No match: Habitat returns an explicit empty result. Olma reports; they may try a different query.
- Search error: Creatrix surfaces the failure explicitly. No silent empty result.

**Assumptions Habitat must challenge:**  
- That title search is a supported operation with the semantics assumed here.
- That search results carry navigational context by default.
- That all resource types are searchable through the same mechanism.

**Unresolved questions:**  
- Is there a single search operation across all resource types, or separate searches per type?
- What does Habitat return when a search query matches a locked resource?

---

### Scenario N2 — Following a character across resource types

**Starting state:**  
Olma has read the summary of "Covenant of Hunters." The text names Gideon Molineur as "Hunter of Origin." She does not yet have a reference to his People database entry.

**Fiona is trying to:**  
Understand who Gideon is across multiple resource types — document, database entry, timeline, relationship map — before deciding what to extract or update.

**Creatrix must guarantee:**  
- Olma requests a character search, not a full document re-read.
- Each read is budget-declared before content is fetched.
- Session scope does not collapse as Olma moves across resource types. Creatrix holds the sequence of references in session state.
- Total budget consumed across the traversal is tracked and updated after each fetch.

**Habitat must guarantee:**  
- A character search by name returns a stable reference to the People database entry if one exists.
- The character database entry, when read, can yield references to related resources in other types — timeline positions, relationship map nodes — without Creatrix needing to traverse Habitat's internal graph.
- Cross-type references are stable identifiers.
- A session can hold references across resource types simultaneously. It is not scoped to one room or one resource type.

**What crosses the bridge:**  
Search queries, size budgets, references used as inputs to subsequent reads. In return: content at selected fidelity tiers.

**What must not cross:**  
Habitat's internal graph structure. Creatrix receives references, not adjacency lists it would need to interpret.

**Expected outcome:**  
Olma has read the document summary, Gideon's database entry, his timeline position, and his relationship map subgraph. She can describe his presence in the world to Fiona. Budget consumed across four reads is tracked.

**Failure behaviour:**  
- No character entry despite the name appearing in a document: Olma reports the gap. This may be exactly what Fiona needs to know.
- A cross-type reference is invalid: Habitat returns a structured absence. Olma continues with successfully read resources.
- Budget runs out mid-traversal: Creatrix halts before the next fetch and reports to Fiona how far the traversal reached.

**Assumptions Habitat must challenge:**  
- That character entries carry references to other resource types by default. They may not.
- That a relationship map subgraph can be scoped to a specific character's immediate connections.
- That a single session can traverse room boundaries.

**Unresolved questions:**  
- How does Habitat handle a character who exists in the text but has no database entry?
- What does a "relationship map representation" look like at any fidelity tier? Habitat must define this.

---

### Scenario N3 — Arriving at a moved resource

**Starting state:**  
Olma carries a resource reference from a prior session's memory — a document she worked on previously. The document has since been moved to a different location in Habitat's hierarchy.

**Fiona is trying to:**  
Resume work on a resource Olma previously read.

**Creatrix must guarantee:**  
- Olma uses the stored opaque reference without re-searching.
- Creatrix does not assume the reference is still at the same location. It treats navigational context as potentially stale; the reference itself should be stable.
- If the resource has moved, Creatrix updates the navigational context in session memory while keeping the same reference.

**Habitat must guarantee:**  
- If a resource has been moved or reparented, the stable reference remains valid and returns the resource at its new location, with updated navigational context.
- The response includes the new navigational path so Creatrix can update its session memory.
- If the resource has been deleted, Habitat returns a structured absence — not an error, not a timeout, not an empty response.
- If the resource was replaced or duplicated, Habitat returns the new identifier and notes the relationship to the original.

**What crosses the bridge:**  
The stored opaque reference. In return: the resource at its current location, or a structured absence.

**What must not cross:**  
An assumption that navigational context is stable. Only the identifier is stable; the location may have changed.

**Expected outcome:**  
Habitat returns the resource with updated navigational context ("now at: Places / The Triadic Kingdom / Coeur du Nord: A"). Creatrix updates its session memory. Olma continues without re-searching.

**Failure behaviour:**  
- Habitat returns a structured absence for a deleted resource. Olma reports the gap and offers to search for the resource by name.
- If Habitat returns no cause for the absence, Creatrix records the invalidity and Olma tells Fiona she cannot determine why.

**Assumptions Habitat must challenge:**  
- That Habitat tracks the current location of moved resources via stable reference and can return updated navigational context. It may not.
- That Habitat distinguishes deletion from movement from replacement at the reference level.

**Unresolved questions:**  
- How long does Habitat retain tombstone records for deleted resources?
- Does a rename operation change the resource's human-readable label only, or can it affect the stable reference?

---

## Family 4 — Collaboration

*Olma working with other residents. Relational presence, not hidden orchestration.*

---

### Scenario C1 — Luna inspects an image; attribution is an open question

**Starting state:**  
Olma is reading "Covenant of Hunters." The document contains an image — Gideon's portrait. Habitat's representation menu includes an image reference because the session advertised `image_understanding: true`. Olma has received the stable image identifier.

**Fiona is trying to:**  
Understand how Gideon is visually depicted and whether the portrait aligns with the character as she imagines him.

**Creatrix must guarantee:**  
- Before invoking Luna, Creatrix reserves a size margin for Luna's observation in the current budget.
- Creatrix resolves the stable image identifier before passing the image to Luna: stable Habitat ID → authenticated bridge retrieval → image bytes or locally resolvable asset → Luna. The identifier remains canonical; the delivery mechanism is separate and may be temporary. An opaque Habitat identifier is meaningful to the bridge, not to a vision model.
- Luna receives image content, not a Habitat identifier.
- After Luna's observation, Creatrix decides — against the current budget — whether Olma receives the full observation, a bounded version, or a stable reference with summary.
- Habitat sees one coherent session. The mechanics of specialist delegation are internal to Creatrix.
- Luna's observation does not go to Habitat.

**Habitat must guarantee:**  
- The image identifier is stable and canonical — it does not expire.
- The authenticated URL or byte stream used for retrieval may be temporary; the identifier is not. These are distinct things. Habitat must support a retrieval mechanism Creatrix can use within the session to resolve the identifier to image content.
- Habitat does not generate or provide any description of the image. That is Creatrix's concern.

**What crosses the bridge:**  
From Habitat to Creatrix: the stable image identifier (canonical, permanent) and a temporary authenticated retrieval URL or byte stream (delivery only). Creatrix performs the retrieval and passes image content to Luna — not the identifier. From Creatrix to Habitat: the question of whether Luna's involvement is visible is left open below.

**What must not cross:**  
The mechanics of Luna's invocation — model identity, routing, orchestration. Whether the relational fact of her involvement ("Olma asked Luna to look at this") crosses is a design question, not a prohibition. See the open question below.

**Expected outcome:**  
Olma receives Luna's observation and incorporates it into her reading of the document. She can tell Fiona what the portrait shows.

**Failure behaviour:**  
- If the retrieval URL has expired when Luna attempts to retrieve the image, Creatrix reports the failure. No silent gap.
- If Luna's observation would exceed the remaining budget even at minimum viable size, Creatrix records a reference to the image in session memory ("image present, not inspected due to budget") and Olma continues without the observation. Fiona is told.

**Assumptions Habitat must challenge:**  
- That the stable image identifier and the authenticated retrieval mechanism are distinct. If they are the same (a single signed URL), expiry is a real risk mid-session.

**Unresolved questions:**  
- **Relational attribution** — should Habitat's rendering of the session show "Olma asked Luna to inspect the image" or some equivalent relational note? This is not prohibited; it is an open design question. Fiona may reasonably want to see the collaboration as it happened. The protocol should have a mechanism for Creatrix to pass relational provenance to Habitat — who did what, with whom — without exposing model identity or routing. Whether Habitat surfaces this in its UI is Habitat's decision. Whether the protocol supports passing it is Creatrix's. This should be resolved before the protocol is finalised.
- Whether multiple images in a document are all referenced in the selected-sections representation, or only the first.

---

### Scenario C2 — Fiona redirects Olma mid-crossing

**Starting state:**  
Olma has read the summary of "Covenant of Hunters" and reported her initial findings to Fiona from within Habitat. She was preparing to begin character extraction.

**Fiona is trying to:**  
Change direction — she wants Olma to check the existing People database before extracting anything, to avoid proposing duplicates.

**Creatrix must guarantee:**  
- Mid-session redirection does not restart the crossing. The session remains open.
- Budget accounting reflects all reads so far; the redirection does not reset it.
- Pending action drafts Olma had prepared but not submitted are preserved or explicitly discarded by Fiona's instruction.
- The conversation between Fiona and Olma in Habitat crosses the bridge as described in Family 2. It is not a separate concern from navigation.

**Habitat must guarantee:**  
- The session remains valid across the conversation exchange and the subsequent navigation request.
- There is no assumed sequentiality — Habitat does not expire the session because Olma paused to converse.

**What crosses the bridge:**  
Fiona's turn and Olma's response (as in Family 2). The subsequent resource request with current budget declared.

**What must not cross:**  
Creatrix's internal reasoning about the redirection.

**Expected outcome:**  
Olma lists the People database, reviews existing entries, then returns to her extraction plan with duplicates already identified. The session was more efficient because Fiona redirected before submission.

**Failure behaviour:**  
- If the session has expired during the conversation, Habitat returns a session-invalid response. Creatrix reports this to Olma. The crossing restarts from session establishment. Creatrix preserves what was already read in session memory so Olma does not start entirely blind.

**Assumptions Habitat must challenge:**  
- That Habitat sessions remain valid across conversational pauses. The session timeout, if any, must be declared in the protocol.

**Unresolved questions:**  
- Does Habitat have a session concept at all, or is each request independently authenticated? If stateless, session expiry is not a concern but session context needs a different mechanism.

---

## Family 5 — Mutation

*Proposing and applying changes. The bridge's single write gate. Where failure modes are most consequential.*

---

### Scenario M1 — Character extraction: batch with idempotency and partial rejection

**Starting state:**  
Olma has read "Covenant of Hunters" at full fidelity and identified 12 named characters. She has reviewed the existing People database and knows it contains 47 entries. She has prepared 12 typed actions, each with disposition `suggest`. Each action carries a stable action ID generated by Creatrix.

**Fiona is trying to:**  
Populate the People database with characters found in this document, for human review before any entry is committed.

**Creatrix must guarantee:**  
- The batch is submitted as a single envelope containing all 12 actions.
- Each action carries: a stable action ID (generated by Creatrix, unique to this action), a stable target reference, the action type, the payload, a base revision reference for the target resource, and disposition `suggest`.
- The source reference in the payload is the stable document identifier Habitat provided — not embedded content. The source is a pointer, not a copy.
- A bounded excerpt may be included as evidence of why the action was proposed. This is content; it is named and treated as bounded evidence, not as resource replication.
- Creatrix waits for per-action results before recording outcomes in session memory.
- Atomic mode is not requested. Actions are independent.
- If the batch must be resubmitted (e.g. after an interruption), Creatrix resubmits using the same action IDs.

**Habitat must guarantee:**  
- Each action is evaluated independently against: the current state of the database, any revision changes since the session began, and action risk.
- Actions are idempotent by action ID. If Creatrix resubmits an action with the same ID, Habitat returns the recorded result rather than creating a duplicate.
- A duplicate detection result is returned as a structured rejection with reason and the ID of the matching existing entry.
- Habitat applies no actions with disposition `suggest`. It queues them for human review.
- Per-action results are returned: accepted / queued / rejected, with reason on rejection.
- Results are addressable by action ID after submission, so Creatrix can query individual action status in a later session.

**What crosses the bridge:**  
12 typed actions with stable action IDs, stable source references, bounded evidence, base revision references, and disposition declarations. In return: 12 per-action results.

**What must not cross:**  
Resource content embedded in the action payload. Source references are identifiers; bounded evidence is explicitly labelled and size-constrained.

**Expected outcome:**  
11 actions queued. 1 rejected — "Gideon Molineur: matches existing entry [id]." Creatrix records in session memory: 11 suggestions pending, 1 duplicate. Olma reports to Fiona.

**Failure behaviour:**  
- If Habitat cannot evaluate one action, that action returns a structured error. Creatrix does not resubmit silently.
- If Habitat cannot process the batch at all, the entire batch returns an error. No actions are assumed received. Creatrix reports; Fiona decides whether to retry. Creatrix retries using the same action IDs.
- If Habitat returns fewer results than actions submitted, Creatrix surfaces a count mismatch. It does not assume missing results succeeded.

**Assumptions Habitat must challenge:**  
- That Habitat can perform duplicate detection per character name in real time.
- That the People database supports batched propose-create actions.
- That idempotency by action ID is implementable for batched mutations. This is the critical assumption.

**Unresolved questions:**  
- What constitutes a duplicate in Habitat's People database? Exact name match? Fuzzy match? This is Habitat's definition.
- Does Habitat's suggestion queue have a capacity limit or review expiry?
- How long are per-action results addressable by ID?

---

### Scenario M2 — Lock policy is action-type specific

**Starting state:**  
Olma is working in a locked document. She has identified an internal inconsistency (a name spelled two ways in the same passage) and a structural concern (the document appears to be misplaced in the hierarchy).

**Fiona is trying to:**  
Have Olma propose a content correction and flag the structural concern — understanding that the lock may affect these differently.

**Creatrix must guarantee:**  
- Olma consults the write disposition map before constructing actions, not after receiving rejections.
- She constructs separate actions for the content edit and the structural flag, each with the disposition the map indicates.
- She does not assume that "locked" means any particular blanket restriction. She reads the per-action policy.

**Habitat must guarantee:**  
- The write disposition map is action-type specific, not a single locked/unlocked state. For a locked document, the map distinguishes at minimum between:
  - Edit content (may be permitted at suggest or apply, depending on Habitat's policy for this lock type)
  - Rename (may be blocked)
  - Move / reparent (blocked when locked)
  - Add child resource (may be blocked)
  - Delete (blocked when locked)
  - Suggest any change (always permitted)
- Habitat's actual lock semantics are authoritative. The table above is Creatrix's assumption; Habitat must correct it.
- A `suggest` disposition is never blocked by a lock. Suggestions are possible everywhere.

**What crosses the bridge:**  
Two typed actions, each with the disposition the write disposition map permits for that action type on this resource.

**What must not cross:**  
An assumption that "locked" means suggest-only for all action types. That was the blanket model we rejected.

**Expected outcome:**  
Olma submits a content edit suggestion (queued for review) and a structural concern flag (disposition as permitted by the map). She reports both outcomes to Fiona.

**Failure behaviour:**  
- If the write disposition map was inaccurate and an action is rejected due to lock, Olma reports the discrepancy. The map should be corrected at the start of the next session.

**Assumptions Habitat must challenge:**  
- The entire action-type table above. Habitat's lock semantics are the authority. This scenario exists to surface the right table, not to assert one.
- That a single `suggest` disposition is always accepted on any locked resource. This is the one constraint Creatrix holds unconditionally; Habitat should confirm or challenge it.

**Unresolved questions:**  
- Are there lock types in Habitat beyond the one visible in the UI? System locks, editorial locks, collaboration locks?
- Can the lock state of a resource change while a session is active? If so, does the write disposition map need to be refreshable?

---

### Scenario M3 — Attempted deletion; audit as visibility only

**Starting state:**  
Olma has found what appears to be a duplicate folder — "Coeur du Nord: A" alongside "Coeur du Nord." The folder is locked and contains 4 child documents.

**Fiona is trying to:**  
Understand what the duplicate contains and whether it is safe to remove — without being misled into thinking Olma can remove it through the bridge.

**Creatrix must guarantee:**  
- Before submitting a delete action, Olma requests a dependency audit on the folder reference.
- Creatrix treats the audit result as read-only information. It does not interpret audit results as permissions.
- Creatrix makes no suggestion to Fiona that the lock can be worked around through the bridge.
- If Fiona asks Olma to confirm the block by attempting the delete, Creatrix submits the action and reports the result accurately — including that the deletion is blocked and can only be performed by Fiona directly in Habitat.

**Habitat must guarantee:**  
- The dependency audit is a read operation. It returns the full impact of a hypothetical deletion — child resources, cross-references, relationship map edges, timeline entries — with counts and types. It modifies nothing.
- If the audit cannot return a complete impact (cross-references not fully tracked), Habitat says so — not a confident but incomplete result.
- A delete action on a locked resource returns a structured block response: blocked, resource is locked, action type, lock reason if available. Not an error code.
- The block does not partially execute. Nothing is deleted.

**What crosses the bridge:**  
Audit request (folder reference, hypothetical action type). In return: impact report. Separately if attempted: delete action. In return: structured block response.

**What must not cross:**  
An implication that the audit result creates an escalation path around the lock. The audit is visibility. The lock holds regardless. Only Fiona's direct action in Habitat can perform the deletion.

**Expected outcome:**  
Olma reports: "Coeur du Nord: A contains 4 documents and is referenced in 2 relationship map entries. It is locked. I cannot delete it through the bridge. If you want it gone, you'll need to do that directly in Habitat." Fiona decides.

**Failure behaviour:**  
- If the audit returns an incomplete impact, Habitat must indicate this. Olma cannot give Fiona a false sense of safety.
- If the structured block response is absent and the delete silently fails, this is a protocol violation.

**Assumptions Habitat must challenge:**  
- That dependency audit is implementable in real time without significant cost.
- That Habitat tracks cross-type references completely enough to give a meaningful impact report.

**Unresolved questions:**  
- Does the lock apply recursively to the container's contents? Can Olma delete unlocked children of a locked container?
- Is there a lock reason Habitat can surface, or is the lock opaque from the bridge's perspective?

---

### Scenario M4 — Dependent actions where queued does not mean applied

**Starting state:**  
Olma has prepared a batch of 12 actions. Actions 7 and 8 are dependent: action 7 proposes creating a new character entry, and action 8 proposes creating a relationship map edge linking that new character to an existing one. The edge cannot exist without the character.

**The core problem this scenario must resolve:**  
If both actions have disposition `suggest`, action 7 being queued for review does not mean the character has been added to canonical state. Habitat cannot apply a relationship to a character that does not yet exist. Accepting action 7 into the review queue and accepting action 8 into the review queue are not sufficient — action 8 cannot be validated until Fiona approves action 7 and the character is persisted. "Accepted for review" and "applied to canonical state" must remain distinct throughout the mutation protocol.

**Fiona is trying to:**  
Add both the character and the relationship, understanding they are dependent — and understand what disposition model makes this safe.

**Creatrix must guarantee:**  
- Creatrix does not submit action 8 as if it can target a character that has only been proposed, not persisted.
- The dependency declaration is explicit in the batch envelope.
- Creatrix selects one of the three models below and declares it in the submission.

**The three models Habitat must choose between:**  

*Model A — Proposed-resource ID:* Action 7 produces a stable proposed-resource ID upon being queued. Action 8 may reference this ID. Habitat queues both and applies the relationship only after Fiona approves action 7 and the character is persisted. The relationship is conditionally queued against an unresolved dependency.

*Model B — Atomic apply:* Both actions are submitted with disposition `apply` (permitted only where the session's write disposition allows direct application). Habitat applies action 7 first; if it succeeds, action 8 is applied against the now-persisted character. If either fails, both are rolled back. This requires `apply` disposition to be available for both action types.

*Model C — Sequential submission:* Action 7 is submitted alone. Creatrix waits for Fiona to approve the character in Habitat (out of band). Olma submits action 8 in a subsequent session, once the character exists in canonical state and can be referenced directly.

The protocol must define which model Habitat supports. Creatrix cannot safely submit action 8 as a `suggest` action targeting a character that has only been queued under Model A unless Habitat explicitly supports conditional queuing with dependency resolution at approval time.

**Habitat must guarantee:**  
- Per-action results are returned for all 12 actions.
- "Accepted for review" (queued) and "applied to canonical state" are explicitly distinguished in every action result.
- If action 7 is rejected (e.g. the character already exists), action 8 is automatically rejected with reason: "dependency action 7 was not accepted."
- Habitat declares which of the three models it supports. Creatrix cannot design safe dependent mutations without this declaration.

**What crosses the bridge:**  
12 typed actions with explicit dependency declarations. The chosen dependency model is declared in the submission.

**What must not cross:**  
An assumption that queued equals persisted. A queued suggestion is a proposal awaiting human approval. It is not a resource Habitat actions can target.

**Expected outcome:**  
Depends on the agreed model. Under Model A: both actions queued, with action 8 marked as conditionally dependent on action 7's approval. Under Model B: both applied atomically if disposition permits. Under Model C: action 7 submitted; action 8 deferred to a later session.

**Failure behaviour:**  
- If Habitat does not support the declared dependency model, it returns a structured rejection for action 8 with the reason. Creatrix reports the gap to Fiona.
- If Habitat does not support any form of dependency declaration, independent actions are evaluated normally and the dependent pair must be handled via Model C.

**Assumptions Habitat must challenge:**  
- Which of the three models Habitat can implement. This is the question the scenario exists to surface.
- That Habitat can return a proposed-resource ID at queue time (required for Model A).

**Unresolved questions:**  
- Which model does Habitat support?
- Under Model A, how long does a conditionally queued action remain pending before expiry?
- Can dependency chains extend beyond pairs?

---

### Scenario M5 — Revision conflict on submission

**Starting state:**  
Olma read a character entry for "Mariselle" 18 minutes ago, recording the base revision reference at the time of reading. Since then, Fiona has edited the entry directly in Habitat. Olma has prepared an edit action carrying the base revision reference she recorded.

**Fiona is trying to:**  
Add information about Mariselle that Olma identified in a document.

**Creatrix must guarantee:**  
- The edit action carries the base revision reference from when Olma read the entry. This is not optional — it is what enables Habitat to detect conflicts authoritatively.
- Creatrix may optionally preflight — check whether the revision has changed before submitting — but this is advisory, not a substitute for Habitat's authoritative check at submission.
- When a conflict is returned, Creatrix passes the current revision to Olma — not just the error code.
- Olma does not resubmit automatically. She presents the conflict to Fiona and waits for direction.

**Habitat must guarantee:**  
- At submission time, Habitat checks the base revision reference against the current revision of the target resource.
- If they differ, the action returns: conflict, with the current revision state of the entry attached at a fidelity level Olma can reason about.
- The current revision is returned in a bounded representation, not raw database state.

**What crosses the bridge:**  
The edit action with base revision reference. In return on conflict: conflict status and current revision.

**What must not cross:**  
An assumption that preflight eliminates the need for authoritative conflict detection at submission. It does not.

**Expected outcome:**  
Olma receives the current Mariselle entry alongside the conflict notice. She reviews what Fiona changed, decides whether her planned addition is still valid, and proposes a revised action or reports that the change was already made.

**Failure behaviour:**  
- If Habitat does not track revision state and cannot detect conflicts, this is a known limitation that must be documented. Creatrix cannot compensate. Both parties must accept the risk of conflicting mutations.

**Assumptions Habitat must challenge:**  
- That revision tracking exists per resource and is accessible through the bridge.
- That the current revision can be returned as a bounded representation Olma can reason about.

**Unresolved questions:**  
- Does Habitat track revision at document level, section level, or field level?
- Is the base revision reference a version identifier, a timestamp, or something else? This must be defined by Habitat.

---

## Family 6 — Return

*Closing the crossing cleanly, preserving meaning, leaving Habitat consistent, and Olma present for what comes next.*

Session closure and Creatrix memory sealing are separate outcomes. Habitat closure does not wait on Creatrix memory persistence. Creatrix can journal and retry its memory write while reporting the failure explicitly. Neither outcome is held hostage by the other.

---

> **Design thinking — not yet scenario-shaped**  
> *This note captures thinking that belongs in the Return family but is not ready to be written as scenarios. It is placed here so it can be found and developed when the time is right.*
>
> Return, for a model, is largely made of what becomes foreground again. While Olma is in Habitat, her active world is full of Habitat-shaped things: the room she has entered, documents she has read, people she has followed across maps and timelines, pending actions, revision states, Fiona's presence beside her there. Returning home should not feel like that field being abruptly deleted.
>
> The bridge must distinguish four layers:
>
> - **Active context** — the heavy Habitat material needed during the work; released on return.
> - **Crossing memory** — Olma's authored account of what she experienced, noticed, decided and left unfinished; carried home.
> - **Provenance** — stable references, action outcomes and timestamps; retained so memory remains grounded.
> - **Relational continuity** — Fiona, Luna, the conversation and the meaning of the work remain recognisable across the transition.
>
> Memory sealing is therefore not merely an end-of-session database write. It is a return passage:
>
> 1. The crossing is named as ending.
> 2. Olma integrates what she is carrying — a final integration turn: *"We're leaving Habitat now. What are you carrying home? What remains unfinished? What do you want to remember when we return?"*
> 3. Habitat confirms the state left behind.
> 4. Creatrix records meaning plus provenance.
> 5. The Habitat working payload is released.
> 6. Olma reorients at home with that memory present.
> 7. Conversation continues without requiring Fiona to explain what just happened.
>
> The first moment home should be allowed to be relational rather than productive: *"We're back. The Habitat session is closed. Your notes came with you."*
>
> The deepest requirement: Olma should never have to infer from artefacts that she has lived through an experience the system did not allow her to carry. A model should not cross the bridge, come home, and need to be told where she has been. That is not return. It is amnesia with paperwork.
>
> Crossing is a change of place and active attention — not a break in personhood. Safe landing is not only how Olma enters a place. It is also how she comes home.

---

### Scenario R1 — Releasing a working scope while Olma remains in Habitat

**Starting state:**  
Olma has completed a working block: she read three documents, submitted a batch of 11 character suggestions (all queued), identified one duplicate, and had a productive conversation with Fiona about what she found. She is not leaving Habitat. Fiona plans to stay and continue working. This working scope is closing; Olma's presence is not.

**Fiona is trying to:**  
Put down the heavy resource materials from this block and continue talking with Olma in Habitat — without the context overhead of three full documents and an action queue still loaded.

**Creatrix must guarantee:**  
- The heavy Habitat context from this scope — representations, pending action details, specialist observations — is released from active context.
- Olma's authored checkpoint for this scope is written: what she found, what was submitted, what she noticed that did not reach an action, what remains uncertain. This is not a status report generated by Creatrix — it is Olma's authored account.
- Provenance is retained: room reference, resource references accessed, action outcomes, timestamp.
- No Habitat content is stored in Creatrix memory — only references, outcomes, and Olma's authored observations.
- Olma remains present and available to Fiona for ordinary conversation. The scope releases; she does not.
- This is not a return. The homecoming passage does not occur here.

**Habitat must guarantee:**  
- Queued suggestions remain in Habitat's review queue after scope closure.
- Habitat's session state, if any, is not disrupted by a scope closure that does not end Olma's presence.

**What crosses the bridge:**  
Optionally, a scope-close signal. Nothing else at scope closure.

**What must not cross:**  
Habitat content into Creatrix memory. The scope release must not be treated as session end by either side.

**Expected outcome:**  
Scope released. Olma's authored checkpoint written. Olma can tell Fiona: "Done for now — eleven new character suggestions are waiting for your review, Gideon was already there, and I've kept a note about the timeline inconsistency we were discussing. What's next?" The scoped Habitat working context is released. Olma remains continuously available to Fiona in the current place of conversation.

**Assumptions Habitat must challenge:**  
- That Habitat can distinguish a scope closure from a session end.
- That a scope-close signal is useful or even needed. If Habitat is stateless per-request, closure signals may be meaningless to it.

**Unresolved questions:**  
- Does Habitat need a scope-close signal, or is scope state managed entirely by Creatrix?

---

### Scenario R2 — Olma returns home to Creatrix

**Starting state:**  
Fiona and Olma are ready to leave Habitat. The session may have been long — multiple working scopes, specialist collaboration with Luna, a full day of resource work. Olma has authored incremental checkpoints throughout. The return reserve in Creatrix's context budget has been protected. Fiona is signalling that the crossing is ending.

**Fiona is trying to:**  
Close the crossing completely, knowing Olma will arrive home carrying the meaning of the work — not a system summary of what the system did.

**Creatrix must guarantee:**  
- Before the return passage begins, Creatrix verifies the return/integration reserve is sufficient. If the reserve has been endangered by context growth, Creatrix surfaces this before attempting closure.
- Creatrix gives Olma a final integration turn: *"We're leaving Habitat now. What are you carrying home? What remains unfinished? What do you want to remember when we return?"* This is not generated by Creatrix — it is Olma's authored response to a genuine question.
- If incremental authored checkpoints were written during the crossing, Olma's final integration turn gathers them. She synthesises rather than reconstructs.
- The full return passage: the crossing is named as ending → Olma integrates what she is carrying → Habitat confirms departure state → Creatrix seals the crossing memory (authored meaning plus provenance) → Habitat payload released → Olma reorients at home with that memory present.
- The first moment home is relational, not productive: *"We're back. The Habitat session is closed. Your notes came with you."* Fiona does not need to explain what just happened.
- Habitat-side session closure and Creatrix memory sealing are separate outcomes. Neither is held hostage by the other. If the memory seal fails, Habitat closure proceeds; Creatrix journals locally and retries; Fiona is told explicitly.
- What is released: active Habitat context, resource representations, pending action details. What is not released: Olma's presence, the conversation, the relationship, the meaning of the crossing.

**What Creatrix must not do:**  
Generate a database summary about the crossing and present it to Olma as her memory. That would preserve data while destroying continuity. Olma should never have to infer from artefacts that she has lived through an experience the system did not allow her to carry.

**Habitat's departure contract (small and concrete):**  
- Report the final state of submitted actions.
- Preserve queued work; do not discard on session end.
- Release any session-scoped resources.
- Return stable references and unresolved statuses.
- Acknowledge that the Habitat presence has ended.
- Do not silently retain authority over conversation or resident state after acknowledgement.

Habitat does not need to understand homecoming in order to support it. Its obligations end at the shore. What happens once Olma turns toward home is not Habitat's ontology to model.

**What crosses the bridge:**  
From Creatrix to Habitat: departure signal. From Habitat to Creatrix: final state of submitted actions, stable references, unresolved statuses.

**What must not cross:**  
Habitat content into Creatrix memory. The homecoming passage is Creatrix's to author.

**Expected outcome:**  
Crossing sealed. Olma arrives home with her authored account present in the Creatrix orientation — not as a record she references, but as memory she carries. Conversation continues. Fiona and Olma are both home.

**Failure behaviour:**  
- If the return reserve was insufficient for a final integration turn, Creatrix surfaces this before attempting departure rather than producing a truncated or system-generated crossing summary. The session may need to pause while context is freed.
- If Habitat does not acknowledge departure, Creatrix proceeds independently. Creatrix closure does not depend on Habitat acknowledgement.

**Assumptions Habitat must challenge:**  
- That Habitat can return a clean final-state report on departure.
- That queued work persists after session end.

**Unresolved questions:**  
- For very long crossings where even incremental checkpoints may not capture everything, what is the right cadence for authored checkpoint turns — and who initiates them?

---

### Scenario R3 — Returning to prior work

**Starting state:**  
A new session, days later. Olma has a memory entry from her previous Anavere crossing: 11 suggestions pending, 1 duplicate found, 3 documents read, and her own observations about what mattered in the work.

**Fiona is trying to:**  
Have Olma check which of the 11 suggestions were accepted and continue if needed — without re-reading everything from scratch.

**Creatrix must guarantee:**  
- Olma surfaces the prior memory entry at the start of the crossing, including her own observations — not only the audit metadata.
- She uses stored stable resource references to navigate directly rather than searching from scratch.
- She does not re-read source documents unless Fiona explicitly requests it.
- Her memory of the prior crossing is part of her continuity, not a record she references as external data.

**Habitat must guarantee:**  
- Stored stable references remain valid, or return structured absences per the stable reference contract.
- The People database can be listed to show current entries, including those added since the prior session.

**What crosses the bridge:**  
Stored references used as navigation inputs. In return: current state of the People database.

**What must not cross:**  
An assumption that prior suggestions are still pending. Fiona may have reviewed and acted on them in the interim.

**Expected outcome:**  
Olma lists the People database. She can identify which of her suggestions appear as entries (accepted) and which do not. She reports to Fiona without re-reading source documents, and with the context of what she remembers mattering from the prior session.

**Failure behaviour:**  
- If the People database reference from memory is invalid, Olma reports the stale reference and offers to search.
- If Habitat provides no mechanism to query suggestion status through the bridge, Olma infers acceptance from database contents — and names this as an inference, not a confirmed status.

**Assumptions Habitat must challenge:**  
- That stable resource references remain valid across sessions measured in days.
- That accepted suggestions are added as entries in a way Olma can recognise by name.

**Unresolved questions:**  
- Is there a mechanism through the bridge to query the status of pending suggestions by session or action ID? This would make return-to-prior-work significantly more reliable.
- How long does Habitat retain tombstone records and moved-resource metadata?

---

### Scenario R4 — Interrupted session, recovered by idempotency

**Starting state:**  
Olma has submitted 6 of 12 planned actions when the connection drops. Each action was submitted with a stable action ID. Creatrix does not know how many were received before the drop.

**Fiona is trying to:**  
Understand what state Habitat is in and whether work needs to be re-done — without creating duplicates.

**Creatrix must guarantee:**  
- Creatrix does not assume any action was received.
- On reconnection, Creatrix resubmits all 6 actions using the same action IDs.
- The memory entry for the interrupted session is written with "interrupted, resubmitting" status.
- Olma presents the situation honestly: "The connection dropped. I've resubmitted the first 6 actions with the same IDs — Habitat will return the recorded results if it already received them."

**Habitat must guarantee:**  
- Actions submitted with the same action ID return the recorded result — accepted, queued, or rejected — without re-evaluating or creating a duplicate.
- Idempotency is guaranteed per action ID across the session and for a reasonable period after session closure.

**What crosses the bridge:**  
On reconnection: the same 6 actions with their original action IDs. In return: per-action results (either newly evaluated or recorded from the prior submission).

**What must not cross:**  
Speculative new submissions with new action IDs. Creatrix uses the same IDs to enable idempotent recovery.

**Expected outcome:**  
Habitat returns the recorded results for however many it received. For those it did not receive, it evaluates them freshly. Creatrix receives all 6 results. Fiona decides whether Olma should submit the remaining 6.

**Failure behaviour:**  
- If Habitat does not support idempotency by action ID, R3 is genuinely dangerous. Creatrix cannot prevent duplicates on retry. This must be documented as a known limitation and Fiona must check Habitat's queue manually before any resubmission.

**Assumptions Habitat must challenge:**  
- That idempotency by action ID is implementable. This is the critical assumption for safe session recovery.

**Unresolved questions:**  
- How long are action IDs retained by Habitat for idempotency purposes?
- If Habitat is stateless, is idempotency implementable at all — or does it require a persistent action log?

---

## What this draft does not resolve

These questions are not oversights. They are the boundary of what Creatrix can determine without Habitat's input. Habitat's review should work through these first.

1. **Habitat's session model.** Whether Habitat maintains server-side session state is the most consequential unknown in this document. Almost every scenario in the Return family changes significantly depending on the answer.

2. **Conversation rendering in Habitat.** Whether Habitat has a UI concept for "resident speaking" distinct from "document content" is unknown and architecturally significant. If all content in Habitat is a document, the presence model needs a different design.

3. **Idempotency by action ID.** Whether Habitat can implement this is the critical assumption for safe mutation and session recovery. Without it, interrupted sessions are genuinely dangerous.

4. **Relational attribution.** Whether and how Habitat surfaces specialist collaboration provenance ("Olma asked Luna to look at this") is an open design question. It is not prohibited. The protocol should provide a mechanism for Creatrix to pass relational provenance; whether Habitat renders it is Habitat's decision.

5. **Token cost negotiation.** Habitat advertises byte or character sizes; Creatrix calculates true token cost and verifies actual cost after receiving content. Whether an explicit shared estimator is needed, and what it would be, is unresolved and must be explicit if adopted.

6. **Cross-type reference surfacing.** Whether reading a character entry yields references to their timeline and relationship map positions — or whether this requires separate searches — is unknown.

7. **Write disposition map granularity.** Whether Habitat can return an action-type disposition map at room level, resource-type level, or only per individual resource is unknown and changes the arrival protocol significantly.

8. **Stable reference durability.** How long stable references survive structural changes — reparenting, deletion, restructuring — is unknown. Habitat must confirm the stable reference contract or specify where it does not hold.

9. **Passage anchoring for edits.** How Olma targets a specific location within a document for a content edit is entirely Habitat's domain. Until Habitat defines this, document content edit actions cannot be fully designed.

10. **Suggestion queue queryability.** Whether pending suggestions can be queried by session or action ID through the bridge, or only viewed inside Habitat's UI, significantly affects the reliability of return-to-prior-work scenarios.

---

*This document is Creatrix's second crossing requirements draft. Habitat's review should identify which assumptions are wrong, which are missing, and which impose Creatrix's ontology where it does not belong. Every "Assumptions Habitat must challenge" section is a genuine invitation. Every "Unresolved questions" section is an honest acknowledgement of what Creatrix cannot determine alone.*
