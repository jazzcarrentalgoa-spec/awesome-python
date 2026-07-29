/* Loadout definitions: weapons, armor, perks.
 * Exposed on the global IF (IronFront) namespace so classic <script> tags can share state. */
(function (root) {
  const IF = root.IF || (root.IF = {});

  // Weapon stats:
  //  damage   - per projectile
  //  fireRate - shots per second
  //  spread   - radians of random cone (0 = perfectly accurate)
  //  speed    - projectile speed (px/s)
  //  range    - projectile lifetime in px before it dies
  //  mag      - magazine size
  //  reload   - reload time in seconds
  //  pellets  - projectiles per shot (shotgun)
  IF.WEAPONS = {
    pistol:   { name: "M9 Pistol",     damage: 18, fireRate: 5,  spread: 0.04, speed: 620, range: 620, mag: 12, reload: 1.1, pellets: 1, desc: "Reliable sidearm. Balanced all-rounder." },
    rifle:    { name: "AK Rifle",      damage: 14, fireRate: 9,  spread: 0.07, speed: 720, range: 780, mag: 30, reload: 1.8, pellets: 1, desc: "Automatic fire, strong sustained damage." },
    smg:      { name: "MP5 SMG",       damage: 10, fireRate: 14, spread: 0.10, speed: 680, range: 560, mag: 32, reload: 1.5, pellets: 1, desc: "Very high rate of fire, shorter range." },
    shotgun:  { name: "M870 Shotgun",  damage: 9,  fireRate: 1.6,spread: 0.28, speed: 640, range: 380, mag: 6,  reload: 2.2, pellets: 7, desc: "Devastating up close, spreads wide." },
    sniper:   { name: "SVD Sniper",    damage: 75, fireRate: 1.1,spread: 0.0,  speed: 1100,range: 1400,mag: 5,  reload: 2.6, pellets: 1, desc: "One-shot punch at long range." },
    knife:    { name: "Combat Knife",  damage: 45, fireRate: 3,  spread: 0.0,  speed: 300, range: 60,  mag: 999,reload: 0,   pellets: 1, desc: "Melee only. Infinite, but you must be close." },
  };

  IF.ARMOR = {
    light:  { name: "Light Vest",  hp: 100, speedMul: 1.15, desc: "Fast and nimble, minimal protection." },
    medium: { name: "Combat Vest", hp: 140, speedMul: 1.0,  desc: "Balanced protection and mobility." },
    heavy:  { name: "Riot Armor",  hp: 200, speedMul: 0.82, desc: "Heavy plating, slower movement." },
  };

  IF.PERKS = {
    none:     { name: "None",        desc: "No perk." },
    regen:    { name: "Field Medic", desc: "Slowly regenerate health out of combat.", regen: 8 },
    scavenger:{ name: "Scavenger",   desc: "Reloads are 35% faster.", reloadMul: 0.65 },
    juggernaut:{name: "Juggernaut",  desc: "+25% maximum health.", hpMul: 1.25 },
    marksman: { name: "Marksman",    desc: "Weapon spread reduced by 40%.", spreadMul: 0.6 },
  };

  // A fresh default loadout.
  IF.defaultLoadout = function () {
    return { primary: "rifle", secondary: "pistol", armor: "medium", perk: "none" };
  };

  // Resolve a loadout selection into concrete combat stats.
  IF.resolveLoadout = function (lo) {
    const armor = IF.ARMOR[lo.armor];
    const perk = IF.PERKS[lo.perk] || IF.PERKS.none;
    let maxHp = armor.hp;
    if (perk.hpMul) maxHp = Math.round(maxHp * perk.hpMul);
    return {
      maxHp,
      speedMul: armor.speedMul,
      reloadMul: perk.reloadMul || 1,
      spreadMul: perk.spreadMul || 1,
      regen: perk.regen || 0,
      primary: IF.WEAPONS[lo.primary],
      secondary: IF.WEAPONS[lo.secondary],
    };
  };
})(window);
