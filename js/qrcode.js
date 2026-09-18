/* qrcode.js — minimal QR Code generator (byte mode, EC level M, versions 1-10)
   Self-contained, no dependencies, no CDN. Renders into a <canvas> or <div>.
   Usage:  QRCode.render(element, "https://example.com/play.html", {size: 480, margin: 4}) */
(function (global) {
  'use strict';

  /* ---------- Galois field GF(256), primitive polynomial 0x11d ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { if (a === 0 || b === 0) return 0; return EXP[LOG[a] + LOG[b]]; }

  function genPoly(n) {
    var p = [1];
    for (var i = 0; i < n; i++) {
      var q = [1, EXP[i]], r = new Array(p.length + 1);
      for (var k = 0; k < r.length; k++) r[k] = 0;
      for (var a = 0; a < p.length; a++) for (var b = 0; b < 2; b++) r[a + b] ^= gmul(p[a], q[b]);
      p = r;
    }
    return p;
  }

  function rsRemainder(data, ecLen) {
    var g = genPoly(ecLen), res = new Array(data.length + ecLen), i, j;
    for (i = 0; i < data.length; i++) res[i] = data[i];
    for (i = data.length; i < res.length; i++) res[i] = 0;
    for (i = 0; i < data.length; i++) {
      var c = res[i];
      if (c === 0) continue;
      for (j = 0; j < g.length; j++) res[i + j] ^= gmul(g[j], c);
    }
    return res.slice(data.length);
  }

  /* ---------- Block layout table: version -> [ecPerBlock, b1, d1, b2, d2] ---------- */
  var BLOCKS = {
    L: {
      1: [7, 1, 19, 0, 0],   2: [10, 1, 34, 0, 0],  3: [15, 1, 55, 0, 0],
      4: [20, 1, 80, 0, 0],  5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0],
      7: [20, 2, 78, 0, 0],  8: [24, 2, 97, 0, 0],  9: [30, 2, 116, 0, 0],
      10: [18, 2, 68, 2, 69]
    },
    M: {
      1: [10, 1, 16, 0, 0],  2: [16, 1, 28, 0, 0],  3: [26, 1, 44, 0, 0],
      4: [18, 2, 32, 0, 0],  5: [24, 2, 43, 0, 0],  6: [16, 4, 27, 0, 0],
      7: [18, 4, 31, 0, 0],  8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37],
      10: [26, 4, 43, 1, 44]
    }
  };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };
  var ECBITS = { L: 0x01, M: 0x00, Q: 0x03, H: 0x02 };

  function dataCapacityBytes(version, ecl) {
    var b = BLOCKS[ecl][version];
    var totalData = b[1] * b[2] + b[3] * b[4];
    var lenBits = version < 10 ? 8 : 16;
    return Math.floor((totalData * 8 - 4 - lenBits) / 8);
  }

  function toUtf8Bytes(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c < 0xd800 || c >= 0xe000) { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
      else {
        i++;
        var cp = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return out;
  }

  /* ---------- Bit buffer ---------- */
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.put = function (val, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  };

  /* ---------- Build the final codeword stream ---------- */
  function makeCodewords(bytes, version, ecl) {
    var spec = BLOCKS[ecl][version];
    var ecLen = spec[0], b1 = spec[1], d1 = spec[2], b2 = spec[3], d2 = spec[4];
    var totalData = b1 * d1 + b2 * d2;
    var lenBits = version < 10 ? 8 : 16;

    var bb = new BitBuf();
    bb.put(4, 4);                 // byte mode
    bb.put(bytes.length, lenBits);
    for (var i = 0; i < bytes.length; i++) bb.put(bytes[i], 8);

    var cap = totalData * 8;
    var term = Math.min(4, cap - bb.bits.length);
    bb.put(0, term);
    while (bb.bits.length % 8 !== 0) bb.bits.push(0);

    var data = [];
    for (i = 0; i < bb.bits.length; i += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bb.bits[i + k];
      data.push(v);
    }
    var pad = [0xEC, 0x11], p = 0;
    while (data.length < totalData) { data.push(pad[p % 2]); p++; }

    // split into blocks
    var blocks = [], ecblocks = [], off = 0, n;
    for (n = 0; n < b1; n++) { blocks.push(data.slice(off, off + d1)); off += d1; }
    for (n = 0; n < b2; n++) { blocks.push(data.slice(off, off + d2)); off += d2; }
    for (n = 0; n < blocks.length; n++) ecblocks.push(rsRemainder(blocks[n], ecLen));

    // interleave
    var out = [], maxD = Math.max(d1, d2), c;
    for (i = 0; i < maxD; i++) for (c = 0; c < blocks.length; c++) if (i < blocks[c].length) out.push(blocks[c][i]);
    for (i = 0; i < ecLen; i++) for (c = 0; c < ecblocks.length; c++) out.push(ecblocks[c][i]);
    return out;
  }

  /* ---------- Matrix construction ---------- */
  function newMatrix(size) {
    var m = new Array(size), r, c;
    for (r = 0; r < size; r++) { m[r] = new Array(size); for (c = 0; c < size; c++) m[r][c] = null; }
    return m;
  }

  function placeFinder(m, r0, c0) {
    for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
      var rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      var dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                 (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                 (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      m[rr][cc] = dark ? 1 : 0;
    }
  }

  function buildBase(version) {
    var size = version * 4 + 17, m = newMatrix(size), i, j;
    placeFinder(m, 0, 0);
    placeFinder(m, 0, size - 7);
    placeFinder(m, size - 7, 0);

    // timing
    for (i = 8; i < size - 8; i++) { var v = (i % 2 === 0) ? 1 : 0; m[6][i] = v; m[i][6] = v; }

    // alignment
    var a = ALIGN[version];
    for (i = 0; i < a.length; i++) for (j = 0; j < a.length; j++) {
      var ar = a[i], ac = a[j];
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
      for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
        m[ar + dr][ac + dc] = (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) ? 1 : 0;
      }
    }

    // dark module
    m[size - 8][8] = 1;

    // reserve format areas (mark with 0 for now, tracked by reserved map)
    var reserved = newMatrix(size);
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) reserved[i][j] = (m[i][j] !== null) ? 1 : 0;
    for (i = 0; i <= 8; i++) { if (reserved[8][i] === 0) { reserved[8][i] = 1; m[8][i] = 0; }
                              if (reserved[i][8] === 0) { reserved[i][8] = 1; m[i][8] = 0; } }
    for (i = 0; i < 8; i++) { reserved[8][size - 1 - i] = 1; m[8][size - 1 - i] = 0;
                              reserved[size - 1 - i][8] = 1; m[size - 1 - i][8] = 0; }
    if (version >= 7) {
      for (i = 0; i < 6; i++) for (j = 0; j < 3; j++) {
        reserved[size - 11 + j][i] = 1; m[size - 11 + j][i] = 0;
        reserved[i][size - 11 + j] = 1; m[i][size - 11 + j] = 0;
      }
    }
    return { m: m, reserved: reserved, size: size };
  }

  function placeData(base, codewords) {
    var m = base.m, reserved = base.reserved, size = base.size;
    var bitIdx = 0, total = codewords.length * 8;
    function bitAt(i) { return (codewords[i >> 3] >>> (7 - (i & 7))) & 1; }
    var upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;            // skip vertical timing column
      for (var r = 0; r < size; r++) {
        var row = upward ? (size - 1 - r) : r;
        for (var k = 0; k < 2; k++) {
          var c = col - k;
          if (reserved[row][c]) continue;
          m[row][c] = bitIdx < total ? bitAt(bitIdx) : 0;
          bitIdx++;
        }
      }
      upward = !upward;
    }
    return m;
  }

  function maskFn(id, r, c) {
    switch (id) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
    return false;
  }

  function bchFormat(data) {           // 5 data bits -> 15 bit format info
    var d = data << 10, g = 0x537;
    for (var i = 4; i >= 0; i--) if (d & (1 << (i + 10))) d ^= g << i;
    return ((data << 10) | d) ^ 0x5412;
  }
  function bchVersion(v) {             // 6 data bits -> 18 bit version info
    var d = v << 12, g = 0x1f25;
    for (var i = 5; i >= 0; i--) if (d & (1 << (i + 12))) d ^= g << i;
    return (v << 12) | d;
  }

  function applyFormat(m, size, ecl, mask) {
    var bits = bchFormat((ECBITS[ecl] << 3) | mask), i, b;
    for (i = 0; i <= 5; i++) { b = (bits >> i) & 1; m[8][i] = b; }
    m[8][7] = (bits >> 6) & 1;
    m[8][8] = (bits >> 7) & 1;
    m[7][8] = (bits >> 8) & 1;
    for (i = 9; i <= 14; i++) { b = (bits >> i) & 1; m[14 - i][8] = b; }
    for (i = 0; i <= 7; i++) { b = (bits >> i) & 1; m[size - 1 - i][8] = b; }
    for (i = 8; i <= 14; i++) { b = (bits >> i) & 1; m[8][size - 15 + i] = b; }
  }

  function applyVersion(m, size, version) {
    if (version < 7) return;
    var bits = bchVersion(version);
    for (var i = 0; i < 18; i++) {
      var b = (bits >> i) & 1, r = Math.floor(i / 3), c = i % 3;
      m[size - 11 + c][r] = b;
      m[r][size - 11 + c] = b;
    }
  }

  function penalty(m) {
    var size = m.length, score = 0, r, c, i, run, last;
    // rule 1: runs of 5+
    for (r = 0; r < size; r++) {
      run = 1; last = m[r][0];
      for (c = 1; c < size; c++) {
        if (m[r][c] === last) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[r][c]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (c = 0; c < size; c++) {
      run = 1; last = m[0][c];
      for (r = 1; r < size; r++) {
        if (m[r][c] === last) { run++; } else { if (run >= 5) score += 3 + (run - 5); run = 1; last = m[r][c]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    // rule 2: 2x2 blocks
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    // rule 3: finder-like patterns
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function match(get, n) {
      var s = 0, k, p;
      for (var start = 0; start + 11 <= n; start++) {
        var ok1 = true, ok2 = true;
        for (k = 0; k < 11; k++) { p = get(start + k); if (p !== pat1[k]) ok1 = false; if (p !== pat2[k]) ok2 = false; }
        if (ok1) s += 40; if (ok2) s += 40;
      }
      return s;
    }
    for (r = 0; r < size; r++) score += match((function (rr) { return function (i) { return m[rr][i]; }; })(r), size);
    for (c = 0; c < size; c++) score += match((function (cc) { return function (i) { return m[i][cc]; }; })(c), size);
    // rule 4: dark ratio
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += m[r][c];
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function encode(text, opts) {
    opts = opts || {};
    var ecl = opts.ecl || 'M';
    var bytes = toUtf8Bytes(text);
    var version = 0;
    for (var v = 1; v <= 10; v++) { if (bytes.length <= dataCapacityBytes(v, ecl)) { version = v; break; } }
    if (!version) throw new Error('QRCode: text too long (' + bytes.length + ' bytes)');

    var codewords = makeCodewords(bytes, version, ecl);
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var base = buildBase(version);
      placeData(base, codewords);
      var m = base.m, size = base.size;
      for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
        if (!base.reserved[r][c] && maskFn(mask, r, c)) m[r][c] ^= 1;
      }
      applyFormat(m, size, ecl, mask);
      applyVersion(m, size, version);
      var s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return { modules: best, size: best.length, version: version, ecl: ecl };
  }

  function render(el, text, opts) {
    opts = opts || {};
    var qr = encode(text, opts);
    var margin = opts.margin == null ? 4 : opts.margin;
    var total = qr.size + margin * 2;
    var px = opts.size || 320;
    var scale = Math.max(1, Math.floor(px / total));
    var dim = scale * total;

    var canvas = document.createElement('canvas');
    var dpr = Math.min(3, global.devicePixelRatio || 1);
    canvas.width = dim * dpr; canvas.height = dim * dpr;
    canvas.style.width = dim + 'px'; canvas.style.height = dim + 'px';
    canvas.style.display = 'block';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = opts.light || '#FFFFFF';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opts.dark || '#1B3350';
    for (var r = 0; r < qr.size; r++) for (var c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    }
    el.innerHTML = '';
    el.appendChild(canvas);
    return qr;
  }

  global.QRCode = { encode: encode, render: render, _dataCapacityBytes: dataCapacityBytes };
})(window);
