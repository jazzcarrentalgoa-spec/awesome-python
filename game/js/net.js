/* Online multiplayer client — a lightweight relay over WebSocket.
 * Each client is authoritative over its own player and broadcasts state + shots.
 * Remote players are rendered from network state; their bullets are spawned locally.
 * If the server is unreachable, main.js falls back to offline bots. */
(function (root) {
  const IF = root.IF || (root.IF = {});

  const net = {
    active: false,
    ws: null,
    id: null,
    team: 0,
    room: null,
    name: "Soldier",
    peers: Object.create(null),   // peerId -> remote Player entity
    _syncAccum: 0,
    _pending: null,
  };

  // Connect and join a room. Resolves with { id, team } on success.
  net.connect = function (url, room, name) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return reject(e); }
      const timeout = setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error("timeout")); }, 4000);

      ws.onopen = () => { ws.send(JSON.stringify({ t: "join", room, name })); };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error("connection error")); };
      ws.onclose = () => { if (!net.active) { clearTimeout(timeout); reject(new Error("closed")); } };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (msg.t === "welcome") {
          clearTimeout(timeout);
          net.ws = ws; net.id = msg.id; net.team = msg.team; net.room = room; net.name = name;
          resolve({ id: msg.id, team: msg.team });
        }
      };
    });
  };

  // Wire the connection into a running game instance.
  net.begin = function (G, config) {
    if (!net.ws) return; // no server: offline fallback already chosen upstream
    net.active = true;
    const world = G.world;

    net.ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      switch (msg.t) {
        case "state": {
          if (msg.id === net.id) return;
          let peer = net.peers[msg.id];
          if (!peer) {
            peer = new IF.Player(msg.x, msg.y, msg.team,
              IF.defaultLoadout(), { faction: msg.faction || "legion", squad: [] },
              (IF.FACTIONS[msg.faction] || IF.FACTIONS.legion).color, null, msg.name || "Enemy");
            peer.controlledLocally = false;
            net.peers[msg.id] = peer;
            G.players.push(peer);
          }
          peer.x = msg.x; peer.y = msg.y; peer.angle = msg.a;
          peer.hp = msg.hp; peer.maxHp = msg.mhp; peer.alive = msg.alive;
          peer.name = msg.name || peer.name;
          break;
        }
        case "shot": {
          if (msg.id === net.id) return;
          world.spawnBullet(new IF.Bullet(msg.x, msg.y, msg.a, msg.speed, msg.dmg, msg.range, msg.team, null, "#ff9db1"));
          break;
        }
        case "leave": {
          const peer = net.peers[msg.id];
          if (peer) { peer.alive = false; delete net.peers[msg.id]; }
          break;
        }
      }
    };

    // Broadcast our shots by wrapping tryShoot.
    const lp = G.localPlayer;
    if (lp) {
      const origShoot = lp.tryShoot.bind(lp);
      lp.tryShoot = function (w) {
        const before = this.ammo, cd = this.cooldown, rl = this.reloading;
        origShoot(w);
        // fired if a shot actually went out this call
        if (this.ammo < before || (before === this.weapon.mag && this.cooldown !== cd && rl <= 0)) {
          net.send({ t: "shot", id: net.id, team: this.team,
            x: this.x + Math.cos(this.angle) * (this.radius + 5),
            y: this.y + Math.sin(this.angle) * (this.radius + 5),
            a: this.angle, speed: this.weapon.speed,
            dmg: this.weapon.damage * this.faction.damageMul, range: this.weapon.range });
        }
      };
    }
  };

  net.sync = function (lp) {
    if (!net.active || !net.ws || !lp) return;
    net._syncAccum += 1;
    if (net._syncAccum < 2) return; // ~ every other frame
    net._syncAccum = 0;
    net.send({ t: "state", id: net.id, team: lp.team, name: lp.name,
      faction: factionKeyOf(lp), x: lp.x, y: lp.y, a: lp.angle,
      hp: lp.hp, mhp: lp.maxHp, alive: lp.alive });
  };

  function factionKeyOf(p) {
    for (const k in IF.FACTIONS) if (IF.FACTIONS[k] === p.faction) return k;
    return "vanguard";
  }

  net.send = function (obj) {
    if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(obj));
  };

  net.end = function () {
    net.active = false;
    try { if (net.ws) { net.send({ t: "leave", id: net.id }); net.ws.close(); } } catch (_) {}
    net.ws = null; net.peers = Object.create(null);
  };

  IF.net = net;
})(window);
