# Iron Front — Multiplayer Arena Shooter

A top-down 2D arena shooter that runs entirely in the browser. Configure a
**loadout**, build an **army**, and fight across single-player, local 2‑player,
and online multiplayer modes.

![modes: single / local / online](https://img.shields.io/badge/modes-single%20%7C%20local%20%7C%20online-orange)

## Features

| Requirement | How it's delivered |
|-------------|--------------------|
| **Multiplayer** | Local 2‑player (shared keyboard) **and** online multiplayer over WebSocket. Online falls back to offline bots when no server is reachable. |
| **Loadout** | Pick a primary + secondary weapon (pistol, rifle, SMG, shotgun, sniper, knife), armor class, and a perk. Each choice changes real combat stats. |
| **Army setup** | Choose a faction and spend deployment points on a squad of AI units (Rifleman, Heavy, Scout, Sniper, Medic) that fight alongside you. |

## Project layout

```
game/
  index.html        # entry point
  css/style.css     # UI + HUD styling
  js/
    loadout.js      # weapon / armor / perk data + stat resolution
    army.js         # factions + deployable unit definitions
    input.js        # keyboard & mouse tracking
    entities.js     # Bullet, AI Soldier, Player
    game.js         # world, main loop, collisions, HUD, win/lose
    net.js          # online multiplayer client (WebSocket relay)
    main.js         # menu flow + loadout/army UI
  server/
    server.js       # zero-dependency WebSocket relay server (Node)
    package.json
```

The client is dependency-free vanilla JS and Canvas, so it can be hosted as
plain static files on any host (GitHub Pages, Netlify, Vercel, S3, nginx, …).

## Single-file build (easiest hosting)

`game/dist/iron-front.html` is a **complete, self-contained build** — all CSS and
JavaScript inlined into one HTML file with no external requests. Drop it on any
host, or open it locally, and single-player, local 2‑player, loadout, and army
setup work immediately (online multiplayer still needs the relay server below).

```bash
# preview the single-file build locally
cd game/dist
python3 -m http.server 5199        # then open http://localhost:5199/iron-front.html
```

Rebuild it from the source modules at any time with `python3 build_bundle.py`
(from the `game/` directory).

## Run locally

The game is static files. Serve the `game/` directory with any HTTP server:

```bash
# from the repository root
cd game
python3 -m http.server 5173
# then open http://localhost:5173
```

> Opening `index.html` directly via `file://` also works for single-player and
> local multiplayer, but browsers block WebSocket connections from `file://`,
> so use an HTTP server if you want to test online mode.

### Online multiplayer

1. Start the relay server (no install step — it has zero dependencies):

   ```bash
   node game/server/server.js          # listens on ws://localhost:8080
   # or choose a port:  node game/server/server.js 9000
   ```

2. Open the game in **two** browser tabs/windows (or two machines).
3. Choose **Online Multiplayer**, keep the server URL (`ws://localhost:8080`)
   and the same **room code** in both, then connect and deploy.

Players in the same room are placed on alternating teams and see each other in
real time. If the server is unreachable, the game automatically starts an
offline match against AI bots so you're never stuck at the lobby.

## Controls

**Player 1** — WASD to move · mouse to aim · left-click or Space to fire ·
`R` to reload · `Q` to swap weapon.

**Player 2 (local)** — Arrow keys to move · auto-aim at the nearest enemy ·
Enter to fire · `/` to reload.

## Hosting notes

- **Static client**: deploy the contents of `game/` to any static host.
- **Online server**: `server/server.js` is a standard Node HTTP+WebSocket
  process. Deploy it to any host that allows long-lived WebSocket connections
  (Render, Railway, Fly.io, a VPS, etc.) and point the in-game **Server URL**
  field at it. Use `wss://` when the page is served over HTTPS. A `/health`
  endpoint is provided for platform health checks.

## License

MIT — see the repository `LICENSE`.
