/* legacy.js: text extraction for old binary Office files (.doc, .ppt).
   Both formats are stored inside an OLE2 "compound file", so we parse that first. */
(function (root) {
  const NONE = 0xFFFFFFFA;
  const latin = new TextDecoder('windows-1252');
  const u16 = new TextDecoder('utf-16le');

  // ---- OLE2 container ----
  function cfb(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0xE011CFD0) throw new Error('Not a legacy Office file.');
    const ss = 1 << dv.getUint16(30, true), ms = 1 << dv.getUint16(32, true);
    const cutoff = dv.getUint32(56, true);

    // Sector ids that hold the FAT (first 109 in the header, rest via DIFAT)
    const ids = [];
    for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v < NONE) ids.push(v); }
    let d = dv.getUint32(68, true), n = dv.getUint32(72, true);
    while (n-- > 0 && d < NONE) {
      const o = (d + 1) * ss;
      for (let i = 0; i < ss / 4 - 1; i++) { const v = dv.getUint32(o + i * 4, true); if (v < NONE) ids.push(v); }
      d = dv.getUint32(o + ss - 4, true);
    }
    const fat = [];
    ids.forEach(id => { const o = (id + 1) * ss; for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(o + i * 4, true)); });

    function chain(start, table, size, src, off) {
      const parts = []; let s = start, guard = 0;
      while (s < NONE && guard++ < 1e6) { const o = off(s); parts.push(src.subarray(o, o + size)); s = table[s]; }
      const out = new Uint8Array(parts.length * size);
      parts.forEach((p, i) => out.set(p, i * size));
      return out;
    }
    const bigOff = s => (s + 1) * ss;

    const dir = chain(dv.getUint32(48, true), fat, ss, u8, bigOff);
    const dd = new DataView(dir.buffer);
    const entries = [];
    for (let i = 0; i + 128 <= dir.length; i += 128) {
      const nl = Math.max(0, dd.getUint16(i + 64, true) - 2);
      entries.push({
        name: u16.decode(dir.subarray(i, i + nl)), type: dir[i + 66],
        start: dd.getUint32(i + 116, true), size: dd.getUint32(i + 120, true)
      });
    }
    const mf = chain(dv.getUint32(60, true), fat, ss, u8, bigOff);
    const miniFat = new Uint32Array(mf.buffer);
    const miniStream = entries[0] ? chain(entries[0].start, fat, ss, u8, bigOff) : new Uint8Array(0);

    return {
      stream(name) {
        const e = entries.find(x => x.type === 2 && x.name === name);
        if (!e) return null;
        const data = e.size < cutoff
          ? chain(e.start, miniFat, ms, miniStream, s => s * ms)
          : chain(e.start, fat, ss, u8, bigOff);
        return data.subarray(0, e.size);
      }
    };
  }

  // ---- .doc : returns an array of paragraphs ----
  function docText(buf) {
    const c = cfb(buf), wd = c.stream('WordDocument');
    if (!wd) throw new Error('No Word data found in this file.');
    const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
    if (dv.getUint16(0, true) !== 0xA5EC) throw new Error('This Word version is not supported.');
    const flags = dv.getUint16(10, true);
    if (flags & 0x100) throw new Error('This document is password protected.');
    const tbl = c.stream((flags & 0x200) ? '1Table' : '0Table');
    if (!tbl) throw new Error('Word table data is missing.');

    let p = 32;
    p += 2 + dv.getUint16(p, true) * 2;                 // skip FibRgW
    const cslw = dv.getUint16(p, true), lw = p + 2;
    const ccpText = dv.getUint32(lw + 12, true);        // characters in the main document
    p = lw + cslw * 4 + 2;                              // start of the fc/lcb pairs
    const fcClx = dv.getUint32(p + 33 * 8, true), lcbClx = dv.getUint32(p + 33 * 8 + 4, true);

    // Clx -> piece table: where each run of text lives
    const cx = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
    let q = fcClx, pieces = null;
    while (q < fcClx + lcbClx) {
      const t = tbl[q];
      if (t === 1) q += 3 + cx.getUint16(q + 1, true);
      else if (t === 2) {
        const base = q + 5, n = (cx.getUint32(q + 1, true) - 4) / 12;
        pieces = [];
        for (let i = 0; i < n; i++) pieces.push({
          cp0: cx.getUint32(base + i * 4, true), cp1: cx.getUint32(base + (i + 1) * 4, true),
          fc: cx.getUint32(base + (n + 1) * 4 + i * 8 + 2, true)
        });
        break;
      } else break;
    }
    if (!pieces) throw new Error('Could not read the text of this document.');

    let text = '';
    for (const pc of pieces) {
      if (pc.cp0 >= ccpText) break;
      const len = Math.min(pc.cp1, ccpText) - pc.cp0;
      if (pc.fc & 0x40000000) { const o = (pc.fc & 0x3FFFFFFF) >> 1; text += latin.decode(wd.subarray(o, o + len)); }
      else text += u16.decode(wd.subarray(pc.fc, pc.fc + len * 2));
    }

    // Strip Word control characters and hidden field codes
    const out = []; let cur = ''; const stack = [];
    for (const ch of text) {
      const k = ch.charCodeAt(0);
      if (k === 0x13) { stack.push(0); continue; }           // field begin (code)
      if (k === 0x14) { if (stack.length) stack[stack.length - 1] = 1; continue; } // field result
      if (k === 0x15) { stack.pop(); continue; }             // field end
      if (stack.includes(0)) continue;
      if (k === 13 || k === 12) { out.push(cur); cur = ''; }
      else if (k === 7) cur += '\t';
      else if (k === 11) cur += '\n';
      else if (k >= 32 || k === 9) cur += ch;
    }
    out.push(cur);
    return out;
  }

  // ---- .ppt : returns [{title, paras}] ----
  function pptSlides(buf) {
    const c = cfb(buf), s = c.stream('PowerPoint Document');
    if (!s) throw new Error('No PowerPoint data found in this file.');
    const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    const slides = [], all = []; let cur = null, kind = -1;

    (function walk(a, b) {
      while (a + 8 <= b) {
        const ver = dv.getUint16(a, true) & 15, type = dv.getUint16(a + 2, true);
        const e = Math.min(a + 8 + dv.getUint32(a + 4, true), b);
        if (ver === 15) {                                    // container: look inside
          if (type === 1006) { cur = []; slides.push(cur); walk(a + 8, e); cur = null; }
          else if (type !== 1008 && type !== 1016 && type !== 1009) walk(a + 8, e); // skip notes, master, handout
        } else if (type === 3999) kind = dv.getUint32(a + 8, true);
        else if (type === 4000 || type === 4008) {
          const t = (type === 4000 ? u16 : latin).decode(s.subarray(a + 8, e));
          const item = { title: kind === 0 || kind === 6, paras: t.split(/[\r\v]/).filter(x => x.trim()) };
          all.push(item); if (cur) cur.push(item);
        }
        a = e;
      }
    })(0, s.length);

    const groups = slides.some(g => g.length) ? slides : [all];
    return groups.map(g => ({
      title: (g.find(x => x.title) || { paras: [] }).paras.join(' '),
      paras: g.filter(x => !x.title).flatMap(x => x.paras)
    }));
  }

  root.Legacy = { cfb, docText, pptSlides };
  if (typeof module !== 'undefined') module.exports = root.Legacy;
})(typeof window !== 'undefined' ? window : globalThis);
