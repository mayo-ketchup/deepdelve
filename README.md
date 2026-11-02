# Deepdelve

An idle dungeon crawler in pixel art. Pick a Knight, Ranger or Mage and battle downward through five realms,
collect randomly dropped gear, hire allies, beat a boss every 10 floors and a zone guardian every 50,
and retire for permanent Soul Gem bonuses.

## Play online

https://mayo-ketchup.github.io/deepdelve/

On a phone, use the browser's **Add to Home Screen** to install it like an app. After the first visit it also works offline (`sw.js` keeps a copy). Saves are stored per website, so the online version and a local copy have separate saves.

**Updating the online version:** commit and push to `main`. GitHub Pages republishes in about a minute.

## Run it

Double-click `index.html`. There's no build step. Vue 3 loads from a CDN, so you need an internet connection.

Add `?dev` to the URL (`index.html?dev`) to make the Store grant items for free while testing. This only works when the game runs on your own computer (opened as a file or on localhost); on a real website `?dev` is ignored.

## Files

| File | What's in it |
| --- | --- |
| `js/game.js` | All game rules and **all balance numbers** (`CONFIG`, `CLASSES`, `SPELLS`, `UPGRADES`, `COMPANIONS`, `ZONES`, `RARITIES`, `STAT_DEFS`). No DOM, so it also runs in Node. |
| `js/sprites.js` | Pixel art as text grids plus colour palettes, hero skins, and the hue-shifted monster variants. |
| `js/render.js` | Canvas renderer: dungeon backgrounds per zone, torches, animations, damage numbers, coins, banners. |
| `js/save.js` | Save encoding: the save is scrambled and checksummed, so editing it in dev tools breaks it instead of granting gold. An unreadable save is moved to `deepdelve.save.unreadable`, never deleted. |
| `js/app.js` | Vue app: UI panels, game loop, autosave (localStorage), offline earnings, store hooks. |
| `css/style.css` | UI styling. |

## How the game works

- **Floors:** 8 kills per floor. Every 10th floor is a boss with a 30-second timer.
- **Hearthstead (town hub):** you can go back to town at any time with **⌂ Town**. In town the hero rests (5% HP per second), the **Merchant** sells 5 items (restocks every 10 minutes, or pay to restock early), and you can equip and sell gear. Gear can only be changed in town. **Set out** resumes where you left off by default. You can also pick your deepest floor this run or any checkpoint (floor 1, 11, 21... one past each boss beaten).
- **Danger:** HP barely regenerates while delving (0.3%/s). If the hero dies they lose 10% of carried gold, wake up in town, and go back to farming the floor below where they died. Two settings keep it idle-friendly: *return to town when HP is below X%* and *set out again after resting*.
- **Life skills:** Woodcutting, Mining, Fishing, Herbalism and Tailoring (levels 1-60, `SKILLS` and `NODES` in `game.js`). Each skill has 5 resources, one per zone. A resource needs the skill level *and* that zone reached in combat. Gathering is safe, heals slowly, and keeps going offline (50% rate). Every gathered material rolls a **quality** (Common to Legendary, same as gear rarity). **Life skills can't outrun combat:** every gathering skill and Crafting is capped at level 10 until you beat the first zone guardian (floor 50), and each guardian raises the cap by 10, up to 60 after floor 250 (`skillCapBase` and `skillCapPerZone` in `CONFIG`). XP stops at the cap. Refining and Masterwork also respect the quality unlock levels. Higher qualities unlock with gathering level: Rare at 10, Epic at 25, Legendary at 40 (`qualityUnlock` in `CONFIG`). Gathering levels also give **Luck** (+0.1%/level, better odds for the unlocked qualities), **Double gather** (+0.5%/level) and speed. Skill levels do not affect combat.
- **Crafting** (Craft tab, the forge in Hearthstead): pick a piece (weapon, helm, armor, trinket), a tier (zone) and a quality. Recipes are in `RECIPES`: weapons use wood + ore (swords mostly ore, bows and staffs mostly wood), trinkets fish + ore, helms herbs + cloth, armor ore + cloth. **Quality sets the rarity** and **tier plus Crafting level set the item level**. Crafting levels give a **Masterwork** chance (+0.5%/level) of one rarity higher. The hero keeps crafting until materials run out or the bag is full, offline too. **Refining** turns 4 materials of one quality into 1 of the next. Skills, materials and gear are kept when you retire.
- **Boss timer:** if a boss timer runs out, the hero drops back one floor and farms there until you press **Advance**.
- **Pacing (simulated, no clicking):** a fresh hero reaches floor 20 in about 30-40 minutes and the first zone guardian in about 2 hours. Clicking adds about a quarter of the hero's attack per click.
- **Zones:** every 50 floors: Whispering Woods, Rotting Swamp, Forgotten Catacombs, Castle Dreadmoor, The Outer Realm. Each has its own background, 3 monster types, and a **zone guardian** on its 50th floor (12x HP, 45-second timer, guaranteed Rare or better drop). After floor 250 the zones repeat with tougher, recoloured monsters ("Whispering Woods II").
- **Classes:** Knight (1.5x HP, 25% damage reduction, block chance), Ranger (40% faster attacks, 25% dodge, less HP), Mage (casts Fireball, Frost Bolt and Chain Lightning between staff hits; Frost Bolt freezes the monster). Focus points strengthen each class's perk: Shield Wall (block), Hawk Eye (dodge) or Arcane Focus (spell speed). You pick a class on a new game and again each time you retire.
- **Hero level:** kills give XP (bosses x5, guardians x15). Each level gives 3 stat points to assign: **Strength** (damage), **Vitality** (health), **Agility** (attack speed, up to +150%), **Focus** (crit and the class perk). Points can be reset for gold in town. The level resets to 1 when you retire. Tuning is in `CONFIG` (`heroXp*`, `attrGrowth`, `agi*`, `foc*`) and `ATTR` in `game.js`.
- **Gold** buys allies and merchant gear, pays the forge fee for each craft, resets stat points, and **enhances gear** from +1 to +10 in town (+8% item stats per step; +1 to +3 always work, then the success chance drops to 30% at +10, and a failure only costs the gold).
- **Gear:** 4 slots (weapon, helm, armor, trinket), 5 rarities (Common to Legendary). Normal monsters have an 8% drop chance and bosses always drop. Stats are percentage bonuses that scale with the floor the item dropped on. Weapons only work for the class that found them. Gear is kept when you retire. Salvage turns items into gold, and once the bag (24) is full new drops are salvaged automatically.
- **Retire (prestige):** unlocks at floor 20. Gems = floor((deepest floor / 10)^2.2). Each gem gives +10% damage, health, gold and ally DPS.
- **Pacing (simulated, no clicking):** a fresh hero reaches floor 20 in about 25-35 minutes and floor 50 in about 1.5-2.5 hours, depending on class. With 300 Soul Gems, floor 50 takes about 12 minutes.
- **Offline earnings:** 35% of the estimated gold and XP rate while delving, capped at 8 hours.

## Cheating

Everything runs in the browser, so nothing is cheat-proof. The scrambled save and the local-only `?dev` stop casual cheating. Real-money purchases must be verified on a server before launch, and leaderboards would need server-side checks.

## Monetization hooks (already in the code)

- `STORE_ITEMS` in `game.js` is the product catalogue.
- `game.grantPurchase(sku)` applies a purchase. The payment backend should call it only after it has **verified** the payment server-side.
- `royal_charter` already doubles offline earnings. Ads aren't added yet.
- Skins unlock through gameplay (floor 50, first retire) or the store.

## Roadmap

1. Playtest and tune the numbers in `CONFIG`.
2. Sound effects and music.
3. Show hired allies in the battle scene.
4. Achievements and daily login rewards (good for player retention).
5. Move to Vite (needs Node 18 or newer) and download Vue so the game can run offline.
6. Backend: player accounts, cloud saves, Stripe checkout and purchase verification.
7. Rewarded ads, then publish to CrazyGames, Poki or itch.io.
