# Client-authoritative networking migration

This records the approved three-milestone change. It preserves the game rules while removing server physics and host CCTV.

## Milestone 1 — Local gameplay and reports

- The browser owns one run: input, fixed-step physics, collision, enemies, projectiles, coins, checkpoints, death/respawn, score banking, and world transitions.
- Coordinator messages never replace that run. A new server-issued run/round identity resets it; ordinary reports and acknowledgements do not.
- The browser sends compact replacement totals at 5% progress milestones, batched coin pickups, checkpoint/death/respawn transitions, world/course completion, and chest contact changes. Local HUD and audio respond immediately.
- Each report carries the current round/run identities, a monotonically increasing sequence number, and a server-synchronized timestamp. Positions, velocities, enemies, particles, projectiles, and collected-coin IDs stay local.
- The server trusts gameplay results. It validates message shape, known IDs, run lifecycle, and sequence ordering rather than replaying physics.

## Milestone 2 — Shared interactions and final scores

- The server retains random chest offers and the durable inventory/claim ledger. The client asserts chest contact; the server validates the offer, current reported status, item identity, reservation, run, and deadline.
- Keep the existing global FIFO power turn, private attack/defense questions, one attempt, case-insensitive aliases, individual defenses, attacker backfire, configured strengths/windows, and full effect/result slot. Answer keys remain server-only.
- The local run consumes server-issued effect identities and deadlines. Repeated coordinator events never restart an effect or erase a checkpoint. Quizzes remain accessible independently of canvas frames.
- The server owns room/quiz/effect/vote deadlines and announcements. It has no gameplay simulation or periodic full-world snapshot loop.
- At natural expiry or manual end, gameplay stops at the cutoff and players enter the podium. The server captures eligible run identities and accepts one final cutoff report from each for at most two seconds. New runs cannot replace those entries. Missing/disconnected clients use their last accepted summary.
- Final totals include unbanked points and distance below a report milestone. A short browser summary history handles a manual cutoff that arrives after it occurred. Full-course completion time is trusted client time relative to the room start, followed by join order for ties.
- Final ranks publish once and remain unchanged. The preparation state says **Finalizing scores…**; it never grants extra gameplay or quiz time.

## Milestone 3 — Host dashboard and verification

- Remove player gameplay canvases, enlarged Watch dialogs, and all CCTV payloads/render loops.
- Display static avatar/name, connection, world/stage, reported progress/checkpoint, score/banked points/coins/deaths, run status, and update time.
- Send detailed incremental progress patches only to the host. Send compact leaderboard changes to players and shared interaction events to their intended recipients. Full coordinator snapshots remain useful for joins, host recovery, and actual shared-state changes.
- Preserve an independent host announcement stage for icebreakers, announcements, power phases, and countdowns. Run reports are collapsible and separated from that stage by spacing; the stage uses a plain background without rendering a game-world scene.
- Host-triggered challenges enter the same ordered queue as player attacks and escape announcements. The authenticated host chooses an existing power; all eligible players defend without a host attacker quiz. No player inventory or gameplay state is invented for the host. Configured deadlines/strengths, private questions, run isolation, and round cleanup remain server-owned.
- Verify protocol/lifecycle and local-runtime regressions, real multi-client WebSockets, browser input/focus/rendering, and 25-player aggregation. Measure message volume; do not infer internet performance solely from local tests.

## Operation

Use `npm run dev` for watched local development or restart `npm start` after updating server/shared protocol code. Refresh every player/host tab. Restarts clear rooms; deploy between sessions. Mixed runtime versions remain blocked by `/health` guards.

Player refresh/rejoin in the same browser tab resumes the existing run using a private player credential and a versioned `sessionStorage` save. The server returns the same player/run identity and its report sequence floor; the client hydrates its matching local engine/runtime before sending reports. Position, coins, checkpoint saves, banked points, actors, projectiles and platform cycles stay local and survive refresh. Inventory, spent currency, cooldowns and effect deadlines remain server-owned. Shared time and respawn deadlines continue while away, without replaying missed physics. Refresh during a victory hold resumes its remaining duration. Actual disconnects still cancel queued attacks and prune active quizzes under the existing rules. A missing/corrupt local save blocks gameplay and offers an explicit fresh run instead of overwriting the server's previous totals. New rounds invalidate old run saves; explicit Home/leave clears the tab credential. Closing the tab, changing devices or restarting the server is not durable recovery. The host uses its separate existing tab credential. Keep Render at one server instance because rooms and results remain in memory.

Heartbeats and low-frequency clock synchronization are connection maintenance, not gameplay updates. Unchanged idle runs should produce no gameplay traffic. Browser background throttling and network failure still require rehearsal: the room and quiz deadlines continue while tabs are hidden, and delivery after a deadline does not extend a shared phase.

## Verification record

Refresh-persistence follow-up: server token resumption, tab-local runtime hydration, report sequencing, death deadlines, and remaining victory holds have regression tests added. JavaScript syntax checks pass; these new tests and browser refresh scenarios have not been executed in this change. The historical verification entries below predate this follow-up.

All three implementation milestones are delivered. A local browser check or automated capacity check does not establish readiness on the event's actual networks and devices.

- All **171 automated checks pass**. They cover local simulation and reporting, all six world orders, checkpoint rollback, inventory/offer identity, FIFO player/host powers and escape announcements, private quizzes, host timing/strength settings, votes, report privacy/ordering, refresh isolation, settlement, frozen ranks, and 25 real WebSocket clients plus a host. The idle-room check observes no gameplay messages when nothing changes. Host challenges also cover authentication, individual defenses while respawning or without inventory, host recovery, no-target skipping, and cleanup of room-owned queue entries.
- Browser checks used an isolated preview on port 10001. The ordinary production page supported lobby movement, local movement/coin scoring, named in-world voting, a one-minute natural expiry, and the ranked podium without console errors. Its last host update was 18 points; the final cutoff correctly included the remaining distance and froze 27 points.
- A temporary local fixture placed two browser players at authored chests/checkpoints to exercise pickup, attack and defense input cards, an uppercase correct attack answer, individual successful defense, Attack / Replace, and checkpoint death rollback. Initial checks found a clock sample trailing the start packet by milliseconds; outgoing reports now clamp their timestamp to the room start. A fresh two-player round produced no rejected reports.
- **Browser stability remains unverified.** Preview tabs intermittently crashed, including a fixture-free host after its podium flow completed. Console checks before the crashes were clear; the cause has not been isolated. An independent Edge verification attempt was stopped by Computer Use because it could not determine the active browser URL confidently enough to enforce its policy. No further UI automation was attempted. Rehearse in the team's ordinary browsers before the event.
- Screenshots: [progress dashboard](screenshots/client-authority-dashboard.png), [podium](screenshots/client-authority-podium.png).
- Host-control follow-up: browser checks confirmed report collapse surviving roster updates and the lobby-to-race transition, a plain announcement background, direct host defense challenges without a held player power, an uppercase correct defense, full blocked-result slots followed by queued host challenges, host refresh recovery, and entering/exiting fullscreen announcements. The host screenshot is [here](screenshots/host-challenges-dashboard.jpg). No browser warnings/errors were recorded during those checks; the player preview tab subsequently crashed before cleanup, so the existing stability limitation remains unresolved.
- No before/after CPU, input-to-display latency, or WAN bandwidth benchmark is claimed. The architectural changes remove server physics and CCTV traffic; measure perceived latency and server/network behavior during the Render rehearsal.

The temporary fixture and owned preview server are removed/stopped after verification. The existing event server is not restarted automatically. Restart it and refresh all tabs to load protocol version 2; this clears any current rooms.
