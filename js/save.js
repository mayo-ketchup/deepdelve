/* Deepdelve - save file encoding.
 * Saves are scrambled and carry a checksum, so editing them in the browser's dev tools
 * (Application > Local Storage) breaks the save instead of granting gold.
 * This stops casual cheating only: the code is readable, so a determined person can still
 * work around it. Anything that involves real money must be checked on a server. */
(function (root) {
  'use strict';

  const SAVE_KEY = 'deepdelve.save.v1';
  const SECURE_KEY = 'deepdelve.secure';          // set once this browser has written a scrambled save
  const BACKUP_KEY = 'deepdelve.save.unreadable'; // an unreadable save is moved here, never deleted
  const SALT = 'hearthstead:ember:7f3a91';
  const TAG = 'DD4';

  // cyrb53: a small, fast 53-bit string hash.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function xor(bytes) {
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= (SALT.charCodeAt(i % SALT.length) + i * 31) & 255;
    return bytes;
  }

  function toBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function fromBase64(b64) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function encode(state) {
    const json = JSON.stringify(state);
    return TAG + ':' + toBase64(xor(new TextEncoder().encode(json))) + ':' + hash(SALT + json);
  }

  // Returns { status: 'ok', data } or { status: 'bad' }.
  function decode(raw) {
    try {
      const parts = raw.split(':');
      if (parts.length !== 3 || parts[0] !== TAG) return { status: 'bad' };
      const json = new TextDecoder().decode(xor(fromBase64(parts[1])));
      if (hash(SALT + json) !== parts[2]) return { status: 'bad' };
      return { status: 'ok', data: JSON.parse(json) };
    } catch (e) {
      return { status: 'bad' };
    }
  }

  // status: 'none' (no save), 'ok', or 'bad' (edited outside the game, or damaged).
  function read(storage) {
    let raw;
    try { raw = storage.getItem(SAVE_KEY); } catch (e) { return { status: 'none' }; }
    if (!raw) return { status: 'none' };
    if (raw.charAt(0) === '{') {
      // A plain save from before scrambling existed. Accepted once, then re-saved scrambled.
      // After this browser has written a scrambled save, a plain one means someone wrote it by hand.
      let secure = null;
      try { secure = storage.getItem(SECURE_KEY); } catch (e) { /* ignore */ }
      if (secure) return { status: 'bad', raw };
      try { return { status: 'ok', data: JSON.parse(raw), legacy: true }; } catch (e) { return { status: 'bad', raw }; }
    }
    const r = decode(raw);
    if (r.status === 'bad') r.raw = raw;
    return r;
  }

  function write(storage, state) {
    try {
      storage.setItem(SAVE_KEY, encode(state));
      storage.setItem(SECURE_KEY, '1');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Keep an unreadable save aside (in case it was damaged rather than edited), then clear it.
  function quarantine(storage, raw) {
    try { storage.setItem(BACKUP_KEY, raw); storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function clear(storage) {
    try { storage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  }

  const DD = root.DD || (root.DD = {});
  DD.Save = { encode, decode, read, write, quarantine, clear, SAVE_KEY, BACKUP_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
