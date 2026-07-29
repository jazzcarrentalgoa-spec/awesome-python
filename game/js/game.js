/* Core game engine: world, spawning, main loop, HUD, win/lose. */
(function (root) {
  const IF = root.IF || (root.IF = {});
  const { clamp } = IF.util;

  const G = {
    canvas: null, ctx: null,
    raf: 0, last: 0, running: false,
    world: null, config: null,
    localPlayer: null, players: [], soldiers: [], bullets: [],
    over: false,
  };

  function buildWalls(w, h) {
    // A handful of rectangular cover blocks, laid out symmetrically.
    const b = [];
    const bw = 90, bh = 26;
    b.push({ x: w * 0.5 - 13, y: h * 0.2, w: 26, h: h * 0.6 });        // central divider
    b.push({ x: w * 0.25 - bw / 2, y: h * 0.32, w: bw, h: bh });
    b.push({ x: w * 0.25 - bw / 2, y: h * 0.62, w: bw, h: bh });
    b.push({ x: w * 0.75 - bw / 2, y: h * 0.32, w: bw, h: bh });
    b.push({ x: w * 0.75 - bw / 2, y: h * 0.62, w: bw, h: bh });
    b.push({ x: w * 0.5 - bh / 2, y: h * 0.06, w: bh, h: bw });
    b.push({ x: w * 0.5 - bh / 2, y: h * 0.94 - bw, w: bh, h: bw });
    return b;
  }

  function makeWorld(w, h) {
    return {
      w, h,
      walls: buildWalls(w, h),
      spawnBullet: (b) => G.bullets.push(b),
      combatants: () => G.combatants,
    };
  }

  function teamColor(teamIndex, factionKey) {
    return IF.FACTIONS[factionKey] ? IF.FACTIONS[factionKey].color : (teamIndex === 0 ? "#58a6ff" : "#f85149");
  }

  function spawnArmy(team, army, side, world) {
    const faction = IF.FACTIONS[army.faction];
    const color = faction.color;
    const baseX = side === 0 ? world.w * 0.12 : world.w * 0.88;
    army.squad.forEach((key, i) => {
      const def = IF.UNITS[key];
      if (!def) return;
      const row = i % 5, col = Math.floor(i / 5);
      const x = baseX + (side === 0 ? -1 : 1) * col * 34;
      const y = world.h * 0.3 + row * (world.h * 0.4 / 5);
      const s = new IF.Soldier(clamp(x, 30, world.w - 30), y, team, def, faction, color);
      s.side = side;
      G.soldiers.push(s);
    });
  }

  function spawnPlayer(team, cfg, side, world) {
    const faction = IF.FACTIONS[cfg.army.faction];
    const x = side === 0 ? world.w * 0.08 : world.w * 0.92;
    const y = world.h * 0.5;
    const p = new IF.Player(x, y, team, cfg.loadout, cfg.army, faction.color, cfg.scheme, cfg.name);
    p.side = side;
    G.players.push(p);
    return p;
  }

  function rebuildCombatants() {
    G.combatants = [].concat(G.players, G.soldiers);
    G.world.combatants = () => G.combatants;
  }

  // ---------------- input schemes ----------------
  function readMove(scheme) {
    const i = IF.input;
    const m = { x: 0, y: 0 };
    if (scheme === "wasd") {
      if (i.isDown("KeyA")) m.x -= 1;
      if (i.isDown("KeyD")) m.x += 1;
      if (i.isDown("KeyW")) m.y -= 1;
      if (i.isDown("KeyS")) m.y += 1;
    } else if (scheme === "arrows") {
      if (i.isDown("ArrowLeft")) m.x -= 1;
      if (i.isDown("ArrowRight")) m.x += 1;
      if (i.isDown("ArrowUp")) m.y -= 1;
      if (i.isDown("ArrowDown")) m.y += 1;
    }
    return m;
  }

  function aimAndFire(p, world) {
    const i = IF.input;
    if (p.scheme === "wasd") {
      // Mouse aim, mouse or space to fire.
      p.angle = Math.atan2(i.mouse.y - p.y, i.mouse.x - p.x);
      if (i.mouse.down || i.isDown("Space")) p.tryShoot(world);
      if (i.isDown("KeyR")) p.startReload();
      handleSwitch(p, i.isDown("KeyQ"), "q");
    } else if (p.scheme === "arrows") {
      // Auto-aim nearest enemy; fire with Enter / Numpad0.
      let best = Infinity, tgt = null;
      for (const e of G.combatants) {
        if (e.team === p.team || !e.alive) continue;
        const d = IF.util.dist2(p.x, p.y, e.x, e.y);
        if (d < best) { best = d; tgt = e; }
      }
      if (tgt) p.angle = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      if (i.isDown("Enter") || i.isDown("Numpad0") || i.isDown("ShiftRight")) p.tryShoot(world);
      if (i.isDown("Slash") || i.isDown("NumpadDecimal")) p.startReload();
      handleSwitch(p, i.isDown("ControlRight") || i.isDown("Numpad1"), "arr");
    }
  }
  const switchLatch = {};
  function handleSwitch(p, pressed, id) {
    if (pressed && !switchLatch[id]) { p.switchWeapon(); switchLatch[id] = true; }
    else if (!pressed) switchLatch[id] = false;
  }

  // ---------------- main loop ----------------
  function step(now) {
    if (!G.running) return;
    let dt = (now - G.last) / 1000;
    G.last = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps
    update(dt);
    render();
    G.raf = requestAnimationFrame(step);
  }

  function update(dt) {
    if (G.over) return;
    const world = G.world;

    // Players
    for (const p of G.players) {
      if (p.controlledLocally !== false && p.scheme) {
        const move = readMove(p.scheme);
        p.update(dt, world, move);
        aimAndFire(p, world);
      } else {
        // remote-driven player: position set by net; just tick timers minimally
        p.update(dt, world, { x: 0, y: 0 });
      }
    }

    // Soldiers
    for (const s of G.soldiers) s.update(dt, world);

    // Bullets + collisions
    for (const b of G.bullets) {
      b.update(dt, world);
      if (!b.alive) continue;
      for (const c of G.combatants) {
        if (!c.alive || c.team === b.team) continue;
        if (IF.util.dist2(b.x, b.y, c.x, c.y) < (c.radius + b.radius) * (c.radius + b.radius)) {
          c.takeDamage(b.damage);
          if (!c.alive && b.owner && b.owner.kills !== undefined) b.owner.kills++;
          b.alive = false;
          break;
        }
      }
    }
    G.bullets = G.bullets.filter((b) => b.alive);
    G.soldiers = G.soldiers.filter((s) => s.alive);
    rebuildCombatants();

    if (IF.net && IF.net.active) IF.net.sync(G.localPlayer);

    checkWinLose();
  }

  function checkWinLose() {
    // Determine which teams still have a living player.
    const teamsAlive = {};
    for (const p of G.players) if (p.alive) teamsAlive[p.team] = true;

    const myTeam = G.localPlayer ? G.localPlayer.team : 0;
    const myAlive = G.localPlayer ? G.localPlayer.alive : false;

    // Enemy fully eliminated? (no living enemy players AND no living enemy soldiers)
    let enemyLeft = 0;
    for (const c of G.combatants) if (c.team !== myTeam && c.alive) enemyLeft++;

    if (!myAlive) return endGame(false, "You were eliminated");
    if (enemyLeft === 0) return endGame(true, "Enemy forces neutralized");
  }

  function endGame(win, reason) {
    if (G.over) return;
    G.over = true;
    const el = document.getElementById("game-message");
    el.innerHTML = `<h2 style="color:${win ? "#3fb950" : "#f85149"}">${win ? "VICTORY" : "DEFEAT"}</h2>` +
      `<p>${reason}</p>` +
      `<p>Kills: ${G.localPlayer ? G.localPlayer.kills : 0}</p>` +
      `<div style="display:flex;gap:12px;margin-top:8px">` +
      `<button class="btn" id="msg-menu">Main Menu</button></div>`;
    el.classList.remove("hidden");
    document.getElementById("msg-menu").onclick = () => { IF.stopGame(); IF.showScreen("menu"); };
  }

  // ---------------- render ----------------
  function render() {
    const ctx = G.ctx, world = G.world;
    ctx.clearRect(0, 0, G.canvas.width, G.canvas.height);

    // floor grid
    ctx.fillStyle = "#10151d";
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.strokeStyle = "rgba(255,255,255,.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < world.w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.h); ctx.stroke(); }
    for (let y = 0; y < world.h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.w, y); ctx.stroke(); }

    // walls
    for (const wl of world.walls) {
      ctx.fillStyle = "#222c39";
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      ctx.strokeStyle = "#3a4756";
      ctx.strokeRect(wl.x, wl.y, wl.w, wl.h);
    }

    for (const s of G.soldiers) s.draw(ctx);
    for (const p of G.players) p.draw(ctx);
    for (const b of G.bullets) b.draw(ctx);

    drawHud();
  }

  function drawHud() {
    const p = G.localPlayer;
    const hud = document.getElementById("hud");
    if (!p) { hud.innerHTML = ""; return; }
    const hpPct = Math.max(0, p.hp / p.maxHp) * 100;
    const ammoPct = (p.reloading > 0 ? 0 : p.ammo / p.weapon.mag) * 100;

    // count forces
    const myTeam = p.team;
    let allies = 0, enemies = 0;
    for (const c of G.combatants) { if (!c.alive) continue; if (c.team === myTeam) allies++; else enemies++; }

    hud.innerHTML =
      `<div class="hud-block">
        <div class="hud-title">${p.name} — ${p.faction.name}</div>
        <div class="bar hp"><i style="width:${hpPct}%"></i></div>
        <div style="margin-top:6px">${p.weapon.name}</div>
        <div class="bar ammo"><i style="width:${ammoPct}%"></i></div>
        <div style="font-size:12px;margin-top:4px;color:#8b949e">${p.reloading > 0 ? "Reloading…" : p.ammo + " / " + p.weapon.mag}</div>
      </div>` +
      `<div class="hud-block">
        <div class="hud-title">Forces</div>
        <div>Allies: ${allies}</div>
        <div>Enemies: ${enemies}</div>
        <div style="margin-top:4px">Kills: ${p.kills}</div>
      </div>` +
      `<div class="hud-block">
        <div class="hud-title">Controls</div>
        <div style="font-size:12px;color:#8b949e">${p.scheme === "wasd"
          ? "WASD move · Mouse aim · Click/Space fire · R reload · Q swap"
          : "Arrows move · Auto-aim · Enter fire · / reload"}</div>
      </div>`;
  }

  // ---------------- public API ----------------
  IF.startGame = function (config) {
    G.canvas = document.getElementById("game-canvas");
    G.ctx = G.canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    IF.bindMouse(G.canvas);

    G.config = config;
    G.players = []; G.soldiers = []; G.bullets = []; G.over = false;
    G.world = makeWorld(G.canvas.width, G.canvas.height);
    document.getElementById("game-message").classList.add("hidden");

    // Spawn per configured players.
    config.players.forEach((cfg, idx) => {
      const p = spawnPlayer(cfg.team, cfg, cfg.side, G.world);
      p.controlledLocally = cfg.controlledLocally !== false;
      if (cfg.local) G.localPlayer = p;
      spawnArmy(cfg.team, cfg.army, cfg.side, G.world);
    });
    if (!G.localPlayer) G.localPlayer = G.players[0];

    // Extra enemy AI army (single player, or an online garrison). Always spawn it
    // on the team OPPOSITE the local player so team-1 players get real opponents.
    if (config.enemyArmy) {
      const enemyTeam = G.localPlayer ? (1 - G.localPlayer.team) : 1;
      spawnArmy(enemyTeam, config.enemyArmy, enemyTeam % 2, G.world);
    }

    rebuildCombatants();

    if (config.mode === "online" && IF.net) IF.net.begin(G, config);

    G.running = true;
    G.last = performance.now();
    G.raf = requestAnimationFrame(step);
  };

  IF.stopGame = function () {
    G.running = false;
    cancelAnimationFrame(G.raf);
    window.removeEventListener("resize", resize);
    if (IF.net && IF.net.active) IF.net.end();
  };

  IF.gameRef = G; // exposed for net.js

  function resize() {
    if (!G.canvas) return;
    G.canvas.width = window.innerWidth;
    G.canvas.height = window.innerHeight;
    if (G.world) { G.world.w = G.canvas.width; G.world.h = G.canvas.height; }
  }
})(window);
