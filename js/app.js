/* Deepdelve - Vue UI, game loop, saving and offline progress. */
(function () {
  'use strict';
  const { createApp, reactive, ref, computed, onMounted, onBeforeUnmount, markRaw, nextTick } = Vue;
  const DD = window.DD;

  // Saves are scrambled with a checksum (js/save.js). An edited or damaged save is set aside, not loaded.
  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  function readSave() {
    const st = storage();
    if (!st) return { status: 'none' };
    const r = DD.Save.read(st);
    if (r.status === 'bad') DD.Save.quarantine(st, r.raw);
    return r;
  }
  function writeSave(state) {
    const st = storage();
    state.lastSeen = Date.now();
    return st ? DD.Save.write(st, state) : false;
  }
  function clearSave() { const st = storage(); if (st) DD.Save.clear(st); }

  // ?dev (free Store purchases for testing) only works when the game runs on your own computer:
  // opened as a file or served from localhost. On a real website it is ignored.
  const LOCAL = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) !== -1;

  // The side-panel menu: top row is the core loop, bottom row the rest. hint = one line under the title.
  const MENU = [
    { id: 'upgrades',   label: 'Hero',     icon: 'menu_hero',     hint: 'Level up and assign stat points' },
    { id: 'gear',       label: 'Gear',     icon: 'menu_gear',     hint: 'Equip and sell in town' },
    { id: 'skills',     label: 'Skills',   icon: 'menu_skills',   hint: 'Gather materials' },
    { id: 'craft',      label: 'Craft',    icon: 'menu_craft',    hint: 'Forge gear and cook meals' },
    { id: 'merchant',   label: 'Merchant', icon: 'menu_merchant', hint: 'Buy gear, sell materials' },
    { id: 'companions', label: 'Allies',   icon: 'menu_allies',   hint: 'Hire fighters' },
    { id: 'prestige',   label: 'Retire',   icon: 'menu_retire',   hint: 'Trade a run for Soul Gems' },
    { id: 'routine',    label: 'Routine',  icon: 'menu_routine',  hint: 'Automate gathering, delving and cooking' },
    { id: 'store',      label: 'Store',    icon: 'menu_store',    hint: 'Skins and support the game' },
    { id: 'settings',   label: 'Stats',    icon: 'menu_stats',    hint: 'Records and saving' }
  ];

  const pct = (v) => (v >= 10 ? Math.round(v) : v.toFixed(1)) + '%';

  createApp({
    setup() {
      const loaded = readSave();
      const saved = loaded.status === 'ok' ? loaded.data : null;
      const state = reactive(DD.hydrate(saved));
      if (!saved) state.cls = null;   // brand new game: show the class picker
      const game = markRaw(new DD.Game(state));
      game.checkUnlocks();
      game.events.length = 0;

      const canvas = ref(null);
      const overlay = ref(null);
      const tab = ref('upgrades');
      const toasts = ref([]);
      const modal = ref(loaded.status === 'bad' ? { type: 'badsave' } : null);
      const retireCls = ref(state.cls || 'knight');
      const dev = LOCAL && new URLSearchParams(location.search).has('dev');
      const previews = {};
      let renderer = null, rafId = 0, last = 0, saveTimer = 0, hiddenAt = null, unloading = false, lastFullToast = 0;

      const stats = computed(() => game.stats());
      const cls = computed(() => DD.CLASSES[state.cls] || DD.CLASSES.knight);
      const gemsOnRetire = computed(() => { void state.bestFloor; void state.depthGems; return game.pendingGems(); });
      const canRetire = computed(() => { void state.bestFloor; return game.canRetire(); });
      const nextIsBoss = computed(() => (state.floor + 1) % DD.CONFIG.bossEvery === 0);
      const zoneName = computed(() => DD.zoneAt(state.floor).name);
      // ---- hero level & stat points ----
      const hero = computed(() => {
        const h = state.hero, need = DD.xpToLevel(h.level);
        return { level: h.level, xp: h.xp, need, frac: Math.min(1, h.xp / need), points: h.points };
      });
      const describeAttr = (id) => { void state.hero.attrs[id]; void state.gear; void state.gems; void state.cls; return game.describeAttr(id); };
      const assign = (id, n) => { game.assign(id, n); };
      const respecCost = computed(() => { void state.hero.attrs; void state.runMaxFloor; return game.respecCost(); });
      function respec() {
        if (!inTown.value) { toast('Return to town to reset your stat points.', 'bad'); return; }
        if (game.respec()) toast('Stat points reset. Assign them again.', 'good');
      }

      // ---- gear enhancement ----
      const itemTitle = (item) => (item.enh ? '+' + item.enh + ' ' : '') + item.name;
      const enhanceCost = (item) => { void item.enh; return game.enhanceCost(item); };
      const enhanceChance = (item) => { void item.enh; return game.enhanceChance(item); };
      function enhance(item) {
        const ok = game.enhance(item.id);
        if (ok === true) toast('Success! ' + itemTitle(item), 'good');
        else if (ok === false) toast('The enhancement failed. ' + item.name + ' is unchanged.', 'bad');
      }
      const inTown = computed(() => state.location === 'town' || state.location === 'craft');   // the forge is in town
      const departOptions = computed(() => { void state.floor; void state.runMaxFloor; return game.departOptions(); });
      const departFloor = ref(state.floor);
      const heroHp = ref(1);   // fraction, refreshed by the game loop (battle state isn't reactive)
      const restockIn = computed(() => DD.fmtTime(Math.max(0, state.merchant.restockAt - state.stats.playSeconds)));

      // ---- life skills ----
      const gathering = computed(() => state.location === 'gather');
      const skillTab = ref((DD.NODES.find((n) => n.id === state.gatherNode) || DD.NODES[0]).skill);
      const gatherNodeInfo = computed(() => game.node(state.gatherNode));
      const skillProgress = (id) => { void state.skillXp[id]; return game.skillProgress(id); };
      const skillNodes = computed(() => DD.NODES.filter((n) => n.skill === skillTab.value));
      const nodeLock = (n) => { void state.skillXp[n.skill]; void state.bestFloor; return game.nodeLock(n); };
      const gatherTime = (n) => { void state.skillXp[n.skill]; return game.gatherTime(n); };
      // Gathering perks for a skill, plus the odds of each material quality.
      const gatherPerks = (id) => {
        void state.skillXp[id];
        const p = game.gatherPerks(id);
        return { luck: p.luck, double: p.double, odds: game.qualityOdds(p.luck, p.level) };
      };
      // count of a node's material at each quality
      const matCounts = (nodeId) => { void state.materials; return DD.RARITIES.map((r, q) => state.materials[nodeId + ':' + q] || 0); };
      const materials = computed(() => Object.keys(state.materials).filter((k) => state.materials[k] > 0).map((k) => {
        const parts = k.split(':');
        return { key: k, node: game.matDef(parts[0]), q: +parts[1], count: state.materials[k], value: game.materialValue(k) };
      }).sort((a, b) => (a.node.zone - b.node.zone) || a.node.skill.localeCompare(b.node.skill) || (a.q - b.q)));
      const commonValue = computed(() => materials.value.filter((m) => m.q === 0).reduce((t, m) => t + m.count * m.value, 0));
      function startGather(n) {
        if (state.location === 'delve') { toast('Return to town before you set out to gather.', 'bad'); return; }
        game.startGather(n.id);
        save();
      }
      const sellMaterial = (m) => { game.sellMaterial(m.key); };
      function sellCommonMaterials() {
        let g = 0;
        materials.value.filter((m) => m.q === 0).forEach((m) => { g += game.sellMaterial(m.key); });
        if (g) toast('Sold all Common materials for ' + DD.fmt(g) + ' gold.', 'good');
      }

      // ---- crafting ----
      const crafting = computed(() => state.location === 'craft');
      // ---- energy (refreshed by the loop a few times a second) ----
      const energy = ref({ cur: 0, max: 1, frac: 0, regen: false, feast: false });
      function refreshEnergy() {
        const e = state.energy, max = game.maxEnergy(), now = game.clock();
        energy.value = { cur: e.cur, max, frac: Math.min(1, e.cur / max), regen: e.regenUntil > now, feast: e.feastUntil > now,
          regenLeft: Math.max(0, e.regenUntil - now), feastLeft: Math.max(0, e.feastUntil - now) };
      }
      const energyCost = (n) => game.energyCost(n);

      // ---- cooking & pantry ----
      const craftMode = ref('forge');   // the Craft screen: 'forge' or 'campfire'
      const cooking = computed(() => state.location === 'cook');
      const cookMeal = ref('ration');
      const cookTier = ref(0);
      const cookQuality = ref(0);
      const mealRecipe = computed(() => {
        void state.materials; void state.pantry; void state.skillXp.cooking; void state.bestFloor;
        return game.mealRecipe(cookMeal.value, cookTier.value, cookQuality.value);
      });
      const cookLock = (mealId, tier) => { void state.skillXp.cooking; void state.bestFloor; return game.cookLock(mealId, tier); };
      const mealEffect = (key) => game.mealEffect(key);
      const mealName = (key) => game.mealName(key);
      const pantry = computed(() => Object.keys(state.pantry).filter((k) => state.pantry[k] > 0).map((k) => ({ key: k, count: state.pantry[k], name: game.mealName(k), effect: game.mealEffect(k) }))
        .sort((a, b) => a.effect.tier - b.effect.tier || MEAL_ORDER[a.effect.meal.id] - MEAL_ORDER[b.effect.meal.id] || a.effect.quality - b.effect.quality));
      const pantryInfo = computed(() => { void state.pantry; void state.skillXp.cooking; void state.bestFloor; return { count: game.pantryCount(), cap: game.pantryCap() }; });
      function startCook() {
        if (state.location === 'delve' || state.location === 'gather') { toast('Return to town to use the campfire.', 'bad'); return; }
        if (game.startCook(cookMeal.value, cookTier.value, cookQuality.value)) save();
      }
      const stopCook = () => game.stopCook('manual');
      function eatMeal(key) { if (game.eat(key)) refreshEnergy(); }
      const mealText = (eff) => eff.energy && eff.maxBonus ? '+' + eff.energy + ' energy, +' + eff.maxBonus + ' max for ' + Math.round(eff.duration / 60) + ' min'
        : eff.energy ? '+' + eff.energy + ' energy'
        : 'x' + eff.regen + ' energy regen for ' + Math.round(eff.duration / 60) + ' min';

      // ---- routines ----
      const routineSlots = computed(() => { void state.bestFloor; return game.routineSlots(); });
      const routineNextUnlock = computed(() => { void state.bestFloor; return game.routineSlots() < DD.CONFIG.routineMaxSteps ? game.nextCapGuardian() : null; });
      const UNTIL = {
        gather: [['energyBelow', 'energy drops below %'], ['done', 'out of energy and food'], ['items', 'N items gathered'], ['minutes', 'N minutes pass']],
        delve:  [['energyFull', 'energy is full'], ['hpBelow', 'HP drops below %'], ['minutes', 'N minutes pass']],
        rest:   [['energyFull', 'energy is full'], ['hpFull', 'HP is full'], ['minutes', 'N minutes pass']],
        cook:   [['done', 'out of ingredients'], ['pantryFull', 'the pantry is full'], ['items', 'N meals cooked'], ['minutes', 'N minutes pass']],
        craft:  [['done', 'out of materials or gold'], ['items', 'N items crafted'], ['minutes', 'N minutes pass']]
      };
      const ACTS = [['gather', 'Gather'], ['delve', 'Delve'], ['rest', 'Rest in town'], ['cook', 'Cook'], ['craft', 'Craft']];
      const untilNeedsValue = (u) => ['energyBelow', 'hpBelow', 'items', 'minutes'].indexOf(u) !== -1;
      function defaultStep(act) {
        const firstNode = DD.NODES.find((n) => !game.nodeLock(n)) || DD.NODES[0];
        const t = act === 'gather' ? { node: firstNode.id } : act === 'delve' ? { from: 'left' }
          : act === 'cook' ? { meal: 'ration', tier: 0, q: 0 } : act === 'craft' ? { slot: 'weapon', tier: 0, q: 0 } : {};
        const u = UNTIL[act][0][0];
        return { act, target: t, until: u, value: u === 'energyBelow' ? 10 : u === 'hpBelow' ? 25 : u === 'items' ? 20 : u === 'minutes' ? 10 : 0 };
      }
      function setStepAct(st, act) { Object.assign(st, defaultStep(act)); }
      function stepLabel(i) { const st = state.routine.steps[i], a = st && ACTS.find((x) => x[0] === st.act); return a ? a[1] : ''; }
      function setStepUntil(st, u) { st.until = u; if (untilNeedsValue(u) && !st.value) st.value = u === 'energyBelow' ? 10 : u === 'hpBelow' ? 25 : u === 'items' ? 20 : 10; }
      function addStep() { if (state.routine.steps.length < routineSlots.value) state.routine.steps.push(defaultStep(state.routine.steps.length ? 'delve' : 'gather')); }
      function removeStep(i) { state.routine.steps.splice(i, 1); if (state.routine.idx >= state.routine.steps.length) state.routine.idx = 0; }
      function moveStep(i, d) {
        const st = state.routine.steps, j = i + d;
        if (j < 0 || j >= st.length) return;
        const tmp = st[i]; st[i] = st[j]; st[j] = tmp;
      }
      const TEMPLATES = [
        { id: 'gatherRest', name: 'Gather and rest', steps: () => [defaultStep('gather'), Object.assign(defaultStep('rest'), { until: 'energyFull' })] },
        { id: 'gatherDelve', name: 'Gather and delve', steps: () => [defaultStep('gather'), defaultStep('delve')] },
        { id: 'delveCook', name: 'Delve and cook', steps: () => [Object.assign(defaultStep('delve'), { until: 'minutes', value: 20 }), defaultStep('cook')] }
      ];
      function applyTemplate(tp) {
        game.stopRoutine();
        state.routine.steps = tp.steps().slice(0, routineSlots.value);
        state.routine.idx = 0;
      }
      function toggleRoutine() {
        if (state.routine.on) { game.stopRoutine(); return; }
        if (!game.startRoutine()) toast('Add at least one step first.', 'bad');
        else save();
      }
      const gatherOptions = computed(() => { void state.skillXp; void state.bestFloor; return DD.NODES.map((n) => ({ id: n.id, label: n.name + ' (' + n.item + ')' + (game.nodeLock(n) ? ' 🔒' : '') })); });
      const MEAL_ORDER = { ration: 0, stew: 1, roast: 2, feast: 3 };

      const craftSlot = ref('weapon');
      const craftTier = ref(0);
      const craftQuality = ref(0);
      const recipe = computed(() => {
        void state.materials; void state.skillXp.crafting; void state.cls; void state.bag.length;
        return game.recipe(craftSlot.value, craftTier.value, craftQuality.value);
      });
      const craftLock = (tier) => { void state.skillXp.crafting; return game.craftLock(tier); };
      // Life skill level cap from combat progress, and who to beat to raise it.
      const levelCap = computed(() => { void state.bestFloor; return game.levelCap(); });
      const nextCapGuardian = computed(() => { void state.bestFloor; return game.nextCapGuardian(); });
      const refineLock = (n, q) => { void state.skillXp[n.skill]; void state.bestFloor; return game.refineLock(n.id, q); };
      const masterwork = computed(() => { void state.skillXp.crafting; return game.masterworkChance(); });
      const tierMaterials = computed(() => DD.NODES.filter((n) => n.zone === craftTier.value));
      function startCraft() {
        if (state.location === 'delve' || state.location === 'gather') { toast('Return to town to use the forge.', 'bad'); return; }
        if (state.bag.length >= DD.CONFIG.bagSize) { toast('Your bag is full. Sell or equip something first.', 'bad'); return; }
        if (game.startCraft(craftSlot.value, craftTier.value, craftQuality.value)) save();
      }
      const stopCraft = () => game.stopCraft('manual');
      function refine(n, q) {
        const made = game.refine(n.id, q);
        if (made) toast('Refined ' + made + ' ' + DD.RARITIES[q + 1].name + ' ' + n.item + '.', 'good');
      }

      // e.g. "Armor 25% · Block 14%"
      const classTraits = computed(() => {
        const d = stats.value, out = [];
        if (d.dr) out.push('Armor ' + pct(d.dr * 100));
        if (d.block) out.push('Block ' + pct(d.block * 100));
        if (d.evade) out.push('Dodge ' + pct(d.evade * 100));
        if (d.spellCd) out.push('Spell every ' + d.spellCd.toFixed(1) + 's');
        if (d.crit) out.push('Crit ' + pct(d.crit * 100));
        return out.join(' · ');
      });

      function toast(text, kind) {
        const id = Date.now() + Math.random();
        toasts.value.push({ id, text, kind: kind || 'info' });
        if (toasts.value.length > 4) toasts.value.shift();
        setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, 3500);
      }

      function handleUi(e) {
        switch (e.type) {
          case 'bossKill':
            toast(e.guardian ? e.name + ' falls! A new realm opens below.' : e.name + ' defeated!', 'good');
            break;
          case 'bossFail': toast(e.name + ' drove you back. Upgrade and challenge again.', 'bad'); break;
          case 'heroDie': toast('Slain by ' + e.name + '. You dropped ' + DD.fmt(e.lost) + ' gold and were carried back to town.', 'bad'); break;
          case 'town':
            if (e.reason === 'auto') toast('Badly wounded, your hero heads back to Hearthstead to rest.', 'info');
            else if (e.reason === 'tired') toast('Out of energy. Your hero heads back to Hearthstead to rest.', 'info');
            departFloor.value = state.floor;
            break;
          case 'skillLevel': toast(e.skill.name + ' is now level ' + e.level + '!', 'good'); break;
          case 'craft':
            if (e.master) toast('Masterwork! ' + e.item.name + ' came out ' + DD.RARITIES[e.item.rarity].name + '.', 'loot');
            else if (e.item.rarity >= 3) toast('Crafted ' + e.item.name + ' (' + DD.RARITIES[e.item.rarity].name + ').', 'loot');
            break;
          case 'heroLevel': toast('Level ' + e.level + '! +' + e.points + ' stat points to assign on the Hero screen.', 'good'); break;
          case 'tired': toast('Too tired to gather. Rest, eat something, or wait for energy to come back.', 'bad'); break;
          case 'cookStop':
            if (e.reason === 'ingredients') toast('Out of ingredients. Your hero steps away from the campfire.', 'info');
            else if (e.reason === 'pantry') toast('The pantry is full. Cooking stopped.', 'info');
            break;
          case 'craftStop':
            if (e.reason === 'gold') toast('Not enough gold for the forge fee. Crafting stopped.', 'bad');
            else if (e.reason === 'materials') toast('Out of materials. Your hero steps away from the forge.', 'info');
            else if (e.reason === 'bag') toast('Your bag is full. Crafting stopped.', 'bad');
            break;
          case 'unlock': toast('New skin unlocked: ' + e.skin.name, 'good'); break;
          case 'purchase': toast('Purchase granted: ' + e.sku, 'good'); break;
          case 'loot': {
            if (e.full) {
              if (Date.now() - lastFullToast > 30000) { lastFullToast = Date.now(); toast('Your bag is full. New drops are salvaged for gold.', 'bad'); }
            } else if (!e.salvaged && (e.item.rarity >= 2 || e.upgrade)) {
              toast((e.upgrade ? '▲ Upgrade: ' : 'Found: ') + e.item.name + ' (' + DD.RARITIES[e.item.rarity].name + ')', e.item.rarity >= 3 ? 'loot' : 'good');
            }
            break;
          }
        }
      }

      function loop(now) {
        let dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        if (state.cls) {
          while (dt > 0) {
            const step = Math.min(dt, 1 / 30);
            game.update(step);
            dt -= step;
          }
        }
        const events = game.events.splice(0);
        for (const e of events) { renderer.handle(e); handleUi(e); }
        if ((loop.n = (loop.n || 0) + 1) % 10 === 0) { heroHp.value = Math.min(1, game.b.heroHp / game.stats().maxHp); refreshEnergy(); }
        renderer.draw(Math.min(0.25, (now - (loop.prev || now)) / 1000), now / 1000);
        loop.prev = now;
        rafId = requestAnimationFrame(loop);
      }

      // Time away is replayed with the real game (routines, energy, cooking and all), then summarised.
      function grantOffline(seconds) {
        if (seconds < 60 || !state.cls) return;
        const plan = game.offlinePlan(seconds), before = game.snapshot();
        game.replay(plan.simSeconds);
        const sum = game.offlineSummary(before, game.snapshot());
        refreshEnergy();
        const anything = sum.gold >= 1 || sum.mats.length || sum.levels || sum.crafted || sum.cooked || sum.skills.length;
        if (anything) modal.value = { type: 'offline', seconds: plan.seconds, capped: seconds > plan.seconds, sum };
      }

      function save() { if (!unloading && state.cls) writeSave(state); }

      function onVisibility() {
        if (document.hidden) { hiddenAt = Date.now(); save(); }
        else if (hiddenAt) {
          grantOffline((Date.now() - hiddenAt) / 1000);
          hiddenAt = null;
          last = performance.now();
        }
      }

      onMounted(() => {
        renderer = new DD.Renderer(canvas.value, game, overlay.value);
        refreshEnergy();
        if (saved && saved.lastSeen) grantOffline((Date.now() - saved.lastSeen) / 1000);
        last = performance.now();
        rafId = requestAnimationFrame(loop);
        saveTimer = setInterval(save, 10000);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('beforeunload', save);
      });

      onBeforeUnmount(() => {
        cancelAnimationFrame(rafId);
        clearInterval(saveTimer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('beforeunload', save);
      });

      // ---- actions ----
      const tap = () => game.tap();
      const challenge = () => game.challenge();
      const quote = (kind, id) => game.quote(kind, id, state.settings.buyMode);
      const buy = (kind, id) => game.buy(kind, id, state.settings.buyMode);
      const describe = (kind, id) => game.describe(kind, id, Math.max(1, quote(kind, id).count));
      const level = (kind, id) => game.level(kind, id);
      const setBuyMode = (m) => { state.settings.buyMode = m; };

      function chooseClass(id) {
        game.chooseClass(id);
        retireCls.value = id;
        departFloor.value = 1;
        renderer.setBanner('HEARTHSTEAD', 'Press Set out to begin your delve', '#ffcf6a');
        save();
      }

      function goTown() {
        if (game.goToTown('manual') && (tab.value === 'upgrades' || tab.value === 'companions')) tab.value = 'merchant';
      }
      function setOut() {
        game.depart(departFloor.value);
        save();
      }

      // ---- merchant ----
      const price = (item) => game.price(item);
      function buyItem(item) {
        if (state.bag.length >= DD.CONFIG.bagSize) { toast('Your bag is full. Sell something first.', 'bad'); return; }
        if (game.buyItem(item.id)) toast('Bought ' + item.name + '. It is in your bag.', 'good');
      }
      const rerollCost = computed(() => { void state.runMaxFloor; return game.rerollCost(); });
      const reroll = () => game.reroll();

      function openRetire() {
        retireCls.value = state.cls;
        modal.value = { type: 'prestige' };
      }

      function confirmPrestige() {
        const g = game.prestige(retireCls.value);
        modal.value = null;
        departFloor.value = 1;
        if (g > 0) toast('Your hero retires a legend. +' + DD.fmt(g) + ' Soul Gems.', 'good');
        else if (g === 0) toast('Your hero retires. No new depth this time, so no new Soul Gems.', 'info');
        if (g >= 0) save();
      }

      function hardReset() {
        unloading = true;
        clearSave();
        location.reload();
      }

      function img(key, make) {
        if (!previews[key]) previews[key] = make();
        return previews[key];
      }
      const heroPreview = (clsId, skin, scale) => img('h|' + clsId + '|' + skin + '|' + scale, () => DD.Sprites.preview(clsId, { skin }, scale));
      const skinPreview = (id) => heroPreview(state.cls || 'knight', id, 4);
      // On phones the menu is a bar at the bottom of the screen, so after a tap scroll to the screen it opened.
      function openTab(id) {
        tab.value = id;
        if (window.innerWidth <= 860) {
          nextTick(() => {
            const el = document.querySelector('.menu-title');
            if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          });
        }
      }
      const menuIcon = (id) => img('m|' + id, () => DD.Sprites.preview(id, {}, 3));
      const ownsSkin = (id) => state.skinsOwned.indexOf(id) !== -1;
      const equip = (id) => game.equip(id);

      // ---- gear ----
      const rarity = (item) => DD.RARITIES[item.rarity];
      const itemIcon = (item) => {
        const id = DD.Sprites.iconFor(item), tint = rarity(item).color;
        return img('i|' + id + '|' + tint, () => DD.Sprites.preview(id, { tint }, 5));
      };
      const slotIcon = (slot) => {
        const id = slot === 'weapon' ? DD.Sprites.iconFor({ slot, cls: state.cls }) : 'icon_' + slot;
        return img('s|' + id, () => DD.Sprites.preview(id, { tint: '#4a4058' }, 5));
      };
      function itemLines(item) {
        const keys = Object.keys(item.stats).sort((a, b) => (a === item.main ? -1 : b === item.main ? 1 : 0));
        return keys.map((k) => ({ main: k === item.main, text: '+' + pct(game.itemStat(item, k)) + ' ' + DD.STAT_DEFS[k].name }));
      }
      const canEquip = (item) => game.canEquip(item);
      const isUpgrade = (item) => game.isUpgrade(item);
      const salvageValue = (item) => game.salvageValue(item);
      const equipItem = (item) => { game.equipItem(item.id); };
      const unequip = (slot) => {
        if (!game.unequip(slot)) toast('Your bag is full.', 'bad');
      };
      const salvageItem = (item) => { game.salvage([item.id]); };
      const bagSorted = computed(() => state.bag.slice().sort((a, b) =>
        (isUpgrade(b) - isUpgrade(a)) || (b.rarity - a.rarity) || (b.ilvl - a.ilvl)));
      function salvageJunk() {
        const ids = state.bag.filter((it) => !isUpgrade(it)).map((it) => it.id);
        if (!ids.length) { toast('Nothing to salvage. Every item is an upgrade.', 'info'); return; }
        const g = game.salvage(ids);
        toast('Salvaged ' + ids.length + ' item' + (ids.length > 1 ? 's' : '') + ' for ' + DD.fmt(g) + ' gold.', 'good');
      }

      // Placeholder until the payment backend exists. The backend will verify the payment,
      // then the client calls game.grantPurchase(sku).
      function purchase(item) {
        if (dev) { game.grantPurchase(item.sku); save(); return; }
        toast('The store opens soon!', 'info');
      }

      const playTime = computed(() => DD.fmtTime(state.stats.playSeconds));

      return {
        state, stats, cls, canvas, overlay, tab, toasts, modal, dev, gemsOnRetire, canRetire, nextIsBoss, playTime, zoneName, hero, describeAttr, assign, respecCost, respec, itemTitle, enhanceCost, enhanceChance, enhance, ATTRS: DD.ATTRS,
        classTraits, retireCls, bagSorted, inTown, departOptions, departFloor, heroHp, restockIn, rerollCost,
        goTown, setOut, price, buyItem, reroll,
        gathering, skillTab, gatherNodeInfo, skillProgress, skillNodes, nodeLock, gatherTime, gatherPerks, matCounts, materials, commonValue,
        startGather, sellMaterial, sellCommonMaterials, materialValue: (k) => game.materialValue(k), SKILLS: DD.SKILLS, ZONES: DD.ZONES,
        crafting, craftSlot, craftTier, craftQuality, recipe, craftLock, masterwork, tierMaterials, startCraft, stopCraft, refine,
        CRAFT_TIER_LEVEL: DD.CRAFT_TIER_LEVEL, pct, MENU, menuIcon, openTab, energy, energyCost, craftMode, cooking, cookMeal, cookTier, cookQuality, mealRecipe, cookLock,
        mealEffect, mealName, pantry, pantryInfo, startCook, stopCook, eatMeal, mealText, MEALS: DD.MEALS,
        routineSlots, routineNextUnlock, UNTIL, ACTS, untilNeedsValue, setStepAct, setStepUntil, addStep, removeStep, moveStep,
        TEMPLATES, applyTemplate, toggleRoutine, gatherOptions, stepLabel, levelCap, nextCapGuardian, refineLock,
        CLASS_LIST: DD.CLASS_LIST, COMPANIONS: DD.COMPANIONS, SKINS: DD.SKINS, STORE_ITEMS: DD.STORE_ITEMS,
        CONFIG: DD.CONFIG, SLOTS: DD.SLOTS, RARITIES: DD.RARITIES,
        fmt: DD.fmt, fmtTime: DD.fmtTime,
        tap, challenge, quote, buy, describe, level, setBuyMode, chooseClass, openRetire, confirmPrestige, hardReset,
        heroPreview, skinPreview, ownsSkin, equip, purchase,
        rarity, itemIcon, slotIcon, itemLines, canEquip, isUpgrade, salvageValue, equipItem, unequip, salvageItem, salvageJunk,
        saveNow: () => { save(); toast('Game saved.', 'info'); },
        owns: (sku) => game.owns(sku)
      };
    }
  }).mount('#app');
})();
