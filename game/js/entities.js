/* Game entities: Bullet, Soldier (AI squad unit), Player. */
(function (root) {
  const IF = root.IF || (root.IF = {});

  const TAU = Math.PI * 2;
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  IF.util = { dist2, clamp, TAU };

  // ---------------- Bullet ----------------
  class Bullet {
    constructor(x, y, angle, speed, damage, range, team, owner, color) {
      this.x = x; this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.damage = damage;
      this.team = team;
      this.owner = owner;
      this.color = color || "#ffd479";
      this.life = range / speed; // seconds until it expires
      this.alive = true;
      this.radius = 3;
    }
    update(dt, world) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0) { this.alive = false; return; }
      if (this.x < 0 || this.y < 0 || this.x > world.w || this.y > world.h) { this.alive = false; return; }
      // walls
      for (const wall of world.walls) {
        if (this.x > wall.x && this.x < wall.x + wall.w && this.y > wall.y && this.y < wall.y + wall.h) {
          this.alive = false; return;
        }
      }
    }
    draw(ctx) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, TAU);
      ctx.fill();
    }
  }

  // ---------------- Combatant base ----------------
  class Combatant {
    constructor(x, y, team, opts) {
      this.x = x; this.y = y;
      this.team = team;
      this.angle = 0;
      this.radius = opts.radius || 13;
      this.maxHp = opts.hp;
      this.hp = opts.hp;
      this.speed = opts.speed;
      this.color = opts.color;
      this.alive = true;
      this.cooldown = 0;
    }
    takeDamage(d) {
      if (!this.alive) return;
      this.hp -= d;
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }
    collideWalls(world, nx, ny) {
      // Axis-separated resolution against rectangular walls.
      let x = nx, y = ny, r = this.radius;
      for (const wall of world.walls) {
        const cx = clamp(x, wall.x, wall.x + wall.w);
        const cy = clamp(y, wall.y, wall.y + wall.h);
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          y = cy + (dy / d) * r;
        }
      }
      x = clamp(x, r, world.w - r);
      y = clamp(y, r, world.h - r);
      return [x, y];
    }
  }

  // ---------------- AI Soldier ----------------
  class Soldier extends Combatant {
    constructor(x, y, team, def, faction, color) {
      const hp = Math.round(def.hp * faction.hpMul);
      super(x, y, team, { hp, speed: def.speed * faction.speedMul, radius: def.radius, color });
      this.def = def;
      this.faction = faction;
      this.damage = def.damage * faction.damageMul;
      this.range = def.range;
      this.fireInterval = 1 / def.fireRate;
      this.heal = def.heal || 0;
      this.healTimer = 0;
      this.wander = Math.random() * TAU;
      this.wanderTimer = 0;
    }
    update(dt, world) {
      if (!this.alive) return;
      this.cooldown -= dt;

      // Medic: periodically heal nearby friendlies.
      if (this.heal) {
        this.healTimer -= dt;
        if (this.healTimer <= 0) {
          this.healTimer = 1;
          for (const f of world.combatants()) {
            if (f.team === this.team && f.alive && f !== this && dist2(this.x, this.y, f.x, f.y) < 140 * 140) {
              f.hp = Math.min(f.maxHp, f.hp + this.heal);
            }
          }
        }
      }

      // Target the nearest living enemy.
      let target = null, best = Infinity;
      for (const e of world.combatants()) {
        if (e.team === this.team || !e.alive) continue;
        const d = dist2(this.x, this.y, e.x, e.y);
        if (d < best) { best = d; target = e; }
      }

      let mvx = 0, mvy = 0;
      if (target) {
        const d = Math.sqrt(best);
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        const ideal = this.range * 0.7;
        if (d > ideal + 20) { mvx = Math.cos(this.angle); mvy = Math.sin(this.angle); }
        else if (d < ideal - 60) { mvx = -Math.cos(this.angle); mvy = -Math.sin(this.angle); }
        else {
          // strafe
          mvx = Math.cos(this.angle + Math.PI / 2);
          mvy = Math.sin(this.angle + Math.PI / 2);
        }
        if (d < this.range && this.cooldown <= 0) {
          this.cooldown = this.fireInterval;
          const spread = (Math.random() - 0.5) * 0.12;
          world.spawnBullet(new Bullet(
            this.x + Math.cos(this.angle) * (this.radius + 4),
            this.y + Math.sin(this.angle) * (this.radius + 4),
            this.angle + spread, 640, this.damage, this.range, this.team, this,
            this.faction.color));
        }
      } else {
        // No enemies: wander a little.
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) { this.wander = Math.random() * TAU; this.wanderTimer = 1.5 + Math.random(); }
        mvx = Math.cos(this.wander) * 0.4; mvy = Math.sin(this.wander) * 0.4;
      }

      const len = Math.hypot(mvx, mvy) || 1;
      const nx = this.x + (mvx / len) * this.speed * dt;
      const ny = this.y + (mvy / len) * this.speed * dt;
      [this.x, this.y] = this.collideWalls(world, nx, ny);
    }
    draw(ctx) {
      if (!this.alive) return;
      drawUnit(ctx, this, false);
    }
  }

  // ---------------- Player ----------------
  class Player extends Combatant {
    constructor(x, y, team, loadout, army, color, scheme, name) {
      const res = IF.resolveLoadout(loadout);
      const faction = IF.FACTIONS[army.faction];
      const hp = Math.round(res.maxHp * faction.hpMul);
      super(x, y, team, { hp, speed: 180 * res.speedMul * faction.speedMul, radius: 14, color });
      this.name = name || "Player";
      this.res = res;
      this.faction = faction;
      this.scheme = scheme;         // control scheme (see input handling in game.js)
      this.weapons = [res.primary, res.secondary];
      this.weaponIndex = 0;
      this.ammo = this.weapon.mag;
      this.reloading = 0;
      this.regen = res.regen;
      this.outOfCombat = 0;
      this.kills = 0;
      this.respawnTimer = 0;
    }
    get weapon() { return this.weapons[this.weaponIndex]; }
    switchWeapon() {
      this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
      this.ammo = this.weapon.mag;
      this.reloading = 0;
    }
    startReload() {
      if (this.reloading > 0 || this.ammo === this.weapon.mag) return;
      this.reloading = this.weapon.reload * this.res.reloadMul;
    }
    tryShoot(world) {
      if (!this.alive || this.reloading > 0 || this.cooldown > 0) return;
      if (this.ammo <= 0) { this.startReload(); return; }
      this.cooldown = 1 / this.weapon.fireRate;
      this.ammo--;
      this.outOfCombat = 0;
      const w = this.weapon;
      const spread = w.spread * this.res.spreadMul;
      for (let p = 0; p < w.pellets; p++) {
        const a = this.angle + (Math.random() - 0.5) * spread * 2;
        world.spawnBullet(new Bullet(
          this.x + Math.cos(this.angle) * (this.radius + 5),
          this.y + Math.sin(this.angle) * (this.radius + 5),
          a, w.speed, w.damage * this.faction.damageMul, w.range, this.team, this, "#ffe08a"));
      }
      if (this.ammo <= 0) this.startReload();
    }
    update(dt, world, move) {
      if (!this.alive) return;
      this.cooldown -= dt;
      this.outOfCombat += dt;
      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0) { this.reloading = 0; this.ammo = this.weapon.mag; }
      }
      // Passive regen perk.
      if (this.regen && this.outOfCombat > 3 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
      }
      const len = Math.hypot(move.x, move.y);
      if (len > 0.001) {
        const nx = this.x + (move.x / len) * this.speed * dt;
        const ny = this.y + (move.y / len) * this.speed * dt;
        [this.x, this.y] = this.collideWalls(world, nx, ny);
      }
    }
    takeDamage(d) { super.takeDamage(d); this.outOfCombat = 0; }
    draw(ctx) {
      if (!this.alive) return;
      drawUnit(ctx, this, true);
      // name tag
      ctx.fillStyle = "#e6edf3";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(this.name, this.x, this.y - this.radius - 8);
    }
  }

  // Shared unit renderer: body, direction barrel, and a small health ring.
  function drawUnit(ctx, u, isPlayer) {
    ctx.save();
    // health ring
    const pct = u.hp / u.maxHp;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius + 4, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
    ctx.strokeStyle = pct > 0.5 ? "#3fb950" : pct > 0.25 ? "#d29922" : "#f85149";
    ctx.lineWidth = 3;
    ctx.stroke();

    // body
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius, 0, TAU);
    ctx.fillStyle = u.color;
    ctx.fill();
    ctx.lineWidth = isPlayer ? 3 : 1.5;
    ctx.strokeStyle = isPlayer ? "#ffffff" : "rgba(0,0,0,.5)";
    ctx.stroke();

    // barrel / facing
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x + Math.cos(u.angle) * (u.radius + 8), u.y + Math.sin(u.angle) * (u.radius + 8));
    ctx.strokeStyle = "#0d1117";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  IF.Bullet = Bullet;
  IF.Soldier = Soldier;
  IF.Player = Player;
})(window);
