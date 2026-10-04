# Hand Cricket Live

A working local multiplayer prototype for 2–8 players. No player accounts or app installation.

## Play in under a minute

The browser files are already built and included. Only the computer hosting the game needs **Node.js 22 or newer**. Players need a web browser.

1. Extract this entire folder.
2. Open a terminal in this folder.
3. Run `node local-server.mjs`.
4. Open **http://localhost:3000** on that computer.
5. Enter a nickname, create a room, and share the six-character code.

Keep the terminal open while playing. Ctrl+C stops the game server.

### Test two players on one computer

Use a normal browser window for player one and an incognito/private window (or a different browser) for player two. Two ordinary tabs share the same saved seat by design. Copying a tab is not a new player.

### Join on phones

Connect the phones and hosting computer to the same Wi-Fi. The terminal prints a **Same Wi-Fi** address such as `http://192.168.1.25:3000`. Open that exact address on each phone, then enter the room code. If the address could not be printed, use the hosting computer's Wi-Fi IPv4 address with port 3000. Allow Node through the host computer's local-network firewall if prompted. Guest Wi-Fi networks may block device-to-device access.

**localhost on a phone means the phone itself**, so phones must use the computer's Wi-Fi address. For an invite link that works on phones, open the Wi-Fi address on the hosting computer before using Copy invite.

People on other networks cannot join this local-only version. Nothing has been published.

## Approved rules

- Host starts with 2–8 connected players. Batting order is shuffled.
- Everyone bats once, until out or six balls are complete.
- The bowler rotates every ball through the other players in room order.
- Batter and bowler each have six seconds to lock one number from 1 to 6.
- Matching numbers mean OUT and no runs on that ball. Otherwise the batter scores their own number.
- Each innings shows the best opposing score and how many runs are needed to lead. With no earlier score, the target starts at zero.
- Highest regular score wins. If multiple players tie for first, only those players enter the Super Over.
- Each tied player faces exactly one ball, against a random other match participant. The regular score remains unchanged. Highest Super Over score wins; another tie is shared. No repeated Super Overs.
- Batter timeout: dot ball (zero runs, not out). Bowler timeout: a secret random number. The timer never pauses or resets on refresh.
- Everyone sees the same result. Emoji reactions are available from the stands.
- Mid-match arrivals spectate. Up to eight connected players can take part in the next match; existing seats have priority.
- Rematch resets scores and reshuffles batting order.

## Rejoining and disconnections

The browser stores a private seat token for each room. Refreshing the page or reopening the room in **the same browser and origin** restores your seat, locked pick, and score. Moving from localhost to an IP address, using a different browser, clearing browser data, or switching devices does not restore that identity. If storage is blocked, the page explains that recovery is unavailable.

The server keeps running when a device disconnects; timeout rules apply. If the host is absent for 20 seconds, an active player becomes host. Rooms expire after four hours without activity.

**Room state is in memory. Restarting the hosting process resets every room.** This version is intended for local core-loop testing. A public release will need shared durable room storage, deployment, rate limits and network-resilience testing before use across independent server instances.

## Implementation

- `lib/game.mjs`: authoritative game engine, timers, validation and per-player state projection.
- `app/page.tsx` and `app/globals.css`: responsive React game interface.
- `local-server.mjs`: zero-dependency Node HTTP server, 50 ms game clock, static browser files and game API.
- `local-dist/`: prebuilt browser assets; ready to run without npm install.
- `app/api/game/route.ts`: adapter for the included Vinext project. The local Node server is the tested runtime for this prototype.
- `tests/game.test.mjs`: rule and state-machine tests with deterministic time.
- `tests/http-smoke.mjs`: starts a temporary local server and exercises three independent HTTP clients.

Clients poll for state roughly every 180 ms during play, and every 650 ms in the lobby. Once both picks are committed (or time expires), the server sends a shared reveal timestamp 650 ms in the future. Clients estimate server clock offset and reveal at that timestamp. Normal local-network play is synchronized; severe latency/background throttling can make a device display a result late. Choices are never released while either participant can still change a pick.

Server-side checks prevent forged scores, spectator picks, repeat picks, self bowling, stale-ball submissions, invalid values and non-host starts. Only the current player's seat token and locked pick are returned. The client uses text rendering for player names.

## Validation completed

- Seven engine tests: secret choices, immutable picks, refresh recovery, eight-player six-ball innings, bowler rotation, top-score target, unique winners, one-ball Super Over, shared ties, timeout behavior, room capacity, spectator restrictions, rematches and disconnected progression.
- TypeScript check passed.
- Local browser bundle and full framework build passed.
- Live HTTP smoke test: page/assets, three independent players, secret picks, seat recovery, shared reveal time and synchronized scoring.

The remote workspace cannot expose its local server to the user's browser. Browser visual QA and real-phone network testing were unavailable here. Test using the steps above. The optional read-only browser agent hook is feature-detected; validation in a supported browser context was unavailable.

## Editing and rebuilding

The complete editable project is included. The prebuilt local version needs no dependencies beyond Node.

For development, install the dependencies with the declared pnpm version and lockfile:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run build:local
node local-server.mjs
```

Run rules and HTTP tests:

```sh
node --test tests/game.test.mjs
node tests/http-smoke.mjs
```

Set `PORT` to use another port if 3000 is occupied. The local server binds to 0.0.0.0 so devices on your Wi-Fi can connect.

## Night stadium restyle

Every screen now uses night navy and deep stadium green, bright yellow actions, and an original packed-stadium backdrop with floodlights. Phone play screens put score, target and timer above the duel, with six large number buttons in **two columns and three rows** at the bottom of the match panel. Compact-screen sizing and device safe-area padding keep the controls within reach; unusually small screens or enlarged text can scroll naturally.

Both number cards flip from the same existing reveal timestamp. After the 420 ms flip, wickets, fours and sixes get a large OUT!, FOUR! or SIX! callout with a short confetti burst and cheering crowd wave. Animations stay inside the existing reveal window and do not add time, change a pick or alter scores. The reduced-motion preference removes the flips, confetti and crowd movement.

The game engine, API, and original client action/clock/recovery code were compared against the previous package and are unchanged. The only local-server edit adds the PNG response content type for the stadium asset. The existing rule tests, HTTP smoke test and TypeScript checks are rerun for this version. Browser visual QA remains unavailable in this workspace.
