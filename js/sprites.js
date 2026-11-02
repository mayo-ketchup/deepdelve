/* Deepdelve - pixel-art sprites.
 * Each sprite is a grid of characters; each character maps to a colour in its palette ('.' = transparent).
 * Monsters are drawn facing right and flipped at render time so they face the hero.
 * Sprites are rendered once to small canvases and cached. */
(function (root) {
  'use strict';

  // Shared hero colours. n = skin, m = magic gem.
  const HERO_BASE = {
    a: '#14121a', c: '#0b0a10', s: '#7d8796', h: '#3c3f4f',
    j: '#4a3020', f: '#e8eef7', k: '#8a5a1a', g: '#e3b341',
    n: '#e0b48a', m: '#7fd1ff'
  };

  // Skins recolour every class. b = helmet / hat / hood, d = shoulders, e = tabard / robe / tunic, g = belt
  const SKIN_COLORS = {
    steel:   { b: '#a9b3c2', d: '#c9d1dc', e: '#2f6fd0' },
    crimson: { b: '#8c95a3', d: '#d9b25a', e: '#b8302f' },
    emerald: { b: '#9aa39a', d: '#7a5230', e: '#2e8f55' },
    shadow:  { b: '#3b3842', d: '#6e3fa0', e: '#2a2236', g: '#9b6be0' },
    gilded:  { b: '#e8c04a', d: '#f5e3a0', e: '#f0efe8', g: '#b8862a' }
  };
  const HERO_IDS = { knight: 1, ranger: 1, mage: 1 };

  // Item icons: x = rarity colour, w = shine, k = wood, a = outline
  const ICON_BASE = { a: '#141218', w: '#f4f4f4', k: '#8a5a1a' };

  const SPRITES = {
    // ---------- heroes ----------
    knight: {
      rows: [
        '................',
        '.....aaaaa....a.',
        '....abbbbba..afa',
        '...abbbbbbba.afa',
        '...abbbcccca.afa',
        '...abbbbbbba.afa',
        '....abbbbba..afa',
        '..addeeeedda.kkk',
        '..adeeeeeedaass.',
        '..adeggggedaass.',
        '..aseeeeeesa....',
        '...aeeeeeea.....',
        '...ahhaahha.....',
        '...ahha.ahha....',
        '...ajja.ajja....',
        '..ajjja.ajjja...'
      ]
    },
    ranger: {
      rows: [
        '................',
        '.....aaaaa..kk..',
        '....abbbbba.f.k.',
        '...abbbbbbbaf..k',
        '...abbnnnnbaf..k',
        '...abncnncbaf..k',
        '....abnnnbaaf..k',
        '..addeeeedda.nnk',
        '..adeeeeeeda.f.k',
        '..adeggggeda.f.k',
        '..aseeeeeesa.f.k',
        '...aeeeeeea..fk.',
        '...ahhaahha..kk.',
        '...ahha.ahha....',
        '...ajja.ajja....',
        '..ajjja.ajjja...'
      ]
    },
    mage: {
      rows: [
        '.......aa.......',
        '......abba....m.',
        '.....abbba...mmm',
        '....abbbbba...k.',
        '..aabbbbbbbaa.k.',
        '....annnnna...k.',
        '....ancnnca...k.',
        '....annnnna...k.',
        '...addeeedda.nk.',
        '..adeeeeeeeaank.',
        '..aeeggggeea..k.',
        '..aeeeeeeeea..k.',
        '..aeeeeeeeeea.k.',
        '.aeeeeeeeeeeeak.',
        '.aeeeeeeeeeeeak.',
        '..ajja...ajja.k.'
      ]
    },

    // ---------- Whispering Woods ----------
    goblin: {
      palette: { a: '#16200f', b: '#6aa84f', c: '#ffd23f', d: '#f0ead6', e: '#7a4a2a', f: '#3b2414', g: '#8a6a4a' },
      rows: [
        '................',
        '................',
        '......aaaa......',
        '.a...abbbba...a.',
        '.aa.abbbbbba.aa.',
        '..ababcbbcbaba..',
        '...abbbbbbbba...',
        '....abddddba....',
        '.....abbbba.....',
        '....eeeeeeee....',
        '...beeeeeeeeb...',
        '...b.eeffee.b.g.',
        '...b.eeeeee.bgg.',
        '.....bb..bb..gg.',
        '.....bb..bb.....',
        '....aaa..aaa....'
      ]
    },
    wolf: {
      palette: { a: '#141418', b: '#7a7f8c', c: '#ffd23f', d: '#4e525e', e: '#b9bdc6', f: '#f0f0f0' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        '...........a.a..',
        '..........abab..',
        'a.........abbbba',
        'ba.......abbcbba',
        '.ba.aaaaaabbbbbf',
        '..abbbbbbbbbbdaa',
        '..abbbbbbbbbba..',
        '..adeeeeeebbba..',
        '..abd....abd....',
        '..ab.....ab.....',
        '..ab.....ab.....',
        '.aaa....aaa.....'
      ]
    },
    spider: {
      palette: { a: '#100a14', b: '#3a2a4a', c: '#ff3b3b', d: '#241a2e', e: '#d8a020' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '......aaaa......',
        '...d.abbbba.d...',
        '..d.abbeebba.d..',
        '.d..abbbbbba..d.',
        '.d.aabbbbbbaa.d.',
        'd.dabcbbbbcbad.d',
        'd.d.abbbbbba.d.d',
        '.d.d.aaaaaa.d.d.',
        '.d.d........d.d.',
        'd...d......d...d'
      ]
    },

    // ---------- Rotting Swamp ----------
    slime: {
      palette: { a: '#0f2a14', b: '#4cc35a', c: '#0f1a10', d: '#2e8a3c', e: '#b6f5bd' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        '................',
        '......aaaa......',
        '....aabbbbaa....',
        '...abbebbbbba...',
        '..abbebbbbbbba..',
        '..abbbcbbbcbba..',
        '.abbbbcbbbcbbba.',
        '.abbbbbbbbbbbba.',
        '.abbbbbddddbbba.',
        '.adbbbbbbbbbbda.',
        '..aaaaaaaaaaaa..',
        '................'
      ]
    },
    toad: {
      palette: { a: '#14200e', b: '#6b8a3a', c: '#ffcf3a', d: '#3e5a22', e: '#d8d07a' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '....aa....aa....',
        '...abca..abca...',
        '..abbbbaabbbba..',
        '.abbdbbbbbbdbba.',
        '.abbbbbbbbbbbba.',
        '.abaaaaaaaaaaba.',
        'abbeeeeeeeeeebba',
        'abdbeeeeeeeebdba',
        '.abbbaaaaaabbba.',
        'aaaa........aaaa'
      ]
    },
    snake: {
      palette: { a: '#0e1a0c', b: '#5a9a3a', c: '#ff4040', d: '#2f5a20', e: '#d8d07a', f: '#ff4060' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        '..........aaaa..',
        '.........abbbba.',
        '.........abcbbaf',
        '.........abbbba.',
        '..........abba..',
        '..........abda..',
        '...aaaaa..abba..',
        '..abdbdbaabdba..',
        '.abbaaaabbbbba..',
        '.abda...abdbda..',
        '.abbbaaabbbbba..',
        '..aeeeeeeeeea...'
      ]
    },

    // ---------- Forgotten Catacombs ----------
    skeleton: {
      palette: { a: '#1a1a1a', b: '#e6e1d3', c: '#ff5a3c', d: '#1a1a1a', e: '#e6e1d3' },
      rows: [
        '................',
        '......aaaa......',
        '.....abbbba.....',
        '....abbbbbba....',
        '....abccbccba...',
        '....abbbbbbba...',
        '.....abdbdba....',
        '......aaaaa.....',
        '....abbbbbbba...',
        '...b.abababa.b..',
        '...b.abbbbba.b..',
        '...e..ababa..e..',
        '.......bab......',
        '......b...b.....',
        '......b...b.....',
        '.....bb...bb....'
      ]
    },
    bat: {
      palette: { a: '#120d18', b: '#5a3d7a', c: '#ff4d4d', d: '#f2f2f2' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        'a..............a',
        'aa....a..a....aa',
        'aba...aaaa...aba',
        'abba.abbbba.abba',
        'abbbabcbbcbabbba',
        'abbbbbbbbbbbbbba',
        '.abbbbbddbbbbba.',
        '..abba.aa.abba..',
        '...aa......aa...',
        '................',
        '................',
        '................'
      ]
    },
    ghost: {
      palette: { a: '#1a2440', b: '#dfe8f5', c: '#3a7aff', d: '#a8b8d8' },
      rows: [
        '................',
        '................',
        '.....aaaaa......',
        '....abbbbba.....',
        '...abbbbbbba....',
        '..abbcbbbcbba...',
        '..abbcbbbcbba...',
        '..abbbbbbbbba...',
        '..abbbaaabbba...',
        '..abbbbbbbbbba..',
        '..abbbbbbbbbbba.',
        '..abdbbbbbbdbba.',
        '..adbdbbbbdbdba.',
        '...abda.abdba...',
        '....aa...aaa....',
        '................'
      ]
    },

    // ---------- Castle Dreadmoor ----------
    darkknight: {
      palette: { a: '#0c0a10', b: '#3a3848', c: '#ff2a2a', d: '#6a6880', e: '#8a1a24', f: '#c8ccd8', g: '#c09030' },
      rows: [
        '................',
        '.....aaaaa......',
        '....abbbbba..a..',
        '....abdbbba.afa.',
        '....abcccba.afa.',
        '....abbbbba.afa.',
        '.....abbba..afa.',
        '...eaddddda.ggg.',
        '..eabdbbbdbaab..',
        '..eabbbbbbbab...',
        '..eabdddddba....',
        '..eeabbbbba.....',
        '...eabbabba.....',
        '....abba.abba...',
        '....abba.abba...',
        '...aaaaa.aaaaa..'
      ]
    },
    gargoyle: {
      palette: { a: '#121216', b: '#7a7a84', c: '#ff8a1a', d: '#4e4e58', e: '#5a5a66' },
      rows: [
        '................',
        '................',
        'e..............e',
        'ee....a..a....ee',
        'eee..abaaba..eee',
        'eede.abbbba.edee',
        'edde.abcbca.edde',
        '.edeeabbbbaeede.',
        '..eeeabddbaeee..',
        '....abbbbbba....',
        '...abdbbbbdba...',
        '...abbbbbbbba...',
        '....abbaabba....',
        '....ab.aa.ba....',
        '...aaa....aaa...',
        '................'
      ]
    },
    imp: {
      palette: { a: '#1a0808', b: '#c8382a', c: '#ffe23a', d: '#7a1a14', e: '#f0e0c0', f: '#6a4a2a', g: '#b0b0b8' },
      rows: [
        '................',
        '................',
        '................',
        '...........g.g.g',
        '...........ggggg',
        '...e....e....f..',
        '...eaaaae....f..',
        '...abbbba....f..',
        '...abcbca....f..',
        '...abbbba...bf..',
        '....abba...b.f..',
        '...abbbbabb..f..',
        '..b.adddda...f..',
        '..b..abba....f..',
        '.b...a..a....f..',
        '....aa..aa......'
      ]
    },

    // ---------- The Outer Realm ----------
    eye: {
      palette: { a: '#12081e', b: '#7a3aa8', c: '#ff3df0', d: '#4a1e70', e: '#f0e8f8', f: '#5a2a88' },
      rows: [
        '................',
        '................',
        '.....aaaaaa.....',
        '...aabbbbbbaa...',
        '..abbbbbbbbbba..',
        '.abbaaaaaaaabba.',
        '.abaeeeeeeeeaba.',
        'abaeeeacceeeeaba',
        'abaeeeacceeeeaba',
        '.abaeeeeeeeeaba.',
        '.abbaaaaaaaabba.',
        '..abbbbbbbbbba..',
        '...aabdbbdbaa...',
        '....f.f..f.f....',
        '...f..f..f..f...',
        '...f...ff...f...'
      ]
    },
    voidling: {
      palette: { a: '#06040c', b: '#221438', c: '#5ff0ff', d: '#5a3a8a', e: '#3a2260' },
      rows: [
        '................',
        '................',
        '................',
        '................',
        '......aaaa......',
        '....aabbbbaa....',
        '...abbdbbbbba...',
        '..abbbbbbbbbba..',
        '..abbcbbbbcbba..',
        '..abbcbbbbcbba..',
        '..abbbbbbbbbba..',
        '..abbbaaaabbba..',
        '..aebbbbbbbbea..',
        '.e.aeebbeea.e...',
        'e...e.e..e.e..e.',
        '....e......e....'
      ]
    },
    wisp: {
      palette: { a: '#1a0f2e', b: '#f4faff', c: '#1a0f2e', d: '#8fdcff', e: '#3a6ee0' },
      rows: [
        '................',
        '.......e........',
        '......ede.......',
        '.....eddde......',
        '....edddde......',
        '...eddbbdde.....',
        '..eddbbbbdde....',
        '..edbcbbcbde....',
        '..edbcbbcbde....',
        '..edbbbbbbde....',
        '...edbbbbde.....',
        '....eddddde.....',
        '.....eeeee......',
        '......e.e.......',
        '.......e........',
        '................'
      ]
    },

    // ---------- Hearthstead ----------
    merchant: {
      palette: { a: '#141218', b: '#6a3a7a', c: '#141218', d: '#4a2458', n: '#e0b48a', w: '#e8e4dc', e: '#8a5a2a' },
      rows: [
        '................',
        '.....aaaaa......',
        '....abbbbba.....',
        '...abbbbbbba....',
        '...abdnnndba....',
        '...abncnncba....',
        '...abnnnnnba....',
        '...abwwwwwba....',
        '..abbwwwwwbba...',
        '..aeewwwwweea...',
        '..aeeewwweeea...',
        '..aeeeeeeeeea...',
        '..aeeeeeeeeea...',
        '..aeeeeeeeeea...',
        '..aeeeeeeeeea...',
        '..aaaaaaaaaaa...'
      ]
    },

    // ---------- menu icons (8x8) ----------
    menu_hero: {
      palette: { a: '#14121a', b: '#a9b3c2', c: '#3c3f4f', d: '#e8eef7' },
      rows: ['..aaaa..', '.abdbba.', 'abbbbbba', 'abccccba', 'abbbbbba', '.abbbba.', '.ab..ba.', '........']
    },
    menu_gear: {
      palette: { w: '#e8eef7', a: '#7d8796', k: '#e3b341', g: '#8a5a1a' },
      rows: ['.......w', '......wa', '.....wa.', '.k..wa..', '..kwa...', '..gk....', '.g..k...', 'g.......']
    },
    menu_skills: {
      palette: { s: '#c9d1dc', k: '#8a5a1a', a: '#7d8796' },
      rows: ['.asssss.', 's...k..s', '....k...', '....k...', '...k....', '...k....', '..k.....', '..k.....']
    },
    menu_craft: {
      palette: { h: '#c9d1dc', k: '#8a5a1a', a: '#5a5a68', f: '#ff9a2e' },
      rows: ['.hh..f..', '.hhk.f..', '...k....', 'aaaaaaa.', '.aaaaaaa', '...aa...', '..aaaa..', '.aaaaaa.']
    },
    menu_merchant: {
      palette: { a: '#3a2414', b: '#8a5a2a', k: '#c09030', y: '#f2c230' },
      rows: ['...aa...', '..akka..', '...aa...', '.abbbba.', 'abbybbba', 'abyybbba', 'abbbbbba', '.aaaaaa.']
    },
    menu_allies: {
      palette: { a: '#4cd964', b: '#4da3ff', c: '#14121a' },
      rows: ['.aa..bb.', '.aa..bb.', '........', 'aaa..bbb', 'aaaa.bbb', 'aaaa.bbb', 'a..a.b.b', '........']
    },
    menu_retire: {
      palette: { a: '#5a2a90', b: '#c99bff', w: '#f0e0ff' },
      rows: ['..aaaa..', '.abbbba.', 'abbwbbba', 'abwbbbba', '.abbbba.', '..abba..', '...aa...', '........']
    },
    menu_skins: {
      palette: { a: '#14121a', b: '#d8343a', g: '#e3b341' },
      rows: ['.aa..aa.', 'abbaabba', 'abbbbbba', '.abbbba.', '.abggba.', '.abbbba.', '.abbbba.', '.aaaaaa.']
    },
    menu_store: {
      palette: { a: '#3a2414', b: '#8a5a2a', g: '#f2c230' },
      rows: ['.aaaaaa.', 'abbbbbba', 'abbbbbba', 'aaaggaaa', 'abbggbba', 'abbbbbba', 'abbbbbba', 'aaaaaaaa']
    },
    menu_stats: {
      palette: { a: '#b6e36a', b: '#5a7a3a' },
      rows: ['........', '......a.', '....a.a.', '....a.a.', '..a.a.a.', '..a.a.a.', 'a.a.a.a.', 'bbbbbbbb']
    },

    // ---------- misc ----------
    crown: {
      palette: { g: '#f2c230', r: '#d8343a', b: '#3a6ee0' },
      rows: [
        'g..g..g',
        'gg.g.gg',
        'ggggggg',
        'grgbgrg'
      ]
    },

    // ---------- item icons (8x8) ----------
    icon_sword: {
      icon: true,
      rows: [
        '.......a',
        '......ax',
        '.....axa',
        '....axa.',
        '.k.axa..',
        '..kxa...',
        '.k.k....',
        'k.......'
      ]
    },
    icon_bow: {
      icon: true,
      rows: [
        '.xk.....',
        '.w.k....',
        '.w..k...',
        '.w..x...',
        '.w..x...',
        '.w..k...',
        '.w.k....',
        '.xk.....'
      ]
    },
    icon_staff: {
      icon: true,
      rows: [
        '.....xx.',
        '....xwwx',
        '....xwwx',
        '.....xx.',
        '....k...',
        '...k....',
        '..k.....',
        '.k......'
      ]
    },
    icon_helm: {
      icon: true,
      rows: [
        '..aaaa..',
        '.axxxxa.',
        'axxwxxxa',
        'axaaaaxa',
        'axa..axa',
        'axxxxxxa',
        '.ax..xa.',
        '........'
      ]
    },
    icon_armor: {
      icon: true,
      rows: [
        '.aa..aa.',
        'axxaaxxa',
        'axxxxxxa',
        '.axwxxa.',
        '.axxxxa.',
        '.axxxxa.',
        '.axxxxa.',
        '..aaaa..'
      ]
    },
    icon_trinket: {
      icon: true,
      rows: [
        '.a....a.',
        '..a..a..',
        '...aa...',
        '..axxa..',
        '.axwxxa.',
        '.axxxxa.',
        '..axxa..',
        '...aa...'
      ]
    }
  };

  const WEAPON_ICON = { knight: 'icon_sword', ranger: 'icon_bow', mage: 'icon_staff' };
  function iconFor(item) {
    if (item.slot === 'weapon') return WEAPON_ICON[item.cls] || 'icon_sword';
    return 'icon_' + item.slot;
  }

  // ---- colour helpers (hue-shift palettes for tougher monster variants) ----
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }

  function shift(hex, deg, dl) {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h + deg, s, Math.max(0, Math.min(1, l + (dl || 0))));
  }

  function mix(hex, toHex, t) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(toHex.slice(1), 16);
    const ch = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
    return '#' + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('');
  }

  function paletteFor(id, opts) {
    if (HERO_IDS[id]) return Object.assign({}, HERO_BASE, SKIN_COLORS[opts.skin] || SKIN_COLORS.steel);
    if (SPRITES[id].icon) return Object.assign({}, ICON_BASE, { x: opts.tint || '#c8c8c8' });
    const base = SPRITES[id].palette;
    const deg = (opts.variant || 0) * 75 + (opts.boss ? 30 : 0);
    let out = base;
    if (deg) {
      out = {};
      Object.keys(base).forEach((k) => {
        // keep outlines and glowing eyes intact so variants still read clearly
        out[k] = (k === 'a' || k === 'c') ? base[k] : shift(base[k], deg, opts.boss ? -0.06 : 0);
      });
    }
    if (opts.frozen) {
      const iced = {};
      Object.keys(out).forEach((k) => { iced[k] = k === 'a' ? out[k] : mix(out[k], '#a8e4ff', 0.55); });
      out = iced;
    }
    return out;
  }

  function render(rows, palette, flip) {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = palette[rows[y][x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
      }
    }
    return c;
  }

  const cache = new Map();

  function get(id, opts) {
    opts = opts || {};
    const key = [id, opts.skin || '', opts.variant || 0, opts.boss ? 1 : 0, opts.flash ? 1 : 0,
      opts.flip ? 1 : 0, opts.frozen ? 1 : 0, opts.tint || ''].join('|');
    let c = cache.get(key);
    if (c) return c;
    let pal = paletteFor(id, opts);
    if (opts.flash) {
      const white = {};
      Object.keys(pal).forEach((k) => { white[k] = '#ffffff'; });
      pal = white;
    }
    c = render(SPRITES[id].rows, pal, opts.flip);
    cache.set(key, c);
    return c;
  }

  // First row that contains any pixels (used to place crowns / HP bars above a sprite's head).
  function topRow(id) {
    const rows = SPRITES[id].rows;
    for (let y = 0; y < rows.length; y++) if (/[^.]/.test(rows[y])) return y;
    return 0;
  }

  function preview(id, opts, scale) {
    const s = get(id, opts);
    const c = document.createElement('canvas');
    c.width = s.width * scale; c.height = s.height * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(s, 0, 0, c.width, c.height);
    return c.toDataURL();
  }

  // Sanity check: every row of a sprite must be the same width.
  Object.keys(SPRITES).forEach((id) => {
    const w = SPRITES[id].rows[0].length;
    SPRITES[id].rows.forEach((r, i) => {
      if (r.length !== w) console.warn('Sprite ' + id + ' row ' + i + ' has width ' + r.length + ', expected ' + w);
    });
  });

  const DD = root.DD || (root.DD = {});
  DD.Sprites = { get, preview, topRow, iconFor, SPRITES };
})(typeof window !== 'undefined' ? window : globalThis);
