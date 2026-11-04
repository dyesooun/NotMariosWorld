# Not Mario’s World

An original desktop pixel platformer for Game Day Thursday. One host runs a room for up to 25 players. Each player has a separate, identical copy of the three worlds: Whimsical Woods, Troubled Tides, and Inferno Express.

## Run locally

Install Node.js 22 or later, then from this directory:

```sh
npm ci
npm start
```

Open [http://localhost:10000](http://localhost:10000). There is no frontend build step. `PORT` overrides the default port. Run `npm test` for the physics/scoring and real WebSocket integration checks.

For local editing, use `npm run dev` so Node restarts when shared game rules change. Refresh the browser after changes. The browser checks `/health` before joining and displays a clear restart message if the server is still using older rules. Server restarts clear test rooms.

## Host a game

1. Choose **Host a room → Create a game room**.
2. Copy the room code or invite link and send it to the team. The host is separate from the 25 player slots.
3. Open **Game settings**. Choose a **World order** (all six sequences are available), then set a 1–60 minute round, scoring weights, separate power/attack/defense durations (1–60 seconds each), and power strengths. Defaults are 10 minutes, 10 points per coin, and 1 point per 32-pixel tile reached.
4. Five default icebreakers are included, including the executive dashboard and pillows/blankets questions. Edit or remove any in settings; at most five are allowed, each with exactly two choices. **Launch** each question manually. It appears as a pixel broadcast inside every player's game viewport and the host's world broadcast stage. Players click a choice or press **1 / 2**. Everyone sees named votes live; voting closes after 15 seconds. Use the in-world **Skip question** or **Dismiss question** control to clear it. Questions run in the lobby.
5. Players choose a name, one of four avatars, and a color, then **Spawn into the lobby**. They can practice movement and jumps around the instruction signs.
6. Choose **Start the race**. Players already in the lobby enter the first world in your selected sequence together. Players still choosing their character can spawn later. New arrivals get only the remaining room time.
7. Follow the lightweight player progress dashboard: current world/stage, progress/checkpoint, score, banked points, coins, deaths, connection status, and last update. It updates at milestones and gameplay events instead of streaming gameplay previews. Collapse **Run reports** whenever you want more room for shared announcements. The separate announcement stage shows icebreakers, messages, power phases, and the final countdown on a plain background, without a game-world scene. During play, use **Host challenges** to choose a power and challenge all active players to defend.
8. A visible, audible countdown runs during the **final 10 seconds of play**. Players can still move, collect coins, and score. At zero, gameplay stops and everyone teleports into **World 04: the podium**. **Finalizing scores…** can appear for up to **2 seconds** while final reports arrive; this adds no playtime. Then the top three appear on the main podium and every remaining player on a ranked stand. Your own avatar and rank are highlighted. Review full rankings, download a CSV, or return everyone to the lobby. Manual **End round** uses the same cutoff and finalization flow.

The host can refresh and resume using the host credential kept in that tab’s session storage. Keep the host tab open during the event. The room code gives player access; it does not grant host control.

## Whimsical Woods

World 1 has a separate authored course with broad groves, root terraces, moving/vanishing moss platforms, and clear checkpoint havens. Original raster sprites add canopy vines, four flower varieties, red/glowing mushrooms, totems, tikis, hanging masks, leafy treasure chests, glow moths, mushlings, and acorn beetles. The two new enemy species use the existing platform-bound patrol/chase rules; some beetles shoot. Forest music is the original 32-beat **Mosslight Mountain** theme, with bell/flute-like lead, plucked arpeggios, and short bass notes. Forest sprites render with coarse, crisp pixels while retaining their existing colors and aligned platform surfaces. The ocean and inferno retain their existing courses and artwork.

To test a particular world first, open **Game settings → World order**, select a sequence beginning with that world, save, and start the race. Every player uses the same order. All three worlds are still included; stage labels and progress follow the sequence, and score banking, checkpoints, powers, music, and escape broadcasts follow the actual world. New arrivals and refreshed runs begin at the first selected world with the room’s remaining time.

## Controls and scoring

- **Move:** A/D or left/right arrows.
- **Jump:** Space, W, or up arrow. Release before jumping again.
- **Chest powers:** Each world has three real power chests, just after the 25%, 50%, and 75% checkpoints (forest: x=3940, 7460, 10940; ocean/inferno: x=3880, 7380, 10880), marked with cyan sparkles. Other chests can be decoys. Each chest randomly grants Sticky Boots (slow), Wrong Way (reversed controls), Ice Skates (slippery movement), or Ink Cloud (dark fog). You can use up to three powers per world, but hold/reserve only one at a time. At another chest, choose **Attack current** or **Replace with new** inside the world. Attack queues the held item and leaves the new chest unopened until the slot is free; Replace discards the held item and claims the new chest. Press **F** or **USE** to attack elsewhere. Unused powers and opened chests survive death and checkpoint rollback. Replacing, dying, or using a power never regenerates a claimed chest. The unopened reward is stable if you walk away and return. An old unreserved item is discarded on entering the next world; a queued item survives and blocks pickup until consumed.
- **Attack and defense:** A correct attack always challenges **everyone else who is eligible**, across all worlds. The attacker has one general-knowledge question; wrong or unanswered applies the power to themselves. After a correct attack, each opponent gets a private defense question before the effect begins. Correct defenders block individually; incorrect or missing answers receive the effect together. Answers ignore case and extra whitespace; answer keys stay on the server. Defaults are 10 seconds to attack, 10 seconds to defend, and a 5-second effect. The host can set each duration independently to **1–60 seconds** in Game settings. Each question allows one attempt, and phases resolve early when everyone has answered.
- **Host challenges:** During the race, the host can choose Sticky Boots, Wrong Way, Ice Skates, or Ink Cloud without a chest or attacker quiz. Every connected, spawned player who has not finished receives a private defense question, even while respawning. Correct answers block individually; wrong or missing answers receive the selected power. These challenges use the same queue, defense window, power strength, and effect duration as chest attacks. Targets are selected when the queued challenge begins. Host reconnection preserves queued challenges; ending/resetting the round clears them.
- **Power queue and display:** Only one power turn (attack, defense, then effect/result) runs across the room at a time. Other requests enter a FIFO queue with positions in the upper-left HUD. The result banner lasts the full configured effect duration, including a fully blocked result. Level-escape broadcasts use two-second slots in the same queue. Queued items survive death and level changes; disconnect/refresh cancels pending uses, and round end/reset clears all requests and effects. No available opponent means the held power is kept. The question and answer controls appear together inside the game viewport, including after tab/fullscreen changes. By default, Ink Cloud darkens its previous fog scene by a further **75%**, while HUDs, quizzes, and broadcasts remain readable. The host follows shared power phases on the broadcast stage.
- **Power strength settings:** Sticky Boots speed is 10–90% of normal (default 55%); Wrong Way speed is 50–200% while controls stay reversed (default 100%). Ice Skates now reach **170% of normal speed** by default, configurable from 110–250%, with braking grip from 2–50% (default 12%); lower grip makes you coast farther. Ink darkness is configurable from 0–95% (default 75% additional darkening). The server fixes strength when the power turn starts, and the affected browser applies those values locally.
- **Audio is enabled by default.** Original looping chiptune music changes between the lobby, forest, ocean, inferno, and podium. Sound effects also change with the current world: light plucks/chirps in the forest, rounded bubbles and pitch glides at sea, and low crunchy tones in the inferno. Effects cover jumping, coins, deaths, respawning, checkpoints, broadcasts, countdowns, race starts, level clears, and the final teleport. The top-right speaker mutes or enables music and effects together.
- Playback starts on your first click or keypress, as required by browser autoplay rules. Audio pauses in a hidden tab and resumes when you return. No music downloads or extra dependencies are needed.
- All enemies, spikes, disguised traps, and falls are lethal. Death reveals disguised spikes or bombs and creates a pixel explosion.
- Spike hitboxes are 15% smaller in width and height than their artwork in all three worlds, including disguised spikes. Light edge grazes are more forgiving; the inner spike area remains lethal.
- Platform widths, heights, gaps, and spacing vary deterministically by world. Critters patrol within their own ground or raised platform bounds, and only chase while the player is standing on the same platform. Leaving that platform makes them resume patrol. Some telegraph and fire aimed pixel flames at 120 pixels/second, with a 16×16 collision body and a 4.8-second firing interval (half the previous rate). Flames are lethal and expire after three seconds.
- Every world has **checkpoints at 25%, 50%, and 75%**, in clear landing areas. Pass each blue flag to save your location, points, collected coin IDs, and progress. Reached flags stay gold, and only a later flag replaces your save. Revisiting an earlier flag cannot downgrade or update that save. The 100% exit banks the completed world.
- Respawn after **3 seconds** at the checkpoint if reached, or at the current world’s start otherwise, with unlimited attempts. Death immediately restores the checkpoint’s saved points and coins; gains afterward are lost. Coins already collected at the checkpoint stay collected, while coins collected afterward reappear. Moving platforms and enemies restart their cycles.
- Each attempt earns coin points plus points for the farthest distance reached. Walking backward and collecting a coin twice cannot increase the score.
- Completing a world banks its full score once, including the checkpoint-protected points, then clears that checkpoint for the next world. Banked points survive all deaths. Before reaching a checkpoint, death removes all current world points.
- When time expires, the final total includes banked points and current attempt points. Highest score wins; equal scores favor the earlier full completion, measured from the room’s start. Remaining equal scores keep join order. Final rankings are frozen: leaving, reconnecting, or joining after time expires cannot change anyone’s podium place. New arrivals after the round watch as unranked spectators when the room has capacity.
- Clearing a world queues a broadcast inside everyone's game viewport. Broadcasts display one at a time, for two seconds each. Clearing the third world in the selected sequence banks the final score and waits for the shared timer, countdown, and podium teleport.
- **Refreshing resets a player’s run, including checkpoints.** Rejoining with the same name replaces a disconnected entry and starts from the first selected world with only the time left. Use distinct player names. A disconnected player cannot continue moving.

## Deploy on Render

This is a **Node Web Service**, not a static site. HTTP and WebSockets share the same port. The browser uses `wss://` automatically on HTTPS.

1. Put this directory in a Git repository and push it to your Git provider.
2. In Render, create a **Blueprint** from the repository to use [render.yaml](render.yaml), or create a **Web Service** with:

   | Setting | Value |
   | --- | --- |
   | Runtime | Node |
   | Build command | `npm ci` |
   | Start command | `npm start` |
   | Health check | `/health` |
   | Node version | 22 or later |

3. Deploy and open the provided `https://…onrender.com` URL. Share that URL or the host’s invite link with the team.
4. Keep the service at **one instance**. Rooms live in server memory. Restarts, deployments, or instance replacement clear rooms and running games. Avoid changing deployments during a round.
5. Before game day, rehearse from two different internet connections: create a room, join, spawn, launch a vote, start, die, check the host's score rollback and progress updates, use/defend a power, and finish/end the round. Include a full 25-player rehearsal.

Render’s official guides cover [Node services](https://render.com/docs/deploy-node-express-app), [port binding](https://render.com/docs/web-services#port-binding), and [WebSockets](https://render.com/docs/websocket).

## Project layout

```text
public/
  index.html, styles.css, app.js    Browser UI, local gameplay controls, progress dashboard
  game/engine.js                  Shared pure simulation and scoring
  game/levels.js                  Deterministic world layouts and trajectories
  game/world-order.js             Validated room-specific world sequences
  game/renderer.js                Pixel worlds, animation, atlas drawing
  game/forest-sprites.js          Forest expansion atlas and alpha-trimmed sprite crops
  game/audio.js                   Original music, effects, and audio lifecycle
  game/world-ui.js                In-world questions, votes, announcements, countdown
  game/podium.js                  Ranked ceremony world with all player avatars
  game/powers.js, power-ui.js     Inventory rules and in-world power HUD
  game/power-chest-ui.js          In-world Attack / Replace chest choices
  game/power-quiz-ui.js           Attack/defense quiz panels inside the game
  server/power-duels.js           Authoritative quiz phases and outcomes
  server/power-questions.js       Server-only general-knowledge pool and answer keys
  game/default-questions.js       Five editable default icebreakers
  game/client-state.js            World progress, quiz movement restrictions, runtime guard
  game/local-run.js               Local fixed-step gameplay, milestone reports, cutoff history
  game/run-protocol.js            Compact report schema and finalization constants
  assets/sprites.png              Original generated transparent sprite atlas
server/index.js                   HTTP, room coordinator, progress aggregation, finalization, WebSockets
tests/                           Engine and multi-client integration checks
render.yaml                      Render Web Service configuration
docs/ASSETS.md                    Sprite provenance and generation prompt
```

Each player's browser runs its own physics, enemies, collisions, coins, checkpoints, deaths, score, and level transitions. Movement responds locally and does not wait for the network. The server deliberately trusts gameplay summaries for this casual game; it does not replay physics or prevent score tampering.

The server coordinates rooms, the shared timer, random chest rewards/inventory, the global power queue, private quizzes and answer validation, votes, broadcasts, and final results. Clients report compact totals at 5% progress milestones, coin collections (batched), checkpoints, deaths/respawns, world completion, chest contact, and the final cutoff. Detailed progress goes to the host; players receive compact leaderboard updates and shared interaction events. No movement inputs, world simulation snapshots, or CCTV views are transmitted. Incoming coordinator messages never replace local gameplay state.

Final gameplay totals represent the shared cutoff, including current unbanked points. The server collects final reports for at most two seconds, falls back to the last accepted totals when a player cannot report, and publishes immutable ranks. Completion tiebreakers use client-reported completion time relative to the room start, followed by join order. Refreshing during a run still resets it; finalization does not allow a new run to replace a pending result. See [the three migration milestones](docs/NETWORKING.md).

The three levels target a 5–10 minute casual session including surprise deaths. Actual completion time depends on player skill; a team rehearsal is the right place to tune obstacle spacing and round duration. Desktop keyboard play is supported. Mobile controls and persistent game recovery are outside this version.

## Artwork

Four avatars, enemies, hazards, coins, wildlife, and the goal flag use original generated sprites. Environment tiles and parallax scenery are drawn in canvas. See [the asset notes](docs/ASSETS.md) for the generation prompt and atlas mapping. The UI uses DM Sans and Space Grotesk from Google Fonts, with system fallbacks if those requests are unavailable.
#   N o t M a r i o s W o r l d  
 
