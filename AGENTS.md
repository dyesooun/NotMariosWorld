# Not Mario's World — Project Rules and Feature Contract

This file records the agreed requirements for the company's Game Day Thursday game. Read it before changing gameplay, UI, networking, scoring, or assets. It describes the established behavior; it does not authorize unrelated features or balance changes.

## Authority and working rules

- The user is the design and POC authority. Do not silently change gameplay, UX, visual behavior, progression, or game-design constraints. Do not declare the POC successful, failed, or finished on the user's behalf.
- New explicit user instructions take precedence over this document. When an authorized task changes a rule, update this file and the relevant player-facing documentation together.
- Preserve existing features while fixing bugs. Make routine implementation decisions within the authorized scope without repeatedly requesting approval.
- The main agent coordinates requirements, decisions, delegated work, review, and final status. Handle small changes directly. For substantial clear implementation, use a Grunt; for unclear architecture or difficult investigation, use a Planner before implementation. Pass only the needed context, avoid duplicate investigations and unnecessary delegation chains, and tell workers not to revert others' edits.
- Never invoke or switch to GPT-6 Astra automatically. Ask the user for explicit approval first, explaining the unresolved problem, previous attempts, why the other models are insufficient, and the expected contribution. If approved, use medium reasoning or lower.
- Report implementation, verification, and remaining limitations accurately. Distinguish automated coverage from manual browser checks and actual internet/capacity rehearsals.

## Game concept and platform

- An original, playful pixel-art platform race/battle royale for a company event. Collect coins, travel farther, and escape three worlds to earn the highest score.
- Desktop browser and keyboard play. Mobile controls are outside the agreed scope.
- Internet multiplayer, deployed as a Node Web Service on Render, with room-code entry and shareable invite links.
- Support a host plus up to **25 players**. The host is an observer/controller and does not consume a player slot.
- Every player runs a separate simulation of the same level layout. Players do not collide, share collectible depletion, or physically enter one another's world. Chest powers are the explicitly requested cross-player interaction.
- Layouts and obstacle definitions must be identical for every player. Random power types and quiz questions do not change the terrain; successful attacks target all eligible opponents.
- Aim for **5–10 minutes** of casual play across all three race levels, including surprise deaths. Actual duration depends on skill and needs team rehearsal; do not claim the target has been proven merely because tests pass.
- No particular licensed character or theme is required. Preserve the original artwork and playful surprise-death tone.

## Session and host flow

- The host creates a room, configures it, and **starts the race manually**. Joining or spawning must not start the round.
- Room states are lobby, running, and ended. Host actions are authenticated separately from player access; a room code must not grant host control.
- Host settings are editable in the lobby. Round duration defaults to **10 minutes** and is configurable from **1–60 minutes**.
- Scoring settings default to **10 points per coin** and **1 point per 32-pixel distance tile**; the current supported range for each weight is 0–1000.
- The host can separately configure **power duration**, **attack-answer window**, and **defense-answer window** in the lobby, each from **1–60 seconds**. Defaults are **5**, **10**, and **10 seconds**, respectively. The server owns these deadlines; quiz progress and result broadcasts must use the configured values.
- Late arrivals are allowed during a running round. They start World 1 and have only the room's remaining time, with no personal timer extension.
- Refreshing/rejoining a player during an unfinished round resets their run: location, score, banked points, checkpoints, inventory, and collected coins. It is not a saved-game recovery feature.
- A disconnected player must stop moving. Rejoining the same disconnected name replaces that entry; players should use distinct names.
- The host can resume their host session after refresh using the credential in that tab's session storage. This is separate from player-run reset behavior.
- The host can end a running round manually and return an ended room to the lobby for another round. Manual end currently finishes immediately.
- Post-round arrivals may watch as unranked spectators when room capacity permits. Reconnecting to frozen results must not reset or rerank those results.

## Lobby, identity, and controls

- **Level 0** is a safe, playable lobby with movement, jumping, platforms, and instructions inside the world.
- Players enter a name, select an avatar and color, then click **Spawn** to enter the lobby. During an active round, spawning enters the race instead.
- Current avatars: explorer, cat, robot, and wizard. Current color choices: lime, pink, blue, purple, gold, and coral. Names are limited to 24 characters.
- Move with **A/D** or **left/right arrows**. Jump with **Space**, **W**, or **up arrow**. Release the jump key before jumping again.
- Activate a chest power with **F** or the in-world **USE** button.
- Lobby icebreakers support clicking a choice or pressing **1 / 2**.
- Preserve fullscreen play, readable instructions, and keyboard focus behavior. Typing into profile/settings/quiz inputs must not control the character.
- Clear held movement input on blur, relevant modal transitions, and disconnect so controls cannot become stuck.

## Race worlds and presentation

| Level | World | Required theme |
| --- | --- | --- |
| 0 | Lobby / The Waiting Woods | Safe practice and instructions |
| 1 | Whimsical Woods | Whimsical forest |
| 2 | Troubled Tides | Ocean |
| 3 | Inferno Express | Hell / lava |
| 4 | Podium | Shared ranked end-of-round ceremony |

- Race levels include coins, lethal traps, disguised decoys, enemies, moving platforms, and vanishing platforms.
- Vary platform widths, heights, gaps, and spacing deterministically. Avoid repetitive equal-size stepping stones and preserve reachable routes.
- Current race-world tuning uses a 14,000-pixel exit position and a 14,200-pixel world width. Treat these as current tuning, not a reason to silently redesign the courses.
- Keep the world alive with moving clouds, flying birds, swimming fish, parallax scenery, and biome-appropriate animation.
- Death produces a **pixel explosion**. Reveal the real spike/bomb or other cause behind a decoy and display its cause of death.
- Use crisp, original pixel sprites. The existing transparent atlas includes avatars, enemies, bombs, coins, spikes, a mushroom/spring, chests, birds, fish, a skull, and a flag. Canvas draws terrain, scenery, and additional effects.
- Preserve asset provenance in `docs/ASSETS.md`. Do not replace the original art with copyrighted game assets.

## Death, checkpoints, and scoring

- Enemies, projectiles, spikes, bomb/spike decoys, and falls kill instantly. There is no agreed health/damage system.
- Respawns are unlimited and occur after **3 seconds**.
- Each race level has checkpoints at **25%, 50%, and 75%**. The exit at 100% completes/banks the level rather than acting as another checkpoint.
- Each new checkpoint saves **respawn location, current points, coin count, collected coin IDs, farthest distance, and progress**.
- Before the first checkpoint, death resets the current level's points, coins, and progress and respawns at that level's start. Previously banked levels remain safe.
- After a checkpoint, death restores the checkpoint's saved state and respawns there. Only gains made after the saved checkpoint are lost.
- Coins already collected at the checkpoint stay collected. Coins collected after it reappear after death. Never allow coin duplication or repeated-checkpoint score farming.
- Checkpoints advance monotonically. Only a later checkpoint can replace the save; revisiting the same or an earlier checkpoint must not overwrite or downgrade it.
- Unreached flags are blue; **all reached flags remain gold**, including after client/server reconciliation and respawn.
- Checkpoints must have solid support and clear landing/respawn space. Touching a flag from ground level must not kill the player. Do not allow nearby hazard placement or enemy patrols to invalidate its safe landing area.
- Respawn resets enemy and moving-platform cycles. The saved scoring/collection state and separately tracked power inventory must still survive as specified.
- Current total score is `banked + current coin points + floor(farthest current-level distance / 32) * distancePoints`.
- Distance uses the farthest point reached, so walking backward and forward cannot farm points.
- Completing a level banks its full current score **once**, including checkpoint-protected points, then starts the next level with a fresh checkpoint state. Death in a later level never removes earlier banked points.
- Completing World 3 banks the final level and waits for the shared room timer and ceremony; it does not immediately end the round for everyone.
- At time expiry, include **banked points plus current unbanked points** in the final result.
- Highest score wins. Ties favor earlier full-course completion measured from the **room's start**, then join order for remaining ties. An unfinished player has no completion time.
- Freeze final scores and ranks at round end. Disconnects, refreshes, reconnects, and new spectators must not change podium placements.

## Critters and projectiles

- Critters live on both ground and raised platforms and patrol within the bounds of their assigned platform.
- Chase only when the player is standing on **that same platform**, not merely nearby or at a similar height. Resume patrol when the player leaves it.
- Maintain patrol movement independently of chase direction. Critters must not camp at the left edge and make landing jumps routinely unavoidable deaths.
- Keep the entire critter supported by its platform; do not let it float past cliff edges.
- Some critters telegraph and fire aimed, lethal projectiles.
- Projectiles are visibly **fire-shaped**, larger, and slower. Current shared tuning is **120 pixels/second**, a **16×16** collision body, a **4.8-second** firing interval, and a **3-second** lifetime. The interval reflects the requested 50% firing-frequency reduction.
- Renderer and simulation must use the same projectile dimensions/tuning so visible flames and collision remain aligned.

## Chests and powers

- Not every chest is a decoy. Each race level has **three real power chests** per player; other chests can hide lethal surprises.
- The real chests are at **x = 3880, 7380, and 10880**, just after the three checkpoints, with cyan sparkles. Keep rewards distinguishable from decoys, with stable IDs, solid support, and clear access.
- Each chest grants one random power, allowing **up to three uses per level**. Players can hold or reserve **only one power at a time across levels**, without stacking inventory.
- Reaching another chest while holding a power shows an **in-world Attack / Replace choice**. Attack queues the current item and leaves the new chest unopened until the slot is free. Replace discards the current item and claims the new chest; replacement does not grant an extra inventory slot.
- Cache an unopened chest's offered reward for that run so walking away and returning cannot reroll it. Validate each choice against the actual nearby chest, offer, held-item identity, current run, liveness, and round deadline. A queued item cannot be replaced.
- An unused held power survives death. A claimed chest stays spent across respawns, including when death rewinds coins to a checkpoint. Used powers/chests must never regenerate through death or checkpoint rollback.
- Entering the next level gives access to that level's three fresh chests and discards an unreserved old-level item. Already queued requests remain tied to their original level/item and survive the transition; a reserved old item blocks new pickup until consumed. An active turn has already consumed its item and is not a second held slot.

| Power | Effect | Duration |
| --- | --- | --- |
| Sticky Boots | Slower movement | Host setting; default 5 seconds |
| Wrong Way | Reversed movement controls | Host setting; default 5 seconds |
| Ice Skates | Slippery movement | Host setting; default 5 seconds |
| Ink Cloud | Dark fog over the affected player's view | Host setting; default 5 seconds |

- Successful attacks **always challenge every eligible opponent**, excluding the caster. Correct defenders block individually; wrong or unanswered defenses are affected. Attack-quiz failure is the explicit exception that applies the effect to the caster alone. Random-single-opponent scope is no longer used.
- Ink Cloud is **75% darker than its previous fog appearance**: reduce the fog scene's remaining brightness by 75% before drawing readable HUDs, broadcasts, and quiz controls.
- Opponents can be in different levels. Eligible targets are connected, spawned players who have not finished the course; the host is never a target.
- If no opponent is available, keep the held power rather than silently spending it.
- Place the inventory/use widget in the **upper left of the game viewport**. It must not cover the main play area, quiz controls, broadcasts, or final countdown.
- Show held, queued, testing, used, and active-effect states clearly. The host's live previews must reflect inventories and effects, including fog.

## Global power queue and broadcasts

- Only **one power turn** can run across the entire room at a time, even when players are on different levels. A turn includes its attack quiz, defense phase, and effect/result phase.
- Multiple activation requests enter a shared **FIFO queue**. Show each pending power request's position; reject duplicate reservation/use of the same level slot.
- Queued requests survive the caster's death and level changes. Disconnecting/refreshing cancels pending requests; ending or resetting the round clears requests, quizzes, and effects.
- A request consumes its exact chest item when its attack quiz begins. It remains spent whether the attack succeeds, fails, times out, or is blocked; later unclaimed chests can still grant powers. Reservations must retain their item/run identity so a stale request cannot consume a replacement.
- A caster disconnecting during their attack quiz cancels that turn. Once a successful attack has committed its defense phase, the turn may finish without the caster. Invalid/disconnected/refreshed/finished defenders must be skipped without affecting a new run.
- Do not overlap power effects. Start the effect when its result broadcast starts, after defenses resolve. Keep that broadcast visible for the **full configured power duration** (default 5 seconds).
- If all defenders block, show the blocked result for the same configured duration, with no applied effects, before advancing the queue.
- Every level escape is broadcast to everyone **inside the game viewport**, including a host view.
- Level-escape broadcasts display one at a time, for at most **2 seconds each**, in the same ordered announcement queue as power turns. A level announcement must not replace an active quiz or truncate a power's result banner.
- Power phase notices must tell players whether it is their attack question, their defense question, a wait for another participant, or an attack that does **not target them**.

## Attack and defense quizzes

- Activating a power requires a random **general-knowledge** question from a server-owned pool. This pool is separate from configurable lobby icebreakers; it currently contains 52 questions.
- Attacker: the configured attack window (**10 seconds by default**), **one attempt**. Wrong or unanswered means the power applies to the attacker for the configured power duration, without a defender quiz.
- Correct attack: every eligible opponent receives a private defense question with the configured defense window (**10 seconds by default**) and **one attempt**.
- Defense happens **before the effect starts**. Correct defense blocks that player's effect; incorrect/unanswered defense leaves that player affected. One player's success must not protect others automatically.
- Resolve early when all applicable answers are in. Otherwise resolve at the authoritative deadline, then give affected players the full configured effect duration.
- Answers are **case-insensitive**. Preserve Unicode normalization, trimming, repeated-whitespace normalization, and the accepted aliases in the server question bank.
- Keep answer keys and accepted aliases on the server. Never expose them in static public files, snapshots, host previews, or client-side validation. Players receive only their own question; the host may view question previews without answer keys.
- Validate the socket's participant, current run, transaction ID, challenge ID, phase, deadline, and one-attempt state on every answer. Reject stale, duplicate, forged, or other players' submissions.
- A targeted defender must get a question even if they have **no held chest power**. A committed queued attacker must still get their attack question after death or level completion.
- Death must not hide an active quiz or make its answer inaccessible. It does not pause the room clock or quiz deadline.
- Show the question, answer input, submit control, and timer **together inside the game viewport**. The actual player uses one DOM card, independent of the canvas animation lifecycle; host previews are read-only.
- Sync the card from server state, with lifecycle recovery on tab visibility changes, page restoration, resizing, and fullscreen changes. Do not rely solely on `requestAnimationFrame` for its existence or visibility.
- Preserve typed input across repeated snapshots of the same challenge; reset for a genuinely new challenge. Submit once, restore controls after a rejected request when appropriate, and prevent duplicate handlers/submissions.
- Help dialogs must not cover an unanswered quiz. Focus the input and suppress gameplay key handling while answering. Restore normal play after submission/closure.
- A bystander or a player who has already answered should not receive a fresh answer input. Explain the phase/target status instead of implying a missing question.

## Lobby icebreakers

- Optional and configurable by the host, with **at most 5 questions** and **exactly 2 choices per question**. An explicitly empty list disables them; do not silently restore defaults.
- Include the following five editable defaults:

| # | Prompt | Choice 1 | Choice 2 |
| --- | --- | --- | --- |
| 1 | Panic! An executive is standing behind you, watching you build an urgently needed dashboard. Who would you rather have watching? | Madam Elena | Tita Ambe |
| 2 | One will be erased from existence. Which would you choose to keep? | Pillows | Blankets |
| 3 | You get one coding superpower. Which do you choose? | Find any bug instantly | Write perfect documentation instantly |
| 4 | Your next team day includes one free perk. Which do you pick? | Unlimited coffee and tea | Unlimited snacks |
| 5 | Your code works on the first try. What do you do? | Celebrate immediately | Check what else I broke |

- Launch questions **individually and manually** from the host dashboard, during the lobby. Do not auto-launch the sequence.
- Display the question, choices, and named live votes as an **in-world broadcast**, visible to players and on the host's world broadcast stage.
- Players and the host can see other players' answers. Voting closes automatically after **15 seconds**.
- The host can skip/dismiss a question. Keep launch/configuration controls on the host side while the actual player interaction remains in the world.
- Current input limits are 240 characters per prompt and 100 per choice.

## Audio

- Background music **and sound effects are enabled by default**. Preserve the single speaker control that mutes/enables both.
- Unlock playback on the first user click/key press to comply with browser autoplay behavior; do not silently change the default preference to muted.
- Original looping chiptune music changes between lobby, forest, ocean, inferno, and podium.
- Effects are appropriate to the current world: light plucks/chirps in the forest, bubbles/glides at sea, and low crunchy tones in the inferno.
- Include feedback for jumping, coins, death, respawn, checkpoints, broadcasts, countdowns, race start, level clear, and the final teleport.
- Pause audio in hidden tabs and resume when visible. Keep audio from multiplying on rerenders, reconnects, or repeated phase snapshots.

## Countdown, podium, and host observation

- Run the visible/audible **10-second countdown during the final 10 seconds of play**, not as an extra frozen period after time expires. Players can still move, collect coins, and score during it.
- At zero, freeze authoritative scores, stop gameplay/power processing, and teleport everyone into **World 4: the podium**.
- Show the top three on the main podium and every other ranked player on a ranked stand. Highlight the viewer's avatar/rank and support all 25 player positions.
- Preserve the host's full rankings, CSV export, and return-to-lobby flow.
- The host must see live views of players' games, points, levels, and deaths, with an enlarged watch view on selection.
- These feeds are rendered from authoritative simulation snapshots, not webcam or screen-capture video. Do not introduce screen-sharing permissions to implement this feature.

## Architecture and operation

- Stack: Node.js **22+**, ES modules, `ws`, plain HTML/CSS/JavaScript, and canvas. No frontend build step is required.
- The server owns room time, physics, collision, deaths, coins, checkpoints, scores, inventories, target selection, quizzes, voting, broadcasts, and results. Clients send input/actions; never trust client-submitted scores or quiz correctness.
- Share deterministic simulation and rule modules between server and browser where appropriate. Local prediction must reconcile with server-confirmed checkpoints, coins, deaths, and level changes without reverting durable state.
- Detailed player state is private to that player and the host; other players receive summaries and the required public votes/broadcasts.
- Serve HTTP and WebSockets on the same port. Default local address: `http://localhost:10000`; honor `PORT`. HTTPS deployments use secure WebSockets automatically.
- Render configuration is in `render.yaml`: Node Web Service, build `npm ci`, start `npm start`, health check `/health`.
- Rooms are held in memory on **one server instance**. Restarts/deployments clear rooms and running games. Persistent recovery and multi-instance room coordination are outside the current scope.
- `/health` exposes the running/disk rule fingerprints. Preserve the stale-server and stale-loaded-page guards; require the appropriate server restart/browser refresh instead of allowing incompatible clients to join.
- Shared/server rule changes require a server restart unless a watcher has already restarted it. Browser code changes require refreshing player tabs. Do not restart the running event server for documentation-only edits.

## Source map

| Path | Responsibility |
| --- | --- |
| `server/index.js` | HTTP/WebSockets, authoritative room lifecycle/tick, host authorization, queue, snapshots, final results |
| `server/power-duels.js` | Attack/defense phases, participants, answer validation, outcomes |
| `server/power-questions.js` | Private general-knowledge pool, aliases, answer normalization |
| `public/app.js` | Browser UI, controls, connection, prediction reconciliation, quiz lifecycle |
| `public/styles.css` | Browser layout, viewport overlays, quiz card styling |
| `public/game/engine.js` | Shared movement, collisions, deaths, checkpoint state, scoring, enemy simulation |
| `public/game/levels.js` | Deterministic layouts, checkpoints, platforms, hazards, critter placement, power chest |
| `public/game/renderer.js` | Pixel scene, sprite atlas, wildlife, animation, effects |
| `public/game/projectiles.js` | Shared flame speed, size, lifetime, firing interval |
| `public/game/powers.js` | Inventory, definitions, reservations, effect metadata |
| `public/game/power-ui.js` | Upper-left power inventory/effect HUD |
| `public/game/power-chest-ui.js` | In-world Attack / Replace chest choice card |
| `public/game/power-quiz-ui.js` | Quiz model/geometry and read-only canvas preview |
| `public/game/power-quiz-controls.js` | Actual player's DOM question/input/submit card |
| `public/game/world-ui.js` | In-world votes, announcements, quiz phase notices, countdown |
| `public/game/podium.js` | Ranked ceremony world |
| `public/game/audio.js` | Original music, biome effects, audio lifecycle |
| `public/game/default-questions.js` | Five default lobby icebreakers |
| `public/game/client-state.js` | Confirmed checkpoint reconciliation and runtime compatibility guards |
| `public/assets/`, `docs/ASSETS.md` | Original assets and provenance |
| `tests/` | Unit, DOM lifecycle, simulation, and real WebSocket integration checks |
| `README.md`, `render.yaml` | Operator instructions and deployment configuration |

## Verification and regression priorities

- Install with `npm ci`; run with `npm start` or use `npm run dev` for watched local edits. The test command is `npm test` (`node --test`).
- Run checks appropriate to changed behavior; use real multi-client WebSocket checks for authoritative multiplayer rules and browser checks for viewport/focus/rendering behavior. Documentation-only edits do not require restarting the server or rerunning the game suite.
- When touching relevant systems, preserve or extend coverage for these prior failures:
  - All nine checkpoint saves, persistent gold flags, safe ground contact, saved coins/points/location, no backward overwrite or farming, and client reconciliation.
  - Three distinct chest claims per level, death/checkpoint persistence, one held/reserved item, Attack / Replace choices, stable previews, stale-item rejection, no-target behavior, cross-level FIFO, and cleanup at disconnect/reset/end.
  - Host timing settings, normalization, configured quiz progress/deadlines, and full-duration effect/result banners, including nondefault durations.
  - Attack correctness/failure/timeout, individual defenses, mixed results, no-inventory defenders, committed queued attackers, one-attempt authentication, run refresh isolation, and private answer keys.
  - Quiz question and input appearing together when animation is paused, with tab/fullscreen recovery, preserved typing, correct focus, and rejected-submit recovery.
  - Platform-bound patrol/chase, supported critter positions, flame size/collision, speed, and reduced firing frequency.
  - Final 10 seconds remaining playable, current points included at zero, frozen ranks, all podium positions, and reconnect/spectator stability.
  - Optional/default icebreakers, named live votes, 15-second closure, manual skip, and in-world presentation.
  - Default-on music/effects, biome variation, mute, hidden-tab behavior, and no duplicated playback.
- Do not treat simulation tests as proof of visual quality, browser audio, internet behavior, or 25-player event readiness. Describe any manual checks and rehearsal still needed when relevant.
- Do not leave temporary QA pages, fixture servers, test rooms, or debug controls in production code. Keep deliberate screenshots/provenance artifacts under `docs/`.
