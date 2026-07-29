/* Army setup definitions: factions and deployable squad units. */
(function (root) {
  const IF = root.IF || (root.IF = {});

  // Factions apply team-wide modifiers and a color identity.
  IF.FACTIONS = {
    vanguard: { name: "Vanguard",  color: "#58a6ff", damageMul: 1.0,  hpMul: 1.0,  speedMul: 1.0,  desc: "Balanced professional army." },
    legion:   { name: "Red Legion",color: "#f85149", damageMul: 1.15, hpMul: 0.95, speedMul: 1.0,  desc: "Aggressive: hits harder, slightly fragile." },
    sentinel: { name: "Sentinel",  color: "#3fb950", damageMul: 0.9,  hpMul: 1.25, speedMul: 0.95, desc: "Defensive: tanky and durable." },
    phantom:  { name: "Phantom",   color: "#a371f7", damageMul: 1.0,  hpMul: 0.9,  speedMul: 1.2,  desc: "Fast strike force, low armor." },
  };

  // Deployable AI units. cost is spent from the deployment budget.
  IF.UNITS = {
    rifleman: { name: "Rifleman", cost: 3, hp: 90,  speed: 90,  damage: 12, fireRate: 3.5, range: 420, radius: 12, desc: "Standard infantry. Cheap and dependable." },
    heavy:    { name: "Heavy",    cost: 6, hp: 180, speed: 62,  damage: 20, fireRate: 2.2, range: 380, radius: 15, desc: "Slow, tough, heavy hitter." },
    scout:    { name: "Scout",    cost: 4, hp: 70,  speed: 140, damage: 9,  fireRate: 5.0, range: 340, radius: 10, desc: "Fast flanker with rapid fire." },
    sniper:   { name: "Sniper",   cost: 5, hp: 60,  speed: 75,  damage: 55, fireRate: 0.9, range: 720, radius: 10, desc: "Long range, high damage, low fire rate." },
    medic:    { name: "Medic",    cost: 5, hp: 100, speed: 100, damage: 6,  fireRate: 2.0, range: 300, radius: 12, heal: 14, desc: "Heals nearby friendly units over time." },
  };

  IF.ARMY_BUDGET = 20;

  IF.defaultArmy = function () {
    return { faction: "vanguard", squad: ["rifleman", "rifleman", "heavy", "sniper"] };
  };

  IF.squadCost = function (squad) {
    return squad.reduce((sum, key) => sum + (IF.UNITS[key] ? IF.UNITS[key].cost : 0), 0);
  };
})(window);
