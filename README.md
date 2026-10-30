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
3. Open **Game settings**. Set a 1–60 minute round and scoring weights. Defaults are 10 minutes, 10 points per coin, and 1 point per 32-pixel tile reached.
4. Five default icebreakers are included, including the executive dashboard and pillows/blankets questions. Edit or remove any in settings; at most five are allowed, each with exactly two choices. **Launch** each question manually. It appears as a pixel broadcast inside every player's game viewport and the host's world broadcast stage. Players click a choice or press **1 / 2**. Everyone sees named votes live; voting closes after 15 seconds. Use the in-world **Skip question** or **Dismiss question** control to clear it. Questions run in the lobby.
5. Players choose a name, one of four avatars, and a color, then **Spawn into the lobby**. They can practice movement and jumps around the instruction signs.
6. Choose **Start the race**. Players already in the lobby enter World 1 together. Players still choosing their character can spawn later. New arrivals get only the remaining room time.
7. Watch each player’s live gameplay preview, score, level, and death count. Click a preview to enlarge it. These are views rendered from authoritative simulation snapshots, rather than camera or screen capture streams; no screen-sharing permission is needed.
8. A visible, audible countdown runs during the **final 10 seconds of play**. Players can still move, collect coins, and score. At zero, scores freeze and everyone teleports into **World 04: the podium**, with the top three on the main podium and every remaining player on a ranked stand. Your own avatar and rank are highlighted. Review full rankings, download a CSV, or return everyone to the lobby for another round. The host's manual **End round** action still ends immediately.

The host can refresh and resume using the host credential kept in that tab’s session storage. Keep the host tab open during the event. The room code gives player access; it does not grant host control.

## Controls and scoring

- **Move:** A/D or left/right arrows.
- **Jump:** Space, W, or up arrow. Release before jumping again.
- **Chest power:** F or the in-world **USE** button. Each world has one real power chest; other chests can be decoys. The chest randomly grants Sticky Boots (slow), Wrong Way (reversed controls), Ice Skates (slippery movement), or Ink Cloud (fog), and a random-opponent or everyone-else target. Effects last five seconds and exclude the caster. Only one power is active across the entire room at a time. Requests from all players and levels enter a shared FIFO queue, and the HUD shows each pending request’s position. At the front of the queue, the attacker gets a random general-knowledge question. They have 10 seconds and one attempt; an incorrect or unanswered question applies the power to the attacker. A correct attacker gives each target a private defense question with the same 10-second, one-attempt rule. Correct defenders block; wrong or unanswered defenses receive the effect. All defenses resolve before the five-second effect starts, and phases advance early when everyone has answered. Typed answers ignore case and extra whitespace. The question pool and accepted answers stay on the server. The effect starts when its result broadcast starts; that banner remains visible for the full five seconds, with a countdown. Level-escape broadcasts keep their two-second slots in the same queue. Queued uses survive death and level changes; disconnecting or refreshing cancels pending uses, and ending/resetting the round clears the queue. Unused powers survive death; one use is allowed per world, and a claimed chest stays spent through respawns. Entering the next world offers a fresh chest. No available opponent means the held power is kept. Host previews show inventories and active effects, including fog.
- **Audio is enabled by default.** Original looping chiptune music changes between the lobby, forest, ocean, inferno, and podium. Sound effects also change with the current world: light plucks/chirps in the forest, rounded bubbles and pitch glides at sea, and low crunchy tones in the inferno. Effects cover jumping, coins, deaths, respawning, checkpoints, broadcasts, countdowns, race starts, level clears, and the final teleport. The top-right speaker mutes or enables music and effects together.
- Playback starts on your first click or keypress, as required by browser autoplay rules. Audio pauses in a hidden tab and resumes when you return. No music downloads or extra dependencies are needed.
- All enemies, spikes, disguised traps, and falls are lethal. Death reveals disguised spikes or bombs and creates a pixel explosion.
- Platform widths, heights, gaps, and spacing vary deterministically by world. Critters patrol within their own ground or raised platform bounds, and only chase while the player is standing on the same platform. Leaving that platform makes them resume patrol. Some telegraph and fire aimed pixel flames at 120 pixels/second, with a 16×16 collision body and a 4.8-second firing interval (half the previous rate). Flames are lethal and expire after three seconds.
- Every world has **checkpoints at 25%, 50%, and 75%**, in clear landing areas. Pass each blue flag to save your location, points, collected coin IDs, and progress. Reached flags stay gold, and only a later flag replaces your save. Revisiting an earlier flag cannot downgrade or update that save. The 100% exit banks the completed world.
- Respawn after **3 seconds** at the checkpoint if reached, or at the current world’s start otherwise, with unlimited attempts. Death immediately restores the checkpoint’s saved points and coins; gains afterward are lost. Coins already collected at the checkpoint stay collected, while coins collected afterward reappear. Moving platforms and enemies restart their cycles.
- Each attempt earns coin points plus points for the farthest distance reached. Walking backward and collecting a coin twice cannot increase the score.
- Completing a world banks its full score once, including the checkpoint-protected points, then clears that checkpoint for the next world. Banked points survive all deaths. Before reaching a checkpoint, death removes all current world points.
- When time expires, the final total includes banked points and current attempt points. Highest score wins; equal scores favor the earlier full completion, measured from the room’s start. Remaining equal scores keep join order. Final rankings are frozen: leaving, reconnecting, or joining after time expires cannot change anyone’s podium place. New arrivals after the round watch as unranked spectators when the room has capacity.
- Clearing a world queues a broadcast inside everyone's game viewport. Broadcasts display one at a time, for two seconds each. Clearing the third world banks the final score and waits for the shared timer, countdown, and podium teleport.
- **Refreshing resets a player’s run, including checkpoints.** Rejoining with the same name replaces a disconnected entry and starts from World 1 with only the time left. Use distinct player names. A disconnected player cannot continue moving.

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
5. Before game day, rehearse from two different internet connections: create a room, join, spawn, launch a vote, start, die, check the host preview, and finish/end the round.

Render’s official guides cover [Node services](https://render.com/docs/deploy-node-express-app), [port binding](https://render.com/docs/web-services#port-binding), and [WebSockets](https://render.com/docs/websocket).

## Project layout

```text
public/
  index.html, styles.css, app.js    Browser UI, controls, local visual prediction
  game/engine.js                  Shared pure simulation and scoring
  game/levels.js                  Deterministic world layouts and trajectories
  game/renderer.js                Pixel worlds, animation, atlas drawing
  game/audio.js                   Original music, effects, and audio lifecycle
  game/world-ui.js                In-world questions, votes, announcements, countdown
  game/podium.js                  Ranked ceremony world with all player avatars
  game/powers.js, power-ui.js     Inventory rules and in-world power HUD
  game/power-quiz-ui.js           Attack/defense quiz panels inside the game
  server/power-duels.js           Authoritative quiz phases and outcomes
  server/power-questions.js       Server-only general-knowledge pool and answer keys
  game/default-questions.js       Five editable default icebreakers
  game/client-state.js            Confirmed checkpoint display and runtime guard
  assets/sprites.png              Original generated transparent sprite atlas
server/index.js                   HTTP, room lifecycle, authoritative physics, WebSockets
tests/                           Engine and multi-client integration checks
render.yaml                      Render Web Service configuration
docs/ASSETS.md                    Sprite provenance and generation prompt
```

The server owns game time, movement, collision, coins, scores, voting, and results. Clients send controls rather than submitting scores. Player snapshots contain their own detailed game state and summaries for others. The host receives all player states for the live previews.

The three levels target a 5–10 minute casual session including surprise deaths. Actual completion time depends on player skill; a team rehearsal is the right place to tune obstacle spacing and round duration. Desktop keyboard play is supported. Mobile controls and persistent game recovery are outside this version.

## Artwork

Four avatars, enemies, hazards, coins, wildlife, and the goal flag use original generated sprites. Environment tiles and parallax scenery are drawn in canvas. See [the asset notes](docs/ASSETS.md) for the generation prompt and atlas mapping. The UI uses DM Sans and Space Grotesk from Google Fonts, with system fallbacks if those requests are unavailable.
#   N o t M a r i o s W o r l d  
 