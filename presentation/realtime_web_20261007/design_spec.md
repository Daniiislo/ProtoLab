<!-- ppt-master-schema: design-spec/v1 -->
# Real-time Communication on the Web — Design Spec

## I. Project Information
| Field | Value |
|---|---|
| Project Name | realtime_web_20261007 |
| Canvas Format | PPT 16:9 |
| Page Count | 12 |
| Primary Language | en |
| Target Audience | Developers familiar with basic HTTP |
| Communication Intent | Explain four browser-server methods through practical forum and chat scenarios |
| Desired Audience Outcome | Choose a suitable method and recognize recovery, persistence and authorization duties |
| Core Message / Ask / Action | Match the communication pattern; build reliability above the transport |
| Delivery Context | Live talk; English slides, Vietnamese narration |
| Artifact Afterlife | Editable PowerPoint, no speaker notes |
| Reading Mode | presentation |
| Content Strategy | balanced |
| Design Style | Custom technical schematic, light navy-cyan |
| AI Image Acquisition Path | Not applicable; native editable illustrations |
| Generation Mode | continuous |
| Spec Refinement | disabled |
| Speaker Notes | disabled — explicit latest user request |
| Custom Animations | disabled — workflow default |
| Narration Audio | disabled |
| Created Date | 2026-10-07 |

User confirmed the proposed 12-slide design by requesting “hãy làm đi”. Chat fallback follows the unavailable confirmation surface. No UI confirmation receipt is claimed. Three considered directions: signal-path schematic (selected); editorial case-study spreads; dark network console. The selected direction best preserves diagrams, projection contrast and editable geometry. No AI images are selected; rendering candidates are not used.

## II. Canvas Specification
- Format: PPT 16:9
- Dimensions: 1280 × 720
- viewBox: 0 0 1280 720
- Margins: 64 px; footer baseline 681 px
- Content area: x64–1216, y180–624

## III. Visual Theme
- Mode: custom
- Mode Behavior: Begin with two concrete frustrations, compare four exchange patterns, then return to operational lessons. Explain rather than prove universal superiority. Keep the user-approved page sequence.
- Visual Style: custom
- Visual Style Behavior: Off-white canvas, navy typography and cyan signal paths. Native browser frames and server boundaries clarify ownership; thin arrows clarify transfer, with generous whitespace. Use dark navy fields for emphasis only on cover and conclusion accents. No decorative texture or photorealism is necessary.
- Theme: A cyan signal path connects browser and server across the deck.
- Tone: Professional, academic and practical.

| Role | HEX | Usage |
|---|---|---|
| background | #F7F9FC | Main canvas |
| secondary_bg | #E8F4F8 | Active connection field |
| primary | #102A43 | Titles and server |
| accent | #007F9E | Active signal |
| secondary_accent | #15836B | Stored or delivered event |
| body_text | #243B53 | Main text |
| secondary_text | #526B80 | Supporting labels |
| divider | #CAD7E2 | Lifelines and inactive paths |
| white | #FFFFFF | Device surface |
| warning | #B36A13 | Waiting and disconnect |

## IV. Typography System
| Role | Family | Size | Weight |
|---|---|---|---|
| Title | Segoe UI | 48 | 600 |
| Body | Segoe UI | 28 | 400 |
| Subtitle | Segoe UI | 32 | 400 |
| Annotation | Segoe UI | 20 | 400 |
| Footnote | Segoe UI | 14 | 400 |
| Display | Segoe UI | 72 | 600 |
| Code | Consolas | 22 | 400 |

## V. Layout Principles
- Section kickers: 32 px, semibold, cyan; enlarged at user request. Main titles remain 48 px.
- Margin 64; block gap 24; column gutter 40; radius 12.
- One idea per page; short labels rather than explanatory paragraphs.
- Method pages deliberately repeat a client-server exchange grammar to enable comparison.
- Other pages change composition: cover field, agenda list, paired interface scenes, horizontal overview, recovery path, asymmetric decision split.

## VI. Icon Usage Specification
- Primary library: tabler-outline
- Stroke width: 2
- Inventory: bell, message-circle, database, shield-check, wifi-off, refresh, browser, server
- Use semantic icons within native diagrams; no brand assets.

## VIII. Image Resource List
No raster assets. All illustrations are editable schematic geometry and prepared SVG icons.

## IX. Content Outline
#### Slide 01 - cover
- Audience move: Recognize the topic and practical focus.
- Relationships: link browser and server.
- Title: Real-time Communication on the Web
- Core message: From waiting for updates to live interaction.
- Content: Tavian Nguyen (presenter). No cover kicker.
- Composition: Large title left, abstract browser-server link right.
#### Slide 02 - agenda
- Audience move: Understand the talk's four parts.
- Relationships: order pain points, methods, lessons, demo.
- Title: Agenda
- Core message: Problems lead to methods and practical choices.
- Content: Pain Points & Approach; Real-time Communication Methods; Lessons Learned & Trade-offs; Demo & Q&A.
- Composition: Four numbered typographic rows.
#### Slide 03 - notifications
- Audience move: Notice the gap between server event and UI update.
- Relationships: link forum action to server to recipient; contrast waiting and push.
- Title: Why Are Notifications Late?
- Core message: Use server push for in-page updates.
- Content: New reply; Waiting for the next check; SSE; Push updates to an open page.
- Composition: Forum event, server, waiting recipient; solution band underneath.
#### Slide 04 - chat
- Audience move: Recognize repeated two-way interaction.
- Relationships: link member A through server to member B; contrast waiting and open exchange.
- Title: Why Does Chat Feel Slow?
- Core message: Keep a two-way channel open.
- Content: Sent; Still waiting; WebSocket; Keep the conversation open.
- Composition: Two chat windows connected through a server.
#### Slide 05 - overview
- Audience move: Distinguish four patterns without a superiority ladder.
- Relationships: order repeated requests, held requests, one-way stream, two-way channel.
- Title: From Repeated Requests to Live Connections
- Core message: Different trade-offs. No universal winner.
- Content: Polling—Ask again; Long Polling—Wait, then ask; SSE—Receive a stream; WebSocket—Talk both ways.
- Composition: Four stages on a shared signal line, no numerical performance claim.
#### Slide 06 - polling
- Audience move: Understand interval-based checking.
- Relationships: order request, response, wait, repeat.
- Title: Polling
- Core message: Ask at regular intervals.
- Content: Simple HTTP; Empty responses; Interval vs. delay.
- Composition: Time-down sequence left; short practical notes right.
#### Slide 07 - long_polling
- Audience move: Understand a request held until event or timeout.
- Relationships: order request, hold, event response, next request.
- Title: Long Polling
- Core message: Wait for an update, then ask again.
- Content: Fewer empty replies; Repeated requests; Timeouts still matter.
- Composition: Same sequence grammar, visible server hold.
#### Slide 08 - sse
- Audience move: Connect one-way streaming to notifications.
- Relationships: link browser opens stream; server sends repeated events; HTTP actions separate.
- Title: Server-Sent Events
- Core message: One open stream. Server to browser.
- Content: Forum notifications; EventSource reconnects; Recover missed events.
- Composition: Shared stream field and multiple downward-ordered server-to-browser events.
#### Slide 09 - websocket
- Audience move: Understand full-duplex communication without delivery guarantees.
- Relationships: link both peers after connection establishment.
- Title: WebSocket
- Core message: One connection. Both directions.
- Content: Member chat; Messages + typing; Delivery is application logic.
- Composition: Same client-server lifelines with alternating message arrows.
#### Slide 10 - recovery
- Audience move: Separate reconnection from recovery.
- Relationships: order disconnect, reconnect, recover; membership persistence and IDs in recovery.
- Title: Build for Disconnects
- Core message: Reconnect ≠ recovery.
- Content: Show state; Backoff + jitter; Resume + deduplicate; Persist important events.
- Composition: Three-step recovery path with persistent storage as foundation.
#### Slide 11 - choices
- Audience move: Choose appropriately and avoid unnecessary connections.
- Relationships: contrast periodic updates, one-way updates, two-way interaction; link all to authorization and reuse.
- Title: Choose What Fits
- Core message: Less polling. More connection management.
- Content: Periodic → Polling; Server push → SSE; Interactive → WebSocket; Reuse connections; Authorize every action.
- Composition: Three unboxed selection rows left and an operational guardrail right.
#### Slide 12 - demo
- Audience move: Observe requests, messages and failure behavior.
- Relationships: none.
- Title: Demo & Q&A
- Core message: Watch the connection. Follow the messages.
- Content: Polling; Long Polling; SSE; WebSocket.
- Composition: Large closing type with a single linked signal motif.

## X. Speaker Notes Requirements
- Disabled by explicit latest user request. Do not create notes or narration scripts.
- Focus exclusively on sparse English slide content and clear editable illustrations.
