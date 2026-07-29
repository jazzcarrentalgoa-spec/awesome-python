/* Menu flow, screen management, loadout & army UI, match configuration. */
(function (root) {
  const IF = root.IF || (root.IF = {});

  IF.state = {
    screen: "menu",
    mode: "single",
    players: [],        // configs being built
    configuring: 0,     // index of the player currently being configured
    toConfigure: 1,     // how many players need configuring for this mode
    online: null,       // { id, team } once connected
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  IF.showScreen = function (name) {
    IF.state.screen = name;
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = document.getElementById("screen-" + name);
    if (el) el.classList.add("active");
  };

  function freshPlayerConfig(i) {
    return {
      name: i === 0 ? "Player 1" : "Player 2",
      loadout: IF.defaultLoadout(),
      army: IF.defaultArmy(),
      scheme: i === 0 ? "wasd" : "arrows",
    };
  }

  // ---------------- menu ----------------
  function initMenu() {
    $$("#screen-menu [data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        IF.state.mode = mode;
        if (mode === "online") { IF.showScreen("online"); return; }
        IF.state.toConfigure = mode === "local" ? 2 : 1;
        IF.state.players = [];
        for (let i = 0; i < IF.state.toConfigure; i++) IF.state.players.push(freshPlayerConfig(i));
        IF.state.configuring = 0;
        openLoadout();
      });
    });

    // generic back / nav buttons
    $$("[data-nav]").forEach((btn) => btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      if (target === "menu") { IF.stopGame && IF.stopGame(); }
      IF.showScreen(target);
    }));
  }

  // ---------------- loadout ----------------
  function openLoadout() {
    const cfg = IF.state.players[IF.state.configuring];
    $("#loadout-player-label").textContent = cfg.name;
    renderWeaponList("#primary-list", cfg, "primary");
    renderWeaponList("#secondary-list", cfg, "secondary");
    renderArmorList(cfg);
    renderPerkList(cfg);
    updateLoadoutSummary(cfg);
    IF.showScreen("loadout");
  }

  function optionEl(selected, html) {
    const div = document.createElement("div");
    div.className = "option" + (selected ? " selected" : "");
    div.innerHTML = html;
    return div;
  }

  function renderWeaponList(sel, cfg, slot) {
    const list = $(sel); list.innerHTML = "";
    Object.entries(IF.WEAPONS).forEach(([key, w]) => {
      const el = optionEl(cfg.loadout[slot] === key,
        `<div class="opt-name">${w.name}</div>
         <div class="opt-desc">${w.desc}</div>
         <div class="opt-stats">
           <span class="stat-chip">DMG ${w.damage}</span>
           <span class="stat-chip">ROF ${w.fireRate}/s</span>
           <span class="stat-chip">MAG ${w.mag}</span>
           ${w.pellets > 1 ? `<span class="stat-chip">x${w.pellets}</span>` : ""}
         </div>`);
      el.addEventListener("click", () => {
        cfg.loadout[slot] = key;
        renderWeaponList(sel, cfg, slot);
        updateLoadoutSummary(cfg);
      });
      list.appendChild(el);
    });
  }

  function renderArmorList(cfg) {
    const list = $("#armor-list"); list.innerHTML = "";
    Object.entries(IF.ARMOR).forEach(([key, a]) => {
      const el = optionEl(cfg.loadout.armor === key,
        `<div class="opt-name">${a.name}</div>
         <div class="opt-desc">${a.desc}</div>
         <div class="opt-stats"><span class="stat-chip">HP ${a.hp}</span>
           <span class="stat-chip">SPD x${a.speedMul}</span></div>`);
      el.addEventListener("click", () => { cfg.loadout.armor = key; renderArmorList(cfg); updateLoadoutSummary(cfg); });
      list.appendChild(el);
    });
  }

  function renderPerkList(cfg) {
    const list = $("#perk-list"); list.innerHTML = "";
    Object.entries(IF.PERKS).forEach(([key, p]) => {
      const el = optionEl(cfg.loadout.perk === key,
        `<div class="opt-name">${p.name}</div><div class="opt-desc">${p.desc}</div>`);
      el.addEventListener("click", () => { cfg.loadout.perk = key; renderPerkList(cfg); updateLoadoutSummary(cfg); });
      list.appendChild(el);
    });
  }

  function updateLoadoutSummary(cfg) {
    const r = IF.resolveLoadout(cfg.loadout);
    $("#loadout-summary").innerHTML =
      `<strong>${IF.WEAPONS[cfg.loadout.primary].name}</strong> + ${IF.WEAPONS[cfg.loadout.secondary].name}
       · ${r.maxHp} HP · ${IF.PERKS[cfg.loadout.perk].name}`;
  }

  // ---------------- army ----------------
  function openArmy() {
    const cfg = IF.state.players[IF.state.configuring];
    $("#army-player-label").textContent = cfg.name;
    renderFactionList(cfg);
    renderUnitList(cfg);
    renderSquad(cfg);
    IF.showScreen("army");
  }

  function renderFactionList(cfg) {
    const list = $("#faction-list"); list.innerHTML = "";
    Object.entries(IF.FACTIONS).forEach(([key, f]) => {
      const el = optionEl(cfg.army.faction === key,
        `<div class="opt-name" style="color:${f.color}">${f.name}</div>
         <div class="opt-desc">${f.desc}</div>`);
      el.style.flex = "1 1 180px";
      el.addEventListener("click", () => { cfg.army.faction = key; renderFactionList(cfg); });
      list.appendChild(el);
    });
  }

  function renderUnitList(cfg) {
    const list = $("#unit-list"); list.innerHTML = "";
    Object.entries(IF.UNITS).forEach(([key, u]) => {
      const el = optionEl(false,
        `<div class="opt-name">${u.name}<span class="opt-cost">${u.cost} pts</span></div>
         <div class="opt-desc">${u.desc}</div>
         <div class="opt-stats">
           <span class="stat-chip">HP ${u.hp}</span>
           <span class="stat-chip">DMG ${u.damage}</span>
           <span class="stat-chip">RNG ${u.range}</span>
         </div>`);
      el.addEventListener("click", () => {
        const cost = IF.squadCost(cfg.army.squad);
        if (cost + u.cost <= IF.ARMY_BUDGET) { cfg.army.squad.push(key); renderSquad(cfg); }
        else flashBudget();
      });
      list.appendChild(el);
    });
  }

  function renderSquad(cfg) {
    const ul = $("#squad-list"); ul.innerHTML = "";
    if (cfg.army.squad.length === 0) {
      ul.innerHTML = `<div class="squad-empty">No units deployed yet. Click units to add them.</div>`;
    }
    cfg.army.squad.forEach((key, idx) => {
      const u = IF.UNITS[key];
      const li = document.createElement("li");
      li.innerHTML = `<span>${u.name} <small style="color:#8b949e">(${u.cost})</small></span>`;
      const rm = document.createElement("button");
      rm.className = "remove"; rm.textContent = "×";
      rm.addEventListener("click", () => { cfg.army.squad.splice(idx, 1); renderSquad(cfg); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    const cost = IF.squadCost(cfg.army.squad);
    $("#budget-fill").style.width = (cost / IF.ARMY_BUDGET * 100) + "%";
    $("#budget-text").textContent = `${cost} / ${IF.ARMY_BUDGET}`;
    $("#army-summary").textContent =
      `${IF.FACTIONS[cfg.army.faction].name} · ${cfg.army.squad.length} units · ${cost}/${IF.ARMY_BUDGET} pts`;
  }

  let flashT;
  function flashBudget() {
    const t = $("#budget-text");
    t.style.color = "#f85149";
    clearTimeout(flashT);
    flashT = setTimeout(() => { t.style.color = ""; }, 400);
  }

  // ---------------- transitions ----------------
  function loadoutNext() { openArmy(); }

  function armyNext() {
    // Advance to next player, or launch.
    if (IF.state.configuring < IF.state.toConfigure - 1) {
      IF.state.configuring++;
      openLoadout();
    } else {
      launch();
    }
  }

  function launch() {
    const s = IF.state;
    const config = { mode: s.mode, players: [] };

    if (s.mode === "single") {
      const p = s.players[0];
      config.players.push({ ...p, team: 0, side: 0, local: true, controlledLocally: true });
      // Enemy AI army on team 1 with an opposing faction.
      config.enemyArmy = pickEnemyArmy(p.army.faction);
    } else if (s.mode === "local") {
      config.players.push({ ...s.players[0], team: 0, side: 0, local: true, controlledLocally: true });
      config.players.push({ ...s.players[1], team: 1, side: 1, local: false, controlledLocally: true });
    } else if (s.mode === "online") {
      const p = s.players[0];
      const team = s.online ? s.online.team : 0;
      config.players.push({ ...p, team, side: team % 2, local: true, controlledLocally: true });
      // If server present, remote players join dynamically. Add a small AI garrison
      // on the opposing team so a solo-connected player still has something to fight.
      config.enemyArmy = pickEnemyArmy(p.army.faction);
    }

    IF.showScreen("game");
    IF.startGame(config);
  }

  function pickEnemyArmy(playerFaction) {
    const others = Object.keys(IF.FACTIONS).filter((k) => k !== playerFaction);
    const faction = others[0] || "legion";
    return { faction, squad: ["rifleman", "rifleman", "heavy", "scout", "sniper", "medic"] };
  }

  // ---------------- online ----------------
  function initOnline() {
    $("#online-connect").addEventListener("click", async () => {
      const url = $("#server-url").value.trim();
      const room = $("#room-code").value.trim() || "arena-1";
      const name = $("#callsign").value.trim() || "Soldier";
      const status = $("#online-status");
      status.className = "status";
      status.textContent = "Connecting…";
      try {
        const res = await IF.net.connect(url, room, name);
        IF.state.online = res;
        status.className = "status ok";
        status.textContent = `Connected — team ${res.team}. Configure your loadout…`;
        setTimeout(() => proceedOnline(name), 500);
      } catch (e) {
        status.className = "status err";
        status.textContent = "No server reachable — starting offline match vs bots.";
        IF.state.online = null;
        setTimeout(() => proceedOnline(name), 900);
      }
    });
  }

  function proceedOnline(name) {
    IF.state.mode = "online";
    IF.state.toConfigure = 1;
    IF.state.players = [freshPlayerConfig(0)];
    IF.state.players[0].name = name;
    IF.state.configuring = 0;
    openLoadout();
  }

  // ---------------- boot ----------------
  window.addEventListener("DOMContentLoaded", () => {
    initMenu();
    initOnline();
    $("#loadout-next").addEventListener("click", loadoutNext);
    $("#army-next").addEventListener("click", armyNext);
    IF.showScreen("menu");
  });
})(window);
