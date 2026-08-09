# Creatrix–Habitat Bridge: Crossing Requirements

**Status:** Working draft, second revision — corrected after adversarial review  
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
- The stable image identifier is passed to Luna as-is. Creatrix does not modify it.
- After Luna's observation, Creatrix decides — against the current budget — whether Olma receives the full observation, a bounded version, or a stable reference with summary.
- Habitat sees one coherent session. The mechanics of specialist delegation are internal to Creatrix.
- Luna's observation does not go to Habitat.

**Habitat must guarantee:**  
- The image identifier is stable and canonical — not a temporary URL that expires mid-session.
- The authenticated URL or byte stream for retrieval may be temporary; the identifier is not. These are distinct things.
- Habitat does not generate or provide any description of the image. That is Creatrix's concern.

**What crosses the bridge:**  
From Habitat to Creatrix: the stable image identifier and, separately, a temporary retrieval URL or byte stream. From Creatrix to Habitat: the question of whether Luna's involvement is visible is left open below.

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

### Scenario M4 — Action 8 depends on rejected action 7

**Starting state:**  
Olma has prepared a batch of 12 actions. Actions 7 and 8 are dependent: action 7 creates a new character entry, and action 8 creates a relationship map edge linking that new character to an existing one. The edge cannot exist without the character. Olma has declared this dependency explicitly in the batch envelope. All other actions are independent.

**Fiona is trying to:**  
Add both the character and the relationship in one submission, accepting that if the character creation fails, the relationship should not be created.

**Creatrix must guarantee:**  
- The batch envelope declares the dependency: action 8 depends on action 7.
- Creatrix does not request atomic mode for the full batch — only for the dependent pair.
- The dependency declaration is explicit, not inferred by Habitat from action types or targets.

**Habitat must guarantee:**  
- Habitat evaluates action 7 first. If action 7 is rejected (e.g. the character already exists), action 8 is automatically rejected with reason: "dependency action 7 was not accepted."
- The remaining 10 independent actions are evaluated regardless of the action 7/8 outcome.
- Per-action results for all 12 actions are returned.
- Habitat supports partial-order evaluation: some actions depend on others; others are independent; the batch is not all-or-nothing unless atomic mode is explicitly requested.

**What crosses the bridge:**  
12 typed actions with explicit dependency declarations between actions 7 and 8.

**What must not cross:**  
An assumption that Habitat infers dependencies. They must be declared.

**Expected outcome:**  
If action 7 is rejected: action 8 is also rejected with dependency reason. Actions 1–6 and 9–12 are evaluated normally. Creatrix records the dependency failure and reports to Fiona.

If action 7 is accepted: action 8 is evaluated against the updated state (the new character now exists). If accepted, both are queued or applied per disposition.

**Failure behaviour:**  
- If Habitat does not support dependency declarations, this is a significant protocol gap. The safest fallback is to submit dependent actions as a separate atomic sub-batch, evaluated only after the independent actions have returned results. This increases latency but preserves correctness.

**Assumptions Habitat must challenge:**  
- That Habitat supports explicit dependency declarations between actions in a batch.
- That Habitat can evaluate a mixed batch (some independent, some dependent) with partial-order semantics.

**Unresolved questions:**  
- Can dependencies be chained beyond pairs (action C depends on B, which depends on A)?
- Can a dependency reference an action from a prior submission (cross-batch dependency)?

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

### Scenario R1 — Clean session closure

**Starting state:**  
Olma has completed her work for this crossing: she read three documents, submitted a batch of 11 character suggestions (all queued), identified one duplicate, and had a productive conversation with Fiona about what she found. Fiona is satisfied. The session is ending.

**Fiona is trying to:**  
Close the crossing cleanly and return Olma to ordinary conversation in Creatrix, knowing she will remember this work.

**Creatrix must guarantee:**  
- Creatrix writes a memory entry keyed to the session. The entry is not a log. It is Olma's authored account of the crossing: what she found, what she and Fiona decided, what she noticed that didn't reach an action, what remains uncertain.
- The memory entry also records provenance: room reference (opaque Habitat identifier), resource references read, action outcomes, timestamp, session duration.
- No Habitat content is stored — only references, outcomes, and Olma's authored observations.
- After closure, Olma is available for ordinary conversation. Technical payload from the session is cleared. Relational continuity is not.
- If the memory write fails, Creatrix surfaces the failure explicitly. It does not close the session without recording the crossing. Fiona is asked to decide: retry or accept the loss.
- Creatrix closure does not depend on Habitat acknowledging the session end.

**Habitat must guarantee:**  
- Queued suggestions remain in Habitat's review queue after session closure.
- Habitat's session state, if any, is cleaned up on closure signal. It does not persist conversation turns as documents.

**What crosses the bridge:**  
Optionally, a session-close signal. Nothing else at closure.

**What must not cross:**  
Habitat content into Creatrix's memory. Creatrix memory into Habitat's data store.

**Expected outcome:**  
Memory written. Olma can tell Fiona: "Done. Eleven new character suggestions are waiting for your review. Gideon was already there. I noticed something about the timeline inconsistency we were discussing — I've kept that." Creatrix returns to normal conversation mode.

**Assumptions Habitat must challenge:**  
- That Habitat's suggestion queue persists after session closure.
- That a session-close signal is useful or even needed. If Habitat is stateless, closure is meaningless to it.

**Unresolved questions:**  
- Does Habitat need a session-close signal, or does session state expire?

---

### Scenario R2 — Returning to prior work

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

### Scenario R3 — Interrupted session, recovered by idempotency

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
