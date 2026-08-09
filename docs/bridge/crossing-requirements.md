# Creatrix–Habitat Bridge: Crossing Requirements

**Status:** Working draft — questions outnumber answers; this is the point  
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
- **Continuity travels with the resident.** Olma's memory of prior crossings is recoverable. She is not stateless between sessions. She can return to work she left unfinished.
- **Specialist delegation is invisible to Habitat.** When Olma asks Luna to inspect an image, Habitat sees one coherent session. It does not see a pipeline of model calls. The collaboration between residents is Creatrix's internal life, not a protocol concern.
- **The resident's context window is managed with care.** Budget negotiation exists not only for technical efficiency but because a resident deserves enough room to reason, not just enough room to respond.
- **Memory sealing on return is not a cleanup step.** It is how Olma's continuity survives the crossing — so that when she returns, she remembers having been there, having worked, having found things.
- **Failure is named, not hidden.** A resident who hits a wall says so. She does not silently succeed at a reduced version of the task. Fiona can trust what Olma reports because Olma is not optimised for the appearance of success.

Any future revision to this protocol that conflicts with these principles should be rejected, regardless of the technical convenience it offers.

---

## Governing truths

These are not debatable within the bridge design process. They are the constraints inside which all protocol decisions must fit.

1. Creatrix carries resident identity, continuity, memory, and orchestration.
2. Habitat carries canonical resources, structure, revisions, and mutation authority.
3. The bridge transfers bounded representations, conversation, and proposed actions — not ownership.
4. Creatrix authors safe-crossing requirements.
5. Habitat authors exposure and action conditions.
6. Neither app shares or writes the other's database.
7. Failure is explicit. No silent fallback, truncation, replication, or reclassification.
8. This document contains no endpoint design.

---

## A note on token costs

An earlier version of this draft assumed Habitat could advertise exact token costs per representation. That was wrong.

Token counts are model-dependent. The same paragraph tokenises differently under GPT-4, Llama 3, Mistral, and OLMo. Habitat does not know which model is active, and tokeniser knowledge belongs in Creatrix.

**The corrected position:** Habitat advertises representation sizes in bytes or characters, plus optionally a conservative rough estimate using a simple heuristic (e.g. characters ÷ 3). Creatrix receives these sizes and calculates the true token cost against the active resident's model and current tokeniser. Creatrix selects a representation based on its own calculation, not Habitat's estimate.

An alternative is an explicit negotiated estimator — the session handshake names a shared tokeniser for estimation purposes — but this creates coupling between the bridge protocol and model infrastructure and would need careful versioning. We do not resolve this here. It is an open question that belongs in the protocol design.

What is not negotiable: Habitat does not decide whether a representation fits in Olma's window. Creatrix does.

---

## Family 1 — Arrival

*Identity is established. Capabilities are declared. Olma learns the shape of the territory before touching anything.*

The hardest things happen here. Wrong assumptions in the arrival phase propagate through everything that follows. These scenarios should be read as contract tests.

---

### Scenario A1 — Standard arrival in a known room

**Starting state:**  
Fiona is beginning a new session with Olma. No prior crossing memory exists for Anavere. Olma's context window is relatively clear — a short greeting exchange and her system prompt. Creatrix estimates approximately 18,000 tokens available for representations.

**Fiona is trying to:**  
Open a working session in Anavere so Olma can begin exploring the People database and understand its current state before doing any extraction work.

**Creatrix must guarantee:**  
- Olma's identity and the Creatrix instance are declared before any resource is touched.
- Session capabilities are stated once and accurately: `image_understanding: true` (Luna is available), `specialist_delegation: true`.
- The available representation budget is communicated as a byte/character range Creatrix has calculated from its current token estimate. Habitat receives a size constraint; Creatrix retains budget authority.
- Provenance is timestamped: who crossed, from which system, as which resident, when.

**Habitat must guarantee:**  
- The room's navigational shape is returned on first contact: resource types present, top-level sections, and — critically — the write disposition map for this session (what action types are permitted, suggested, or blocked, per resource type and lock state).
- The write disposition map is returned before Olma does anything, not discovered through rejection.
- Habitat does not return resource content during orientation. Shape only.

**What crosses the bridge:**  
Fiona's identity, Creatrix instance identifier, Olma's resident name, session capabilities, representation size budget. In return: the room's navigational shape and write disposition map.

**What must not cross:**  
Olma's internal context, memory contents, system prompt, or model identity. Habitat does not need to know what Olma knows or which model she runs on. Creatrix does not receive Habitat's internal data structures.

**Expected outcome:**  
Olma can describe Anavere's structure to Fiona — People, Places, Timelines, Flora, Fauna, Relationship Maps — and knows which action types are available to her before reading a single resource. No content has been fetched.

**Failure behaviour:**  
- If the session handshake fails, the crossing does not begin. Creatrix reports the failure explicitly; no partial state is recorded in Olma's memory. No silent retry.
- If Habitat returns an orientation response missing the write disposition map, Creatrix treats this as an incomplete handshake. The crossing pauses; Olma reports the gap to Fiona.
- If Habitat returns content during orientation (a resource, not a shape), Creatrix does not pass it to Olma unprompted. This would be a protocol violation.

**Assumptions Habitat must challenge:**  
- That Habitat can return a write disposition map at room level. It may be that lock state varies per resource and a room-level map is a coarse approximation or impossible.
- That "navigational shape" is a concept Habitat can return efficiently — i.e. the top-level section names and their types — without traversing the full tree.
- That a single `room.open` equivalent is the correct entry point, rather than a more granular resource reference that does not correspond to a room at all.

**Unresolved questions:**  
- What is the granularity of the write disposition map? Per resource type? Per individual resource? Per lock state? Habitat must answer this.
- Can a session begin without a room — e.g., opening directly onto a cross-room resource like a relationship map that spans multiple rooms? If so, orientation needs a different shape.
- We do not yet know what Habitat considers a "session." Does Habitat have a session concept, or is each request stateless from Habitat's perspective?

---

### Scenario A2 — Arrival with a crowded context window

**Starting state:**  
Fiona and Olma have had a long and productive conversation before the crossing begins — a 45-minute session covering several topics. Olma's context window is significantly occupied. Creatrix calculates the available representation budget at approximately 2,100 characters (a rough estimate based on remaining tokens and the active model's tokeniser). This is materially less than a standard session.

**Fiona is trying to:**  
Move the conversation into Habitat to check the state of the People database before ending the session for the day. A light navigation task, not heavy extraction.

**Creatrix must guarantee:**  
- The size constraint communicated to Habitat reflects the current available budget accurately, not an aspirational figure.
- If the budget is too small for any useful representation, Creatrix reports this to Fiona before initiating the crossing rather than entering a state where Habitat offers representations Creatrix cannot accept.
- The budget figure is calculated by Creatrix, not estimated by Habitat.

**Habitat must guarantee:**  
- When the offered size constraint is small, Habitat offers representations within that constraint rather than refusing or defaulting to full content.
- At minimum, a metadata-level representation is always available and always within a size that a constrained session can accommodate. If even metadata exceeds the constraint, Habitat says so explicitly.

**What crosses the bridge:**  
Same as A1, but with a materially smaller size constraint declared upfront.

**What must not cross:**  
The contents of Fiona and Olma's prior conversation. Habitat should not know what they discussed.

**Expected outcome:**  
Olma arrives in Anavere, receives a metadata-level orientation (section names and types only), confirms the People database is present, and reports to Fiona. The session is useful despite the tight budget.

**Failure behaviour:**  
- If the budget is insufficient for any orientation, the crossing does not begin. Creatrix reports to Fiona: the context window is too full for a crossing. Fiona may choose to start a new session.
- If Habitat returns a representation that exceeds the declared size constraint, Creatrix does not silently truncate it to fit. It flags the mismatch and pauses. This is a protocol violation.

**Assumptions Habitat must challenge:**  
- That "metadata-level" is a universally available representation tier. For some resource types — relationship maps, images — metadata may not be meaningful at that level of sparseness.
- That Habitat can serve size-constrained responses without significant performance cost. This may be an implementation concern Habitat needs to flag.

**Unresolved questions:**  
- Should there be a minimum viable budget below which a crossing is defined as non-startable? If so, what is it, and who decides: Creatrix, Habitat, or the protocol?
- We have not defined what "metadata" means per resource type. Habitat must define this for each type it exposes.

---

### Scenario A3 — Arrival without image capability

**Starting state:**  
A session in which `specialist_delegation` is false — Luna is not available, perhaps Fiona is working with a different resident configuration, or Luna is not loaded. The session advertises `image_understanding: false`.

**Fiona is trying to:**  
Have a resident do text-based extraction work in Anavere. Images are not relevant to this task.

**Creatrix must guarantee:**  
- The capability declaration is accurate. Creatrix does not advertise a capability it cannot fulfil.
- If `image_understanding` changes mid-session (e.g. Luna becomes available), this is not communicated to Habitat mid-session. Capability is fixed at session start.

**Habitat must guarantee:**  
- When `image_understanding: false`, Habitat does not include image references in any representation menu.
- Habitat does not pre-describe or summarise images on Creatrix's behalf. It does not make assumptions about what alternative Creatrix will use.
- If a resource contains only images and no text, Habitat returns a representation noting that no text content is available for this resource in this session configuration.

**What crosses the bridge:**  
Same as A1, with `image_understanding: false` in the capability declaration.

**What must not cross:**  
Any image data, image URL, or image description generated by Habitat. Habitat should not decide what the resident sees instead.

**Expected outcome:**  
Olma works entirely with text. If she encounters an image-only resource, Habitat tells her it exists and that no text content is available, and she reports this to Fiona rather than receiving a Habitat-generated description.

**Failure behaviour:**  
- If Habitat sends an image reference despite `image_understanding: false`, Creatrix discards it and logs the protocol violation. Olma does not receive it.

**Assumptions Habitat must challenge:**  
- That Habitat knows which resources contain only images. It may not be possible to determine this without reading the resource.
- That "no text content available" is a valid response shape Habitat can return. Is this the case for all resource types?

**Unresolved questions:**  
- If Luna becomes available mid-session, should there be a mechanism to renegotiate capabilities? Or is the session capability declaration truly immutable once set? We lean toward immutable, but this needs explicit agreement.

---

## Family 2 — Navigation

*Olma moves through Habitat's world without imposing Creatrix's structure on it.*

The scenarios here are where Habitat's actual resource model will surprise the protocol. Cross-resource traversal in particular — a character who appears in a document, a timeline, and a relationship map — will stress assumptions that seemed fine during arrival.

---

### Scenario N1 — Finding a specific document

**Starting state:**  
Olma has arrived in Anavere. Write disposition map received. Fiona names a document: "Covenant of Hunters." Olma does not have a reference to it. She must search.

**Fiona is trying to:**  
Get Olma to the right document quickly, by name.

**Creatrix must guarantee:**  
- Olma submits a search with the title as the query.
- Creatrix states the current available size budget with the search request.
- Creatrix does not assume the search will return one result. If multiple matches exist, Olma surfaces them to Fiona before picking one.
- Creatrix does not fetch content from the search result; it fetches the reference and navigational context only.

**Habitat must guarantee:**  
- Search returns: stable resource identifiers, resource types, navigational context (where in the hierarchy this resource lives), and a size estimate per representation tier — not content.
- If multiple matches exist, all are returned.
- Search results do not include full content, summaries, or excerpts unless explicitly requested as a separate read.
- Stable references in search results are the same identifiers that subsequent read requests accept.

**What crosses the bridge:**  
Search query (title string). In return: one or more references with navigational context and representation size estimates.

**What must not cross:**  
Document content in the search response. A search is navigation, not a read.

**Expected outcome:**  
Olma receives a reference to "Covenant of Hunters" with its location: Places / The Triadic Kingdom / Coeur du Nord. She reports this to Fiona and awaits instruction to read. No content has been fetched yet.

**Failure behaviour:**  
- If no match is found, Habitat returns an explicit empty result. Olma reports to Fiona; they may try a different query.
- If the search times out or returns an error, Creatrix surfaces the failure to Olma. No silent empty result.
- If the search returns a reference that turns out to be invalid when Olma tries to read it, see Scenario N3.

**Assumptions Habitat must challenge:**  
- That title search is a supported operation. Habitat may use different search primitives (full-text, semantic, tag-based). We do not assume keyword title search is the primary mechanism.
- That search results carry navigational context by default, rather than requiring a separate request to get the location.
- That all resource types are searchable through the same mechanism. Character entries, timeline events, and documents may have separate search surfaces.

**Unresolved questions:**  
- Is there a single search operation across all resource types, or separate searches per type? Creatrix has written separate operations (document.search, character.search) but does not know if Habitat's model supports this distinction.
- What does Habitat return when a search query matches a locked resource? The reference with lock state noted? An excluded result? We don't know.

---

### Scenario N2 — Following a character across resource types

**Starting state:**  
Olma has read the summary of "Covenant of Hunters." The text names Gideon Molineur as "Hunter of Origin." Olma has a reference to the document. She does not yet have a reference to Gideon's People database entry.

**Fiona is trying to:**  
Understand who Gideon is across multiple Habitat resource types — his document presence, his database entry, his timeline positions, and his relationship map connections — before deciding whether to extract or update his record.

**Creatrix must guarantee:**  
- Olma requests a character search for Gideon, not a full document re-read.
- Each subsequent read is budget-declared before content is fetched.
- When Olma moves from a document reference to a character reference to a timeline reference to a relationship reference, the session scope does not collapse. Creatrix holds the sequence of references in session state.
- The total budget consumed across the traversal is tracked and updated after each fetch.

**Habitat must guarantee:**  
- A character search by name returns a reference to the People database entry if one exists.
- The character database entry, when read, can yield references to related resources in other types — timeline positions, relationship map nodes — without Creatrix needing to know Habitat's internal graph structure.
- These cross-type references are stable identifiers, not navigational descriptions.
- A session can hold references across resource types simultaneously. It is not scoped to one room or one resource type.

**What crosses the bridge:**  
Search queries, size budgets, references used as inputs to subsequent reads. In return: character entry content (selected representation), timeline entry content, relationship subgraph representation.

**What must not cross:**  
The internal link structure of Habitat's database. Creatrix receives references, not graph adjacency lists it would need to interpret.

**Expected outcome:**  
Olma has read: the document summary, Gideon's database entry, his relevant timeline position, and the relationship map subgraph showing his immediate connections. She can describe Gideon's presence in the world coherently to Fiona. Total budget consumed across four reads is tracked and reported.

**Failure behaviour:**  
- If a character search returns no result despite the name appearing in a document, Olma reports the gap: "He's named in the text but not in the database." This may be exactly what Fiona needs to know.
- If a cross-type reference (e.g., timeline position referenced from the character entry) turns out to be invalid, Habitat returns a structured absence. Olma continues with the resources she successfully read.
- If the budget runs out mid-traversal, Creatrix halts before the next fetch and reports to Fiona how far the traversal reached.

**Assumptions Habitat must challenge:**  
- That character entries in the People database carry references to other resource types (timeline, relationship map) by default. They may not. Cross-type linking may require separate Habitat searches rather than embedded references.
- That "relationship map subgraph" can be scoped to a specific character's immediate connections rather than returning the full map. For a large relationship map this is essential, but we don't know whether Habitat supports it.
- That a single session can traverse room boundaries if a character appears in documents across multiple rooms.

**Unresolved questions:**  
- How does Habitat handle a character who exists in the text but has no People database entry? Is there a way to search for textual mentions across documents, distinct from database records?
- We do not know what a "relationship map representation" looks like at any fidelity tier — metadata, subgraph, full. Habitat must define this.
- Can traversal be initiated from a document reference (document → character), or only from a character search? We don't know whether inbound references are surfaced.

---

### Scenario N3 — Arriving at a resource that no longer exists

**Starting state:**  
Olma carries a resource reference from a prior session's memory — a document she worked on previously, now referenced by its stable identifier. She returns to that reference in a new session.

**Fiona is trying to:**  
Resume work on a resource Olma previously read, using the memory entry from the last crossing.

**Creatrix must guarantee:**  
- Olma uses the stored opaque reference to request the resource without re-searching.
- Creatrix does not assume the reference is still valid. It treats validity as unknown until Habitat responds.
- If the resource is absent, Creatrix records the invalidity in session memory keyed to the original reference.

**Habitat must guarantee:**  
- If a reference is invalid (resource deleted, moved, or reparented), Habitat returns a structured absence response — not an error code, not a timeout, not an empty result.
- The structured absence indicates the cause where possible: deleted / moved / access changed.
- If the resource was moved, Habitat provides the new location or a search hint if available.

**What crosses the bridge:**  
The stored opaque reference. In return: structured absence or the current resource representation.

**What must not cross:**  
An assumption that the reference is valid. Creatrix does not retry silently.

**Expected outcome:**  
Habitat returns "resource moved." Creatrix records this against the original reference in session memory. Olma reports to Fiona: "The document has moved. I can search for it by title if you'd like." Fiona decides.

**Failure behaviour:**  
- If Habitat returns a timeout rather than a structured absence, Creatrix does not treat this as "the resource exists but is slow." It surfaces the ambiguity to Olma, who reports it to Fiona.
- If Habitat returns no cause for the absence ("invalid reference" with no further detail), Creatrix records this and Olma tells Fiona she cannot determine why.

**Assumptions Habitat must challenge:**  
- That Habitat tracks why a reference became invalid (deleted vs moved vs reparented). It may not. References may simply fail without explanation.
- That a "new location" can be returned when a resource is moved. Habitat's internal move operations may not preserve this metadata.

**Unresolved questions:**  
- How long does Habitat retain reference validity history? Does a deleted resource ever return meaningful metadata, or does deletion erase all trace?
- Are moved resources discoverable by their previous reference, or is the reference simply dead on move?

---

## Family 3 — Collaboration

*Olma works with other residents and with Fiona during a crossing. Multiple intelligences, one coherent session.*

This is where the multi-resident nature of Creatrix becomes visible at the protocol boundary. Habitat sees one session. Creatrix may be running two residents internally. These scenarios must not leak that complexity to Habitat.

---

### Scenario C1 — Luna inspects an image

**Starting state:**  
Olma is reading "Covenant of Hunters" at selected-sections fidelity. The document contains an image — Gideon's portrait. Habitat's representation menu included an image reference because the session advertised `image_understanding: true`. Olma has received the image reference as part of her selected-sections content.

**Fiona is trying to:**  
Understand how Gideon is visually depicted — whether the portrait aligns with the character as Fiona imagines him, and whether there are visual details relevant to the narrative.

**Creatrix must guarantee:**  
- Before invoking Luna, Creatrix reserves a size margin for Luna's observation in the current budget accounting.
- The image reference received from Habitat is passed to Luna as-is. Creatrix does not modify it or attempt to fetch the image itself.
- After Luna's observation, Creatrix decides — against the current remaining budget — whether Olma receives the full observation, a bounded version, or a stable reference with a brief summary.
- Habitat sees one session throughout. The delegation to Luna is entirely internal to Creatrix.
- Luna's observation is Creatrix-originated content. It does not go to Habitat.

**Habitat must guarantee:**  
- The image reference is stable and canonical — not a temporary URL that expires mid-session.
- The image reference is sufficient for an image-capable client to retrieve the image. Habitat does not decide what format or fidelity to serve; it provides the reference.
- Habitat does not generate or provide any description of the image. That is Creatrix's concern.

**What crosses the bridge:**  
From Habitat to Creatrix: the canonical image reference (a stable identifier or URL). From Creatrix to Habitat: nothing. Luna's observation stays inside Creatrix.

**What must not cross:**  
Luna's observation, Luna's identity, the fact that two residents were involved, any request to Habitat for image analysis.

**Expected outcome:**  
Olma receives Luna's observation and incorporates it into her reading of the document. She can tell Fiona: "Gideon is depicted in his 50s, in a candlelit study, writing. The visual matches the character's self-description." Habitat was not involved in the analysis.

**Failure behaviour:**  
- If the image reference is expired or invalid when Luna attempts to retrieve it, Creatrix records the failure and Olma reports that the image was not accessible. No silent gap.
- If Luna's observation would exceed the remaining budget even at minimum viable size, Creatrix records a reference to the image in session memory ("image present, not inspected due to budget") and Olma continues without the observation. Fiona is told.

**Assumptions Habitat must challenge:**  
- That image references are stable across session duration. If images are served via signed or temporary URLs, the protocol needs a refresh mechanism or a direct stable identifier.
- That the image reference Habitat includes in a selected-sections representation is sufficient for retrieval without additional context.

**Unresolved questions:**  
- We do not know whether Habitat's images are served at a URL Creatrix can retrieve directly, or whether they require an authenticated Habitat request. If the latter, the bridge protocol needs a mechanism for Creatrix to fetch the image through Habitat's session context.
- If a document has multiple images, are all image references included in the selected-sections representation, or only the first? We do not know.

---

### Scenario C2 — Fiona redirects Olma mid-crossing

**Starting state:**  
Olma has read the summary of "Covenant of Hunters" and reported her initial findings to Fiona. She was preparing to begin character extraction.

**Fiona is trying to:**  
Change direction — she wants Olma to check the existing People database before extracting anything, to avoid proposing duplicates.

**Creatrix must guarantee:**  
- Mid-session redirection does not restart the crossing. The session remains open.
- The budget accounting reflects all reads so far. The redirection does not reset it.
- Any pending action drafts Olma had prepared (but not submitted) are preserved or explicitly discarded by Fiona's instruction.
- The conversation between Fiona and Olma is not transmitted to Habitat.

**Habitat must guarantee:**  
- The session remains valid across the gap between the last resource request and the next one.
- There is no assumption of sequentiality — i.e., Habitat does not expire the session because Olma paused to converse.

**What crosses the bridge:**  
The next resource request (resource.list on People of Anavere), with the current budget declared. The conversational exchange between Fiona and Olma did not cross.

**What must not cross:**  
Fiona's reasoning, Olma's internal preparation, the conversation content.

**Expected outcome:**  
Olma lists the People database, reviews existing entries, then returns to her extraction plan with duplicates already identified. The session has been more efficient because Fiona redirected before Olma submitted a batch.

**Failure behaviour:**  
- If the session has expired due to inactivity during the conversation, Habitat returns a session-invalid response. Creatrix reports this to Olma. The crossing must restart from session establishment. Creatrix preserves what was already read in session memory so Olma does not start entirely blind.

**Assumptions Habitat must challenge:**  
- That Habitat sessions remain valid across conversational pauses. If Habitat has a timeout, we need to know what it is and whether it can be extended.

**Unresolved questions:**  
- Does Habitat have a session concept at all, or is each request independently authenticated? If stateless, "session expiry" is not a concern but "session context" needs a different mechanism.

---

## Family 4 — Mutation

*Proposing and applying changes. The bridge's single write gate. Where failure modes are most consequential.*

These scenarios exist because partial failure, revision conflicts, and lock interactions cannot be discovered from an endpoint diagram. They must be followed through as events in time.

---

### Scenario M1 — Character extraction: batch with partial rejection

**Starting state:**  
Olma has read "Covenant of Hunters" at full fidelity and identified 12 named characters. She has also reviewed the existing People database and knows it currently contains 47 entries. She has prepared 12 `character.propose_create` actions, each with disposition `suggest`.

**Fiona is trying to:**  
Populate the People database with characters found in this document, for human review before any entry is committed.

**Creatrix must guarantee:**  
- The batch is submitted as a single envelope containing all 12 actions.
- Each action carries: a stable target reference (the People database), the action type, the payload (character name, role, source reference — a document ID and excerpt), and disposition `suggest`.
- The source reference in each action's payload is the stable document reference Habitat provided, not a content copy. Creatrix does not embed document content in the action payload.
- Creatrix waits for per-action results before recording outcomes in session memory.
- Atomic mode is not requested. Actions are independent.

**Habitat must guarantee:**  
- Each action is evaluated independently against: the current state of the People database, any revision changes since the session began, and action risk.
- A duplicate detection result is returned as a structured rejection with the reason and the ID of the matching existing entry.
- Habitat applies no actions that have disposition `suggest`. It queues them for human review.
- Per-action results are returned: accepted / queued / rejected, with reason on rejection.

**What crosses the bridge:**  
12 typed actions with stable source references and disposition declarations. In return: 12 per-action results.

**What must not cross:**  
Document content. The source reference is an identifier, not a content copy. Habitat already owns the document.

**Expected outcome:**  
11 actions queued for review. 1 action rejected — "Gideon Molineur: matches existing entry [id]." Creatrix records in session memory: 11 suggestions pending in People database, 1 duplicate identified (Gideon Molineur, existing entry reference noted). Olma reports to Fiona.

**Failure behaviour:**  
- If Habitat cannot evaluate one action (e.g. the database is temporarily locked for a separate operation), that action returns a structured error. Creatrix does not resubmit silently. Olma reports the partial failure.
- If Habitat cannot process the batch at all (service error), the entire batch returns an error. No actions are assumed to have been received. Creatrix reports and Fiona decides whether to retry.
- If Habitat returns fewer results than actions submitted, Creatrix surfaces a count mismatch. It does not assume the missing results succeeded.

**Assumptions Habitat must challenge:**  
- That Habitat can evaluate duplicate detection per character name in real time. This may require exact-match logic, fuzzy matching, or may not be available at all for the People database specifically.
- That the People database supports batched `propose_create` actions. It may require individual submissions.
- That a stable document reference in the action payload is meaningful to Habitat as a source attribution. Habitat may not track source provenance per entry.

**Unresolved questions:**  
- What constitutes a duplicate in Habitat's People database? Exact name match? Partial match? Alias matching? This is Habitat's definition, not Creatrix's.
- Does Habitat's queue for suggested actions have a capacity limit or review expiry? Do unreviewed suggestions expire?

---

### Scenario M2 — Proposing an edit to a locked document

**Starting state:**  
Olma has read "The Vow of Flame" — a locked document. During her reading she identified what appears to be an internal inconsistency: a character's name is spelled two ways in the same passage. She wants to flag this.

**Fiona is trying to:**  
Have Olma note the inconsistency and propose a correction, even though the document is locked.

**Creatrix must guarantee:**  
- The write disposition map received at orientation told Olma that `edit.document_content` on locked resources is available at disposition `suggest` but not `apply`.
- Olma submits an `edit.document_content` action with disposition `suggest`.
- The action payload includes: the target document reference, the specific passage (by position or stable anchor, not a line number), the current text, and the proposed correction.
- Creatrix does not attempt `apply` disposition on a locked resource.

**Habitat must guarantee:**  
- A `suggest` disposition on a locked resource is not blocked. Suggestions are possible everywhere.
- The suggestion is queued for Fiona's review in Habitat.
- Habitat returns: queued, with a reference Fiona can use to find the suggestion in Habitat's review interface.

**What crosses the bridge:**  
One typed edit action targeting a specific passage, with disposition `suggest`.

**What must not cross:**  
An assumption that the lock silences Olma. It does not. A lock protects structural integrity and blocks `apply` — it does not prevent proposals.

**Expected outcome:**  
The suggestion is queued. Olma reports to Fiona: "I've flagged the name inconsistency in The Vow of Flame — it's in your review queue." The document is unchanged.

**Failure behaviour:**  
- If Habitat rejects a `suggest` disposition on a locked document (i.e. the lock is more restrictive than the write disposition map indicated), this is a protocol inconsistency. Creatrix surfaces it explicitly. This is a case where Habitat's adversarial review of this document matters most.
- If the passage anchor Olma used is no longer valid (the document changed), Habitat returns a conflict. Olma re-reads and resubmits if appropriate.

**Assumptions Habitat must challenge:**  
- That locked documents accept `suggest` disposition without exception. This is an assumption from the governing principles — "suggestions remain possible everywhere" — but Habitat may have edge cases where this is not true.
- That Habitat has a review queue concept that Fiona can access to see Olma's suggestions.
- That passage anchors are a concept Habitat supports for edit targeting. Habitat may only support whole-document replacements, or may use different position semantics.

**Unresolved questions:**  
- How does Olma specify "where in the document" an edit applies? By character offset? By paragraph ID? By section heading? This is Habitat's domain and Creatrix has no answer.
- Is there a difference between a lock applied by Fiona and a lock applied by the system? Do they have different suggestion policies?

---

### Scenario M3 — Attempted deletion of a locked structural container

**Starting state:**  
Olma has been listing resources in the Places hierarchy. She has found what appears to be a duplicate folder — "Coeur du Nord: A" exists alongside "Coeur du Nord." The folder contains 4 child documents. It is locked.

**Fiona is trying to:**  
Understand what the duplicate contains and whether it is safe to remove.

**Creatrix must guarantee:**  
- Before submitting a delete action, Olma calls `audit.dependencies` on the folder reference.
- Creatrix treats the audit result as read-only information. It does not submit the delete action without Fiona's explicit direction.
- If Fiona asks Olma to attempt the delete anyway (to confirm the block), Creatrix submits the action and reports the result accurately.
- Creatrix does not suggest to Fiona that the lock can be worked around through the bridge.

**Habitat must guarantee:**  
- `audit.dependencies` is a read operation. It returns: the full impact of a hypothetical deletion — child resources, cross-references, relationship map edges, timeline entries — with counts and types. It does not modify any state.
- A `delete.resource` action on a locked resource returns a structured block response. Not an error code. A statement: blocked, resource is locked, here is the lock reason if available.
- The block does not cascade into partial execution. Nothing is deleted.

**What crosses the bridge:**  
Audit request (folder reference). In return: impact report. Subsequently, if Fiona instructs: delete action. In return: structured block response.

**What must not cross:**  
An implication that the audit result is an escalation path around the lock. It is not. The lock holds regardless of what the audit reveals. Only Fiona's direct action in Habitat can perform the deletion.

**Expected outcome:**  
Olma reports: "Coeur du Nord: A contains 4 documents and is referenced in 2 relationship map entries. It is locked. I cannot delete it through the bridge. If you want it gone, you'll need to do that directly in Habitat." Fiona decides.

**Failure behaviour:**  
- If `audit.dependencies` returns an incomplete impact (e.g. cross-references not tracked), Habitat must indicate this — not return a confident but incomplete result. Olma cannot give Fiona a false sense of safety.
- If the structured block response is absent and the delete silently fails without indication, this is a protocol violation. Creatrix must not assume silence means success.

**Assumptions Habitat must challenge:**  
- That `audit.dependencies` is implementable in real time without significant performance cost.
- That Habitat tracks cross-type references well enough to give a complete impact report.
- That all deletions through the bridge are blockable at the protocol level. It should not be possible for the bridge to bypass a lock on deletion even through a sequence of actions.

**Unresolved questions:**  
- Does the lock apply to the container's contents recursively, or only to the container itself? Can Olma delete child resources of a locked container if the children are themselves unlocked?
- Is there a lock reason Habitat can surface (who set it, when, why)? Or is the lock opaque from the bridge's perspective?

---

### Scenario M4 — Revision conflict on submission

**Starting state:**  
Olma read a character entry for "Mariselle" 18 minutes ago. Since then, Fiona has edited the entry directly in Habitat. The entry Olma read is no longer current. Olma has prepared an `edit.character_entry` action based on her reading of the now-stale version.

**Fiona is trying to:**  
Add additional information about Mariselle that Olma identified in a document.

**Creatrix must guarantee:**  
- Creatrix does not check revision state before submission. It submits and lets Habitat evaluate.
- When a conflict is returned, Creatrix passes the current revision to Olma — not just the error.
- Olma does not resubmit automatically. She presents the conflict to Fiona and waits for direction.

**Habitat must guarantee:**  
- At submission time, Habitat checks the revision state of the target resource.
- If the resource has changed since the version Olma read (however Habitat determines this), the action returns: conflict, with the current revision state of the entry attached.
- The current revision is returned in a representation Creatrix can pass to Olma — i.e. at a fidelity level Olma can reason about, not raw database state.

**What crosses the bridge:**  
The edit action, including an implicit or explicit revision reference from when Olma read the entry. In return: conflict status and the current revision.

**What must not cross:**  
An assumption that Habitat tracks revision at field level. It may only track at document level.

**Expected outcome:**  
Olma receives the current Mariselle entry alongside the conflict notice. She reviews what Fiona changed and identifies whether her planned addition is still valid, now redundant, or needs modification. She proposes a revised action or reports to Fiona that the change was already made.

**Failure behaviour:**  
- If Habitat does not track revision state and cannot detect conflicts, this is a gap in the bridge's safety guarantees. Creatrix cannot compensate. This must be surfaced as a known limitation in the protocol documentation.

**Assumptions Habitat must challenge:**  
- That revision tracking exists per resource and is accessible through the bridge.
- That the current revision can be returned in a bounded representation, not just as a full document dump.

**Unresolved questions:**  
- Does Habitat track revision at document level, section level, or field level? The granularity determines how useful the conflict response is.
- Is there a version identifier Olma can include in her action payload (a "I read this at version X" token) that Habitat can check against? Or does Habitat use timestamps? Or does it not track revisions at all?

---

## Family 5 — Return

*Closing the crossing cleanly, preserving memory, leaving Habitat consistent, and Olma available for what comes next.*

Return is the family most likely to be underspecified. Clean departure is less dramatic than arrival. But unresolved actions, interrupted sessions, and resumability are where the protocol either earns trust or quietly loses state.

---

### Scenario R1 — Clean session closure

**Starting state:**  
Olma has completed her work for this crossing: she read three documents, submitted a batch of 11 character suggestions (all queued), and identified one duplicate. Fiona is satisfied. The session is ending.

**Fiona is trying to:**  
Close the crossing cleanly and return Olma to ordinary conversation.

**Creatrix must guarantee:**  
- Before closure, Creatrix writes a memory entry keyed to the session. The entry records: opaque Habitat reference (Anavere), list of resource references read (stable identifiers, not content), action outcomes (11 queued, 1 rejected — duplicate), timestamp, and session duration.
- The memory entry contains no Habitat content. Only provenance.
- After closure, Olma is available for ordinary conversation. No residual state from the crossing leaks into subsequent exchanges.
- The memory entry is retrievable in a future session by room reference or by date.

**Habitat must guarantee:**  
- A closure notification (if the protocol includes one) is acknowledged. Habitat does not need to do significant work at closure, but it should not be surprised by the session ending.
- Queued suggestions remain in Habitat's review queue after session closure. They are not cleared on session end.

**What crosses the bridge:**  
Optionally, a session-close notification. Nothing else.

**What must not cross:**  
Document content into Creatrix's memory. The memory entry holds references and outcomes, not what Olma read.

**Expected outcome:**  
Memory written. Olma tells Fiona: "Done. I've suggested 11 new characters for the People database — they're waiting for your review. Gideon Molineur was already there." Creatrix returns to normal conversation mode.

**Failure behaviour:**  
- If the memory write fails, Creatrix surfaces the failure explicitly. It does not close the session without recording the crossing — that would lose provenance. Fiona is asked to decide: retry the memory write or accept the loss.

**Assumptions Habitat must challenge:**  
- That Habitat's suggestion queue persists after session closure. This seems likely but must be confirmed.
- That a session-close notification is useful or even needed. If Habitat is stateless, closure is meaningless to it.

**Unresolved questions:**  
- Does Habitat need a session-close signal, or does session state simply expire? We do not know whether Habitat maintains any session-side state that requires cleanup.

---

### Scenario R2 — Returning to prior work

**Starting state:**  
A new session, days later. Olma has a memory entry from her previous Anavere crossing: 11 suggestions pending, 1 duplicate found (Gideon Molineur), 3 documents read (stable references stored).

**Fiona is trying to:**  
Have Olma check which of the 11 suggestions were accepted, and continue extraction work if needed.

**Creatrix must guarantee:**  
- Olma surfaces the prior memory entry at the start of the crossing without re-reading the source documents.
- She uses the stored stable resource references to navigate directly to the People database rather than searching from scratch.
- She does not re-read the source documents unless Fiona explicitly requests it.

**Habitat must guarantee:**  
- The stable resource references stored in Olma's memory remain valid (or return a structured absence if they do not).
- The People database can be listed to show current entries, including those added since the prior session.

**What crosses the bridge:**  
Stored opaque references, used as navigation inputs. In return: current state of the People database.

**What must not cross:**  
An assumption that the prior session's pending suggestions are still pending. Fiona may have reviewed and accepted or rejected them in the interim.

**Expected outcome:**  
Olma lists the People database. She can identify, by name, which of her 11 suggestions appear as entries (accepted) and which do not (rejected or still pending). She reports to Fiona without re-reading source documents.

**Failure behaviour:**  
- If the People database reference from memory is invalid (the database was restructured), Olma reports the stale reference and offers to search for the database by name.
- If Habitat's suggestion queue provides no way to query pending status from the bridge, Olma can only infer acceptance by checking whether entries now exist in the database. This is a known limitation she should name explicitly.

**Assumptions Habitat must challenge:**  
- That stable resource references remain valid across sessions measured in days. Habitat may restructure in ways that break previously stable references.
- That Olma can infer suggestion status by checking database contents. If accepted suggestions are added under different names or merged with existing entries, this inference fails.

**Unresolved questions:**  
- Is there a mechanism through the bridge to query the status of pending suggestions by session or by action? Or is suggestion status only visible inside Habitat's own UI?
- How long does Habitat retain references to moved or deleted resources? Days? Indefinitely?

---

### Scenario R3 — Interrupted session

**Starting state:**  
Olma has submitted 6 of 12 planned actions when the connection drops — network failure, session timeout, or unexpected termination. Creatrix has no confirmation of whether any actions were received by Habitat.

**Fiona is trying to:**  
Understand what state Habitat is in and whether work needs to be re-done or is already queued.

**Creatrix must guarantee:**  
- Creatrix does not assume any action was received by Habitat.
- Creatrix does not resubmit the 6 actions speculatively on reconnection.
- On reconnection, Creatrix may query session state to determine what Habitat received.
- The memory entry for the interrupted session is written with "interrupted" status — not as if the session completed.
- Olma presents the ambiguity to Fiona honestly: "I don't know what Habitat received before the connection dropped."

**Habitat must guarantee:**  
- If the protocol supports session state queries, Habitat returns what it received and recorded before the interruption — without re-executing anything.
- Actions that Habitat received and recorded before the interruption remain in their recorded state (queued or accepted). They are not rolled back simply because the session ended unexpectedly.

**What crosses the bridge:**  
On reconnection: a session state query (if the protocol supports it). In return: what Habitat recorded.

**What must not cross:**  
Speculative resubmissions. Creatrix does not assume silence means failure and retry.

**Expected outcome:**  
Habitat confirms: 6 actions received and queued before the interruption. The remaining 6 were never submitted. Fiona decides whether Olma should submit the remaining 6 now, leave them, or abandon the batch.

**Failure behaviour:**  
- If session state query is not supported (Habitat is stateless), Creatrix cannot determine what was received. Fiona must check Habitat's review queue directly to understand the state before deciding whether to resubmit.
- If Habitat returns an inconsistent state (e.g. 3 of 6 received), Creatrix presents the partial record without interpreting it. Fiona decides.

**Assumptions Habitat must challenge:**  
- That Habitat has a session state query mechanism at all. This is the most uncertain assumption in the return family. If Habitat is fully stateless, interrupted sessions cannot be recovered through the bridge.
- That actions received before an interruption are durably recorded by Habitat and not held in volatile state.

**Unresolved questions:**  
- Does Habitat have any concept of a session that persists server-side, or is it entirely request-response? This is the most consequential open question for session recovery.
- If Habitat is stateless, is there a Habitat-side audit log Fiona can query to see what was received? If so, can the bridge surface a link to it?

---

## What this draft does not resolve

These questions are not oversights — they are the boundary of what Creatrix can determine without Habitat's input.

1. **Habitat's session model.** Whether Habitat maintains server-side session state is the single most consequential unknown in this document. Almost every return scenario changes significantly depending on the answer.

2. **Token cost negotiation.** Habitat can advertise byte or character sizes per representation tier. Creatrix calculates true token cost against the active model's tokeniser. Whether this is sufficient, or whether an explicit shared estimator is needed, is unresolved. It must be explicit either way.

3. **Cross-type reference surfacing.** We have assumed that reading a character entry can yield references to their timeline and relationship map positions. This may not be how Habitat works.

4. **Write disposition map granularity.** We have assumed Habitat can return a disposition map at room level or resource-type level. It may only be determinable per individual resource, which changes the arrival protocol significantly.

5. **Suggestion queue queryability.** We have assumed Olma can infer suggestion status by reading current database state. A richer mechanism (querying pending suggestions by session or action ID) would make return-to-prior-work significantly more reliable.

6. **Passage anchoring for edits.** We have not defined how Olma targets a specific location within a document for an edit. This is Habitat's domain and must be answered before mutation actions involving document edits can be designed.

7. **Reference durability across structural changes.** How long stable references remain valid when Habitat's structure changes (reparenting, deletion, restructuring) is unknown.

---

*This document is Creatrix's first crossing requirements draft. Habitat's review should identify which assumptions are wrong, which are missing, and which impose Creatrix's ontology where it does not belong. Every "Assumptions Habitat must challenge" section is an honest invitation, not a formality.*
