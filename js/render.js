/* Deepdelve - canvas renderer. Draws a 320x180 pixel scene that CSS scales up crisply,
 * plus a high-resolution overlay canvas for text. */
(function (root) {
  'use strict';
  const DD = root.DD;

  const W = 320, H = 180, GROUND = 150, WALL_H = 118;
  const HERO_X = 56, MON_X = 206, SCALE = 3, BOSS_SCALE = 4, GUARD_SCALE = 5;
  // Text goes on a sharp high-res overlay (TEXT_RES x the scene) so numbers stay readable
  // while the pixel art is scaled up chunky. Sizes below are in scene pixels.
  const FONT = '400 {size}px "Jersey 10", monospace';
  const TEXT_RES = 4, TEXT_SCALE = 1.5;
  let TG = null;   // overlay context, set by the Renderer

  // One theme per zone id. style picks the background builder, ambient the animated extras.
  const THEMES = {
    woods: {
      style: 'woods', ambient: 'fireflies', torches: false, trim: '#b6e36a',
      sky: ['#0d2224', '#1d4038', '#3f6a48', '#7a9a5a'], far: '#163428', far2: '#1f4630',
      canopy: ['#173a22', '#22502c', '#2f6634'], trunk: '#2b1f17', trunkHi: '#44311f',
      grass: '#36622a', grassHi: '#5a8f3a', grassDark: '#24461d', path: '#5c4a33', pathHi: '#72603f', pathDark: '#43361f'
    },
    swamp: {
      style: 'swamp', ambient: 'swamp', torches: false, trim: '#a8c870',
      sky: ['#141c18', '#24302a', '#38463a', '#56624a'], far: '#1e2a22', far2: '#2a3a2c',
      water: '#1e3028', waterHi: '#3a5444', waterDark: '#14221c', lily: '#4a7a34', lilyHi: '#6a9a44',
      plank: '#5a4430', plankHi: '#6e5640', plankDark: '#3a2c1e', reed: '#4a5a2a', cattail: '#5a3a20', moss: '#3e5a34'
    },
    catacombs: {
      style: 'catacombs', ambient: 'dust', torches: true, trim: '#c9d36a',
      mortar: '#141a16', bricks: ['#2f3a33', '#2a332d', '#36433a'], hi: '#46584a',
      floor: '#262a22', floorDark: '#191c16', floorHi: '#323829', bone: '#d8d2c0', moss: '#3e6a3a'
    },
    castle: {
      style: 'castle', ambient: null, torches: true, trim: '#e3b341',
      mortar: '#16161e', stone: ['#3e3e4c', '#363644', '#464656'], hi: '#565668',
      night: ['#0a1028', '#1a2a58'], moon: '#f0ecd0', banner: '#8a1a24',
      tileA: '#2e2c36', tileB: '#26242e', tileHi: '#3c3a46', carpet: '#7a1a22', carpetHi: '#9a2a30'
    },
    void: {
      style: 'void', ambient: 'void', torches: false, trim: '#c99bff',
      sky: ['#05030c', '#120828', '#241040', '#2e1450'], nebula: ['rgba(140,60,220,0.07)', 'rgba(60,160,220,0.06)', 'rgba(220,60,160,0.05)'],
      planet: '#4a2a78', planetHi: '#7a4ab0', rock: '#1e1230', rockHi: '#4a2a78',
      ground: '#1a0e2c', groundHi: '#6a3fb0', groundDark: '#0e0818', crystal: '#5ff0ff', crack: '#8a5aff'
    }
  };
  const TORCHES = [{ x: 28, y: 46 }, { x: 292, y: 46 }];

  const zoneOf = (floor) => DD.zoneAt(floor);
  const themeOf = (floor) => THEMES[zoneOf(floor).zone.id];

  function rng(seed) {
    return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }

  // ---- pixel drawing helpers ----
  function lerpColor(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }

  // Banded vertical gradient (pixel-art style, no smooth blending).
  function bands(g, y0, y1, colors, steps) {
    const h = (y1 - y0) / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1) * (colors.length - 1);
      const k = Math.min(colors.length - 2, Math.floor(t));
      g.fillStyle = lerpColor(colors[k], colors[k + 1], t - k);
      g.fillRect(0, Math.floor(y0 + i * h), W, Math.ceil(h) + 1);
    }
  }

  function disc(g, cx, cy, r, color) {
    g.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.round(Math.sqrt(r * r - dy * dy));
      g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }

  function vignette(g, strength) {
    const grad = g.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, 210);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  function torchBrackets(g) {
    TORCHES.forEach((t) => {
      g.fillStyle = '#2a2018'; g.fillRect(t.x - 3, t.y + 8, 7, 2);
      g.fillStyle = '#5a3b22'; g.fillRect(t.x - 1, t.y, 3, 10);
    });
  }

  function brickWall(g, t, r, bw, bh, colors) {
    g.fillStyle = t.mortar;
    g.fillRect(0, 0, W, WALL_H);
    for (let row = 0; row * bh < WALL_H; row++) {
      const y = row * bh, off = (row % 2) * (bw / 2);
      for (let x = -off; x < W; x += bw) {
        g.fillStyle = colors[Math.floor(r() * colors.length)];
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = t.hi;
        g.fillRect(x + 1, y + 1, bw - 2, 1);
        if (r() < 0.08) { g.fillStyle = t.mortar; g.fillRect(x + 3 + Math.floor(r() * (bw - 8)), y + 3, 2, 1); }
      }
    }
  }

  function flagstones(g, t) {
    g.fillStyle = t.floor;
    g.fillRect(0, WALL_H, W, H - WALL_H);
    g.fillStyle = t.floorDark;
    g.fillRect(0, WALL_H, W, 3);
    const heights = [9, 12, 15, 19, 24];
    let y = WALL_H + 3, i = 0;
    while (y < H) {
      const h = heights[Math.min(i, heights.length - 1)];
      g.fillStyle = t.floorHi; g.fillRect(0, y, W, 1);
      g.fillStyle = t.floorDark; g.fillRect(0, y + h - 1, W, 1);
      const w = 20 + i * 8, off = (i % 2) * (w / 2);
      for (let x = -off; x < W; x += w) g.fillRect(Math.round(x), y, 1, h - 1);
      y += h; i++;
    }
  }

  // ---- zone backgrounds ----
  function buildWoods(g, t, r) {
    bands(g, 0, WALL_H, t.sky, 12);
    // two layers of distant treeline
    for (let x = -10; x < W + 10; x += 8 + Math.floor(r() * 8)) disc(g, x, 70 + r() * 12, 9 + Math.floor(r() * 7), t.far);
    g.fillStyle = t.far; g.fillRect(0, 78, W, WALL_H - 78);
    for (let x = -10; x < W + 10; x += 10 + Math.floor(r() * 10)) disc(g, x, 92 + r() * 8, 8 + Math.floor(r() * 6), t.far2);
    g.fillStyle = t.far2; g.fillRect(0, 98, W, WALL_H - 98);
    // light shafts through the canopy
    g.fillStyle = 'rgba(255,240,170,0.07)';
    for (let i = 0; i < 4; i++) {
      const x = 30 + i * 78 + r() * 24;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 52, WALL_H + 10); g.lineTo(x + 30, WALL_H + 10); g.fill();
    }
    // foreground trunks (kept clear of the hero and monster)
    [{ x: 4, w: 16 }, { x: 128, w: 11 }, { x: 290, w: 18 }].forEach((tr) => {
      g.fillStyle = t.trunk; g.fillRect(tr.x, 0, tr.w, WALL_H + 8);
      g.fillStyle = t.trunkHi; g.fillRect(tr.x + 2, 0, 2, WALL_H + 8);
      for (let y = 10; y < WALL_H; y += 9 + Math.floor(r() * 10)) { g.fillStyle = '#1a120c'; g.fillRect(tr.x + 4 + Math.floor(r() * (tr.w - 6)), y, 2, 3); }
      g.fillStyle = t.trunk; g.fillRect(tr.x - 3, WALL_H + 4, tr.w + 6, 4);   // roots
    });
    // canopy across the top
    for (let x = -6; x < W + 6; x += 7) {
      disc(g, x, 4 + r() * 10, 10 + Math.floor(r() * 6), t.canopy[0]);
    }
    for (let x = -6; x < W + 6; x += 9) disc(g, x + r() * 4, r() * 6, 7 + Math.floor(r() * 5), t.canopy[1]);
    for (let i = 0; i < 40; i++) { g.fillStyle = t.canopy[2]; g.fillRect(Math.floor(r() * W), Math.floor(r() * 14), 3, 2); }
    // grass and a dirt path
    g.fillStyle = t.grass; g.fillRect(0, WALL_H, W, H - WALL_H);
    g.fillStyle = t.grassDark; g.fillRect(0, WALL_H, W, 2);
    for (let x = 0; x < W; x += 2) {
      const top = 132 + Math.round(Math.sin(x * 0.07) * 2 + r() * 2), bot = 164 + Math.round(Math.sin(x * 0.05 + 1) * 2 + r() * 2);
      g.fillStyle = t.path; g.fillRect(x, top, 2, bot - top);
      g.fillStyle = t.pathDark; g.fillRect(x, top, 2, 1); g.fillRect(x, bot - 1, 2, 1);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? t.pathHi : t.pathDark; g.fillRect(Math.floor(r() * W), 136 + Math.floor(r() * 26), 2, 1); }
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(r() * W), y = WALL_H + 3 + Math.floor(r() * (H - WALL_H - 3));
      if (y > 130 && y < 166) continue;
      g.fillStyle = r() < 0.6 ? t.grassHi : t.grassDark;
      g.fillRect(x, y, 1, 2); g.fillRect(x + 2, y + 1, 1, 2);
    }
    // a few flowers
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(r() * W), y = r() < 0.5 ? 122 + Math.floor(r() * 8) : 168 + Math.floor(r() * 10);
      g.fillStyle = ['#f0d84a', '#e8e8f0', '#d86a8a'][i % 3]; g.fillRect(x, y, 2, 2);
    }
    vignette(g, 0.55);
  }

  function buildSwamp(g, t, r) {
    bands(g, 0, WALL_H, t.sky, 12);
    // dead trees in two depths
    const deadTree = (x, w, top, color) => {
      g.fillStyle = color;
      g.fillRect(x, top, w, WALL_H - top);
      for (let i = 0; i < 4; i++) {
        const by = top + 6 + Math.floor(r() * 30), dir = r() < 0.5 ? -1 : 1, len = 8 + Math.floor(r() * 14);
        for (let k = 0; k < len; k++) g.fillRect(x + (dir > 0 ? w : -1) + dir * k, by - Math.floor(k / 2), 1, 2);
      }
    };
    for (let i = 0; i < 7; i++) deadTree(Math.floor(r() * W), 3 + Math.floor(r() * 2), 30 + Math.floor(r() * 30), t.far);
    for (let i = 0; i < 4; i++) deadTree(Math.floor(r() * W), 5 + Math.floor(r() * 3), 14 + Math.floor(r() * 20), t.far2);
    // hanging moss
    for (let i = 0; i < 26; i++) {
      g.fillStyle = t.moss;
      g.fillRect(Math.floor(r() * W), 0, 1, 6 + Math.floor(r() * 26));
    }
    // fog bank
    g.fillStyle = 'rgba(190,210,190,0.10)'; g.fillRect(0, 86, W, 32);
    g.fillStyle = 'rgba(190,210,190,0.08)'; g.fillRect(0, 100, W, 18);
    // water
    g.fillStyle = t.water; g.fillRect(0, WALL_H, W, H - WALL_H);
    g.fillStyle = t.waterDark; g.fillRect(0, WALL_H, W, 2);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() < 0.7 ? t.waterHi : t.waterDark;
      g.fillRect(Math.floor(r() * W), WALL_H + 3 + Math.floor(r() * (H - WALL_H - 3)), 3 + Math.floor(r() * 8), 1);
    }
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * W), y = r() < 0.5 ? 124 + Math.floor(r() * 10) : 164 + Math.floor(r() * 12);
      g.fillStyle = t.lily; g.fillRect(x, y, 7, 3); g.fillRect(x + 1, y - 1, 5, 1);
      g.fillStyle = t.lilyHi; g.fillRect(x + 1, y, 2, 1);
      g.fillStyle = t.water; g.fillRect(x + 3, y + 1, 1, 2);
    }
    // boardwalk the fighters stand on
    for (let x = 0; x < W; x += 30) {
      g.fillStyle = t.plankDark; g.fillRect(x + 4, 154, 3, 12);
      g.fillStyle = t.waterHi; g.fillRect(x + 2, 166, 7, 1);
    }
    g.fillStyle = t.plank; g.fillRect(0, 140, W, 15);
    g.fillStyle = t.plankHi; g.fillRect(0, 140, W, 1);
    g.fillStyle = t.plankDark; g.fillRect(0, 154, W, 1);
    let px = 0;
    while (px < W) {
      const pw = 12 + Math.floor(r() * 10);
      g.fillStyle = t.plankDark; g.fillRect(px, 141, 1, 13);
      if (r() < 0.4) { g.fillStyle = t.plankHi; g.fillRect(px + 3, 145 + Math.floor(r() * 6), 4, 1); }
      px += pw;
    }
    // reeds at the edges
    const reeds = (x0, x1) => {
      for (let i = 0; i < 14; i++) {
        const x = x0 + Math.floor(r() * (x1 - x0)), h = 14 + Math.floor(r() * 20), base = 176;
        g.fillStyle = t.reed; g.fillRect(x, base - h, 1, h);
        if (r() < 0.5) { g.fillStyle = t.cattail; g.fillRect(x, base - h - 4, 2, 5); }
      }
    };
    reeds(0, 34); reeds(286, 320);
    vignette(g, 0.6);
  }

  function buildCatacombs(g, t, r) {
    brickWall(g, t, r, 16, 8, t.bricks);
    // skull niches
    [70, 150, 250].forEach((x) => {
      g.fillStyle = '#0b0e0c'; g.fillRect(x, 30, 22, 18);
      disc(g, x + 11, 30, 11, '#0b0e0c');
      g.fillStyle = t.bone; g.fillRect(x + 7, 34, 8, 7); g.fillRect(x + 8, 41, 6, 3);
      g.fillStyle = '#0b0e0c'; g.fillRect(x + 8, 36, 2, 2); g.fillRect(x + 12, 36, 2, 2); g.fillRect(x + 10, 42, 1, 2);
      g.fillStyle = t.bone; g.fillRect(x + 2, 45, 18, 2);
    });
    // moss streaks
    for (let i = 0; i < 30; i++) { g.fillStyle = t.moss; g.fillRect(Math.floor(r() * W), Math.floor(r() * WALL_H), 2, 1 + Math.floor(r() * 4)); }
    // cobwebs in the corners
    g.strokeStyle = 'rgba(220,220,220,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0, 6 + i * 6); g.lineTo(6 + i * 6, 0); g.stroke(); }
    g.beginPath(); g.moveTo(0, 0); g.lineTo(22, 22); g.stroke();
    torchBrackets(g);
    flagstones(g, t);
    // scattered bones
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(r() * W), y = 160 + Math.floor(r() * 16);
      g.fillStyle = t.bone; g.fillRect(x, y, 6, 1); g.fillRect(x - 1, y - 1, 2, 3); g.fillRect(x + 5, y - 1, 2, 3);
    }
    vignette(g, 0.65);
  }

  function buildCastle(g, t, r) {
    brickWall(g, t, r, 24, 12, t.stone);
    // tall arched windows with a moonlit sky
    [{ x: 100, moon: true }, { x: 196, moon: false }].forEach((w) => {
      const x = w.x, top = 22, wd = 22, bot = 80;
      g.fillStyle = '#0e0e14'; g.fillRect(x - 2, top + 9, wd + 4, bot - top - 7); disc(g, x + wd / 2, top + 10, wd / 2 + 2, '#0e0e14');
      const sky = g.createLinearGradient(0, top, 0, bot);
      sky.addColorStop(0, t.night[0]); sky.addColorStop(1, t.night[1]);
      g.fillStyle = sky; g.fillRect(x, top + 10, wd, bot - top - 10);
      disc(g, x + wd / 2, top + 10, wd / 2, t.night[0]);
      for (let i = 0; i < 6; i++) { g.fillStyle = '#d8e0ff'; g.fillRect(x + 2 + Math.floor(r() * (wd - 4)), top + 4 + Math.floor(r() * 50), 1, 1); }
      if (w.moon) { disc(g, x + 14, top + 18, 4, t.moon); disc(g, x + 16, top + 16, 3, t.night[0]); }
      g.fillStyle = '#2a2a36'; g.fillRect(x + wd / 2 - 1, top, 2, bot - top); g.fillRect(x, top + 36, wd, 2);
      g.fillStyle = '#4a4a5c'; g.fillRect(x - 3, bot, wd + 6, 3);
      // moonlight on the floor
      g.fillStyle = 'rgba(160,180,255,0.05)';
      g.beginPath(); g.moveTo(x, bot); g.lineTo(x + wd, bot); g.lineTo(x + wd + 30, WALL_H + 40); g.lineTo(x + 20, WALL_H + 40); g.fill();
    });
    // royal banners
    [150, 260, 50].forEach((bx) => {
      g.fillStyle = '#1a1410'; g.fillRect(bx - 3, 14, 22, 2);
      g.fillStyle = t.banner; g.fillRect(bx, 16, 16, 44);
      g.fillRect(bx, 60, 6, 6); g.fillRect(bx + 10, 60, 6, 6);
      g.fillStyle = t.trim;
      g.fillRect(bx, 16, 16, 1); g.fillRect(bx + 1, 18, 1, 40); g.fillRect(bx + 14, 18, 1, 40);
      g.fillRect(bx + 4, 30, 8, 3); g.fillRect(bx + 4, 27, 2, 3); g.fillRect(bx + 7, 26, 2, 4); g.fillRect(bx + 10, 27, 2, 3);  // crown
    });
    torchBrackets(g);
    // checkered floor with a red carpet
    g.fillStyle = t.tileA; g.fillRect(0, WALL_H, W, H - WALL_H);
    g.fillStyle = '#121218'; g.fillRect(0, WALL_H, W, 3);
    for (let y = WALL_H + 3, row = 0; y < H; y += 10, row++) {
      for (let x = (row % 2) * 14; x < W; x += 28) { g.fillStyle = t.tileB; g.fillRect(x, y, 14, 10); }
      g.fillStyle = t.tileHi; g.fillRect(0, y, W, 1);
    }
    g.fillStyle = t.carpet; g.fillRect(0, 138, W, 20);
    g.fillStyle = t.trim; g.fillRect(0, 139, W, 1); g.fillRect(0, 156, W, 1);
    g.fillStyle = t.carpetHi; g.fillRect(0, 141, W, 1);
    for (let x = 8; x < W; x += 24) { g.fillStyle = t.trim; g.fillRect(x, 147, 2, 2); }
    vignette(g, 0.6);
  }

  function buildVoid(g, t, r) {
    bands(g, 0, H, t.sky, 14);
    for (let i = 0; i < 26; i++) disc(g, Math.floor(r() * W), Math.floor(r() * 110), 14 + Math.floor(r() * 26), t.nebula[i % t.nebula.length]);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = r() < 0.8 ? '#cfc8ff' : '#7fe8ff';
      g.fillRect(Math.floor(r() * W), Math.floor(r() * 120), 1, 1);
    }
    // a ringed planet
    disc(g, 252, 34, 17, t.planet);
    disc(g, 246, 28, 11, t.planetHi);
    disc(g, 250, 32, 11, t.planet);
    g.fillStyle = '#b89ae0';
    for (let x = -28; x <= 28; x++) g.fillRect(252 + x, 34 + Math.round(x * 0.22), 1, 1);
    // floating rocks
    [{ x: 40, y: 64, w: 22 }, { x: 150, y: 44, w: 14 }, { x: 196, y: 88, w: 18 }, { x: 300, y: 80, w: 12 }].forEach((k) => {
      g.fillStyle = t.rock;
      for (let i = 0; i < k.w / 2; i++) g.fillRect(k.x + i, k.y + i, k.w - i * 2, 1);
      g.fillRect(k.x - 1, k.y - 2, k.w + 2, 2);
      g.fillStyle = t.rockHi; g.fillRect(k.x - 1, k.y - 3, k.w + 2, 1);
      g.fillStyle = t.crystal; g.fillRect(k.x + Math.floor(k.w / 2), k.y - 6, 2, 3);
    });
    // crystalline ground
    for (let x = 0; x < W; x += 2) {
      const top = 124 + Math.round(Math.sin(x * 0.11) * 2 + r() * 2);
      g.fillStyle = t.ground; g.fillRect(x, top, 2, H - top);
      g.fillStyle = t.groundHi; g.fillRect(x, top, 2, 1);
    }
    g.fillStyle = t.groundDark; g.fillRect(0, 170, W, 10);
    g.strokeStyle = t.crack; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = Math.floor(r() * W), y = 132 + Math.floor(r() * 30);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += 4 + Math.floor(r() * 8); y += Math.floor(r() * 7) - 3; g.lineTo(x, y); }
      g.stroke();
    }
    // crystal shards at the edges
    const shard = (x, h) => {
      for (let i = 0; i < h; i++) {
        const w = Math.max(1, Math.round((h - i) / h * 4));
        g.fillStyle = i < 2 ? '#e0ffff' : t.crystal;
        g.fillRect(x - Math.floor(w / 2), 132 - i, w, 1);
      }
    };
    shard(12, 18); shard(22, 10); shard(300, 22); shard(288, 12); shard(150, 8);
    vignette(g, 0.5);
  }

  // ---- Hearthstead, the town hub ----
  const TOWN = { fireX: 162, heroX: 92, merchX: 212, stallL: 194, stallR: 270, anvilX: 128 };

  function buildTown(g, t, r) {
    bands(g, 0, 124, ['#141030', '#2e2450', '#6a3e62', '#c8704e'], 14);
    for (let i = 0; i < 40; i++) { g.fillStyle = '#e8e0ff'; g.fillRect(Math.floor(r() * W), Math.floor(r() * 50), 1, 1); }
    disc(g, 40, 22, 6, '#f4ecc8');   // moon
    // rolling hills
    for (let x = -20; x < W + 20; x += 26) disc(g, x, 108 + r() * 6, 22 + Math.floor(r() * 10), '#2a2240');
    for (let x = -10; x < W + 10; x += 18) disc(g, x, 118 + r() * 4, 12 + Math.floor(r() * 6), '#221c34');
    // cottages
    const cottage = (x, w, h, roof) => {
      const top = 132 - h;
      g.fillStyle = '#4a3428'; g.fillRect(x, top, w, h);
      g.fillStyle = '#3a281e';
      for (let k = x + 6; k < x + w; k += 10) g.fillRect(k, top, 2, h);
      g.fillRect(x, top + Math.floor(h / 2), w, 2);
      for (let i = 0; i <= w / 2 + 4; i++) { g.fillStyle = roof; g.fillRect(x - 4 + i, top - i * 0.8 - 1, w + 8 - i * 2, 1); }
      g.fillStyle = '#2a1a14'; g.fillRect(x + w - 14, top + h - 16, 9, 16);   // door
      g.fillStyle = 'rgba(255,190,90,0.25)'; g.fillRect(x + 4, top + 5, 14, 12);
      g.fillStyle = '#ffcf6a'; g.fillRect(x + 7, top + 8, 8, 6);
      g.fillStyle = '#3a281e'; g.fillRect(x + 10, top + 8, 2, 6);
    };
    cottage(4, 56, 34, '#6a2a2a');
    cottage(286, 48, 30, '#3a4a6a');
    // ground: grass and a cobbled square
    g.fillStyle = '#2a4026'; g.fillRect(0, 128, W, H - 128);
    g.fillStyle = '#4a4450'; g.fillRect(0, 136, W, 32);
    for (let y = 137; y < 168; y += 5) {
      for (let x = (y % 2) * 4; x < W; x += 9) {
        g.fillStyle = r() < 0.5 ? '#5a5462' : '#3e3946';
        g.fillRect(x, y, 7, 4);
      }
    }
    g.fillStyle = '#1e2e1c'; g.fillRect(0, 128, W, 2);
    for (let i = 0; i < 40; i++) { g.fillStyle = '#4a6a3a'; g.fillRect(Math.floor(r() * W), 170 + Math.floor(r() * 9), 1, 2); }
    // fence
    for (let x = 64; x < 186; x += 10) { g.fillStyle = '#5a4030'; g.fillRect(x, 120, 2, 12); }
    g.fillStyle = '#6a4a36'; g.fillRect(64, 123, 122, 2); g.fillRect(64, 128, 122, 1);
    // merchant stall: posts, striped awning and back wall (the counter is drawn in front of the merchant)
    g.fillStyle = '#3a2a1e'; g.fillRect(TOWN.stallL + 4, 104, TOWN.stallR - TOWN.stallL - 8, 30);
    g.fillStyle = '#5a3e28'; g.fillRect(TOWN.stallL, 92, 4, 58); g.fillRect(TOWN.stallR - 4, 92, 4, 58);
    for (let x = TOWN.stallL - 6, i = 0; x < TOWN.stallR + 6; x += 8, i++) {
      const col = i % 2 ? '#e8dcc0' : '#b8302f';
      g.fillStyle = col;
      g.fillRect(x, 84, 8, 12);
      disc(g, x + 4, 96, 3, col);
    }
    g.fillStyle = '#7a1e1e'; g.fillRect(TOWN.stallL - 6, 84, TOWN.stallR - TOWN.stallL + 12, 2);
    // campfire logs and stones
    const fx = TOWN.fireX;
    g.fillStyle = '#5a3a22'; g.fillRect(fx - 10, 146, 20, 3); g.fillRect(fx - 7, 144, 14, 2);
    g.fillStyle = '#3a2416'; g.fillRect(fx - 10, 148, 20, 1);
    for (let i = -14; i <= 12; i += 5) { g.fillStyle = '#6a6470'; g.fillRect(fx + i, 149, 4, 3); }
    // barrels and crates by the stall
    g.fillStyle = '#6a4a2a'; g.fillRect(278, 132, 14, 18); g.fillStyle = '#3a2a1a'; g.fillRect(278, 136, 14, 1); g.fillRect(278, 145, 14, 1);
    g.fillStyle = '#7a5a34'; g.fillRect(176, 138, 14, 12); g.fillStyle = '#4a3420'; g.fillRect(176, 138, 14, 1); g.fillRect(182, 138, 1, 12);
    vignette(g, 0.45);
  }

  // ---- life skill scenery, one entry per zone tier ----
  const GATHER_SPOT = {           // where the node sits and where the hero stands
    woodcutting: { x: 170, y: 60, heroX: 108 },
    mining:      { x: 176, y: 118, heroX: 112 },
    fishing:     { x: 220, y: 134, heroX: 100 },
    herbalism:   { x: 160, y: 132, heroX: 108 },
    tailoring:   { x: 172, y: 86, heroX: 104 }
  };
  const TREE_COLORS = [
    { trunk: '#5a4030', bark: '#3a281c', leaves: ['#2f6634', '#3f7a3e', '#5a9a4a'], chip: '#c8a070' },
    { trunk: '#4a3a2a', bark: '#2e2418', leaves: ['#4a6a3a', '#5a7a4a', '#7a9a5a'], chip: '#a89060', droop: true },
    { trunk: '#d8d2c0', bark: '#a8a290', leaves: ['#6a7a6a', '#8a9a8a', '#aab8a8'], chip: '#f0ead8' },
    { trunk: '#4a3020', bark: '#2a1a10', leaves: ['#1e4a20', '#2a5a2a', '#3a6a2a'], chip: '#c09030', sparkle: '#f2c230' },
    { trunk: '#3a2a5a', bark: '#241640', leaves: ['#5a2a90', '#7a4ab0', '#9a6ad0'], chip: '#5ff0ff', sparkle: '#5ff0ff' }
  ];
  const ORE_COLORS = ['#d8843a', '#a0522d', '#cfd8e8', '#6a3a9a', '#5ff0ff'];
  const WATER_COLORS = [['#2e5a7a', '#5a8aaa'], ['#2e4a32', '#4a6a4a'], ['#1a2234', '#3a4a64'], ['#22324e', '#4a5a7e'], ['#2a1450', '#7a4ab0']];
  const HERB_COLORS = ['#cfe3ff', '#e86ab0', '#9ab87a', '#e8343a', '#c070ff'];
  const CLOTH_COLORS = ['#d8ccaa', '#b8c48a', '#e4e4f0', '#8a1a3a', '#5a3aa0'];   // linen, bog cotton, spidersilk, velvet, starweave

  const BUILDERS = { woods: buildWoods, swamp: buildSwamp, catacombs: buildCatacombs, castle: buildCastle, void: buildVoid, town: buildTown };

  function buildBg(theme, seed) {   // theme may be { style: 'town' }
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    BUILDERS[theme.style](c.getContext('2d'), theme, rng(seed));
    return c;
  }

  function text(g, str, x, y, color, size, align) {
    const t = TG || g;
    t.globalAlpha = g.globalAlpha;
    t.font = FONT.replace('{size}', Math.round((size || 8) * TEXT_SCALE));
    t.textAlign = align || 'left';
    t.textBaseline = 'top';
    t.lineJoin = 'round';
    t.lineWidth = 3;
    t.strokeStyle = '#000';
    t.strokeText(str, x, y - 1);
    t.fillStyle = color;
    t.fillText(str, x, y - 1);
    t.globalAlpha = 1;
  }

  function bar(g, x, y, w, h, frac, color) {
    frac = Math.max(0, Math.min(1, frac));
    g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#3a1418'; g.fillRect(x, y, w, h);
    g.fillStyle = color; g.fillRect(x, y, Math.round(w * frac), h);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, Math.round(w * frac), 1);
  }

  const HIT_COLORS = { hero: '#ffffff', tap: '#ffe9a8', comp: '#7fd1ff', fire: '#ff9a4a', frost: '#a8e4ff', shock: '#fff27a' };

  class Renderer {
    constructor(canvas, game, overlay) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      if (overlay) {
        overlay.width = W * TEXT_RES;
        overlay.height = H * TEXT_RES;
        this.tg = TG = overlay.getContext('2d');
      }
      this.game = game;
      this.bgs = {};
      this.floaters = [];
      this.parts = [];
      this.fx = [];
      this.ghost = null;
      this.banner = null;
      this.shake = 0;
      this.ambientZone = -1;
      this.amb = [];
    }

    bg(floor) {
      const z = zoneOf(floor);
      if (!this.bgs[z.index]) this.bgs[z.index] = buildBg(THEMES[z.zone.id], z.index * 7919 + 13);
      return this.bgs[z.index];
    }

    monRect(m) {
      const sc = m.guardian ? GUARD_SCALE : m.boss ? BOSS_SCALE : SCALE, size = 16 * sc;
      const x = MON_X - (sc - SCALE) * 8;
      let y = GROUND - size;
      if (m.fly) y -= 16;
      return { x, y, size, sc, cx: x + size / 2, top: y + DD.Sprites.topRow(m.kind) * sc };
    }

    heroHand() { return { x: HERO_X + 42, y: GROUND - 30 }; }

    float(str, x, y, color, life, size) {
      this.floaters.push({ str, x, y, color, life: life || 0.8, max: life || 0.8, size: size || 8 });
    }

    setBanner(title, sub, color) {
      this.banner = { title, sub, color: color || '#ffffff', life: 2.2, max: 2.2 };
    }

    proj(kind, r, life, delay) {
      const h = this.heroHand();
      this.fx.push({ type: 'proj', kind, x0: h.x, y0: h.y, x1: r.cx - 6, y1: r.y + r.size * 0.55, life, max: life, delay: delay || 0 });
    }

    handle(e) {
      switch (e.type) {
        case 'hit': {
          const r = this.monRect(e.monster);
          const jx = (Math.random() - 0.5) * 24;
          const cls = this.game.s.cls;
          const big = e.crit || e.source === 'fire';
          this.float(DD.fmt(e.amount) + (e.crit ? '!' : ''), r.cx + jx, r.top - 4, e.crit ? '#ffd23f' : HIT_COLORS[e.source], big ? 1.0 : 0.8, big ? 16 : 8);
          const impact = { x: r.cx, y: r.y + r.size * 0.6 };
          if (e.source === 'comp') {
            this.fx.push({ type: 'spark', x: r.cx + jx, y: impact.y, life: 0.2, max: 0.2 });
          } else if (e.source === 'fire') {
            this.proj('fireball', r, 0.2);
            this.fx.push({ type: 'burst', x: impact.x - 6, y: impact.y, color: '#ff7a2a', color2: '#ffd04a', life: 0.35, max: 0.35, delay: 0.2 });
            this.shake = 0.15;
          } else if (e.source === 'frost') {
            this.proj('ice', r, 0.18);
            this.fx.push({ type: 'burst', x: impact.x - 6, y: impact.y, color: '#7fd1ff', color2: '#ffffff', life: 0.35, max: 0.35, delay: 0.18 });
          } else if (e.source === 'shock') {
            this.fx.push({ type: 'lightning', x: r.cx + jx * 0.6, y: r.y + r.size * 0.5, life: 0.18, max: 0.18, seed: Math.random() * 1e9 });
            this.shake = 0.08;
          } else if (e.source === 'hero' && cls === 'ranger') {
            this.proj('arrow', r, 0.12);
          } else if (e.source === 'hero' && cls === 'mage') {
            this.proj('bolt', r, 0.14);
          } else {
            this.fx.push({ type: 'slash', x: impact.x, y: impact.y, life: 0.14, max: 0.14, crit: e.crit });
          }
          if (e.crit) this.shake = 0.12;
          break;
        }
        case 'cast':
          this.fx.push({ type: 'castglow', spell: e.spell, life: 0.35, max: 0.35 });
          break;
        case 'kill': {
          const r = this.monRect(e.monster);
          this.ghost = { m: e.monster, r, life: 0.35, max: 0.35 };
          this.float('+' + DD.fmt(e.gold), r.cx, r.top - 18, '#f2c230', 1.1);
          const coins = e.monster.guardian ? 24 : e.monster.boss ? 14 : 4;
          for (let i = 0; i < coins; i++) {
            this.parts.push({ x: r.cx, y: r.y + r.size * 0.6, vx: (Math.random() - 0.7) * 90, vy: -60 - Math.random() * 90, life: 1.2, max: 1.2, coin: true });
          }
          break;
        }
        case 'loot': {
          const r = this.monRect(e.monster), rar = DD.RARITIES[e.item.rarity];
          if (e.salvaged) {
            this.float('salvaged +' + DD.fmt(e.salvaged), r.cx, r.top - 32, '#9a90a8', 1.2, 8);
            break;
          }
          this.parts.push({ x: r.cx, y: r.y + r.size * 0.5, vx: -30 - Math.random() * 30, vy: -110, life: 2.2, max: 2.2, item: true, color: rar.color });
          this.float(e.item.name, r.cx - 30, r.top - 32, rar.color, 1.8, 8);
          if (e.item.rarity >= 2) this.fx.push({ type: 'beam', x: r.cx - 40, color: rar.color, life: 1.6, max: 1.6, delay: 0.5 });
          break;
        }
        case 'heroHit':
          this.float('-' + DD.fmt(e.amount), HERO_X + 24, GROUND - 60, '#ff5a5a', 0.7);
          break;
        case 'dodge':
          this.float('DODGE', HERO_X + 24, GROUND - 62, '#a8e4ff', 0.7);
          this.fx.push({ type: 'dodge', life: 0.25, max: 0.25 });
          break;
        case 'block':
          this.float('BLOCK', HERO_X + 24, GROUND - 62, '#e8e2d0', 0.7);
          this.fx.push({ type: 'shield', life: 0.25, max: 0.25 });
          break;
        case 'floor': {
          const prev = zoneOf(e.floor - 1), now = zoneOf(e.floor);
          if (prev.index !== now.index) this.setBanner(now.name, 'Floor ' + e.floor, themeOf(e.floor).trim);
          break;
        }
        case 'spawn':
          if (e.monster.guardian) this.setBanner('ZONE GUARDIAN', e.monster.name, '#ff9a2e');
          else if (e.monster.boss) this.setBanner('BOSS', e.monster.name, '#ff5a5a');
          break;
        case 'bossFail':
          this.setBanner('RETREAT', 'Grow stronger and try again', '#ff8a5a');
          break;
        case 'town':
          this.clearFx();
          if (e.reason === 'death') this.setBanner('DEFEATED', 'Carried back to Hearthstead', '#ff5a5a');
          else if (e.reason === 'auto') this.setBanner('HEARTHSTEAD', 'Wounded. Resting to recover.', '#ffcf6a');
          else this.setBanner('HEARTHSTEAD', 'Rest, trade and re-equip', '#ffcf6a');
          break;
        case 'depart':
          this.clearFx();
          this.setBanner(zoneOf(e.floor).name, 'Setting out from floor ' + e.floor, themeOf(e.floor).trim);
          break;
        case 'gatherStart':
          this.clearFx();
          this.setBanner(e.node.name.toUpperCase(), DD.ZONES[e.node.zone].name, '#b6e36a');
          break;
        case 'gather': {
          const spot = GATHER_SPOT[e.node.skill];
          let y = spot.y - 22;
          e.got.forEach((c, q) => {
            if (!c) return;
            y -= 12;
            const rar = DD.RARITIES[q];
            this.float('+' + c + ' ' + (q ? rar.name + ' ' : '') + e.node.item, spot.x, y, q ? rar.color : '#ffffff', q >= 2 ? 1.8 : 1.3, q >= 3 ? 10 : 8);
            if (q >= 2) this.fx.push({ type: 'beam', x: spot.x, color: rar.color, life: 1.2, max: 1.2, delay: 0 });
          });
          this.float('+' + DD.fmt(e.xp) + ' XP', spot.x, spot.y - 22, '#b6e36a', 1.3, 8);
          break;
        }
        case 'craftStart':
          this.clearFx();
          this.setBanner('THE FORGE', 'Crafting ' + DD.RARITIES[e.craft.quality].name + ' ' + e.craft.slot, '#ff9a2e');
          break;
        case 'craft': {
          const rar = DD.RARITIES[e.item.rarity];
          this.float(e.item.name, TOWN.anvilX, 88, rar.color, 1.8, 8);
          if (e.master) this.float('MASTERWORK!', TOWN.anvilX, 76, '#ffd23f', 1.8, 10);
          this.float('+' + e.xp + ' XP', TOWN.anvilX, 100, '#b6e36a', 1.3, 8);
          if (e.item.rarity >= 2 || e.master) this.fx.push({ type: 'beam', x: TOWN.anvilX, color: rar.color, life: 1.4, max: 1.4, delay: 0 });
          break;
        }
        case 'heroLevel':
          this.setBanner('LEVEL ' + e.level, '+' + e.points + ' stat points', '#c99bff');
          this.float('LEVEL UP', HERO_X + 24, GROUND - 72, '#c99bff', 1.4, 10);
          break;
        case 'skillLevel':
          this.setBanner(e.skill.name.toUpperCase() + ' ' + e.level, 'Level up!', '#b6e36a');
          break;
        case 'prestige':
          this.setBanner('A NEW HERO RISES', '+' + DD.fmt(e.gems) + ' Soul Gems', '#c99bff');
          break;
      }
    }

    clearFx() { this.floaters = []; this.parts = []; this.fx = []; this.ghost = null; }

    draw(dt, time) {
      const g = this.g, s = this.game.s;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      if (this.tg) {
        this.tg.setTransform(1, 0, 0, 1, 0, 0);
        this.tg.clearRect(0, 0, W * TEXT_RES, H * TEXT_RES);
        this.tg.setTransform(TEXT_RES, 0, 0, TEXT_RES, 0, 0);
      }
      if (s.location === 'gather') {
        this.drawGather(dt, time);
        this.drawParticles(dt, time);
        this.drawFloaters(dt);
        this.drawGatherHud();
        this.drawBanner(dt);
        return;
      }
      if (s.location === 'town' || s.location === 'craft') {
        this.drawTown(dt, time);
        if (s.location === 'craft') this.drawForge(dt, time);
        this.drawParticles(dt, time);
        this.drawFx(dt);
        this.drawFloaters(dt);
        if (s.location === 'craft') this.drawForgeHud(); else this.drawTownHud();
        this.drawBanner(dt);
        return;
      }
      g.save();
      if (this.shake > 0) {
        this.shake -= dt;
        g.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
      }
      const theme = themeOf(s.floor);
      g.drawImage(this.bg(s.floor), 0, 0);
      if (theme.torches) this.drawTorches(time);
      this.drawAmbient(dt, time, theme, zoneOf(s.floor).index);
      this.drawHero(time);
      this.drawMonster(time);
      this.drawGhost(dt);
      this.drawParticles(dt, time);
      this.drawFx(dt, time);
      this.drawFloaters(dt);
      g.restore();
      this.drawHud();
      this.drawBanner(dt);
    }

    drawTown(dt, time) {
      const g = this.g, b = this.game.b, s = this.game.s, d = this.game.stats();
      if (!this.bgs.town) this.bgs.town = buildBg({ style: 'town' }, 4242);
      g.drawImage(this.bgs.town, 0, 0);

      // campfire glow and flames
      const fx = TOWN.fireX, f = Math.sin(time * 8) + Math.sin(time * 19);
      const glow = g.createRadialGradient(fx, 140, 4, fx, 140, 70 + f * 3);
      glow.addColorStop(0, 'rgba(255,170,70,0.35)');
      glow.addColorStop(1, 'rgba(255,110,40,0)');
      g.fillStyle = glow; g.fillRect(fx - 80, 70, 160, 110);
      const lift = Math.round(f);
      g.fillStyle = '#ff5a1a'; g.fillRect(fx - 6, 134 - lift, 12, 11 + lift);
      g.fillStyle = '#ff9a2a'; g.fillRect(fx - 4, 131 - lift - (f > 0 ? 2 : 0), 8, 12);
      g.fillStyle = '#ffd84a'; g.fillRect(fx - 2, 136 - lift, 4, 8);
      g.fillStyle = '#fff4b0'; g.fillRect(fx - 1, 140, 2, 4);
      for (let i = 0; i < 6; i++) {
        const cyc = (time * 0.6 + i / 6) % 1;
        g.globalAlpha = 1 - cyc;
        g.fillStyle = '#ffb43b';
        g.fillRect(Math.round(fx + Math.sin(time * 2 + i * 1.7) * 6), Math.round(130 - cyc * 40), 1, 1);
      }
      g.globalAlpha = 1;

      // merchant behind the counter
      g.drawImage(DD.Sprites.get('merchant'), TOWN.merchX, 102, 48, 48);
      g.fillStyle = '#6a4a2a'; g.fillRect(TOWN.stallL, 130, TOWN.stallR - TOWN.stallL, 20);
      g.fillStyle = '#8a6a3a'; g.fillRect(TOWN.stallL - 2, 128, TOWN.stallR - TOWN.stallL + 4, 3);
      g.fillStyle = '#4a3420'; g.fillRect(TOWN.stallL, 139, TOWN.stallR - TOWN.stallL, 1);
      ['#d84a4a', '#4da3ff', '#4cd964', '#c070ff', '#ffcf3a'].forEach((c, i) => {
        const x = TOWN.stallL + 8 + i * 14;
        g.fillStyle = '#141218'; g.fillRect(x - 1, 121, 6, 8);
        g.fillStyle = c; g.fillRect(x, 123, 4, 5);
        g.fillStyle = '#e8e4dc'; g.fillRect(x + 1, 121, 2, 2);
      });
      text(g, 'MERCHANT', (TOWN.stallL + TOWN.stallR) / 2, 76, '#ffcf6a', 8, 'center');

      // the hero resting by the fire
      if (s.location === 'craft') return;   // the hero is at the anvil instead (drawForge)
      const resting = b.heroHp < d.maxHp;
      const spr = DD.Sprites.get(s.cls || 'knight', { skin: s.skin });
      const y = GROUND - 48 + (resting ? 2 : Math.round(Math.sin(time * 2)));
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(TOWN.heroX + 10, GROUND - 2, 28, 3);
      g.drawImage(spr, TOWN.heroX, y, 48, 48);
      bar(g, TOWN.heroX + 6, y - 2, 36, 3, b.heroHp / d.maxHp, '#4cd964');
      if (resting) {
        for (let i = 0; i < 3; i++) {
          const cyc = (time * 0.4 + i / 3) % 1;
          g.globalAlpha = Math.sin(cyc * Math.PI);
          text(g, 'z', TOWN.heroX + 40 + cyc * 14, y - 6 - cyc * 22, '#cfe3ff', 8, 'left');
        }
        g.globalAlpha = 1;
      }
    }

    // ---- life skills: the hero works a resource node in that node's zone ----
    drawGather(dt, time) {
      const g = this.g, s = this.game.s, b = this.game.b, game = this.game;
      const n = game.node(s.gatherNode);
      if (!n) return;
      const z = zoneOf(n.zoneFloor), theme = THEMES[z.zone.id], tier = n.zone, spot = GATHER_SPOT[n.skill];
      g.drawImage(this.bg(n.zoneFloor), 0, 0);
      if (theme.torches) this.drawTorches(time);
      this.drawAmbient(dt, time, theme, z.index);

      // swing rhythm (purely visual): chips fly on each swing
      const period = n.skill === 'herbalism' ? 1.2 : 0.9;
      const beat = Math.floor(time / period), ph = (time % period) / period;
      const hitNow = beat !== this.lastBeat;
      this.lastBeat = beat;
      const burst = (x, y, color, k, up) => {
        for (let i = 0; i < k; i++) this.parts.push({ x, y, vx: (Math.random() - 0.3) * 70, vy: -(up || 60) - Math.random() * 50, life: 0.6, max: 0.6, color });
      };

      let hx = spot.heroX, hy = GROUND - 48;
      if (n.skill === 'woodcutting') {
        const c = TREE_COLORS[tier];
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(spot.x - 16, GROUND - 2, 44, 3);
        g.fillStyle = c.trunk; g.fillRect(spot.x, 58, 14, GROUND - 58);
        g.fillStyle = c.bark; for (let y = 64; y < GROUND - 4; y += 9) g.fillRect(spot.x + 3 + (y % 4), y, 2, 4);
        g.fillRect(spot.x - 4, GROUND - 4, 22, 4);
        disc(g, spot.x + 7, 48, 26, c.leaves[1]);
        disc(g, spot.x - 6, 58, 16, c.leaves[0]);
        disc(g, spot.x + 20, 58, 16, c.leaves[0]);
        disc(g, spot.x + 7, 38, 16, c.leaves[2]);
        if (c.droop) { g.fillStyle = c.leaves[0]; for (let x = spot.x - 18; x < spot.x + 34; x += 4) g.fillRect(x, 60, 1, 18 + (x % 3) * 6); }
        if (c.sparkle) { g.fillStyle = c.sparkle; for (let i = 0; i < 6; i++) if (Math.sin(time * 3 + i * 2) > 0.5) g.fillRect(spot.x - 12 + i * 7, 32 + (i % 3) * 12, 1, 1); }
        if (ph < 0.2) hx += Math.round(Math.sin(ph / 0.2 * Math.PI) * 10);
        if (hitNow) burst(spot.x, 128, c.chip, 4);
      } else if (n.skill === 'mining') {
        const ore = ORE_COLORS[tier];
        disc(g, spot.x + 8, GROUND - 14, 20, '#4a4852'); disc(g, spot.x + 2, GROUND - 18, 14, '#5e5c68');
        g.fillStyle = '#2a2830'; g.fillRect(spot.x - 14, GROUND - 2, 46, 3);
        g.fillStyle = '#76747e'; g.fillRect(spot.x - 6, GROUND - 31, 12, 2);
        [[-6, -20], [6, -12], [14, -24], [0, -8], [18, -10]].forEach(([dx, dy], i) => {
          g.fillStyle = ore; g.fillRect(spot.x + dx, GROUND + dy, 4, 3);
          if (Math.sin(time * 2 + i) > 0.7) { g.fillStyle = '#ffffff'; g.fillRect(spot.x + dx, GROUND + dy, 1, 1); }
        });
        if (ph < 0.2) hx += Math.round(Math.sin(ph / 0.2 * Math.PI) * 10);
        if (hitNow) burst(spot.x - 8, GROUND - 18, ore, 5, 80);
      } else if (n.skill === 'fishing') {
        const w = WATER_COLORS[tier];
        g.fillStyle = w[0]; g.fillRect(150, 136, W - 150, 34);
        g.fillStyle = w[1];
        for (let i = 0; i < 12; i++) g.fillRect(156 + ((i * 37 + Math.floor(time * 8)) % (W - 170)), 140 + (i * 7) % 26, 6, 1);
        g.fillStyle = '#2a2018'; g.fillRect(150, 134, W - 150, 2);
        const p = (b.gatherT || 0) / game.gatherTime(n);
        const bx = spot.x, by = 142 + Math.round(Math.sin(time * 3) * 1) + (p > 0.85 ? 3 : 0);
        g.strokeStyle = 'rgba(230,230,230,0.7)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(hx + 46, hy + 4); g.quadraticCurveTo(bx - 20, hy - 10, bx, by); g.stroke();
        g.fillStyle = '#8a5a1a'; g.fillRect(hx + 40, hy + 4, 2, 18); g.fillRect(hx + 42, hy + 2, 2, 4);   // rod
        g.fillStyle = '#d8343a'; g.fillRect(bx - 1, by - 2, 3, 2); g.fillStyle = '#f0f0f0'; g.fillRect(bx - 1, by, 3, 2);
      } else if (n.skill === 'herbalism') {
        const fc = HERB_COLORS[tier];
        disc(g, spot.x, GROUND - 8, 12, '#2e5a24'); disc(g, spot.x + 12, GROUND - 6, 9, '#3a6a2c'); disc(g, spot.x - 10, GROUND - 5, 8, '#3a6a2c');
        [[-8, -14], [2, -18], [10, -12], [-2, -8], [14, -4]].forEach(([dx, dy], i) => {
          g.fillStyle = fc; g.fillRect(spot.x + dx, GROUND + dy + Math.round(Math.sin(time * 2 + i)), 3, 3);
        });
        hy += 4;
        if (ph < 0.25) hx += Math.round(Math.sin(ph / 0.25 * Math.PI) * 6);
        if (hitNow) burst(spot.x, GROUND - 12, fc, 3, 40);
      } else {
        // tailoring: a standing loom; the woven cloth grows with each action's progress
        const cloth = CLOTH_COLORS[tier], x0 = spot.x - 14, top = 92, w = 40, h = GROUND - 6 - top;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 - 4, GROUND - 2, w + 8, 3);
        g.fillStyle = '#5a3e28'; g.fillRect(x0 - 4, top - 6, 4, GROUND - top + 6); g.fillRect(x0 + w, top - 6, 4, GROUND - top + 6);
        g.fillStyle = '#6e5038'; g.fillRect(x0 - 6, top - 8, w + 12, 4); g.fillRect(x0 - 6, GROUND - 8, w + 12, 3);
        g.fillStyle = '#3a2818'; g.fillRect(x0 - 6, top - 5, w + 12, 1);
        g.fillStyle = 'rgba(230,230,230,0.55)';
        for (let x = x0 + 2; x < x0 + w; x += 4) g.fillRect(x, top, 1, h);   // warp threads
        const p = Math.min(1, (b.gatherT || 0) / game.gatherTime(n)), woven = Math.round(h * p);
        g.fillStyle = cloth; g.fillRect(x0 + 1, GROUND - 8 - woven, w - 2, woven);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let y = GROUND - 8 - woven; y < GROUND - 8; y += 3) g.fillRect(x0 + 1, y, w - 2, 1);
        const shuttle = x0 + 2 + Math.round((Math.sin(time * 5) + 1) / 2 * (w - 8));   // shuttle sliding back and forth
        g.fillStyle = '#c09030'; g.fillRect(shuttle, GROUND - 10 - woven, 6, 2);
        if (ph < 0.2) hx += Math.round(Math.sin(ph / 0.2 * Math.PI) * 4);
        if (hitNow) burst(x0 + w / 2, GROUND - 10 - woven, cloth, 2, 30);
      }

      const spr = DD.Sprites.get(s.cls || 'knight', { skin: s.skin });
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(hx + 10, GROUND - 2, 28, 3);
      g.drawImage(spr, hx, hy + (n.skill === 'fishing' ? Math.round(Math.sin(time * 2)) : 0), 48, 48);

      // action progress over the node
      bar(g, spot.x - 18, spot.y - 8, 50, 3, (b.gatherT || 0) / game.gatherTime(n), '#b6e36a');
    }

    drawGatherHud() {
      const g = this.g, s = this.game.s, n = this.game.node(s.gatherNode);
      if (!n) return;
      const sk = DD.SKILLS.find((x) => x.id === n.skill), pr = this.game.skillProgress(n.skill);
      text(g, sk.name.toUpperCase() + ' ' + pr.level, 6, 6, '#b6e36a');
      text(g, n.name, W - 6, 6, '#e8e2d0', 8, 'right');
      bar(g, 6, H - 7, W - 12, 2, pr.frac, '#b6e36a');
    }

    // The hero hammering at an anvil beside the campfire.
    drawForge(dt, time) {
      const g = this.g, s = this.game.s, b = this.game.b, c = s.craft;
      if (!c) return;
      const ax = TOWN.anvilX;
      // anvil
      g.fillStyle = '#2a2a34'; g.fillRect(ax - 10, 140, 20, 10);
      g.fillStyle = '#4a4a58'; g.fillRect(ax - 14, 132, 28, 7); g.fillRect(ax + 14, 133, 6, 3);
      g.fillStyle = '#6a6a7c'; g.fillRect(ax - 14, 132, 28, 1);
      // glowing workpiece
      const glow = 0.6 + 0.4 * Math.sin(time * 6);
      g.fillStyle = 'rgba(255,' + Math.round(120 + 60 * glow) + ',40,1)'; g.fillRect(ax - 6, 129, 12, 3);
      // hammering rhythm and sparks
      const period = 0.6, ph = (time % period) / period, beat = Math.floor(time / period);
      if (beat !== this.lastForgeBeat) {
        this.lastForgeBeat = beat;
        for (let i = 0; i < 5; i++) this.parts.push({ x: ax, y: 128, vx: (Math.random() - 0.5) * 110, vy: -50 - Math.random() * 70, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#ffd84a' : '#ff7a2a' });
      }
      const hx = ax - 50 + (ph < 0.25 ? Math.round(Math.sin(ph / 0.25 * Math.PI) * 6) : 0);
      const spr = DD.Sprites.get(s.cls || 'knight', { skin: s.skin });
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(hx + 10, GROUND - 2, 28, 3);
      g.drawImage(spr, hx, GROUND - 48, 48, 48);
      const r = this.game.recipe(c.slot, c.tier, c.quality);
      bar(g, ax - 22, 116, 44, 3, (b.craftT || 0) / r.time, DD.RARITIES[c.quality].color);
    }

    drawForgeHud() {
      const g = this.g, s = this.game.s, c = s.craft;
      if (!c) return;
      const pr = this.game.skillProgress('crafting'), r = this.game.recipe(c.slot, c.tier, c.quality);
      text(g, 'CRAFTING ' + pr.level, 6, 6, '#ff9a2e');
      text(g, DD.RARITIES[c.quality].name + ' ' + c.slot + ' · ' + r.canMake + ' left', W - 6, 6, DD.RARITIES[c.quality].color, 8, 'right');
      bar(g, 6, H - 7, W - 12, 2, pr.frac, '#ff9a2e');
    }

    drawTownHud() {
      const g = this.g, b = this.game.b, d = this.game.stats();
      text(g, 'HEARTHSTEAD', 6, 6, '#ffcf6a');
      const frac = b.heroHp / d.maxHp;
      text(g, frac >= 1 ? 'RESTED' : 'RESTING ' + Math.floor(frac * 100) + '%', W - 6, 6, frac >= 1 ? '#4cd964' : '#cfe3ff', 8, 'right');
    }

    drawTorches(time) {
      const g = this.g;
      TORCHES.forEach((t, i) => {
        const f = Math.sin(time * 9 + i * 2) + Math.sin(time * 23 + i);
        const glow = g.createRadialGradient(t.x, t.y - 2, 2, t.x, t.y - 2, 38 + f * 2);
        glow.addColorStop(0, 'rgba(255,170,70,0.28)');
        glow.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = glow;
        g.fillRect(t.x - 44, t.y - 46, 88, 88);
        const lift = f > 0.6 ? 1 : 0;
        g.fillStyle = '#ff6a1f'; g.fillRect(t.x - 2, t.y - 6 - lift, 5, 6 + lift);
        g.fillStyle = '#ffb43b'; g.fillRect(t.x - 1, t.y - 5 - lift - (f > 0 ? 1 : 0), 3, 4);
        g.fillStyle = '#fff1a8'; g.fillRect(t.x, t.y - 3, 1, 2);
      });
    }

    // Small animated details per zone: fireflies, swamp bubbles, dust, twinkling stars.
    drawAmbient(dt, time, theme, zoneIndex) {
      const g = this.g;
      if (this.ambientZone !== zoneIndex) {
        this.ambientZone = zoneIndex;
        const r = rng(zoneIndex * 31 + 7);
        this.amb = [];
        for (let i = 0; i < 40; i++) this.amb.push({ x: r() * W, y: r() * H, p: r() * 6.28, sp: 0.5 + r() * 1.5 });
      }
      const a = this.amb;
      if (theme.ambient === 'fireflies') {
        for (let i = 0; i < 14; i++) {
          const f = a[i];
          const x = (f.x + Math.sin(time * f.sp * 0.6 + f.p) * 14) | 0, y = (20 + (f.y % 110) + Math.cos(time * f.sp * 0.8 + f.p) * 8) | 0;
          const on = (Math.sin(time * 2.5 * f.sp + f.p) + 1) / 2;
          g.globalAlpha = on * 0.35; g.fillStyle = '#e8ff8a'; g.fillRect(x - 1, y - 1, 4, 4);
          g.globalAlpha = on; g.fillStyle = '#f4ffb0'; g.fillRect(x, y, 2, 2);
        }
      } else if (theme.ambient === 'swamp') {
        g.fillStyle = 'rgba(200,220,200,0.06)';
        const off = (time * 6) % W;
        g.fillRect(off - W, 104, W * 0.7, 10); g.fillRect(off, 104, W * 0.7, 10);
        g.fillRect(W - off - 60, 120, W * 0.5, 8);
        for (let i = 0; i < 8; i++) {
          const b = a[i], cyc = (time * 0.5 * b.sp + b.p) % 3;
          if (cyc > 1) continue;
          const x = b.x | 0, y = (168 - cyc * 6) | 0;
          g.globalAlpha = 1 - cyc; g.fillStyle = '#6a8a74';
          g.fillRect(x, y, 2, 2);
        }
      } else if (theme.ambient === 'dust') {
        g.fillStyle = '#b8b0a0';
        for (let i = 0; i < 16; i++) {
          const d = a[i];
          g.globalAlpha = 0.25 + 0.2 * Math.sin(time + d.p);
          g.fillRect(((d.x + time * 3 * d.sp) % W) | 0, ((d.y + Math.sin(time * 0.5 + d.p) * 6) % 120) | 0, 1, 1);
        }
      } else if (theme.ambient === 'void') {
        for (let i = 0; i < 30; i++) {
          const st = a[i];
          g.globalAlpha = Math.max(0, Math.sin(time * st.sp * 1.5 + st.p));
          g.fillStyle = i % 3 ? '#ffffff' : '#7fe8ff';
          const x = st.x | 0, y = (st.y % 118) | 0;
          g.fillRect(x, y, 1, 1);
          if (g.globalAlpha > 0.85) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
        }
        g.fillStyle = '#b07aff';
        for (let i = 30; i < 40; i++) {
          const m = a[i], y = H - ((time * 8 * m.sp + m.y) % 70);
          g.globalAlpha = 0.5; g.fillRect((m.x + Math.sin(time + m.p) * 4) | 0, y | 0, 2, 2);
        }
      }
      g.globalAlpha = 1;
    }

    drawHero(time) {
      const g = this.g, b = this.game.b, s = this.game.s;
      const cls = s.cls || 'knight';
      const d = this.game.stats();
      const spr = DD.Sprites.get(cls, { skin: s.skin, flash: b.heroFlash > 0 });
      let x = HERO_X, y = GROUND - 48;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 10, GROUND - 2, 28, 3);

      if (b.heroDead) {
        g.save();
        g.globalAlpha = 0.6;
        g.translate(x + 24, GROUND - 12);
        g.rotate(-Math.PI / 2);
        g.drawImage(spr, -24, -24, 48, 48);
        g.restore();
        text(g, 'Respawning ' + Math.ceil(b.respawn), x + 24, GROUND - 52, '#bbbbbb', 8, 'center');
        return;
      }
      if (b.heroAnim > 0) {
        const p = Math.sin((1 - b.heroAnim / 0.18) * Math.PI);
        if (cls === 'knight') x += Math.round(p * 18);       // lunge and slash
        else if (cls === 'ranger') x -= Math.round(p * 3);   // bow recoil
        else x += Math.round(p * 5);                         // staff jab
      } else {
        y += Math.round(Math.sin(time * 4));
      }
      if (b.heroCast > 0) {
        y -= 2;
        const glow = g.createRadialGradient(x + 44, y + 4, 1, x + 44, y + 4, 18);
        glow.addColorStop(0, 'rgba(160,220,255,' + (0.7 * b.heroCast / 0.35) + ')');
        glow.addColorStop(1, 'rgba(120,160,255,0)');
        g.fillStyle = glow; g.fillRect(x + 24, y - 16, 40, 40);
      }
      g.drawImage(spr, x, y, 48, 48);
      bar(g, x + 6, y - 2, 36, 3, b.heroHp / d.maxHp, '#4cd964');
    }

    drawMonster(time) {
      const g = this.g, m = this.game.b.monster;
      if (!m) return;
      const r = this.monRect(m);
      const spr = DD.Sprites.get(m.kind, { variant: m.variant, boss: m.boss, flash: m.flash > 0, flip: true, frozen: m.frozen > 0 });
      let x = r.x, y = r.y;
      const enter = Math.min(1, m.age / DD.CONFIG.enterTime);
      x += Math.round((1 - enter) * 100);
      if (m.anim > 0) x -= Math.round(Math.sin((1 - m.anim / 0.2) * Math.PI) * 16);
      if (m.frozen <= 0) {
        if (m.fly) y += Math.round(Math.sin(time * 6) * 3);
        else if (m.hop) y += Math.round(Math.abs(Math.sin(time * 3)) * -2);
      }

      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + r.size * 0.2, GROUND - 2, r.size * 0.6, 3);
      if (m.guardian) {
        const aura = g.createRadialGradient(x + r.size / 2, y + r.size / 2, 4, x + r.size / 2, y + r.size / 2, r.size * 0.75);
        aura.addColorStop(0, 'rgba(255,140,40,' + (0.18 + 0.08 * Math.sin(time * 3)) + ')');
        aura.addColorStop(1, 'rgba(255,80,20,0)');
        g.fillStyle = aura; g.fillRect(x - r.size * 0.3, y - r.size * 0.3, r.size * 1.6, r.size * 1.6);
      }
      g.drawImage(spr, x, y, r.size, r.size);

      const top = y + (r.top - r.y);
      if (m.boss) {
        const cr = DD.Sprites.get('crown');
        const cw = m.guardian ? 21 : 14, ch = m.guardian ? 12 : 8;
        g.drawImage(cr, Math.round(x + r.size / 2 - cw / 2), top - ch - 1, cw, ch);
      }
      bar(g, x + r.size * 0.15, top - (m.guardian ? 18 : m.boss ? 14 : 6), r.size * 0.7, 3, m.hp / m.maxHp, m.boss ? '#ff4d4d' : '#e8584a');
    }

    drawGhost(dt) {
      const gh = this.ghost;
      if (!gh) return;
      gh.life -= dt;
      if (gh.life <= 0) { this.ghost = null; return; }
      const g = this.g, p = gh.life / gh.max;
      const spr = DD.Sprites.get(gh.m.kind, { variant: gh.m.variant, boss: gh.m.boss, flash: true, flip: true });
      g.globalAlpha = p;
      g.drawImage(spr, gh.r.x, gh.r.y + (1 - p) * 10, gh.r.size, gh.r.size);
      g.globalAlpha = 1;
    }

    drawParticles(dt, time) {
      const g = this.g;
      this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
      this.parts.forEach((p) => {
        p.vy += (p.item ? 260 : 320) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > GROUND - 2) { p.y = GROUND - 2; p.vy *= -0.4; p.vx *= 0.6; }
        g.globalAlpha = Math.min(1, p.life / 0.3);
        const x = Math.round(p.x), y = Math.round(p.y);
        if (p.item) {
          g.globalAlpha *= 0.35 + 0.2 * Math.sin(time * 10);
          g.fillStyle = p.color; g.fillRect(x - 4, y - 7, 9, 9);
          g.globalAlpha = Math.min(1, p.life / 0.3);
          g.fillStyle = '#000'; g.fillRect(x - 2, y - 5, 5, 5);
          g.fillStyle = p.color; g.fillRect(x - 1, y - 4, 3, 3);
          g.fillStyle = '#fff'; g.fillRect(x - 1, y - 4, 1, 1);
        } else if (p.color) {   // wood chips, sparks, splashes, leaves
          g.fillStyle = p.color; g.fillRect(x, y, 2, 2);
        } else {
          g.fillStyle = '#c98a10'; g.fillRect(x, y, 3, 3);
          g.fillStyle = '#ffd84a'; g.fillRect(x, y, 2, 2);
        }
      });
      g.globalAlpha = 1;
    }

    drawFx(dt) {
      const g = this.g;
      this.fx = this.fx.filter((f) => {
        if (f.delay > 0) { f.delay -= dt; return true; }
        return (f.life -= dt) > 0;
      });
      this.fx.forEach((f) => {
        if (f.delay > 0) return;
        const p = f.life / f.max;
        g.globalAlpha = 1;
        switch (f.type) {
          case 'slash': {
            g.globalAlpha = p;
            const len = f.crit ? 16 : 11;
            g.fillStyle = f.crit ? '#ffd23f' : '#ffffff';
            for (let i = -len; i <= len; i += 2) g.fillRect(Math.round(f.x + i), Math.round(f.y + i * 0.8), 2, 2);
            if (f.crit) for (let i = -len; i <= len; i += 2) g.fillRect(Math.round(f.x - i), Math.round(f.y + i * 0.8), 2, 2);
            break;
          }
          case 'spark': {
            g.globalAlpha = p;
            g.fillStyle = '#7fd1ff';
            const k = Math.round((1 - p) * 6);
            g.fillRect(f.x - k, f.y, 2, 2); g.fillRect(f.x + k, f.y, 2, 2);
            g.fillRect(f.x, f.y - k, 2, 2); g.fillRect(f.x, f.y + k, 2, 2);
            break;
          }
          case 'proj': {
            const t = 1 - p, x = Math.round(f.x0 + (f.x1 - f.x0) * t), y = Math.round(f.y0 + (f.y1 - f.y0) * t);
            if (f.kind === 'arrow') {
              g.fillStyle = '#8a5a1a'; g.fillRect(x - 10, y, 10, 1);
              g.fillStyle = '#e8eef7'; g.fillRect(x, y - 1, 2, 3);
              g.fillStyle = '#d84a4a'; g.fillRect(x - 11, y - 1, 2, 3);
            } else if (f.kind === 'bolt') {
              g.fillStyle = 'rgba(160,120,255,0.5)'; g.fillRect(x - 3, y - 3, 7, 7);
              g.fillStyle = '#e0d0ff'; g.fillRect(x - 1, y - 1, 3, 3);
            } else if (f.kind === 'fireball') {
              g.fillStyle = 'rgba(255,120,40,0.35)'; g.fillRect(x - 14, y - 2, 10, 5);
              disc(g, x, y, 5, '#ff6a1f'); disc(g, x + 1, y, 3, '#ffd04a'); g.fillStyle = '#fff6c0'; g.fillRect(x + 1, y - 1, 2, 2);
            } else if (f.kind === 'ice') {
              g.fillStyle = '#7fd1ff'; g.fillRect(x - 8, y - 1, 10, 3);
              g.fillStyle = '#ffffff'; g.fillRect(x, y - 2, 3, 5); g.fillRect(x + 3, y, 2, 1);
            }
            break;
          }
          case 'burst': {
            g.globalAlpha = p;
            const rad = Math.round(4 + (1 - p) * 14);
            for (let i = 0; i < 10; i++) {
              const a = i / 10 * Math.PI * 2;
              g.fillStyle = i % 2 ? f.color : f.color2;
              g.fillRect(Math.round(f.x + Math.cos(a) * rad), Math.round(f.y + Math.sin(a) * rad), 3, 3);
            }
            if (p > 0.6) disc(g, f.x, f.y, Math.round(rad * 0.6), f.color2);
            break;
          }
          case 'lightning': {
            g.globalAlpha = p;
            const r = rng(f.seed);
            let x = f.x + (r() - 0.5) * 20, y = 0;
            g.fillStyle = '#fff27a';
            while (y < f.y) {
              const nx = x + (r() - 0.5) * 12, ny = Math.min(f.y, y + 6 + r() * 8);
              const steps = Math.max(1, Math.round(ny - y));
              for (let k = 0; k < steps; k++) g.fillRect(Math.round(x + (nx - x) * k / steps), Math.round(y + k), 2, 1);
              x = nx; y = ny;
            }
            g.fillStyle = 'rgba(255,255,200,0.4)'; g.fillRect(Math.round(x) - 6, Math.round(y) - 6, 12, 12);
            break;
          }
          case 'castglow': {
            const col = { fire: '255,140,60', frost: '140,210,255', shock: '255,240,120' }[f.spell];
            g.globalAlpha = p;
            g.strokeStyle = 'rgba(' + col + ',0.9)';
            g.lineWidth = 1;
            g.beginPath(); g.arc(HERO_X + 24, GROUND - 4, 18 + (1 - p) * 8, Math.PI, 0); g.stroke();
            break;
          }
          case 'beam': {
            g.globalAlpha = Math.min(1, p * 2) * 0.35;
            g.fillStyle = f.color; g.fillRect(Math.round(f.x) - 2, 0, 5, GROUND);
            g.globalAlpha = Math.min(1, p * 2) * 0.15; g.fillRect(Math.round(f.x) - 6, 0, 13, GROUND);
            break;
          }
          case 'shield': {
            g.globalAlpha = p;
            g.strokeStyle = '#e8e2d0'; g.lineWidth = 2;
            g.beginPath(); g.arc(HERO_X + 30, GROUND - 26, 22, -0.9, 0.9); g.stroke();
            break;
          }
          case 'dodge': {
            g.globalAlpha = p * 0.4;
            const spr = DD.Sprites.get(this.game.s.cls || 'knight', { skin: this.game.s.skin });
            g.drawImage(spr, HERO_X - 10 * (1 - p) - 6, GROUND - 48, 48, 48);
            break;
          }
        }
      });
      g.globalAlpha = 1;
    }

    drawFloaters(dt) {
      const g = this.g;
      this.floaters = this.floaters.filter((f) => (f.life -= dt) > 0);
      this.floaters.forEach((f) => {
        f.y -= 26 * dt;
        g.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
        text(g, f.str, Math.round(f.x), Math.round(f.y), f.color, f.size, 'center');
      });
      g.globalAlpha = 1;
    }

    drawHud() {
      const g = this.g, s = this.game.s, b = this.game.b, C = DD.CONFIG;
      text(g, 'FLOOR ' + s.floor, 6, 6, '#ffffff');
      if (!s.autoAdvance) text(g, 'FARMING', 6, 18, '#8fb8ff');
      // hero XP along the bottom edge
      text(g, 'LV ' + s.hero.level, 6, H - 16, '#c99bff', 7);
      bar(g, 30, H - 11, W - 36, 2, s.hero.xp / DD.xpToLevel(s.hero.level), '#c99bff');

      const m = b.monster;
      if (m && m.boss) {
        bar(g, W - 96, 7, 90, 6, b.bossTimer / b.bossTimeMax, '#ff4d4d');
        text(g, Math.ceil(b.bossTimer) + 's', W - 100, 6, '#ffffff', 8, 'right');
      } else {
        for (let i = 0; i < C.killsPerFloor; i++) {
          const x = W - 8 - (C.killsPerFloor - i) * 10;
          g.fillStyle = '#000'; g.fillRect(x - 1, 5, 9, 9);
          g.fillStyle = i < s.kills ? '#f2c230' : '#3a3542';
          g.fillRect(x, 6, 7, 7);
        }
      }
      if (m) text(g, m.name, W / 2, m.boss ? 20 : 6, m.guardian ? '#ff9a2e' : m.boss ? '#ff7a7a' : '#e8e2d0', 8, 'center');
    }

    drawBanner(dt) {
      const bn = this.banner;
      if (!bn) return;
      bn.life -= dt;
      if (bn.life <= 0) { this.banner = null; return; }
      const g = this.g, t = bn.life / bn.max;
      g.globalAlpha = Math.min(1, t * 3, (1 - t) * 8);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 62, W, 40);
      const size = bn.title.length > 18 ? 12 : 16;
      text(g, bn.title, W / 2, 68 + (16 - size) / 2, bn.color, size, 'center');
      if (bn.sub) text(g, bn.sub, W / 2, 88, '#ffffff', 8, 'center');
      g.globalAlpha = 1;
    }
  }

  DD.Renderer = Renderer;
  DD.THEMES = THEMES;
})(window);
