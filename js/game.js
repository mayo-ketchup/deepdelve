/* Deepdelve - core game logic.
 * No DOM access in this file, so it can run in Node for balance simulations.
 * All tuning numbers live in CONFIG / CLASSES / SPELLS / ATTR / COMPANIONS / ZONES / RARITIES / STAT_DEFS / RECIPES. */
(function (root) {
  'use strict';

  const CONFIG = {
    killsPerFloor: 8,
    bossEvery: 10,            // also the checkpoint spacing: you can set out from floor 1, 11, 21...
    zoneLength: 50,           // floors per zone (Woods, Swamp, Catacombs, Castle, Outer Realm)
    bossTime: 30,             // seconds to defeat a boss
    guardianTime: 45,         // seconds to defeat a zone guardian (every 50th floor)
    spawnDelay: 0.8,          // pause between monsters
    enterTime: 0.5,           // monster walk-in time before combat starts
    heroRegen: 0.003,         // fraction of max HP regenerated per second while delving
    restRate: 0.05,           // fraction of max HP healed per second while resting in town
    deathGoldLoss: 0.10,      // fraction of carried gold lost when the hero dies
    monsterAttackInterval: 1.6,
    // Monsters grow a little each floor and jump at each new realm (every zoneLength floors).
    monsterHpGrowth: 1.09,
    monsterAtkGrowth: 1.045,
    monsterGoldBase: 0.25,
    monsterGoldGrowth: 1.09,
    zoneHpJump: 3,            // extra multiplier at the start of each new realm
    zoneAtkJump: 2,
    zoneGoldJump: 3,
    critMult: 2.5,
    critCap: 0.75,
    evadeCap: 0.75,
    blockCap: 0.75,
    tapMult: 0.25,            // tap damage = hero attack * tapMult
    tapCooldown: 0.2,
    offlineCapHours: 8,
    offlineEfficiency: 0.35,
    prestigeFloor: 251,       // retiring unlocks once you've beaten the Outer Realm guardian (floor 250)
    gemBonus: 0.02,           // each Soul Gem: +2% damage, health, gold, companion DPS
    gemPow: 2,                // Soul Gems owed for your deepest floor ever: (floor / 10) ^ gemPow
    spellCooldown: 5,         // mage: seconds between spells before Arcane Focus
    dropChance: 0.06,         // chance a normal monster drops gear (bosses always drop)
    bagSize: 24,
    merchantSize: 5,          // items for sale in town
    // hero levels: XP from kills, points to assign
    pointsPerLevel: 3,
    heroMaxLevel: 999,
    heroXpBase: 90,           // XP from level 1 to 2...
    heroXpGrowth: 1.02,       // ...and each level needs 2% more (kept gentle: monster XP comes from killsPerLevel below)
    // Monster XP is derived from a pacing target: a hero at the expected level for a floor needs
    // killsPerLevel kills to level up there (rising from Start to End by floor 250; boss x5, guardian x15).
    // Below the expected level you catch up faster; above it, slower.
    levelsPerFloor: 0.95,
    killsPerLevelStart: 210,
    killsPerLevelEnd: 290,
    attrGrowth: 1.07,         // Strength / Vitality compound by this per point...
    dmgBase: 3, dmgPerPoint: 0.3,   // ...on top of a flat base + per-point amount
    hpBase: 30, hpPerPoint: 3,
    agiSpeed: 0.03,           // +3% attack speed per Agility point...
    agiSpeedCap: 1.5,         // ...up to +150%
    focCrit: 0.01,            // +1% crit per Focus point
    focBlock: 0.01,           // Knight: +1% block per Focus point
    focDodge: 0.0075,         // Ranger: +0.75% dodge per Focus point
    focSpell: 0.02,           // Mage: spells 2% faster per Focus point
    respecMult: 25,           // respec cost = 25 kills' worth of gold at your deepest floor this run
    // gold sinks
    enhanceMax: 10,
    enhanceStep: 0.08,        // each + adds 8% to all of an item's stats
    enhanceBase: 6,
    enhanceGrowth: 1.6,       // each step costs this much more
    enhanceChance: [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],   // success chance for +1 ... +10 (failing only costs gold)
    craftFeeMult: 2,          // forge fee per craft, scaled by item level and quality
    merchantRestock: 600,     // seconds of play between free restocks
    merchantMarkup: 8,        // shop price = salvage value x markup
    skillCap: 60,             // max level for life skills
    skillCapBase: 10,         // life skill level cap before beating the first zone guardian...
    skillCapPerZone: 10,      // ...raised by this much for each zone guardian beaten (floor 50, 100, ...)
    gatherHeal: 0.02,         // fraction of max HP healed per second while gathering (it's safe out there)
    gatherOfflineEfficiency: 0.5,   // also used for offline crafting
    gatherLuckPerLevel: 0.001,      // +0.1% luck per gathering level (better material quality)
    gatherDoublePerLevel: 0.005,    // +0.5% chance per level to gather 2 at once
    qualityUnlock: [1, 1, 10, 25, 40],   // gathering level at which each quality can drop (Common..Legendary)
    masterworkPerLevel: 0.005,      // +0.5% chance per Crafting level that a piece comes out one rarity higher
    refineRatio: 4,                 // 4 materials of one quality refine into 1 of the next
    // energy: only life skills use it (gathering). Combat, crafting and cooking are free.
    energyBase: 300,
    energyPerGuardian: 60,          // max energy grows with each zone guardian beaten
    energyRegenHours: 1.5,          // a full bar regenerates in this long...
    energyRestMult: 1.5,            // ...and 1.5x faster resting in Hearthstead
    gatherEnergy: [1, 1.25, 1.5, 1.75, 2],   // energy per gather, by zone tier
    // meat: dropped by monsters, never gathered, so cooking always needs combat
    meatChance: 0.10,
    meatBoss: 2,
    meatGuardian: 5,
    // cooking
    cookBurnBase: 0.30,             // burn chance at a recipe's required level...
    cookBurnPerLevel: 0.015,        // ...minus this per level above it
    pantryBase: 10,                 // pantry holds pantryBase + (Cooking level - 1) meals
    mealTierBonus: 0.25,            // meals restore +25% per zone tier...
    mealQualityBonus: 0.15,         // ...and +15% per ingredient quality step
    // routines
    routineBaseSteps: 2,            // steps available at the start, +1 per zone guardian
    routineMaxSteps: 7,
    offlineReplay: 0.4,             // offline: the game replays this share of your time away
    offlineStep: 0.1                // seconds per simulated step during offline replay
  };

  // ---- classes ----
  // atk / hp / speed multiply what the hero's attributes give. dr = damage reduction.
  const CLASSES = {
    knight: {
      id: 'knight', name: 'Knight', role: 'Tank',
      desc: 'Normal damage, heavy armor. Takes 25% less damage and blocks 10% of hits outright.',
      atk: 1, hp: 1.5, speed: 1, dr: 0.25, block: 0.10, evade: 0, spells: false
    },
    ranger: {
      id: 'ranger', name: 'Ranger', role: 'Damage',
      desc: 'Highest damage. Shoots 40% faster and dodges 25% of attacks, but has a little less health.',
      atk: 1.1, hp: 0.9, speed: 1.4, dr: 0, block: 0, evade: 0.25, spells: false
    },
    mage: {
      id: 'mage', name: 'Mage', role: 'Caster',
      desc: 'Fragile, but casts Fireball, Frost Bolt and Chain Lightning between staff attacks.',
      atk: 0.85, hp: 0.95, speed: 0.9, dr: 0, block: 0, evade: 0.10, spells: true
    }
  };
  const CLASS_LIST = [CLASSES.knight, CLASSES.ranger, CLASSES.mage];

  // Mage spells cast in this order, one per spell cooldown. mult = x hero attack.
  const SPELLS = [
    { id: 'fire',  name: 'Fireball',        mult: 4 },
    { id: 'frost', name: 'Frost Bolt',      mult: 2.5, freeze: 2.5 },  // monster can't attack for `freeze` seconds
    { id: 'shock', name: 'Chain Lightning', mult: 1.2, hits: 3 }
  ];
  const SPELL_AVG = SPELLS.reduce((t, sp) => t + sp.mult * (sp.hits || 1), 0) / SPELLS.length;

  // ---- hero level & attributes ----
  // Combat XP raises the hero's level. Each level gives CONFIG.pointsPerLevel points the player assigns.
  const ATTRS = [
    { id: 'str', name: 'Strength', desc: 'More attack damage.' },
    { id: 'vit', name: 'Vitality', desc: 'More maximum health.' },
    { id: 'agi', name: 'Agility',  desc: 'Attack faster.' },
    { id: 'foc', name: 'Focus',    desc: 'More critical hits, and a stronger class perk.' }
  ];
  // The class perk that Focus strengthens.
  const FOCUS_PERK = { knight: 'Shield Wall (block)', ranger: 'Hawk Eye (dodge)', mage: 'Arcane Focus (spell speed)' };

  // What P points in an attribute give.
  const ATTR = {
    damage:  (P) => (CONFIG.dmgBase + CONFIG.dmgPerPoint * P) * Math.pow(CONFIG.attrGrowth, P),
    health:  (P) => (CONFIG.hpBase + CONFIG.hpPerPoint * P) * Math.pow(CONFIG.attrGrowth, P),
    speed:   (P) => 1 + Math.min(CONFIG.agiSpeedCap, P * CONFIG.agiSpeed),
    crit:    (P) => P * CONFIG.focCrit,
    block:   (P) => P * CONFIG.focBlock,
    dodge:   (P) => P * CONFIG.focDodge,
    spellCd: (P) => CONFIG.spellCooldown / (1 + P * CONFIG.focSpell)
  };

  // XP needed to go from level L to L + 1.
  function xpToLevel(L) { return Math.round(CONFIG.heroXpBase * Math.pow(CONFIG.heroXpGrowth, L - 1)); }

  const COMPANIONS = [
    { id: 'squire', name: 'Squire',          desc: 'Pokes things with a stick. Enthusiastically.', baseDps: 1,   baseCost: 80,     growth: 1.23 },
    { id: 'archer', name: 'Woodland Archer', desc: 'Never misses. Rarely, anyway.',                baseDps: 7,   baseCost: 1500,   growth: 1.24 },
    { id: 'mage',   name: 'Battle Mage',     desc: 'Fireballs first, questions later.',            baseDps: 45,  baseCost: 25000,  growth: 1.25 },
    { id: 'golem',  name: 'Stone Golem',     desc: 'Slow, steady, unstoppable.',                   baseDps: 320, baseCost: 500000, growth: 1.26 }
  ];

  function compDpsAt(c, L) { return c.baseDps * L * Math.pow(1.06, L); }

  // ---- zones & monsters ----
  // fly: hovers above the ground. hop: bounces.
  const MONSTERS = {
    goblin:     { name: 'Goblin',        boss: 'Goblin Warchief' },
    wolf:       { name: 'Timber Wolf',   boss: 'Pack Leader' },
    spider:     { name: 'Venom Spider',  boss: 'Brood Queen' },
    slime:      { name: 'Bog Slime',     boss: 'Slime King', hop: true },
    toad:       { name: 'Swamp Toad',    boss: 'Toad Tyrant', hop: true },
    snake:      { name: 'Marsh Viper',   boss: 'Serpent Matron' },
    skeleton:   { name: 'Skeleton',      boss: 'Bone Lord' },
    bat:        { name: 'Crypt Bat',     boss: 'Bat Matriarch', fly: true },
    ghost:      { name: 'Wailing Ghost', boss: 'Banshee', fly: true },
    darkknight: { name: 'Dark Knight',   boss: 'Black Templar' },
    gargoyle:   { name: 'Gargoyle',      boss: 'Gargoyle Sentinel', fly: true },
    imp:        { name: 'Imp',           boss: 'Imp Overlord' },
    eye:        { name: 'Watcher',       boss: 'Elder Watcher', fly: true },
    voidling:   { name: 'Voidling',      boss: 'Void Herald', fly: true },
    wisp:       { name: 'Star Wisp',     boss: 'Wisp Choir', fly: true }
  };

  // adj: words used to name gear that drops in the zone.
  const ZONES = [
    { id: 'woods',     name: 'Whispering Woods',    mobs: ['goblin', 'wolf', 'spider'],      guardian: { kind: 'wolf',       name: 'Fenris the Alpha' }, adj: ['Oaken', 'Thorned', 'Mossy', "Hunter's"] },
    { id: 'swamp',     name: 'Rotting Swamp',       mobs: ['slime', 'toad', 'snake'],        guardian: { kind: 'toad',       name: 'The Bog Mother' },   adj: ['Bogwood', 'Murky', 'Sodden', 'Mirefang'] },
    { id: 'catacombs', name: 'Forgotten Catacombs', mobs: ['skeleton', 'bat', 'ghost'],      guardian: { kind: 'skeleton',   name: 'The Lich King' },    adj: ['Bone', 'Grave', 'Haunted', 'Ossuary'] },
    { id: 'castle',    name: 'Castle Dreadmoor',    mobs: ['darkknight', 'gargoyle', 'imp'], guardian: { kind: 'darkknight', name: 'The Fallen King' },  adj: ['Royal', 'Iron', 'Dread', 'Crimson'] },
    { id: 'void',      name: 'The Outer Realm',     mobs: ['eye', 'voidling', 'wisp'],       guardian: { kind: 'eye',        name: 'The All-Seeing' },   adj: ['Astral', 'Void', 'Starforged', 'Eldritch'] }
  ];
  // After the Outer Realm the zones repeat with tougher, recoloured monsters.
  const TIERS = ['', 'Dire ', 'Cursed ', 'Abyssal ', 'Ancient ', 'Eldritch '];
  const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  function zoneAt(floor) {
    const n = Math.floor((floor - 1) / CONFIG.zoneLength);
    const zone = ZONES[n % ZONES.length], tier = Math.floor(n / ZONES.length);
    return { index: n, zone, tier, name: zone.name + (tier ? ' ' + ROMAN[Math.min(tier, ROMAN.length - 1)] : '') };
  }

  function monsterAt(floor, rand) {
    rand = rand || Math.random;
    const z = zoneAt(floor), mobs = z.zone.mobs;
    const boss = floor % CONFIG.bossEvery === 0;
    const guardian = floor % CONFIG.zoneLength === 0;
    let kind, name;
    if (guardian) {
      kind = z.zone.guardian.kind;
      name = z.zone.guardian.name;
    } else {
      const idx = boss
        ? Math.floor(((floor - 1) % CONFIG.zoneLength) / CONFIG.bossEvery) % mobs.length
        : Math.floor(rand() * mobs.length);
      kind = mobs[idx];
      name = TIERS[Math.min(z.tier, TIERS.length - 1)] + (boss ? MONSTERS[kind].boss : MONSTERS[kind].name);
    }
    return {
      kind, floor, boss, guardian,
      variant: z.tier,
      fly: !!MONSTERS[kind].fly,
      hop: !!MONSTERS[kind].hop,
      name,
      hp: 8 * scaleAt(floor, CONFIG.monsterHpGrowth, CONFIG.zoneHpJump) * (guardian ? 12 : boss ? 7 : 1),
      atk: 1.5 * scaleAt(floor, CONFIG.monsterAtkGrowth, CONFIG.zoneAtkJump) * (guardian ? 3 : boss ? 2.5 : 1),
      gold: goldAt(floor) * (guardian ? 25 : boss ? 8 : 1),
      xp: monsterXp(floor) * (guardian ? 15 : boss ? 5 : 1)
    };
  }

  // growth per floor, plus a jump each time a new realm starts
  function scaleAt(floor, perFloor, perZone) {
    return Math.pow(perFloor, floor - 1) * Math.pow(perZone, Math.floor((floor - 1) / CONFIG.zoneLength));
  }
  // XP for one ordinary kill on a floor (see levelsPerFloor / killsPerLevel in CONFIG).
  function monsterXp(floor) {
    const k = CONFIG.killsPerLevelStart + (CONFIG.killsPerLevelEnd - CONFIG.killsPerLevelStart) * Math.min(1, (floor - 1) / 249);
    return xpToLevel(Math.max(1, Math.round(floor * CONFIG.levelsPerFloor))) / k;
  }
  function goldAt(floor) { return CONFIG.monsterGoldBase * scaleAt(floor, CONFIG.monsterGoldGrowth, CONFIG.zoneGoldJump); }

  // ---- gear ----
  const SLOTS = [
    { id: 'weapon',  name: 'Weapon',  main: 'dmg', scale: 1 },
    { id: 'helm',    name: 'Helm',    main: 'hp',  scale: 0.6 },
    { id: 'armor',   name: 'Armor',   main: 'hp',  scale: 1 },
    { id: 'trinket', name: 'Trinket', main: null,  scale: 1.5 }   // main stat is crit, speed or gold
  ];

  const RARITIES = [
    { id: 'common',    name: 'Common',    color: '#c8c8c8', mult: 1.0, affixes: 0, weight: 60 },
    { id: 'uncommon',  name: 'Uncommon',  color: '#4cd964', mult: 1.3, affixes: 1, weight: 26 },
    { id: 'rare',      name: 'Rare',      color: '#4da3ff', mult: 1.7, affixes: 2, weight: 10 },
    { id: 'epic',      name: 'Epic',      color: '#c070ff', mult: 2.3, affixes: 3, weight: 3.4 },
    { id: 'legendary', name: 'Legendary', color: '#ff9a2e', mult: 3.2, affixes: 4, weight: 0.6 }
  ];

  // All gear stats are percentages (crit 3 = +3% crit chance). weight is only used to guess
  // whether a drop is an upgrade over what's equipped.
  const rnd = (r) => 0.8 + r() * 0.4;
  const STAT_DEFS = {
    dmg:   { name: 'Damage',       weight: 1,   roll: (il, r) => (5 + il * 0.5) * rnd(r) },
    hp:    { name: 'Health',       weight: 0.7, roll: (il, r) => (5 + il * 0.5) * rnd(r) },
    crit:  { name: 'Crit chance',  weight: 6,   roll: (il, r) => 1 + r() * 2 },
    speed: { name: 'Attack speed', weight: 4,   roll: (il, r) => 2 + r() * 4 },
    gold:  { name: 'Gold find',    weight: 0.4, roll: (il, r) => (8 + il * 0.25) * rnd(r) },
    evade: { name: 'Dodge',        weight: 5,   roll: (il, r) => 1 + r() * 2 },
    spell: { name: 'Spell power',  weight: 0.8, roll: (il, r) => (6 + il * 0.5) * rnd(r), cls: 'mage' }
  };
  const TRINKET_MAINS = ['crit', 'speed', 'gold'];

  const BASES = {
    weapon: {
      knight: ['Shortsword', 'Longsword', 'Broadsword', 'Greatsword'],
      ranger: ['Shortbow', 'Longbow', 'Recurve Bow', 'Warbow'],
      mage:   ['Wand', 'Staff', 'Rod', 'Scepter']
    },
    helm:    ['Coif', 'Helm', 'Visor', 'Greathelm'],
    armor:   ['Tunic', 'Hauberk', 'Breastplate', 'Cuirass'],
    trinket: ['Ring', 'Amulet', 'Charm', 'Talisman']
  };
  const LOOT_SUFFIX = ['of the Wolf', 'of Embers', 'of the Bear', 'of Storms', 'of Kings', 'of the Stars', 'of Ruin', 'of the Phoenix', 'of Echoes', 'of the Deep'];

  function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }

  function rollRarity(r, min) {
    const pool = RARITIES.slice(min || 0);
    let t = pool.reduce((a, x) => a + x.weight, 0) * r();
    for (let i = 0; i < pool.length; i++) {
      t -= pool[i].weight;
      if (t < 0) return RARITIES.indexOf(pool[i]);
    }
    return RARITIES.length - 1;
  }

  // ilvl = the floor it dropped on. cls = the class that found it (weapons are class-locked).
  function makeItem(ilvl, cls, opts, r, id) {
    r = r || Math.random;
    opts = opts || {};
    const ri = opts.rarity != null ? opts.rarity : rollRarity(r, opts.minRarity);
    const rar = RARITIES[ri];
    const slot = opts.slot ? SLOTS.find((x) => x.id === opts.slot) : pick(SLOTS, r);
    const stats = {};
    const main = slot.main || pick(TRINKET_MAINS, r);
    const mainBase = (main === 'dmg' || main === 'hp') ? (10 + ilvl) * (0.85 + r() * 0.3) : STAT_DEFS[main].roll(ilvl, r);
    stats[main] = mainBase * rar.mult * slot.scale;

    const pool = Object.keys(STAT_DEFS).filter((k) => k !== main && (!STAT_DEFS[k].cls || STAT_DEFS[k].cls === cls));
    for (let i = 0; i < rar.affixes && pool.length; i++) {
      const k = pool.splice(Math.floor(r() * pool.length), 1)[0];
      stats[k] = STAT_DEFS[k].roll(ilvl, r) * rar.mult;
    }
    Object.keys(stats).forEach((k) => { stats[k] = Math.round(stats[k] * 10) / 10; });

    const z = zoneAt(ilvl);
    const depth = Math.min(3, Math.floor(((ilvl - 1) % CONFIG.zoneLength) / (CONFIG.zoneLength / 4)));
    const bases = slot.id === 'weapon' ? BASES.weapon[cls] : BASES[slot.id];
    let name = pick(z.zone.adj, r) + ' ' + bases[depth];
    if (ri >= 3) name += ' ' + pick(LOOT_SUFFIX, r);

    return { id: id || 0, slot: slot.id, rarity: ri, ilvl, cls: slot.id === 'weapon' ? cls : null, name, main, stats };
  }

  // ---- life skills ----
  // Gathering skills. Their levels only help life skills: luck (better material quality),
  // a chance to gather double, and speed. mat = the material type used in crafting recipes.
  const SKILLS = [
    { id: 'woodcutting', name: 'Woodcutting', action: 'Chopping', mat: 'wood' },
    { id: 'mining',      name: 'Mining',      action: 'Mining',   mat: 'ore' },
    { id: 'fishing',     name: 'Fishing',     action: 'Fishing',  mat: 'fish' },
    { id: 'herbalism',   name: 'Herbalism',   action: 'Foraging', mat: 'herb' },
    { id: 'tailoring',   name: 'Tailoring',   action: 'Weaving',  mat: 'cloth' }
  ];
  const CRAFTING = { id: 'crafting', name: 'Crafting' };

  // Every material has a quality, using the same tiers and colours as gear rarity.
  // Base odds before luck; luck multiplies quality i by (1 + luck)^i.
  const QUALITY_WEIGHTS = [80, 15, 4, 0.9, 0.1];
  const QUALITY_VALUE = [1, 2.5, 6, 15, 40];   // sell price multiplier

  // Crafting recipes: how many of each material type a piece needs. Materials must all come from the
  // same zone tier (sets the item's power) and the same quality (sets its rarity).
  const RECIPES = {
    weapon: {                         // every weapon is wood and ore, in different proportions
      knight: { ore: 10, wood: 5 },   // sword: mostly metal
      ranger: { wood: 10, ore: 5 },   // bow: mostly wood, metal fittings
      mage:   { wood: 9, ore: 6 }     // staff: wood with a metal-bound head
    },
    helm:    { cloth: 8, herb: 4 },   // padded hood, herb-treated
    armor:   { ore: 10, cloth: 7 },   // plates over a cloth gambeson
    trinket: { ore: 5, fish: 7 }      // pearls and scales set in metal
  };
  const CRAFT_TIER_LEVEL = [1, 10, 20, 30, 40];   // Crafting level needed per zone tier
  const CRAFT_TIER_XP = [15, 40, 80, 140, 220];

  // One resource per skill per zone. To gather it you need the skill level AND to have reached that zone.
  // Materials are stored as "nodeId:quality" -> count.
  const NODES = [
    { id: 'ash',         skill: 'woodcutting', name: 'Ash Tree',          item: 'Ash Log',         level: 1,  zone: 0 },
    { id: 'willow',      skill: 'woodcutting', name: 'Bog Willow',        item: 'Willow Log',      level: 10, zone: 1 },
    { id: 'bonewood',    skill: 'woodcutting', name: 'Bonewood Tree',     item: 'Bonewood Log',    level: 20, zone: 2 },
    { id: 'royaloak',    skill: 'woodcutting', name: 'Royal Oak',         item: 'Royal Oak Log',   level: 30, zone: 3 },
    { id: 'starbark',    skill: 'woodcutting', name: 'Starbark Tree',     item: 'Starbark Log',    level: 40, zone: 4 },
    { id: 'copper',      skill: 'mining',      name: 'Copper Vein',       item: 'Copper Ore',      level: 1,  zone: 0 },
    { id: 'bogiron',     skill: 'mining',      name: 'Bog Iron Deposit',  item: 'Bog Iron Ore',    level: 10, zone: 1 },
    { id: 'gravesilver', skill: 'mining',      name: 'Grave Silver Vein', item: 'Grave Silver',    level: 20, zone: 2 },
    { id: 'obsidian',    skill: 'mining',      name: 'Obsidian Outcrop',  item: 'Obsidian Shard',  level: 30, zone: 3 },
    { id: 'voidcrystal', skill: 'mining',      name: 'Void Crystal',      item: 'Void Crystal',    level: 40, zone: 4 },
    { id: 'trout',       skill: 'fishing',     name: 'Woodland Brook',    item: 'Brook Trout',     level: 1,  zone: 0 },
    { id: 'eel',         skill: 'fishing',     name: 'Mire Pool',         item: 'Mud Eel',         level: 10, zone: 1 },
    { id: 'cavefish',    skill: 'fishing',     name: 'Crypt Well',        item: 'Blind Cavefish',  level: 20, zone: 2 },
    { id: 'pike',        skill: 'fishing',     name: 'Castle Moat',       item: 'Moat Pike',       level: 30, zone: 3 },
    { id: 'ray',         skill: 'fishing',     name: 'Star Pool',         item: 'Nebula Ray',      level: 40, zone: 4 },
    { id: 'moonleaf',    skill: 'herbalism',   name: 'Moonleaf Patch',    item: 'Moonleaf',        level: 1,  zone: 0 },
    { id: 'bogbloom',    skill: 'herbalism',   name: 'Bogbloom Thicket',  item: 'Bogbloom',        level: 10, zone: 1 },
    { id: 'gravemoss',   skill: 'herbalism',   name: 'Gravemoss Crevice', item: 'Gravemoss',       level: 20, zone: 2 },
    { id: 'kingsrose',   skill: 'herbalism',   name: 'Kingsblood Roses',  item: 'Kingsblood Rose', level: 30, zone: 3 },
    { id: 'voidpetal',   skill: 'herbalism',   name: 'Voidpetal Garden',  item: 'Voidpetal',       level: 40, zone: 4 },
    { id: 'linen',       skill: 'tailoring',   name: 'Flax Loom',         item: 'Linen Cloth',     level: 1,  zone: 0 },
    { id: 'bogcotton',   skill: 'tailoring',   name: 'Bog Cotton Loom',   item: 'Bog Cotton',      level: 10, zone: 1 },
    { id: 'spidersilk',  skill: 'tailoring',   name: 'Crypt Silk Loom',   item: 'Spidersilk',      level: 20, zone: 2 },
    { id: 'velvet',      skill: 'tailoring',   name: 'Royal Loom',        item: 'Velvet',          level: 30, zone: 3 },
    { id: 'starweave',   skill: 'tailoring',   name: 'Starweave Loom',    item: 'Starweave',       level: 40, zone: 4 }
  ];
  const TIER_XP = [10, 25, 50, 90, 150];
  NODES.forEach((n) => {
    n.time = 3 + n.zone;              // seconds per action before the level speed bonus
    n.xp = TIER_XP[n.zone];
    n.zoneFloor = n.zone * CONFIG.zoneLength + 1;
  });

  // ---- meat & cooking ----
  // Meat drops from monsters (one kind per zone). It can't be gathered, so a pantry always needs combat.
  const MEATS = ['Wolf Haunch', 'Toad Legs', 'Bat Wing', 'Imp Flank', 'Starflesh'].map((item, zone) => (
    { id: 'meat' + zone, item, zone, zoneFloor: zone * CONFIG.zoneLength + 1, meat: true }));

  const COOKING = { id: 'cooking', name: 'Cooking' };

  // Meals restore energy only. Ingredients come from the meal's zone tier; fish and herbs set the quality.
  // energy: instant refill. regen: multiplies energy regeneration for `duration` seconds.
  // maxBonus: raises max energy for `duration` seconds. auto: eaten by the auto-eat rule.
  const MEALS = [
    { id: 'ration', name: 'Ration',            level: 1,  meat: 2, fish: 0, herb: 1, energy: 40,  auto: true, xpMult: 1 },
    { id: 'stew',   name: 'Stew',              level: 10, meat: 3, fish: 2, herb: 1, energy: 120, auto: true, xpMult: 1.5 },
    { id: 'roast',  name: 'Slow-cooked Roast', level: 20, meat: 3, fish: 2, herb: 2, regen: 2, duration: 3600, auto: false, xpMult: 2 },
    { id: 'feast',  name: 'Feast',             level: 35, meat: 5, fish: 3, herb: 3, energy: 60, maxBonus: 100, duration: 3600, auto: true, xpMult: 3 }
  ];
  const COOK_TIER_XP = [12, 30, 60, 100, 160];

  // Total XP needed to reach a level.
  function xpForLevel(L) { return L <= 1 ? 0 : Math.round(60 * (Math.pow(1.13, L - 1) - 1) / 0.13); }
  function levelFromXp(xp) {
    let L = 1;
    while (L < CONFIG.skillCap && xp >= xpForLevel(L + 1)) L++;
    return L;
  }

  const SKINS = [
    { id: 'steel',   name: 'Steel',    unlock: { type: 'free' },                      note: 'Starting look' },
    { id: 'crimson', name: 'Crimson',  unlock: { type: 'floor', value: 50 },          note: 'Reach floor 50' },
    { id: 'emerald', name: 'Emerald',  unlock: { type: 'prestige', value: 1 },        note: 'Retire a hero once' },
    { id: 'shadow',  name: 'Shadow',   unlock: { type: 'store', sku: 'skin_shadow' }, note: 'Store' },
    { id: 'gilded',  name: 'Gilded',   unlock: { type: 'store', sku: 'skin_gilded' }, note: 'Store' }
  ];

  // Monetization catalogue. Purchases are granted through Game.grantPurchase(sku),
  // which the payment backend will call after verifying a payment.
  const STORE_ITEMS = [
    { sku: 'royal_charter', name: 'Royal Charter',     desc: 'Removes ads and doubles offline earnings, forever.', price: '$4.99' },
    { sku: 'starter_pack',  name: "Adventurer's Pack", desc: '50 Soul Gems and the Gilded skin. One per player.', price: '$2.99', grants: ['skin_gilded'] },
    { sku: 'skin_shadow',   name: 'Shadow Skin',       desc: 'Cosmetic hero skin for every class.', price: '$1.99' },
    { sku: 'skin_gilded',   name: 'Gilded Skin',       desc: 'Cosmetic hero skin for every class.', price: '$1.99' }
  ];

  const SUFFIXES = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1000) return (n < 10 && n % 1 > 0.05) ? n.toFixed(1) : String(Math.floor(n));
    const e = Math.floor(Math.log10(n) / 3);
    if (e > SUFFIXES.length) return n.toExponential(2);
    const v = n / Math.pow(1000, e);
    return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.floor(v))) + SUFFIXES[e - 1];
  }

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + s + 's';
    return s + 's';
  }

  function zeros(list) { const o = {}; list.forEach((x) => { o[x.id] = 0; }); return o; }

  function newState() {
    return {
      version: 4,
      cls: null,              // chosen on a new game; null shows the class picker
      location: 'town',       // 'town' (Hearthstead: rest, shop, change gear) or 'delve'
      merchant: { stock: [], restockAt: 0 },
      gold: 0,
      gems: 0,
      depthGems: 0,           // Soul Gems already paid for depth reached (retiring pays only for new depth)
      floor: 1,
      runMaxFloor: 1,
      bestFloor: 1,
      kills: 0,
      autoAdvance: true,
      hero: { level: 1, xp: 0, points: 0, attrs: zeros(ATTRS) },   // resets when you retire
      companions: zeros(COMPANIONS),
      gear: { weapon: null, helm: null, armor: null, trinket: null },
      bag: [],
      nextItemId: 1,
      skin: 'steel',
      skinsOwned: ['steel'],
      purchases: [],
      skillXp: Object.assign(zeros(SKILLS), { crafting: 0, cooking: 0 }),
      craft: null,            // { slot, tier, quality } while location is 'craft' (working the forge)
      cook: null,             // { meal, tier, quality } while location is 'cook' (at the campfire)
      energy: { cur: CONFIG.energyBase, regenUntil: 0, feastUntil: 0, feastBonus: 0 },   // timers use stats.playSeconds
      pantry: {},             // "mealId:tier:quality" -> count
      // A routine is a loop of steps. Each step: { act, target, until, value }. See routineTick().
      routine: { on: false, steps: [], idx: 0, startedAt: 0, count: 0 },
      materials: {},          // material id (= node id) -> count
      gatherNode: null,       // node being gathered while location is 'gather'
      stats: { totalGold: 0, monstersSlain: 0, bossesSlain: 0, guardiansSlain: 0, prestiges: 0, gemsEarned: 0, itemsFound: 0, itemsCrafted: 0, mealsCooked: 0, mealsEaten: 0, deaths: 0, playSeconds: 0 },
      // autoSalvage: drops below this rarity index are salvaged.
      // autoReturn: walk back to town when HP falls below this fraction (0 = never).
      // autoDelve: after an automatic trip to town (low HP or death), set out again once fully rested.
      // autoEat: eat from the pantry when energy falls below this fraction (0 = never). eatOrder: 'small' | 'big'.
      settings: { buyMode: 1, autoSalvage: 0, autoReturn: 0.25, autoDelve: true, autoEat: 0.15, eatOrder: 'small' },
      lastSeen: Date.now()
    };
  }

  // Merge a saved game onto fresh defaults so new fields added in later versions get values.
  function hydrate(data) {
    const s = newState();
    if (!data || typeof data !== 'object') return s;
    Object.keys(s).forEach((k) => {
      if (!(k in data)) return;
      const def = s[k];
      if (def && typeof def === 'object' && !Array.isArray(def)) Object.assign(def, data[k]);
      else s[k] = data[k];
    });
    if (!CLASSES[s.cls]) s.cls = 'knight';   // saves from before classes existed were knights
    s.hero.attrs = Object.assign(zeros(ATTRS), s.hero.attrs);
    // Saves from when stats were bought with gold: start at a level matching the run's progress,
    // with every point unspent so the player assigns them.
    if (!data.hero && data.upgrades) {
      s.hero.level = Math.max(1, (data.runMaxFloor || 1) - 2);
      s.hero.points = (s.hero.level - 1) * CONFIG.pointsPerLevel;
    }
    // Version 4 changed Soul Gems: each is worth +2% instead of +10%, and gems are paid for new depth only.
    // Older saves keep the same total bonus (gems x5) and count their depth so far as already paid.
    if ((data.version || 1) < 4) {
      s.gems = Math.round((data.gems || 0) * 0.10 / CONFIG.gemBonus);
      s.depthGems = Math.floor(Math.pow(s.bestFloor / 10, CONFIG.gemPow));
      s.hero.xp = 0;   // the XP needed per level changed in version 4
    }
    s.version = newState().version;   // converted: never run the conversions above twice
    // materials from before qualities existed become Common
    Object.keys(s.materials).forEach((k) => {
      if (k.indexOf(':') === -1) { s.materials[k + ':0'] = (s.materials[k + ':0'] || 0) + s.materials[k]; delete s.materials[k]; }
    });
    return s;
  }

  class Game {
    constructor(state) {
      this.s = state;
      this.events = [];
      this.resetBattle();
    }

    emit(type, data) { const e = data || {}; e.type = type; this.events.push(e); }

    cls() { return CLASSES[this.s.cls] || CLASSES.knight; }
    gemMult() { return 1 + this.s.gems * CONFIG.gemBonus; }

    gearTotals() {
      const t = {};
      Object.keys(STAT_DEFS).forEach((k) => { t[k] = 0; });
      SLOTS.forEach((sl) => {
        const it = this.s.gear[sl.id];
        if (!it || !this.canEquip(it)) return;
        Object.keys(it.stats).forEach((k) => { t[k] += this.itemStat(it, k); });
      });
      return t;
    }

    // An item's stat including its enhancement (+1 to +10).
    itemStat(item, k) { return item.stats[k] * (1 + (item.enh || 0) * CONFIG.enhanceStep); }

    stats() {
      const a = this.s.hero.attrs, gm = this.gemMult(), c = this.cls(), g = this.gearTotals();
      const atk = ATTR.damage(a.str) * gm * c.atk * (1 + g.dmg / 100);
      const maxHp = ATTR.health(a.vit) * gm * c.hp * (1 + g.hp / 100);
      const healMult = 1;
      const speed = ATTR.speed(a.agi) * c.speed * (1 + g.speed / 100);
      const crit = Math.min(CONFIG.critCap, ATTR.crit(a.foc) + g.crit / 100);
      const goldMult = gm * (1 + g.gold / 100);
      const evade = Math.min(CONFIG.evadeCap, c.evade + (c.id === 'ranger' ? ATTR.dodge(a.foc) : 0) + g.evade / 100);
      const block = c.id === 'knight' ? Math.min(CONFIG.blockCap, c.block + ATTR.block(a.foc)) : 0;
      const spellCd = c.spells ? ATTR.spellCd(a.foc) : 0;
      const spellPower = 1 + g.spell / 100;
      let compDps = 0;
      COMPANIONS.forEach((co) => { compDps += compDpsAt(co, this.s.companions[co.id] || 0); });
      compDps *= gm;
      const critAvg = 1 + crit * (CONFIG.critMult - 1);
      const spellDps = c.spells ? atk * SPELL_AVG * spellPower * critAvg / spellCd : 0;
      const heroDps = atk * speed * critAvg + spellDps;
      return { atk, maxHp, healMult, speed, crit, goldMult, evade, block, dr: c.dr, spellCd, spellPower, spellDps, compDps, heroDps, totalDps: heroDps + compDps };
    }

    resetBattle() {
      this.b = {
        heroHp: this.stats().maxHp, heroAtk: 0.3, heroAnim: 0, heroFlash: 0, heroCast: 0,
        heroDead: false, monster: null, spawn: 0.3,
        bossTimer: 0, bossTimeMax: CONFIG.bossTime, compTimer: 1, tapCd: 0,
        spellTimer: 1.5, spellIdx: 0,
        autoTrip: false        // true when the hero went to town by itself (low HP or death)
      };
    }

    // ---- town (Hearthstead) ----
    // Working the forge or the campfire counts as being in town (you can still shop and change gear).
    inTown() { return this.s.location === 'town' || this.s.location === 'craft' || this.s.location === 'cook'; }

    // Deepest floor you can set out from: the floor after the last boss beaten this run.
    maxCheckpoint() {
      const e = CONFIG.bossEvery;
      return Math.floor((this.s.runMaxFloor - 1) / e) * e + 1;
    }

    checkpoints() {
      const out = [];
      for (let f = 1; f <= this.maxCheckpoint(); f += CONFIG.bossEvery) out.push(f);
      return out;
    }

    // reason: 'manual' | 'auto' (low HP) | 'death' | 'tired' (out of energy) | 'routine' (a routine changing activity)
    goToTown(reason) {
      const s = this.s, b = this.b;
      if (s.location === 'town') return false;
      s.location = 'town';
      b.monster = null;
      b.autoTrip = reason === 'auto' || reason === 'death';
      if (reason === 'death') b.heroHp = this.stats().maxHp * 0.05;
      if (!s.merchant.stock.length) this.restock();
      this.emit('town', { reason });
      return true;
    }

    // Floors you can set out from: where you left off, the deepest floor this run, and every checkpoint.
    departOptions() {
      const s = this.s, set = {};
      this.checkpoints().forEach((f) => { set[f] = 'Checkpoint'; });
      set[s.runMaxFloor] = 'Deepest';
      set[s.floor] = 'Where you left off';
      return Object.keys(set).map(Number).sort((a, b) => a - b).map((f) => ({ floor: f, label: set[f] }));
    }

    // floor defaults to where the hero left off (s.floor doesn't change while in town).
    depart(floor, keepAdvance) {
      const s = this.s, b = this.b;
      if (!this.inTown()) return false;
      floor = Math.max(1, Math.min(s.runMaxFloor, Math.floor(floor || s.floor)));
      s.location = 'delve';
      s.floor = floor;
      s.kills = 0;
      // Setting out by hand pushes forward. Going back out on your own after a death keeps farming
      // the floor below, so a hero can't loop into the boss that just killed it.
      if (!b.autoTrip && !keepAdvance) s.autoAdvance = true;
      Object.assign(b, { monster: null, spawn: 1, autoTrip: false, heroAtk: 0.3, spellTimer: 1.5, compTimer: 1 });
      this.emit('depart', { floor });
      return true;
    }

    // ---- merchant ----
    restock() {
      const s = this.s, ilvl = Math.max(1, s.runMaxFloor);
      s.merchant.stock = SLOTS.concat(SLOTS).slice(0, CONFIG.merchantSize).map((sl) =>
        makeItem(ilvl, this.cls().id, { minRarity: 1, slot: sl.id }, Math.random, s.nextItemId++));
      s.merchant.restockAt = s.stats.playSeconds + CONFIG.merchantRestock;
      this.emit('restock');
    }

    price(item) {
      return Math.ceil(goldAt(item.ilvl) * (3 + item.rarity * 4) * (1 + item.rarity * 0.5) * CONFIG.merchantMarkup);
    }

    rerollCost() { return Math.ceil(goldAt(Math.max(1, this.s.runMaxFloor)) * 40); }

    buyItem(id) {
      const s = this.s, i = s.merchant.stock.findIndex((x) => x.id === id);
      if (!this.inTown() || i === -1 || s.bag.length >= CONFIG.bagSize) return false;
      const cost = this.price(s.merchant.stock[i]);
      if (s.gold < cost) return false;
      s.gold -= cost;
      s.bag.push(s.merchant.stock.splice(i, 1)[0]);
      this.emit('buyItem');
      return true;
    }

    reroll() {
      const cost = this.rerollCost();
      if (!this.inTown() || this.s.gold < cost) return false;
      this.s.gold -= cost;
      this.restock();
      return true;
    }

    spawn() {
      const info = monsterAt(this.s.floor);
      this.b.monster = Object.assign({}, info, {
        maxHp: info.hp, atkTimer: CONFIG.monsterAttackInterval, age: 0, flash: 0, anim: 0, frozen: 0
      });
      if (info.boss) this.b.bossTimer = this.b.bossTimeMax = info.guardian ? CONFIG.guardianTime : CONFIG.bossTime;
      this.emit('spawn', { monster: this.b.monster });
    }

    update(dt) {
      const s = this.s, b = this.b, d = this.stats();
      s.stats.playSeconds += dt;
      b.heroAnim = Math.max(0, b.heroAnim - dt);
      b.heroFlash = Math.max(0, b.heroFlash - dt);
      b.heroCast = Math.max(0, b.heroCast - dt);
      b.tapCd = Math.max(0, b.tapCd - dt);
      if (s.stats.playSeconds >= s.merchant.restockAt) this.restock();
      this.regenEnergy(dt);
      if (s.routine.on) this.routineTick();

      if (s.location === 'town') {
        b.heroHp = Math.min(d.maxHp, b.heroHp + d.maxHp * CONFIG.restRate * d.healMult * dt);
        if (b.autoTrip && s.settings.autoDelve && !s.routine.on && b.heroHp >= d.maxHp) this.depart(s.floor);
        return;
      }
      if (s.location === 'craft' || s.location === 'cook') {
        b.heroHp = Math.min(d.maxHp, b.heroHp + d.maxHp * CONFIG.restRate * dt);
        if (s.location === 'craft') this.craftTick(dt); else this.cookTick(dt);
        return;
      }
      if (s.location === 'gather') {
        b.heroHp = Math.min(d.maxHp, b.heroHp + d.maxHp * CONFIG.gatherHeal * d.healMult * dt);
        this.gatherTick(dt);
        return;
      }

      b.heroHp = Math.min(d.maxHp, b.heroHp + d.maxHp * CONFIG.heroRegen * d.healMult * dt);
      const m = b.monster;
      if (s.settings.autoReturn && b.heroHp < d.maxHp * s.settings.autoReturn && !(m && m.boss)) {
        this.goToTown('auto');
        return;
      }
      if (!m) {
        b.spawn -= dt;
        if (b.spawn <= 0) this.spawn();
        return;
      }
      m.age += dt;
      m.flash = Math.max(0, m.flash - dt);
      m.anim = Math.max(0, m.anim - dt);

      if (m.boss) {
        b.bossTimer -= dt;
        if (b.bossTimer <= 0) { this.failBoss(); return; }
      }
      if (m.age < CONFIG.enterTime) return;

      b.heroAtk -= dt;
      if (b.heroAtk <= 0) {
        b.heroAtk = Math.max(0, b.heroAtk + 1 / d.speed);
        const crit = Math.random() < d.crit;
        b.heroAnim = 0.18;
        this.hit(d.atk * (crit ? CONFIG.critMult : 1), 'hero', crit);
        if (!b.monster) return;
      }

      if (d.spellCd) {
        b.spellTimer -= dt;
        if (b.spellTimer <= 0) {
          b.spellTimer += d.spellCd;
          this.cast(d);
          if (!b.monster) return;
        }
      }

      if (d.compDps > 0) {
        b.compTimer -= dt;
        if (b.compTimer <= 0) {
          b.compTimer += 1;
          this.hit(d.compDps, 'comp', false);
          if (!b.monster) return;
        }
      }

      if (m.frozen > 0) { m.frozen = Math.max(0, m.frozen - dt); return; }
      m.atkTimer -= dt;
      if (m.atkTimer <= 0) {
        m.atkTimer += CONFIG.monsterAttackInterval;
        m.anim = 0.2;
        if (Math.random() < d.evade) { this.emit('dodge'); return; }
        if (Math.random() < d.block) { this.emit('block'); return; }
        const dmg = m.atk * (1 - d.dr);
        b.heroHp -= dmg;
        b.heroFlash = 0.12;
        this.emit('heroHit', { amount: dmg });
        if (b.heroHp <= 0) this.heroDie();
      }
    }

    cast(d) {
      const b = this.b, sp = SPELLS[b.spellIdx % SPELLS.length];
      b.spellIdx++;
      b.heroCast = 0.35;
      this.emit('cast', { spell: sp.id });
      const hits = sp.hits || 1;
      for (let i = 0; i < hits && b.monster; i++) {
        const crit = Math.random() < d.crit;
        this.hit(d.atk * sp.mult * d.spellPower * (crit ? CONFIG.critMult : 1), sp.id, crit);
      }
      if (sp.freeze && b.monster) b.monster.frozen = sp.freeze;
    }

    hit(amount, source, crit) {
      const m = this.b.monster;
      if (!m) return;
      m.hp -= amount;
      m.flash = 0.08;
      this.emit('hit', { amount, source, crit: !!crit, monster: m });
      if (m.hp <= 0) this.kill();
    }

    tap() {
      const b = this.b, m = b.monster;
      if (b.tapCd > 0 || !m || this.inTown() || m.age < CONFIG.enterTime) return false;
      b.tapCd = CONFIG.tapCooldown;
      this.hit(this.stats().atk * CONFIG.tapMult, 'tap', false);
      return true;
    }

    kill() {
      const s = this.s, b = this.b, m = b.monster;
      const gold = m.gold * this.stats().goldMult;
      s.gold += gold;
      s.stats.totalGold += gold;
      s.stats.monstersSlain++;
      b.monster = null;
      b.spawn = CONFIG.spawnDelay;
      this.emit('kill', { monster: m, gold });
      this.gainXp(m.xp);
      this.rollDrop(m);
      this.dropMeat(m);
      if (m.boss) {
        s.stats.bossesSlain++;
        if (m.guardian) s.stats.guardiansSlain++;
        this.emit('bossKill', { name: m.name, guardian: m.guardian });
        this.advance();
      } else {
        s.kills++;
        if (s.kills >= CONFIG.killsPerFloor) {
          if (s.autoAdvance) this.advance();
          else s.kills = CONFIG.killsPerFloor;
        }
      }
    }

    advance() {
      const s = this.s;
      s.floor++;
      s.kills = 0;
      if (s.floor > s.runMaxFloor) s.runMaxFloor = s.floor;
      if (s.floor > s.bestFloor) s.bestFloor = s.floor;
      this.checkUnlocks();
      this.emit('floor', { floor: s.floor });
    }

    // Player presses "Advance" / "Challenge Boss" after being pushed back.
    challenge() {
      const s = this.s, b = this.b;
      s.autoAdvance = true;
      if (s.kills >= CONFIG.killsPerFloor) {
        this.advance();
        b.monster = null;
        b.spawn = 0.3;
      }
    }

    failBoss() {
      const b = this.b;
      const name = b.monster ? b.monster.name : 'The boss';
      this.retreat();
      this.emit('bossFail', { name });
    }

    retreat() {
      const s = this.s, b = this.b;
      s.floor = Math.max(1, s.floor - 1);
      s.kills = 0;
      s.autoAdvance = false;
      b.monster = null;
      b.spawn = CONFIG.spawnDelay;
    }

    // The hero is carried back to town and drops some of the gold they carry.
    heroDie() {
      const s = this.s, m = this.b.monster;
      const lost = Math.floor(s.gold * CONFIG.deathGoldLoss);
      s.gold -= lost;
      s.stats.deaths++;
      this.emit('heroDie', { lost, name: m ? m.name : 'The dungeon' });
      // Fall back a floor and farm there (like failing a boss timer) until the player presses Advance.
      s.floor = Math.max(1, s.floor - 1);
      s.kills = 0;
      s.autoAdvance = false;
      this.goToTown('death');
    }

    // Runs fn, then tops up current HP by however much max HP grew.
    keepHp(fn) {
      const before = this.stats().maxHp;
      const out = fn();
      const after = this.stats().maxHp;
      this.b.heroHp = Math.min(after, this.b.heroHp + Math.max(0, after - before));
      return out;
    }

    // ---- gear ----
    rollDrop(m) {
      if (!m.boss && Math.random() >= CONFIG.dropChance) return;
      const s = this.s;
      const item = makeItem(m.floor, this.cls().id, { minRarity: m.guardian ? 2 : m.boss ? 1 : 0 }, Math.random, s.nextItemId++);
      s.stats.itemsFound++;
      const full = s.bag.length >= CONFIG.bagSize;
      if (full || item.rarity < s.settings.autoSalvage) {
        const g = this.salvageValue(item);
        s.gold += g;
        s.stats.totalGold += g;
        this.emit('loot', { item, monster: m, salvaged: g, full });
        return;
      }
      s.bag.push(item);
      this.emit('loot', { item, monster: m, upgrade: this.isUpgrade(item) });
    }

    canEquip(item) { return item.slot !== 'weapon' || !item.cls || item.cls === this.cls().id; }

    itemPower(item) {
      if (!item || !this.canEquip(item)) return 0;
      let p = 0;
      Object.keys(item.stats).forEach((k) => {
        const def = STAT_DEFS[k];
        if (!def || (def.cls && def.cls !== this.cls().id)) return;
        p += this.itemStat(item, k) * def.weight;
      });
      return p;
    }

    isUpgrade(item) { return this.canEquip(item) && this.itemPower(item) > this.itemPower(this.s.gear[item.slot]); }

    salvageValue(item) { return goldAt(item.ilvl) * (3 + item.rarity * 4); }

    // Equipping, unequipping and selling only work in town.
    equipItem(id) {
      const s = this.s, i = s.bag.findIndex((x) => x.id === id);
      if (!this.inTown() || i === -1 || !this.canEquip(s.bag[i])) return false;
      this.keepHp(() => {
        const item = s.bag.splice(i, 1)[0];
        const old = s.gear[item.slot];
        s.gear[item.slot] = item;
        if (old) s.bag.splice(i, 0, old);
      });
      return true;
    }

    unequip(slot) {
      const s = this.s;
      if (!this.inTown() || !s.gear[slot] || s.bag.length >= CONFIG.bagSize) return false;
      this.keepHp(() => { s.bag.push(s.gear[slot]); s.gear[slot] = null; });
      return true;
    }

    salvage(ids) {
      const s = this.s;
      if (!this.inTown()) return 0;
      let total = 0;
      s.bag = s.bag.filter((it) => {
        if (ids.indexOf(it.id) === -1) return true;
        total += this.salvageValue(it);
        return false;
      });
      s.gold += total;
      s.stats.totalGold += total;
      return total;
    }

    // ---- hero level & stat points ----
    xpToNext() { return xpToLevel(this.s.hero.level); }

    gainXp(xp) {
      const h = this.s.hero;
      h.xp += xp;
      let ups = 0;
      while (h.level < CONFIG.heroMaxLevel && h.xp >= xpToLevel(h.level)) {
        h.xp -= xpToLevel(h.level);
        h.level++;
        h.points += CONFIG.pointsPerLevel;
        ups++;
      }
      if (ups) this.emit('heroLevel', { level: h.level, levels: ups, points: ups * CONFIG.pointsPerLevel });
      return ups;
    }

    // Spend up to n unspent points on an attribute.
    assign(attr, n) {
      const h = this.s.hero;
      n = Math.min(n, h.points);
      if (n <= 0 || !(attr in h.attrs)) return 0;
      this.keepHp(() => { h.attrs[attr] += n; h.points -= n; });
      return n;
    }

    spentPoints() { const a = this.s.hero.attrs; return Object.keys(a).reduce((t, k) => t + a[k], 0); }
    respecCost() { return this.spentPoints() ? Math.ceil(goldAt(Math.max(1, this.s.runMaxFloor)) * CONFIG.respecMult) : 0; }

    // Pay gold to take back every assigned point. Town only.
    respec() {
      const s = this.s, cost = this.respecCost();
      if (!this.inTown() || !cost || s.gold < cost) return false;
      s.gold -= cost;
      s.hero.points += this.spentPoints();
      Object.keys(s.hero.attrs).forEach((k) => { s.hero.attrs[k] = 0; });
      this.b.heroHp = Math.min(this.b.heroHp, this.stats().maxHp);
      return true;
    }

    // Text for the Hero screen: what an attribute gives now, and with one more point.
    describeAttr(id) {
      const a = this.s.hero.attrs, P = a[id], c = this.cls(), gm = this.gemMult(), g = this.gearTotals();
      const pctS = (v) => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
      if (id === 'str') { const k = gm * c.atk * (1 + g.dmg / 100); return { now: fmt(ATTR.damage(P) * k) + ' damage', next: fmt(ATTR.damage(P + 1) * k) }; }
      if (id === 'vit') { const k = gm * c.hp * (1 + g.hp / 100); return { now: fmt(ATTR.health(P) * k) + ' health', next: fmt(ATTR.health(P + 1) * k) }; }
      if (id === 'agi') {
        const k = c.speed * (1 + g.speed / 100), capped = P * CONFIG.agiSpeed >= CONFIG.agiSpeedCap;
        return { now: (ATTR.speed(P) * k).toFixed(2) + ' attacks/s', next: capped ? 'max' : (ATTR.speed(P + 1) * k).toFixed(2) };
      }
      const perk = c.id === 'knight' ? ['block', (v) => pctS(c.block + ATTR.block(v))]
        : c.id === 'ranger' ? ['dodge', (v) => pctS(c.evade + ATTR.dodge(v))]
        : ['per spell', (v) => ATTR.spellCd(v).toFixed(2) + 's'];
      return {
        now: pctS(ATTR.crit(P)) + ' crit, ' + perk[1](P) + ' ' + perk[0],
        next: pctS(ATTR.crit(P + 1)) + ', ' + perk[1](P + 1),
        perk: FOCUS_PERK[c.id]
      };
    }

    // ---- gear enhancement (gold sink) ----
    enhanceCost(item) {
      const e = item.enh || 0;
      return Math.ceil(goldAt(item.ilvl + 2) * CONFIG.enhanceBase * Math.pow(CONFIG.enhanceGrowth, e) * (1 + item.rarity * 0.5));
    }
    enhanceChance(item) { return CONFIG.enhanceChance[item.enh || 0] || 0; }

    findItem(id) {
      const s = this.s;
      return s.bag.find((x) => x.id === id) || SLOTS.map((sl) => s.gear[sl.id]).find((x) => x && x.id === id);
    }

    // Pay gold to try +1. Failing only costs the gold. Town only.
    enhance(id) {
      const s = this.s, item = this.findItem(id);
      if (!item || !this.inTown() || (item.enh || 0) >= CONFIG.enhanceMax) return null;
      const cost = this.enhanceCost(item);
      if (s.gold < cost) return null;
      s.gold -= cost;
      const ok = Math.random() < this.enhanceChance(item);
      if (ok) this.keepHp(() => { item.enh = (item.enh || 0) + 1; });
      this.emit('enhance', { item, ok });
      return ok;
    }

    // ---- allies (bought with gold) ----
    def(kind, id) { return COMPANIONS.find((x) => x.id === id); }
    level(kind, id) { return this.s.companions[id] || 0; }
    costAt(def, L) { return Math.ceil(def.baseCost * Math.pow(def.growth, L)); }

    // mode: 1 | 10 | 'max'
    quote(kind, id, mode) {
      const def = this.def(kind, id), L = this.level(kind, id);
      const max = def.max || Infinity;
      if (L >= max) return { count: 0, cost: 0, afford: false, maxed: true };
      const target = mode === 'max' ? Infinity : mode;
      let count = 0, cost = 0;
      while (count < target && L + count < max && count < 1000) {
        const c = this.costAt(def, L + count);
        if (mode === 'max' && cost + c > this.s.gold) break;
        cost += c;
        count++;
      }
      if (count === 0) return { count: 1, cost: this.costAt(def, L), afford: false, maxed: false };
      return { count, cost, afford: cost <= this.s.gold, maxed: false };
    }

    buy(kind, id, mode) {
      const q = this.quote(kind, id, mode);
      if (!q.afford) return false;
      this.keepHp(() => {
        this.s.gold -= q.cost;
        this.s.companions[id] += q.count;
      });
      this.emit('buy', { kind, id, count: q.count });
      return true;
    }

    describe(kind, id, count) {
      const L = this.level(kind, id), gm = this.gemMult(), n = count || 1, c = this.def(kind, id);
      return { now: fmt(compDpsAt(c, L) * gm) + ' DPS', next: fmt(compDpsAt(c, L + n) * gm) + ' DPS' };
    }

    // ---- classes ----
    chooseClass(id) {
      if (!CLASSES[id]) return false;
      this.s.cls = id;
      this.s.location = 'town';
      this.resetBattle();
      this.restock();
      return true;
    }

    // ---- prestige ----
    // Retiring unlocks once you've beaten the Outer Realm guardian (deepest floor ever past 250).
    canRetire() { return this.s.bestFloor >= CONFIG.prestigeFloor; }

    // Total Soul Gems owed for a deepest floor. Retiring pays what's owed minus what was already paid,
    // so reaching an old record again pays nothing and only new depth counts.
    depthGemsFor(best) { return Math.floor(Math.pow(best / 10, CONFIG.gemPow)); }
    pendingGems() { return Math.max(0, this.depthGemsFor(this.s.bestFloor) - this.s.depthGems); }

    // Gear is kept. nextCls lets the player pick a new class for the next hero.
    prestige(nextCls) {
      const s = this.s;
      if (!this.canRetire()) return -1;
      const g = this.pendingGems();
      s.gems += g;
      s.depthGems += g;
      s.stats.gemsEarned += g;
      s.stats.prestiges++;
      s.gold = 0;
      s.hero = { level: 1, xp: 0, points: 0, attrs: zeros(ATTRS) };
      Object.keys(s.companions).forEach((k) => { s.companions[k] = 0; });
      s.floor = 1; s.runMaxFloor = 1; s.kills = 0; s.autoAdvance = true;
      s.location = 'town';
      if (CLASSES[nextCls]) s.cls = nextCls;
      this.restock();
      // a weapon for the old class goes back in the bag
      const w = s.gear.weapon;
      if (w && !this.canEquip(w)) { s.bag.push(w); s.gear.weapon = null; }
      this.checkUnlocks();
      this.resetBattle();
      this.emit('prestige', { gems: g });
      return g;
    }

    // ---- life skills ----
    // Life skills can't outrun combat: the level cap rises by one step per zone guardian beaten.
    levelCap() {
      const zonesCleared = Math.floor((this.s.bestFloor - 1) / CONFIG.zoneLength);
      return Math.min(CONFIG.skillCap, CONFIG.skillCapBase + zonesCleared * CONFIG.skillCapPerZone);
    }

    // The guardian to beat to raise the cap, or null at the top.
    nextCapGuardian() {
      if (this.levelCap() >= CONFIG.skillCap) return null;
      const z = Math.floor((this.s.bestFloor - 1) / CONFIG.zoneLength);
      return { name: ZONES[z % ZONES.length].guardian.name, floor: (z + 1) * CONFIG.zoneLength, cap: this.levelCap() + CONFIG.skillCapPerZone };
    }

    skillLevel(id) { return Math.min(this.levelCap(), levelFromXp(this.s.skillXp[id] || 0)); }

    // XP stops at the current cap, so levels can't be banked ahead of combat progress.
    addSkillXp(id, xp) {
      const s = this.s, max = xpForLevel(this.levelCap());
      s.skillXp[id] = Math.max(s.skillXp[id] || 0, Math.min(max, (s.skillXp[id] || 0) + xp));
    }

    // What a gathering skill's level gives: luck (material quality) and a chance to gather double.
    gatherPerks(skillId) {
      const level = this.skillLevel(skillId), L = level - 1;
      return { level, luck: L * CONFIG.gatherLuckPerLevel, double: Math.min(0.5, L * CONFIG.gatherDoublePerLevel) };
    }

    // Odds of each quality at a skill level. Qualities below their unlock level can't drop at all.
    qualityOdds(luck, level) {
      const w = QUALITY_WEIGHTS.map((x, i) => (level >= CONFIG.qualityUnlock[i] ? x * Math.pow(1 + luck, i) : 0));
      const t = w.reduce((a, b) => a + b, 0);
      return w.map((x) => x / t);
    }

    rollQuality(luck, level) {
      const odds = this.qualityOdds(luck, level);
      let r = Math.random();
      for (let i = 0; i < odds.length; i++) { r -= odds[i]; if (r < 0) return i; }
      return odds.length - 1;
    }

    matCount(nodeId, q) { return this.s.materials[nodeId + ':' + q] || 0; }

    addMat(nodeId, q, n) {
      const s = this.s, k = nodeId + ':' + q;
      s.materials[k] = (s.materials[k] || 0) + n;
      if (s.materials[k] <= 0) delete s.materials[k];
    }

    skillProgress(id) {
      const xp = this.s.skillXp[id] || 0, L = this.skillLevel(id), cap = this.levelCap();
      if (L >= cap) return { level: L, xp, into: 0, need: 0, frac: 1, capped: cap < CONFIG.skillCap };
      const lo = xpForLevel(L), hi = xpForLevel(L + 1);
      return { level: L, xp, into: xp - lo, need: hi - lo, frac: (xp - lo) / (hi - lo) };
    }

    node(id) { return NODES.find((n) => n.id === id); }

    // Why a node can't be gathered yet, or '' if it can.
    nodeLock(n) {
      if (this.skillLevel(n.skill) < n.level) return 'Needs ' + SKILLS.find((sk) => sk.id === n.skill).name + ' ' + n.level;
      if (this.s.bestFloor < n.zoneFloor) return 'Reach ' + ZONES[n.zone].name + ' (floor ' + n.zoneFloor + ')';
      return '';
    }

    // Seconds per action: 1% faster per level above the requirement, up to 40%.
    gatherTime(n) {
      const over = Math.max(0, this.skillLevel(n.skill) - n.level);
      return n.time * (1 - Math.min(0.4, over * 0.01));
    }

    // A material's info: a gathering node, or a kind of meat.
    matDef(id) { return this.node(id) || MEATS.find((m) => m.id === id); }

    // key = "nodeId:quality"
    materialValue(key) {
      const parts = String(key).split(':'), n = this.matDef(parts[0]);
      if (!n) return 0;
      return goldAt(n.zoneFloor + 4) * QUALITY_VALUE[+parts[1] || 0] * (n.meat ? 0.5 : 1);
    }

    energyCost(n) { return CONFIG.gatherEnergy[n.zone]; }

    // Can the hero afford one gather right now (counting food the auto-eat rule may eat)?
    canGather(n) { return this.s.energy.cur >= this.energyCost(n) || !!this.mealToAutoEat(true); }

    // Start gathering from town, or switch node while already gathering.
    startGather(id) {
      const s = this.s, n = this.node(id);
      if (!n || this.nodeLock(n) || (!this.inTown() && s.location !== 'gather')) return false;
      if (!this.canGather(n)) { this.emit('tired', { node: n }); return false; }
      s.location = 'gather';
      s.gatherNode = id;
      this.b.monster = null;
      this.b.gatherT = 0;
      this.b.autoTrip = false;
      this.emit('gatherStart', { node: n });
      return true;
    }

    gatherTick(dt) {
      const s = this.s, b = this.b, n = this.node(s.gatherNode);
      if (!n) { s.location = 'town'; return; }
      this.autoEat();
      if (s.energy.cur < this.energyCost(n)) {
        // Out of energy. A routine moves on by itself; otherwise the hero walks home to rest.
        b.tired = true;
        if (!s.routine.on) this.goToTown('tired');
        return;
      }
      b.tired = false;
      b.gatherT = (b.gatherT || 0) + dt;
      const t = this.gatherTime(n);
      if (b.gatherT < t) return;
      b.gatherT -= t;
      s.energy.cur -= this.energyCost(n);
      this.collect(n, 1);
    }

    // actions = number of gathers. Each rolls a quality and may yield double. Returns counts per quality.
    collect(n, actions) {
      const s = this.s, before = this.skillLevel(n.skill), p = this.gatherPerks(n.skill);
      const got = [0, 0, 0, 0, 0];
      for (let i = 0; i < actions; i++) got[this.rollQuality(p.luck, p.level)] += Math.random() < p.double ? 2 : 1;
      got.forEach((c, q) => { if (c) this.addMat(n.id, q, c); });
      if (s.routine.on) s.routine.count += got.reduce((a, c) => a + c, 0);
      const xp = n.xp * actions;
      this.addSkillXp(n.skill, xp);
      const after = this.skillLevel(n.skill);
      this.emit('gather', { node: n, got, xp });
      if (after > before) this.emit('skillLevel', { skill: SKILLS.find((sk) => sk.id === n.skill), level: after });
      return got;
    }

    sellMaterial(key, count) {
      const s = this.s, have = s.materials[key] || 0;
      count = Math.min(have, count || have);
      if (!this.inTown() || count <= 0) return 0;
      const g = this.materialValue(key) * count;
      s.materials[key] = have - count;
      if (!s.materials[key]) delete s.materials[key];
      s.gold += g;
      s.stats.totalGold += g;
      return g;
    }

    // Turn refineRatio materials of quality q into 1 of quality q + 1, as many times as possible.
    // Why refining nodeId's quality q upward isn't allowed, or ''. You can only refine into a quality
    // your gathering level could drop, so piles of Common can't skip the quality gates.
    refineLock(nodeId, q) {
      const n = this.node(nodeId), need = CONFIG.qualityUnlock[q + 1];
      if (!n || q >= RARITIES.length - 1) return 'Max quality';
      if (this.skillLevel(n.skill) < need) return 'Needs ' + SKILLS.find((sk) => sk.id === n.skill).name + ' ' + need;
      return '';
    }

    refine(nodeId, q) {
      if (!this.inTown() || this.refineLock(nodeId, q)) return 0;
      const n = Math.floor(this.matCount(nodeId, q) / CONFIG.refineRatio);
      if (!n) return 0;
      this.addMat(nodeId, q, -n * CONFIG.refineRatio);
      this.addMat(nodeId, q + 1, n);
      return n;
    }

    // ---- crafting ----
    // tier = zone index of the materials (sets item power), q = material quality (sets rarity).
    recipe(slot, tier, q) {
      const base = slot === 'weapon' ? RECIPES.weapon[this.cls().id] : RECIPES[slot];
      const mats = Object.keys(base).map((type) => {
        const n = NODES.find((x) => x.zone === tier && SKILLS.find((sk) => sk.id === x.skill).mat === type);
        return { node: n, type, need: base[type], have: this.matCount(n.id, q) };
      });
      const level = CRAFT_TIER_LEVEL[tier];
      const over = Math.max(0, this.skillLevel('crafting') - level);
      const ilvl = tier * CONFIG.zoneLength + Math.min(49, 5 + over * 3);
      const fee = Math.ceil(goldAt(ilvl) * CONFIG.craftFeeMult * (1 + q));
      const byMats = Math.min.apply(null, mats.map((m) => Math.floor(m.have / m.need)));
      return {
        slot, tier, quality: q, mats, level,
        xp: Math.round(CRAFT_TIER_XP[tier] * (1 + q * 0.5)),
        time: (4 + tier * 1.5) * (1 - Math.min(0.4, over * 0.01)),
        // Item level grows with Crafting level: 3 per level above the tier's requirement, from +5 up to +49.
        ilvl, fee, byMats,
        canMake: Math.min(byMats, Math.floor(this.s.gold / fee))   // limited by materials and by gold for the fee
      };
    }

    craftLock(tier) {
      const need = CRAFT_TIER_LEVEL[tier];
      return this.skillLevel('crafting') < need ? 'Needs Crafting ' + need : '';
    }

    masterworkChance() { return Math.min(0.5, (this.skillLevel('crafting') - 1) * CONFIG.masterworkPerLevel); }

    // Work the forge: crafts the recipe over and over until materials run out or the bag fills.
    startCraft(slot, tier, q) {
      const s = this.s;
      if (!this.inTown() || this.craftLock(tier)) return false;
      if (this.recipe(slot, tier, q).canMake < 1 || s.bag.length >= CONFIG.bagSize) return false;
      s.location = 'craft';
      s.craft = { slot, tier, quality: q };
      this.b.craftT = 0;
      this.emit('craftStart', { craft: s.craft });
      return true;
    }

    stopCraft(reason) {
      if (this.s.location !== 'craft') return;
      this.s.location = 'town';
      this.emit('craftStop', { reason });
    }

    craftTick(dt) {
      const s = this.s, b = this.b, c = s.craft;
      if (!c) { s.location = 'town'; return; }
      const r = this.recipe(c.slot, c.tier, c.quality);
      if (r.canMake < 1) { this.stopCraft(r.byMats < 1 ? 'materials' : 'gold'); return; }
      if (s.bag.length >= CONFIG.bagSize) { this.stopCraft('bag'); return; }
      b.craftT = (b.craftT || 0) + dt;
      if (b.craftT < r.time) return;
      b.craftT -= r.time;
      this.craftOne(r);
    }

    craftOne(r) {
      const s = this.s, before = this.skillLevel('crafting');
      r.mats.forEach((m) => this.addMat(m.node.id, r.quality, -m.need));
      s.gold -= r.fee;
      let rarity = r.quality, master = false;
      // Masterwork bumps rarity by one, but never past what your Crafting level has unlocked.
      if (rarity < RARITIES.length - 1 && this.skillLevel('crafting') >= CONFIG.qualityUnlock[rarity + 1] &&
          Math.random() < this.masterworkChance()) { rarity++; master = true; }
      const item = makeItem(r.ilvl, this.cls().id, { slot: r.slot, rarity }, Math.random, s.nextItemId++);
      item.crafted = true;
      s.bag.push(item);
      s.stats.itemsCrafted++;
      if (s.routine.on) s.routine.count++;
      this.addSkillXp('crafting', r.xp);
      this.emit('craft', { item, master, xp: r.xp });
      const after = this.skillLevel('crafting');
      if (after > before) this.emit('skillLevel', { skill: CRAFTING, level: after });
      return item;
    }

    // ---- energy ----
    zonesCleared() { return Math.floor((this.s.bestFloor - 1) / CONFIG.zoneLength); }
    clock() { return this.s.stats.playSeconds; }

    // Max energy: base + per guardian beaten (+ a Feast's temporary bonus).
    maxEnergy() {
      const e = this.s.energy;
      const feast = e.feastUntil > this.clock() ? e.feastBonus : 0;
      return CONFIG.energyBase + this.zonesCleared() * CONFIG.energyPerGuardian + feast;
    }

    regenRate() {
      const e = this.s.energy, base = (CONFIG.energyBase + this.zonesCleared() * CONFIG.energyPerGuardian) / (CONFIG.energyRegenHours * 3600);
      return base * (this.inTown() ? CONFIG.energyRestMult : 1) * (e.regenUntil > this.clock() ? e.regenMult || 2 : 1);
    }

    regenEnergy(dt) {
      const e = this.s.energy;
      e.cur = Math.min(this.maxEnergy(), e.cur + this.regenRate() * dt);
    }

    // ---- meat ----
    dropMeat(m) {
      const n = m.guardian ? CONFIG.meatGuardian : m.boss ? CONFIG.meatBoss : (Math.random() < CONFIG.meatChance ? 1 : 0);
      if (!n) return;
      const meat = MEATS[ZONES.indexOf(zoneAt(m.floor).zone)];   // the meat of the monster's zone
      this.addMat(meat.id, 0, n);
      this.emit('meat', { meat, count: n, monster: m });
    }

    // ---- pantry & eating ----
    pantryCount() { const p = this.s.pantry; return Object.keys(p).reduce((t, k) => t + p[k], 0); }
    pantryCap() { return CONFIG.pantryBase + this.skillLevel('cooking') - 1; }

    meal(id) { return MEALS.find((x) => x.id === id); }

    // What a meal with these ingredients does. key = "mealId:tier:quality".
    mealEffect(key) {
      const parts = key.split(':'), ml = this.meal(parts[0]), tier = +parts[1], q = +parts[2];
      const k = (1 + tier * CONFIG.mealTierBonus) * (1 + q * CONFIG.mealQualityBonus);
      return {
        meal: ml, tier, quality: q,
        energy: ml.energy ? Math.round(ml.energy * k) : 0,
        maxBonus: ml.maxBonus ? Math.round(ml.maxBonus * k) : 0,
        regen: ml.regen || 0,
        duration: ml.duration ? Math.round(ml.duration * (1 + q * CONFIG.mealQualityBonus)) : 0
      };
    }

    mealName(key) {
      const f = this.mealEffect(key);
      return (f.quality ? RARITIES[f.quality].name + ' ' : '') + ZONES[f.tier].adj[0] + ' ' + f.meal.name;
    }

    eat(key) {
      const s = this.s, e = s.energy;
      if (!s.pantry[key]) return false;
      const f = this.mealEffect(key), now = this.clock();
      if (f.maxBonus) { e.feastUntil = now + f.duration; e.feastBonus = f.maxBonus; }
      if (f.regen) { e.regenUntil = now + f.duration; e.regenMult = f.regen; }
      e.cur = Math.min(this.maxEnergy(), e.cur + f.energy);
      if (!--s.pantry[key]) delete s.pantry[key];
      s.stats.mealsEaten++;
      this.emit('eat', { key, name: this.mealName(key), energy: f.energy, effect: f });
      return true;
    }

    // The meal the auto-eat rule would pick (ignoring the energy threshold when `any` is true), or null.
    mealToAutoEat(any) {
      const s = this.s, e = s.energy;
      if (!s.settings.autoEat) return null;
      if (!any && e.cur >= s.settings.autoEat * this.maxEnergy()) return null;
      const keys = Object.keys(s.pantry).filter((k) => s.pantry[k] > 0 && this.meal(k.split(':')[0]).auto);
      if (!keys.length) return null;
      const size = (k) => { const f = this.mealEffect(k); return f.energy + f.maxBonus; };
      keys.sort((a, b) => size(a) - size(b));
      return s.settings.eatOrder === 'big' ? keys[keys.length - 1] : keys[0];
    }

    autoEat() {
      const k = this.mealToAutoEat(false);
      if (k) this.eat(k);
    }

    // ---- cooking ----
    // A cooking recipe: meal type + zone tier + quality of the fish and herbs used.
    mealRecipe(mealId, tier, q) {
      const ml = this.meal(mealId), level = Math.max(ml.level, CRAFT_TIER_LEVEL[tier]);
      const byType = (type) => NODES.find((x) => x.zone === tier && SKILLS.find((sk) => sk.id === x.skill).mat === type);
      const mats = [];
      if (ml.meat) mats.push({ node: MEATS[tier], q: 0, need: ml.meat, have: this.matCount(MEATS[tier].id, 0) });
      if (ml.fish) { const n = byType('fish'); mats.push({ node: n, q, need: ml.fish, have: this.matCount(n.id, q) }); }
      if (ml.herb) { const n = byType('herb'); mats.push({ node: n, q, need: ml.herb, have: this.matCount(n.id, q) }); }
      const lvl = this.skillLevel('cooking'), over = Math.max(0, lvl - level);
      const byMats = Math.min.apply(null, mats.map((m) => Math.floor(m.have / m.need)));
      const space = Math.max(0, this.pantryCap() - this.pantryCount());
      return {
        meal: ml, tier, quality: q, mats, level, key: mealId + ':' + tier + ':' + q,
        burn: Math.max(0, CONFIG.cookBurnBase - over * CONFIG.cookBurnPerLevel),
        xp: Math.round(COOK_TIER_XP[tier] * ml.xpMult * (1 + q * 0.5)),
        time: (3 + tier) * (1 - Math.min(0.4, over * 0.01)),
        byMats, space, canMake: Math.min(byMats, space)
      };
    }

    cookLock(mealId, tier) {
      const need = Math.max(this.meal(mealId).level, CRAFT_TIER_LEVEL[tier]);
      return this.skillLevel('cooking') < need ? 'Needs Cooking ' + need : '';
    }

    // Cook at the campfire until the ingredients run out or the pantry is full.
    startCook(mealId, tier, q) {
      const s = this.s;
      if (!this.inTown() || this.cookLock(mealId, tier) || this.mealRecipe(mealId, tier, q).canMake < 1) return false;
      s.location = 'cook';
      s.cook = { meal: mealId, tier, quality: q };
      this.b.cookT = 0;
      this.emit('cookStart', { cook: s.cook, name: this.mealName(mealId + ':' + tier + ':' + q) });
      return true;
    }

    stopCook(reason) {
      if (this.s.location !== 'cook') return;
      this.s.location = 'town';
      this.emit('cookStop', { reason });
    }

    cookTick(dt) {
      const s = this.s, b = this.b, c = s.cook;
      if (!c) { s.location = 'town'; return; }
      const r = this.mealRecipe(c.meal, c.tier, c.quality);
      if (r.canMake < 1) { this.stopCook(r.byMats < 1 ? 'ingredients' : 'pantry'); return; }
      b.cookT = (b.cookT || 0) + dt;
      if (b.cookT < r.time) return;
      b.cookT -= r.time;
      this.cookOne(r);
    }

    cookOne(r) {
      const s = this.s, before = this.skillLevel('cooking');
      r.mats.forEach((m) => this.addMat(m.node.id, m.q, -m.need));
      const burned = Math.random() < r.burn;
      if (!burned) {
        s.pantry[r.key] = (s.pantry[r.key] || 0) + 1;
        s.stats.mealsCooked++;
        if (s.routine.on) s.routine.count++;
      }
      const xp = burned ? Math.round(r.xp / 2) : r.xp;   // a burned meal still teaches you something
      this.addSkillXp('cooking', xp);
      this.emit('cook', { key: r.key, name: this.mealName(r.key), burned, xp });
      const after = this.skillLevel('cooking');
      if (after > before) this.emit('skillLevel', { skill: COOKING, level: after });
      return !burned;
    }

    // ---- routines ----
    // A routine is a loop of steps: { act, target, until, value }.
    //   act:    'gather' (target.node) | 'delve' (target.from: 'left' | 'deepest' | floor) | 'rest'
    //           | 'cook' (target.meal, tier, q) | 'craft' (target.slot, tier, q)
    //   until:  'energyBelow' | 'energyFull' | 'hpBelow' | 'hpFull' | 'pantryFull' | 'items' | 'minutes' | 'done'
    //           ('done' = until the step can't continue: out of energy, ingredients or materials)
    // Each tick, if the current step is finished or can't run, the routine moves to the next one.
    routineSlots() { return Math.min(CONFIG.routineMaxSteps, CONFIG.routineBaseSteps + this.zonesCleared()); }

    setRoutine(steps) {
      const r = this.s.routine;
      r.steps = steps.slice(0, CONFIG.routineMaxSteps);
      if (r.idx >= r.steps.length) r.idx = 0;
    }

    startRoutine() {
      const r = this.s.routine;
      if (!r.steps.slice(0, this.routineSlots()).length) return false;
      r.on = true; r.idx = 0; r.startedAt = this.clock(); r.count = 0;
      this.emit('routineStart');
      return true;
    }

    stopRoutine() {
      const r = this.s.routine;
      if (!r.on) return;
      r.on = false;
      this.emit('routineStop');
    }

    stepDone(st) {
      const s = this.s, r = s.routine, d = this.stats(), e = s.energy, max = this.maxEnergy();
      const hp = this.b.heroHp / d.maxHp, v = (st.value || 0) / 100;
      switch (st.until) {
        case 'energyBelow': return e.cur < v * max;
        case 'energyFull':  return e.cur >= max - 0.01;
        case 'hpBelow':     return hp < v;
        case 'hpFull':      return hp >= 0.999;
        case 'pantryFull':  return this.pantryCount() >= this.pantryCap();
        case 'items':       return r.count >= (st.value || 1);
        case 'minutes':     return this.clock() - r.startedAt >= (st.value || 1) * 60;
        default:            return false;   // 'done': only ends when the step can't continue
      }
    }

    // Can this step do anything right now?
    stepCanRun(st) {
      const t = st.target || {};
      switch (st.act) {
        case 'gather': { const n = this.node(t.node); return !!n && !this.nodeLock(n) && this.canGather(n); }
        case 'cook':   return !this.cookLock(t.meal, t.tier) && this.mealRecipe(t.meal, t.tier, t.q).canMake > 0;
        case 'craft':  return !this.craftLock(t.tier) && this.recipe(t.slot, t.tier, t.q).canMake > 0 && this.s.bag.length < CONFIG.bagSize;
        default:       return true;   // delve and rest can always run
      }
    }

    // Put the hero into this step's activity if they aren't already doing it.
    stepEnsure(st) {
      const s = this.s, t = st.target || {}, loc = s.location;
      const leave = () => { if (loc === 'delve' || loc === 'gather') this.goToTown('routine'); else if (loc !== 'town') s.location = 'town'; };
      switch (st.act) {
        case 'gather':
          if (loc === 'gather' && s.gatherNode === t.node) return;
          if (loc === 'delve') this.goToTown('routine');
          this.startGather(t.node);
          return;
        case 'delve': {
          if (loc === 'delve') return;
          if (loc !== 'town') leave();
          // rest up first: set out once HP is nearly full
          if (this.b.heroHp < this.stats().maxHp * 0.95) return;
          const floor = t.from === 'deepest' ? s.runMaxFloor : t.from === 'left' || !t.from ? s.floor : +t.from;
          this.depart(floor, true);
          return;
        }
        case 'rest':
          if (loc !== 'town') leave();
          return;
        case 'cook': {
          const c = s.cook;
          if (loc === 'cook' && c && c.meal === t.meal && c.tier === t.tier && c.quality === t.q) return;
          leave();
          this.startCook(t.meal, t.tier, t.q);
          return;
        }
        case 'craft': {
          const c = s.craft;
          if (loc === 'craft' && c && c.slot === t.slot && c.tier === t.tier && c.quality === t.q) return;
          leave();
          this.startCraft(t.slot, t.tier, t.q);
          return;
        }
      }
    }

    routineTick() {
      const r = this.s.routine, steps = r.steps.slice(0, this.routineSlots());
      if (!steps.length) { this.stopRoutine(); return; }
      for (let tries = 0; tries <= steps.length; tries++) {
        if (r.idx >= steps.length) r.idx = 0;
        const st = steps[r.idx];
        if (!this.stepDone(st) && this.stepCanRun(st)) { this.stepEnsure(st); return; }
        r.idx = (r.idx + 1) % steps.length;
        r.startedAt = this.clock();
        r.count = 0;
        this.emit('routineStep', { idx: r.idx });
      }
      // Nothing can run right now: wait in town until something can (energy regenerates there fastest).
      if (this.s.location !== 'town') { if (this.s.location === 'delve' || this.s.location === 'gather') this.goToTown('routine'); else this.s.location = 'town'; }
    }

    // ---- offline progress ----
    // Time away is replayed by running the game itself, in coarse steps, for a share of the time away.
    // That way routines, energy, deaths and drops all behave exactly as if you'd watched.
    offlinePlan(seconds) {
      const capped = Math.min(seconds, CONFIG.offlineCapHours * 3600);
      const share = CONFIG.offlineReplay * (this.owns('royal_charter') ? 2 : 1);
      return { seconds: capped, simSeconds: capped * share };
    }

    snapshot() {
      const s = this.s;
      return {
        gold: s.stats.totalGold, level: s.hero.level, xp: s.hero.xp, kills: s.stats.monstersSlain,
        items: s.stats.itemsFound, crafted: s.stats.itemsCrafted, cooked: s.stats.mealsCooked,
        floor: s.bestFloor, deaths: s.stats.deaths, materials: Object.assign({}, s.materials),
        skills: Object.assign({}, s.skillXp)
      };
    }

    // Replay up to simSeconds of game time. Returns seconds actually simulated (for chunking across frames).
    replay(simSeconds) {
      const step = CONFIG.offlineStep;
      let t = 0;
      while (t < simSeconds) {
        this.update(Math.min(step, simSeconds - t));
        t += step;
        if (this.events.length > 500) this.events.length = 0;   // nobody is watching
      }
      this.events.length = 0;
      return t;
    }

    // What changed between two snapshots, for the welcome-back screen.
    offlineSummary(a, b) {
      const mats = [];
      Object.keys(b.materials).forEach((k) => {
        const n = (b.materials[k] || 0) - (a.materials[k] || 0);
        if (n > 0) { const parts = k.split(':'); mats.push({ key: k, q: +parts[1], name: this.matDef(parts[0]).item, count: n }); }
      });
      mats.sort((x, y) => y.q - x.q || y.count - x.count);
      const skills = [];
      SKILLS.concat([CRAFTING, COOKING]).forEach((sk) => {
        const from = Math.min(this.levelCap(), levelFromXp(a.skills[sk.id] || 0)), to = this.skillLevel(sk.id);
        if (to > from) skills.push({ name: sk.name, from, to });
      });
      return {
        gold: b.gold - a.gold, levels: b.level - a.level, kills: b.kills - a.kills, items: b.items - a.items,
        crafted: b.crafted - a.crafted, cooked: b.cooked - a.cooked, floors: b.floor - a.floor,
        deaths: b.deaths - a.deaths, mats, skills
      };
    }

    // ---- skins & purchases ----
    owns(sku) { return this.s.purchases.indexOf(sku) !== -1; }

    grantPurchase(sku) {
      const item = STORE_ITEMS.find((x) => x.sku === sku);
      if (!item || this.owns(sku)) return false;
      this.s.purchases.push(sku);
      if (sku === 'starter_pack') { this.s.gems += 50; this.s.stats.gemsEarned += 50; }
      (item.grants || []).forEach((g) => { if (!this.owns(g)) this.s.purchases.push(g); });
      this.checkUnlocks();
      this.emit('purchase', { sku });
      return true;
    }

    checkUnlocks() {
      const s = this.s;
      SKINS.forEach((sk) => {
        if (s.skinsOwned.indexOf(sk.id) !== -1) return;
        const u = sk.unlock;
        const ok = u.type === 'free' ||
          (u.type === 'floor' && s.bestFloor >= u.value) ||
          (u.type === 'prestige' && s.stats.prestiges >= u.value) ||
          (u.type === 'store' && this.owns(u.sku));
        if (ok) { s.skinsOwned.push(sk.id); this.emit('unlock', { skin: sk }); }
      });
    }

    equip(id) {
      if (this.s.skinsOwned.indexOf(id) === -1) return false;
      this.s.skin = id;
      return true;
    }
  }

  const DD = root.DD || (root.DD = {});
  Object.assign(DD, {
    CONFIG, CLASSES, CLASS_LIST, SPELLS, ATTRS, FOCUS_PERK, COMPANIONS, MONSTERS, ZONES, SLOTS, RARITIES, STAT_DEFS,
    SKILLS, NODES, CRAFTING, RECIPES, QUALITY_VALUE, CRAFT_TIER_LEVEL, xpForLevel, levelFromXp,
    MEATS, MEALS, COOKING, scaleAt,
    SKINS, STORE_ITEMS, xpToLevel,
    newState, hydrate, monsterAt, zoneAt, makeItem, compDpsAt, Game, fmt, fmtTime
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = DD;
})(typeof window !== 'undefined' ? window : globalThis);
