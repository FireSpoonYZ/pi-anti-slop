---
name: humanizer-technical
version: 1.0.0
description: Supplement to blader/humanizer. Catches AI tells specific to technical documentation, architecture write-ups, and professional prose that the base skill's Wikipedia-derived patterns miss. Use alongside humanizer, not instead of it.
license: MIT
compatibility: any-agent
---

# Humanizer Technical: AI Patterns in Professional and Technical Prose

This skill extends [blader/humanizer](https://github.com/blader/humanizer) with patterns that appear in technical documents, architecture overviews, project summaries, and professional write-ups. The base Humanizer catches content, language, style, and chat-leftover tells derived from Wikipedia editing. This supplement catches structural and compositional tells that show up when an AI writes *about systems, decisions, and organizations* rather than encyclopedia articles.

Same principle applies: a language model picks whatever fits the widest range of readers. In technical writing, that default produces documents that look structured but say less than they should, because the model optimizes for *appearing organized* over *actually explaining*.

Every pattern below is tested the same way Humanizer tests its patterns: does a careful human writer do this on purpose? If yes, it is not a tell. If a careful human writer would almost never produce this shape of text, it counts.

The numbering starts at T1 to avoid collision with Humanizer's §1–§25.

---

## Density and compression

### T1. Jargon stacking

**Problem:** Multiple acronyms, library names, or technical terms crammed into a single clause with no connective tissue. The clause becomes a parts list, not a sentence. The reader has to already know every term to extract any meaning, which defeats the purpose of the document explaining the system.

A human expert writing for peers still sequences terms and gives each one a job in the sentence. The stacking tell is not *using* jargon; it is using five pieces of jargon as a compound noun phrase where a sentence was needed.

**Before:**
> tonic + protobuf + rustls mTLS

> SM3 fingerprint, SM4 config/SPA encryption (libsm)

> Linux eBPF/TC + Aya; Windows WinDivert

**After:**
> The client talks to the backend over gRPC (tonic + protobuf), with mutual TLS handled by rustls.

> Device fingerprints are hashed with SM3. Configuration blobs and the SPA knock packet are encrypted with SM4, using the libsm library.

> DNS interception uses eBPF traffic classifiers on Linux (via the Aya framework) and WinDivert on Windows.

**False-positive guard:** Inline code, CLI flags, dependency lists, and `Cargo.toml` excerpts are parts lists by nature. Do not expand those into prose.

### T2. Telegraph fragments

**Problem:** Sentences with the subject, verb, or both dropped. The text reads like commit messages or internal shorthand: noun phrases separated by commas or semicolons, no grammatical spine.

This is distinct from Humanizer §13 (passive voice / subjectless fragments). §13 catches "No configuration file needed" where the subject is implied. T2 catches text where *entire clauses* are replaced by bare noun phrases strung together, producing something closer to a bulleted outline that forgot to use bullets.

**Before:**
> Desktop shell thin, frontend iterates fast.

> Crash isolation clean: tunnel down, restart on heartbeat, no need to kill auth and UI.

> Apps transparent DNS rewrite, kernel/driver path preferred.

**After:**
> Tauri keeps the desktop shell thin, so the frontend team can iterate without touching the Rust layer.

> Crashes are isolated: if the tunnel process dies, the service restarts it on the next heartbeat without disrupting authentication or the UI.

> DNS iueries are rewritten transparently at the kernel or driver level, so applications do not need any configuration changes.

**False-positive guard:** Bullet points, table cells, and diagram labels are legitimately compressed. The tell is telegraph style in *running prose*, not in structured elements.

---

## Structure and proportion

### T3. Flat enumeration

**Problem:** A numbered list where every item gets the same weight (same heading level, roughly the same paragraph length) regardless of actual importance. The list typically lands on a round number (5, 10, 12) that feels chosen for symmetry rather than content.

This extends Humanizer §10 (rule of three). §10 catches forced triads within a sentence. T3 catches the document-level version: a section of "10 highlights" or "8 principles" where three items carry all the substance and the rest are padding or table stakes. The flat structure hides which decisions actually mattered.

**Before:**
> ## Technical highlights
>
> 1. Control plane / data plane split *(3 sentences)*
> 2. SPA knock mechanism *(3 sentences)*
> 3. Service-level allowlist *(3 sentences)*
> 4. Kernel-level DNS rewrite *(3 sentences)*
> 5. Windows login integration *(3 sentences)*
> 6. Three-state login *(2 sentences)*
> 7. Third-party SSO loop *(2 sentences)*
> 8. Local attack surface reduction *(2 sentences)*
> 9. Cross-platform shared protocol *(2 sentences)*
> 10. Complete engineering tooling *(2 sentences)*

**After:** Split into two sections. "Design decisions" covers items 1, 2, 3, and 5 with real depth: what alternatives existed, why this path was chosen, what trade-offs it introduced. "Engineering practices" covers the rest in one paragraph, because versioned migrations, packaging scripts, and e2e tests are expected, not exceptional.

**False-positive guard:** A specification that genuinely has N requirements of equal weight (API endpoints, compliance checkboxes) is not this pattern. The tell is unequal substance forced into equal containers.

### T4. Table-first composition

**Problem:** Tables used as the primary narrative device for material that needs explanation, not comparison. The document becomes a grid of short phrases in cells, and the reader cannot see causal relationships, trade-offs, or reasoning, because tables do not have room for "because" or "instead of."

Humanizer §16 catches bold-label lists. T4 catches the broader pattern where the author reached for a table before asking whether the content is actually tabular. Technology selection is tabular (name, role, reason). Architecture description is not, because layers interact and the interaction is the point.

**Before:**
> | Layer | Process | Responsibility |
> |-------|---------|---------------|
> | UI | zt-ui | Main interface: login, apps, traffic, settings |
> | Control | zt-service | Auth, SPA, backend gRPC, tunnel lifecycle, policy refresh, logging, SSO |
> | Data | zt-wg | TUN, routing, WireGuard, DNS hijack, port allowlist forwarding |

**After:**
> The UI process (zt-ui) handles login, the service list, and traffic display. It never talks to the backend directly; every request goes through the control-plane service.
>
> zt-service is the control plane. It owns the backend gRPC connection (mutual TLS), runs the SPA knock before login, manages tunnel lifecycle, and refreshes policies on a timer. If it crashes, the tunnel stays up until the next heartbeat fails.
>
> zt-wg is the data plane. It creates the TUN device, sets routes, runs the WireGuard encryption (via boringtun), intercepts DNS, and enforces the per-service port allowlist. It is started by zt-service and can be restarted independently.

**False-positive guard:** Comparison tables (feature matrix, pricing tiers, API parameter lists) are genuinely tabular. The tell is narrative content forced into cells.

---

## Framing and rhetoric

### T5. Repeated negation anchoring

**Problem:** Defining the system primarily by what it is *not*, and doing so more than once. A single contrast ("this is ZTNA, not a traditional VPN") is useful framing. Repeating the contrast three or four times across the document turns description into sales pitch: the reader is being *persuaded* rather than *informed*.

This is a document-level version of Humanizer §9 (negative parallelisms). §9 catches the sentence-level "not just X, it's Y." T5 catches the structural pattern where the same negation reappears in the intro, the architecture section, and two of the highlights, each time phrased slightly differently but making the same point.

**Before (spread across sections):**
> Multi-process, control/data plane split, not a monolithic VPN.
>
> [later] Service-level allowlist, not blanket tunnel access.
>
> [later] This is the core difference between ZTNA and traditional VPN: entering the tunnel does not mean accessing the entire intranet.
>
> [later] Unlike conventional VPN products, this goes deeper.

**After:** State the contrast once in the introduction. In subsequent sections, describe what the system *does* without re-anchoring against what it replaced.

**False-positive guard:** A comparison document (migration guide, competitive analysis) legitimately repeats contrasts. The tell is a *non-comparative* document that keeps circling back to the same foil.

### T6. Self-awarded labels

**Problem:** The document uses evaluative language about its own subject: "highlights," "innovations," "elegant design," "deep integration." A human author describing their own system to an external reader typically lets the reader judge; a model defaults to evaluation because evaluation is what training data rewards.

Humanizer §1 (significance inflation) and §4 (promotional language) cover this for general prose. T6 is the technical-document variant where the inflation hides behind neutral-sounding section titles. "Technical highlights" is a self-awarded label. "Key design decisions" is a description.

**Before:**
> ## Technical highlights
>
> This is a level of integration depth that most desktop VPN products never reach.
>
> The engineering tooling is fairly complete.

**After:**
> ## Design decisions
>
> The Credential Provider integration runs on the Winlogon secure desktop, which required using a software renderer (iced + tiny-skia) because GPU access is unavailable there.
>
> The project includes versioned database migrations, platform-specific packaging (NSIS, deb), and end-to-end tests against a mock backend.

**False-positive guard:** A portfolio or pitch deck is supposed to evaluate. The tell is self-evaluation in a document whose stated purpose is description or documentation.

### T7. Mechanical summarization

**Problem:** The document ends with a single sentence or short paragraph that compresses the entire content into a dense recap, often introduced by a phrase like "In short," "To summarize," or "In one sentence." The summary adds no information the reader does not already have, and is usually itself a jargon-stacked fragment (see T1).

Humanizer §25 catches generic positive conclusions ("The future looks bright"). T7 catches the non-positive variant: a purely mechanical compression that serves no reader. If someone read the whole document, the summary is redundant. If someone skipped to the end, the summary is incomprehensible without context.

**Before:**
> **In one sentence:** Rust multi-process zero-trust client, tonic/mTLS to cloud, gRPC-over-IPC locally, boringtun for data plane, plus SPA, service-level allowlist, and system-level DNS/login integration.

**After:** Move the summary to the top as an abstract (for readers who want the shape before the detail), or remove it. A document does not need a closing statement. If the last section is "Engineering practices," end with engineering practices.

**False-positive guard:** An executive summary or abstract at the *top* of a document is not this pattern. A conclusion section that adds forward-looking information (next steps, known limitations, open questions) is not this pattern. The tell is a *content-free recap at the end*.

---

## Uniformity

### T8. Even-handed treatment of unequal things

**Problem:** Every section, paragraph, or list item is roughly the same length, regardless of how much substance it carries. A two-sentence architectural insight gets the same space as a two-sentence mention of packaging scripts. The visual uniformity signals that the author did not make editorial choices about what deserves depth.

This is the prose-level manifestation of T3 (flat enumeration). T3 catches the list structure; T8 catches the texture. Human writers naturally spend three paragraphs on what matters and one sentence on what does not. Uniform paragraph length across a document is one of the strongest structural tells of AI composition.

**Before:**
> **Control/data plane split.** zt-service manages connectivity decisions. zt-wg handles packet flow. Crash isolation is clean.
>
> **Cross-platform shared protocol.** Auth, policy, IPC, and proto definitions are shared. Platform-specific code is isolated to the network hook layer.
>
> **Complete engineering tooling.** Includes versioned SQLite migrations, systemd and NSIS packaging, encrypted config, offline deb packages, and cross-platform e2e tests.

All three paragraphs: roughly 2–3 sentences, roughly the same word count. The first is a major design decision. The third is table stakes. They should not look the same.

**After:**
> The control plane and data plane run in separate processes. zt-service decides *what* to connect and *whether* to allow it; zt-wg decides *how* packets move. This split means a tunnel crash does not take down authentication or the UI. The service monitors the data plane by Heartbeat and restarts it if needed, without re-authenticating.
>
> Auth, policy sync, and IPC use the same protocol definitions on both platforms. Platform-specific code (eBPF on Linux, WinDivert on Windows) is confined to the network-hook layer. The project also ships versioned database migrations, platform packaging scripts, and end-to-end tests against a mock backend.

The first item gets four sentences because the split is a real design decision with consequences. The last two are compressed into a shared paragraph because they are context, not decisions.

---

## Process

When using this skill alongside Humanizer:

1. Run Humanizer's patterns first (§1–§25). They catch sentence-level and word-level tells.
2. Then scan for T1–T8. These are structural and compositional tells that survive a sentence-level cleanup.
3. The most common surviving cluster in technical documents is T1 + T3 + T8: jargon-stacked sentences inside a flat, uniformly weighted list. If you find one, you will usually find the other two.

The rewrite should not flatten technical depth. The goal is *uneven, editorial prose* where the author visibly chose what to explain and what to skip, not a homogeneous wall of equal-length paragraphs.
