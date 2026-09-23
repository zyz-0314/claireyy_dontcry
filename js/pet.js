// 像素猫的构建、绘制与动画。
//
// 精灵几何来自 js/vendor/cat-sprite.js 和 js/vendor/dog-sprite.js（pixelpets，MIT）。
// 猫不是位图贴图，而是程序化生成的：一组网格图元（ellipse/triangle/setCell）在
// 24x30 的格子里画出轮廓，再按毛色给每个「角色」上色。所以换毛色是换一张色板，
// 不是换一张图。
//
// 这里从 pixelpets 的 renderer.js 移植了一批纯绘制逻辑：drawCat、composeLoaf（蜷缩
// 睡姿）、composeKnead（踩奶）、composeHunt（追鼠标的蹲伏）、drawTail、drawDogTail，
// 以及摸头、踩奶、追鼠标三个行为的节奏数学。原版把 canvas 挂在模块级全局变量 ctx 上，
// 移植时一律改成显式传参。
//
// 没有搬的是原版那套 2500 行的完整行为系统：拖拽（mochi）、工作模式、捕蝴蝶、
// 多显示器/桌面边缘那一整套。这个房间里的猫会呼吸、看你、睡着，会踩奶、会被摸、
// 会追你的鼠标，会在追完之后自己慢慢走回房间中央。
//
// 全部包在 IIFE 里：cat-sprite.js 在全局词法作用域声明了 CELL / G / setCell /
// PATTERNS 等一大批名字，在全局重复声明同名 const/let 会直接抛 SyntaxError。
(function () {
  'use strict';

  var CELL = 4;                                  // 来自 cat-sprite.js，写死只为可读性
  var COLS = 24, ROWS = 30;                      // 坐姿精灵的网格尺寸
  var SW = COLS * CELL, SH = ROWS * CELL;        // 96 x 120
  var HALO_ALPHA = 0.55;                         // 光晕描边的不透明度
  var BODY_ROLES = BODY;                         // 来自 cat-sprite.js
  var SLEEP_AFTER_MS = 90000;                    // 无操作 90 秒后睡去
  var REACT_MS = 2800;                           // 一次安慰动作的时长

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- 猫的睡姿（lifted from pixelpets renderer.js composeLoaf）--------------
  // 不调 outlineHalo 之外的任何外部状态，只用网格图元和 B。
  function composeLoaf(B) {
    B = B || {};
    var CX = 12;
    var bw = B.bodyW || 1;
    var headRx = B.headRx || 6.3, headRy = B.headRy || 5.8;
    var earY = B.earApexY == null ? 1 : B.earApexY, ew = B.earW || 2.4, eo = B.earOut || 4;
    var eRx = B.eyeRx || 2, eRy = B.eyeRy || 2.4, fluff = !!B.fluff, cheek = B.cheek || 0;
    var EH = 6;   // 头/耳朵相对坐姿下沉的格数（趴着）
    [[20.4, 26.6], [18.6, 28.2], [16.2, 29.2]].forEach(function (p) { ellipse(p[0], p[1], 1.7, 1.6, 'C'); });
    ellipse(16.2, 29.2, 0.9, 0.9, 'W', ['C']);
    ellipse(CX, 25, 8.9 * bw, 4.7 + (fluff ? 0.4 : 0), 'C');
    ellipse(CX, 21, 8.0 * bw, 4.0, 'C');
    ellipse(CX, 8 + EH, headRx, headRy, 'C');
    if (cheek) { ellipse(CX - headRx * 0.7, 9.6 + EH, 1.7, 2.2, 'C'); ellipse(CX + headRx * 0.7, 9.6 + EH, 1.7, 2.2, 'C'); }
    if (fluff) { ellipse(5.4, 10.4 + EH, 1.9, 2.4, 'C'); ellipse(18.6, 10.4 + EH, 1.9, 2.4, 'C'); }
    triangle(CX - eo - 0.5, earY + EH, CX - eo - ew, 7.6 + EH, CX - eo + ew, 6.4 + EH, 'K');
    triangle(CX + eo + 0.5, earY + EH, CX + eo + ew, 7.6 + EH, CX + eo - ew, 6.4 + EH, 'K');
    var iw = ew * 0.55;
    triangle(CX - eo - 0.3, earY + 2 + EH, CX - eo - iw, 7.2 + EH, CX - eo + iw, 6.6 + EH, 'I');
    triangle(CX + eo + 0.3, earY + 2 + EH, CX + eo + iw, 7.2 + EH, CX + eo - iw, 6.6 + EH, 'I');
    if (fluff) { ellipse(CX - eo, 6.0 + EH, 0.9, 1.4, 'W', ['C', 'K']); ellipse(CX + eo, 6.0 + EH, 0.9, 1.4, 'W', ['C', 'K']); }
    ellipse(CX, 12 + EH, 3, 2, 'W', ['C']);
    ellipse(CX, 22, fluff ? 3.2 : 2.6, 3.4, 'W', ['C']);
    ellipse(9.6, 28.4, 2.0, 1.4, 'W', ['C']); ellipse(14.4, 28.4, 2.0, 1.4, 'W', ['C']);
    setCell(12, 28, '.'); setCell(12, 29, '.');
    ellipse(9, 8.2 + EH, eRx, eRy, 'E'); ellipse(15, 8.2 + EH, eRx, eRy, 'E');
    setCell(12, 11 + EH, 'N'); setCell(11, 11 + EH, 'N');
    if (B.tabby) {
      [[11, 6 + EH], [12, 7 + EH], [13, 6 + EH]].forEach(function (p) { if (G[p[1]] && G[p[1]][p[0]] === 'C') setCell(p[0], p[1], 'K'); });
      [[5, 23], [6, 25], [18, 23], [17, 25]].forEach(function (p) { if (G[p[1]] && G[p[1]][p[0]] === 'C') setCell(p[0], p[1], 'K'); });
    }
    ellipse(7.5, 24, 2.3, 2.8, 'X', ['C', 'K']); ellipse(16, 26, 2.2, 2.2, 'X', ['C', 'K']);
  }

  // ---- 踩奶的姿势（lifted from pixelpets renderer.js composeTypeFront）-------
  // 原版叫 composeTypeFront，是 24x24 的网格——它比坐姿矮，因为那儿的猫是趴在一个
  // 真键盘上。这里统一放进 24x30，所以所有行号 +6，脚正好落在和坐姿同一条地板线上。
  // 移植方式和 composeLoaf 一样：把原姿势的几何搬过来，不改高度逻辑。
  //
  // 两只前爪不在这里：pixelpets 也是把前臂单独画出来的（drawKneadPaws），所以这个
  // 姿势只画到肩膀。尾巴是烤进来的（原版如此），所以踩奶时不要再单独画尾巴。
  function composeKnead(B) {
    B = B || {};
    var CX = 12;
    var fluff = !!B.fluff;
    var EH = 6;                                                    // 24 行 -> 30 行的下移量
    // 尾巴：从右后臀出来，贴着地面往右扫（原版是烤进精灵的，不是单独画）
    [[20.5, 20.4 + EH], [22.2, 20.9 + EH], [23.2, 21.8 + EH], [22.6, 22.8 + EH]].forEach(function (p) { ellipse(p[0], p[1], 1.5, 1.5, 'C'); });
    ellipse(21.8, 23.2 + EH, 1.0, 1.0, 'W', ['C']);
    // 身体：前倾，重心压在肩胸上，后臀坐宽（后半身还蹲着，前半身已经探出去）
    ellipse(CX, 16 + EH, 6.0, 5.4, 'C');
    ellipse(6.6, 20.2 + EH, 3.4, 3.2, 'C');
    ellipse(17.4, 20.2 + EH, 3.4, 3.2, 'C');
    // 头：正面、略低
    ellipse(CX, 8.5 + EH, 6.3, 5.6, 'C');
    if (fluff) { ellipse(5.6, 10.8 + EH, 1.9, 2.3, 'C'); ellipse(18.4, 10.8 + EH, 1.9, 2.3, 'C'); }
    // 耳朵
    triangle(CX - 4.5, 1.2 + EH, CX - 6.4, 6.8 + EH, CX - 1.8, 5.6 + EH, 'K');
    triangle(CX + 4.5, 1.2 + EH, CX + 6.4, 6.8 + EH, CX + 1.8, 5.6 + EH, 'K');
    triangle(CX - 4.3, 3.0 + EH, CX - 5.4, 6.3 + EH, CX - 2.8, 5.6 + EH, 'I');
    triangle(CX + 4.3, 3.0 + EH, CX + 5.4, 6.3 + EH, CX + 2.8, 5.6 + EH, 'I');
    if (fluff) { ellipse(CX - 4.5, 5.6 + EH, 0.9, 1.3, 'W', ['C', 'K']); ellipse(CX + 4.5, 5.6 + EH, 0.9, 1.3, 'W', ['C', 'K']); }
    // 大圆眼（drawCat 会把瞳孔往下挪到爪子上）+ 口鼻
    ellipse(9, 8.7 + EH, 2.0, 2.4, 'E'); ellipse(15, 8.7 + EH, 2.0, 2.4, 'E');
    ellipse(CX, 12.2 + EH, 3, 2, 'W', ['C']);
    setCell(12, 11 + EH, 'N'); setCell(11, 11 + EH, 'N');
    // 胸前的白毛——原注释特意说它要收窄，否则抬起的两只白爪子会消失在白毛里
    ellipse(CX, 17.8 + EH, 2.1, 3.2, 'W', ['C']);
    if (B.tabby) {
      [[11, 5 + EH], [12, 6 + EH], [13, 5 + EH]].forEach(function (p) { if (G[p[1]] && G[p[1]][p[0]] === 'C') setCell(p[0], p[1], 'K'); });
      for (var r = 13 + EH; r < 22 + EH; r += 2) for (var c = 3; c < 21; c++) if (G[r] && G[r][c] === 'C' && c % 2 === 0) setCell(c, r, 'K');
    }
    ellipse(7.5, 17.5 + EH, 2.2, 2.6, 'X', ['C', 'K']);
    ellipse(16.5, 20 + EH, 2.0, 2.0, 'X', ['C', 'K']);
  }

  // ---- 追鼠标的蹲伏姿势（lifted from pixelpets renderer.js composeHunt）-----
  // 正面、压得很低很宽、耳朵朝后贴平——原注释说这是猫锁定猎物时的耳朵姿态。
  // 尾巴甩到右后方，两只前爪收在身下。
  //
  // 和别的姿势不同：这一张不吃毛色的 build 参数（原版也是全毛色共用一张，在精灵
  // 表里按 '*' 存）。角色仍是那套 C/K/I/W/E/N/X，所以换毛色照样跟着变。
  var HUNT_COLS = 30, HUNT_ROWS = 20;
  var HW = HUNT_COLS * CELL, HH = HUNT_ROWS * CELL;      // 120 x 80：比坐姿宽、比坐姿矮

  function composeHunt() {
    var CX = 15;
    ellipse(CX, 12, 11, 5.4, 'C');                                          // 宽而低的身子
    ellipse(CX, 8, 6.2, 5, 'C');                                            // 头，正面偏中
    triangle(9, 4, 6, 8, 13, 7, 'K'); triangle(21, 4, 17, 7, 24, 8, 'K');   // 朝后压平的耳朵
    triangle(9, 5, 8, 8, 12, 7, 'I'); triangle(21, 5, 18, 7, 22, 8, 'I');
    [[26, 13], [27, 11]].forEach(function (p) { ellipse(p[0], p[1], 1.6, 1.6, 'C'); });
    ellipse(CX, 12, 2.6, 1.7, 'W', ['C']);                                  // 白口鼻
    ellipse(CX, 15, 3.2, 2.4, 'W', ['C']);                                  // 低下去的胸口
    ellipse(13, 17, 1.8, 1.5, 'W', ['C']); ellipse(17, 17, 1.8, 1.5, 'W', ['C']);   // 收在身下的前爪
    ellipse(27, 11, 1.2, 1.2, 'W', ['C']);                                  // 尾巴尖
    ellipse(12, 8, 2.2, 2.4, 'E'); ellipse(18, 8, 2.2, 2.4, 'E');           // 睁得很大的眼睛
    setCell(15, 11, 'N'); setCell(14, 11, 'N');
    [[13, 5], [14, 6], [15, 5], [16, 6], [17, 5]].forEach(function (p) { if (G[p[1]][p[0]] === 'C') setCell(p[0], p[1], 'K'); });
    for (var r = 10; r < 16; r += 2) for (var c = 4; c < GC; c++) if (G[r][c] === 'C' && c % 2 === 0) G[r][c] = 'K';
    ellipse(9, 12, 2.4, 2.4, 'X', ['C', 'K']); ellipse(21, 13, 2.2, 2.2, 'X', ['C', 'K']);
  }

  // ---- 把精灵画进 canvas（lifted from pixelpets renderer.js drawCat）---------
  // 逐格 fillRect，所以天然是硬边像素。角色 -> 颜色的映射见 palette()。
  function drawCat(g, sp, t, palRGB, o) {
    o = o || {};
    var bob = o.bob || 0, look = o.look || { x: 0, y: 0 };
    var blinking = !!o.blinking, eyeMode = o.eyeMode || 'open';
    var typing = !!o.typing, blush = !!o.blush, dilate = o.dilate || 1;
    var closed = blinking || eyeMode === 'happy';
    var grid = sp.grid, cols = sp.COLS, rows = sp.ROWS;
    var rowFill = new Map();
    for (var r = 0; r < rows; r++) {
      rowFill.clear();
      for (var c = 0; c < cols; c++) {
        var ch = grid[r][c];
        if (ch === '.') continue;
        var style = rowFill.get(ch);
        if (style === undefined) {
          var base = ch === 'E' ? (closed ? palRGB.C : palRGB.E) : palRGB[ch];
          if (!base) { rowFill.set(ch, null); continue; }
          var isOut = ch === 'O';
          var f = BODY_ROLES.has(ch) || (ch === 'E' && closed)
            ? Math.max(0.82, 1.12 - (r / rows) * 0.34)
            : isOut ? 1.16 - (r / rows) * 0.30 : 1;
          style = f === 1 ? rgbStr(base) : shadeStr(base, f);
          rowFill.set(ch, style);
        } else if (style === null) continue;
        g.globalAlpha = ch === 'H'
          ? HALO_ALPHA * Math.max(0.5, Math.min(1.4, 1.3 - (r / rows) * 0.7))
          : 1;
        g.fillStyle = style;
        g.fillRect(c * CELL, r * CELL + bob, CELL, CELL);
      }
    }
    g.globalAlpha = 1;

    // 胡须——只给猫画。给狗画猫胡须会让它看起来像穿了猫外套。
    if (!typing && !isDog()) {
      g.strokeStyle = 'rgba(245,245,245,0.6)'; g.lineWidth = 1; g.lineCap = 'round';
      var my = sp.muzzle.y + bob, cl = sp.muzzle.x - 4.5 * CELL, cr = sp.muzzle.x + 4.5 * CELL;
      var waft = Math.sin(t / 1400) * 0.6;
      var twitch = (t % 5200) < 200 ? Math.sin(t / 26) * 1.5 : 0;
      for (var si = 0; si < 2; si++) {
        var sx = si === 0 ? cl : cr, dir = si === 0 ? -1 : 1;
        for (var i = 0; i < 3; i++) {
          var tipY = my + i * 5 - 1 + waft + twitch + Math.sin(t / 900 + i) * 0.5;
          g.beginPath(); g.moveTo(sx, my + i * 3 - 2); g.lineTo(sx + dir * 13, tipY); g.stroke();
        }
      }
    }

    if (blush) {
      g.globalAlpha = 0.52; g.fillStyle = '#ffaab8';
      for (var bi = 0; bi < sp.eyes.length; bi++) {
        var e = sp.eyes[bi];
        if (e.w <= 0) continue;
        var bx = Math.round(e.cx - 2), by = Math.round(e.cy + e.h * 0.55 + bob);
        g.fillRect(bx, by, 5, 2); g.fillRect(bx + 1, by + 2, 3, 1);
      }
      g.globalAlpha = 1;
    }

    if (eyeMode === 'happy') {
      g.strokeStyle = rgbStr(palRGB.O); g.lineWidth = 3; g.lineCap = 'round';
      for (var hi = 0; hi < sp.eyes.length; hi++) {
        var he = sp.eyes[hi];
        if (he.w <= 0) continue;
        var hcy = he.cy + bob - 1, hr = he.w * 0.54;
        g.beginPath(); g.arc(he.cx, hcy, hr, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
        var dir2 = he.cx < sp.muzzle.x ? -1 : 1;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(he.cx + dir2 * hr * 0.92, hcy + hr * 0.30);
        g.lineTo(he.cx + dir2 * (hr * 1.35), hcy + hr * 0.02);
        g.stroke();
        g.lineWidth = 3;
      }
    } else if (!blinking) {
      var eLook = typing ? { x: look.x * 0.3, y: 0.85 } : look;
      for (var pi = 0; pi < sp.eyes.length; pi++) {
        var pe = sp.eyes[pi];
        if (pe.w <= 0) continue;
        var pw = Math.max(4, Math.round(pe.w * 0.46 * dilate));
        var ph = Math.max(5, Math.round(pe.h * 0.7 * Math.min(dilate, 1.12)));
        var pcx = pe.cx + eLook.x * (pe.w * 0.30), pcy = pe.cy + eLook.y * (pe.h * 0.26) + bob;
        var px = Math.round(pcx - pw / 2), py = Math.round(pcy - ph / 2);
        g.fillStyle = '#22242b';
        g.fillRect(px, py + 1, pw, ph - 2);
        g.fillRect(px + 1, py, pw - 2, ph);
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.fillRect(px + pw - 3, py + 1, 2, 2);
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect(px + 1, py + ph - 3, 2, 2);
      }
    }
  }

  // ---- 猫尾巴（lifted from drawTail，加了 ctx 参数）--------------------------
  var CAT_TAIL_REST = [1.30, 1.10, 0.85, 0.55, 0.28, 0.08, -0.05, -0.45, -0.85, -1.20];

  function drawTail(g, footX, footY, t, pal, flickT0, petting, excite) {
    var baseX = footX + SW * 0.20, baseY = footY - SH * 0.22, segLen = SH * 0.052;
    var flick = 0;
    if (flickT0 >= 0 && t - flickT0 < 650) {
      var e = (t - flickT0) / 650;
      flick = Math.sin(e * Math.PI * 3) * (1 - e) * 0.45;
    }
    var ex = clamp(excite || 0, 0, 1);
    var wag = Math.sin(t / 540) * (0.12 + ex * 0.06)
      + (petting ? Math.sin(t / 120) * 0.08 : 0)
      + ex * Math.sin(t / 170) * 0.10;
    var pts = [[baseX, baseY]];
    var x = baseX, y = baseY, dev = 0;
    for (var i = 0; i < CAT_TAIL_REST.length; i++) {
      var w = (i + 1) / CAT_TAIL_REST.length;
      dev += (wag + flick) * w * w + Math.sin(t / 430 + i * 0.6) * 0.03 * w;
      var ang = CAT_TAIL_REST[i] - dev;
      x += Math.cos(ang) * segLen;
      y = Math.min(y + Math.sin(ang) * segLen, footY - 2.5);
      pts.push([x, y]);
    }
    var reach = 0;
    for (var ri = 0; ri < pts.length; ri++) reach = Math.max(reach, pts[ri][0] - baseX);
    if (reach > 56) { var rf = 56 / reach; for (var fi = 0; fi < pts.length; fi++) pts[fi][0] = baseX + (pts[fi][0] - baseX) * rf; }
    var sm = [pts[0]], px = pts[0][0], py = pts[0][1];
    for (var si = 1; si < pts.length - 1; si++) {
      var mx = (pts[si][0] + pts[si + 1][0]) / 2, my = (pts[si][1] + pts[si + 1][1]) / 2;
      for (var k = 1; k <= 4; k++) {
        var u = k / 4, v = 1 - u;
        sm.push([v * v * px + 2 * v * u * pts[si][0] + u * u * mx,
                 v * v * py + 2 * v * u * pts[si][1] + u * u * my]);
      }
      px = mx; py = my;
    }
    sm.push(pts[pts.length - 1]);
    var n = sm.length - 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (var j = 0; j < n; j++) {
        var s = (j + 0.5) / n;
        g.strokeStyle = pass === 0 ? pal.O : (s > 0.82 ? pal.W : pal.C);
        g.lineWidth = 7 - 4 * s + (pass === 0 ? 3 : 0);
        g.beginPath(); g.moveTo(sm[j][0], sm[j][1]); g.lineTo(sm[j + 1][0], sm[j + 1][1]); g.stroke();
      }
    }
  }

  // ---- 狗尾巴与形状表（lifted from drawDogTail + TAIL_SHAPE）----------------
  var TAIL_SHAPE = {
    straight: { n: 8, len: 0.055, rest: [-0.55, -0.45, -0.36, -0.28, -0.22, -0.16, -0.10, -0.05], thick: 7, taper: 3.2 },
    feather: { n: 9, len: 0.052, rest: [-0.70, -0.62, -0.55, -0.48, -0.42, -0.36, -0.30, -0.24, -0.18], thick: 9, taper: 4.6 },
    plume: { n: 9, len: 0.050, rest: [-0.95, -0.88, -0.80, -0.72, -0.64, -0.56, -0.48, -0.40, -0.32], thick: 8.5, taper: 4.2 },
    curl: { n: 9, len: 0.048, rest: [-1.30, -1.55, -1.85, -2.20, -2.60, -3.00, -3.40, -3.80, -4.15], thick: 7.5, taper: 3.4 },
    stub: { n: 4, len: 0.045, rest: [-0.85, -0.70, -0.55, -0.42], thick: 8, taper: 3.0 },
  };

  function drawDogTail(g, footX, footY, t, pal, shape, flickT0, petting, mood) {
    var S = TAIL_SHAPE[shape] || TAIL_SHAPE.straight;
    var baseX = footX + SW * 0.19, baseY = footY - SH * 0.30;
    var segLen = SH * S.len;
    var excite = clamp((mood || 0) + (petting ? 0.55 : 0), 0, 1.6);
    var rate = 260 - excite * 130;
    var amp = (0.20 + excite * 0.34) * (petting ? 1.25 : 1);
    var flick = 0;
    if (flickT0 >= 0 && t - flickT0 < 650) {
      var e = (t - flickT0) / 650;
      flick = Math.sin(e * Math.PI * 4) * (1 - e) * 0.5;
    }
    var wag = Math.sin(t / rate) * amp + flick;
    var pts = [[baseX, baseY]];
    var x = baseX, y = baseY, dev = 0;
    for (var i = 0; i < S.n; i++) {
      var w = (i + 1) / S.n;
      dev += wag * w * w * 0.9;
      var ang = S.rest[i] + dev;
      x += Math.cos(ang) * segLen;
      y = Math.min(y + Math.sin(ang) * segLen, footY - 2);
      pts.push([x, y]);
    }
    var reach = 0;
    for (var ri = 0; ri < pts.length; ri++) reach = Math.max(reach, Math.abs(pts[ri][0] - baseX));
    if (reach > 52) { var rf = 52 / reach; for (var fi = 0; fi < pts.length; fi++) pts[fi][0] = baseX + (pts[fi][0] - baseX) * rf; }
    var sm = [pts[0]], px = pts[0][0], py = pts[0][1];
    for (var si = 1; si < pts.length - 1; si++) {
      var mx = (pts[si][0] + pts[si + 1][0]) / 2, my = (pts[si][1] + pts[si + 1][1]) / 2;
      for (var k = 1; k <= 4; k++) {
        var u = k / 4, v = 1 - u;
        sm.push([v * v * px + 2 * v * u * pts[si][0] + u * u * mx,
                 v * v * py + 2 * v * u * pts[si][1] + u * u * my]);
      }
      px = mx; py = my;
    }
    sm.push(pts[pts.length - 1]);
    var n = sm.length - 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (var j = 0; j < n; j++) {
        var f = (j + 0.5) / n;
        g.strokeStyle = pass === 0 ? pal.O : (f > 0.80 ? pal.W : pal.C);
        g.lineWidth = S.thick - S.taper * f + (pass === 0 ? 3 : 0);
        g.beginPath(); g.moveTo(sm[j][0], sm[j][1]); g.lineTo(sm[j + 1][0], sm[j + 1][1]); g.stroke();
      }
    }
  }

  // ---- 踩奶的两只前爪（lifted from pixelpets drawKneadPaws）------------------
  // 原版画的是「猫趴在自己的键盘上」：前爪下压的是两个带 F / J 字母的键帽
  // （drawKey 用 fillText 把字画上去）。这个房间的地板上没有键盘，在地上画两个
  // 带字母的键帽会很荒谬，所以键帽整个丢掉，爪子直接拍地板——踩奶的读感来自
  // 前倾的身体和交替下压的爪子，不是来自那两个键帽。地毯（3 天解锁，正好铺在
  // 猫脚下）在后来的日子里会给这件事一个更软的理由。
  //
  // 画法本身照搬：粗壮的网格对齐色块腿 + 白色手套，抬起时才露出的方形肉垫。
  // 原注释专门强调过这是「真正的像素精灵风格，不是平滑的矢量曲线」。
  function drawKneadPaws(g, pal, lcx, rcx, floorAt, lp, rp, shY) {
    function rect(x, y, w, h, col) {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    function paw(kx, side, press) {
      var lift = Math.round((1 - press) * 2) * 2.5;   // 0 / 2.5 / 5 —— 整像素台阶，像真的精灵动画
      var out = lift >= 2 ? side * 2 : 0;             // 抬起来的那只往外挪一点，别压在胸前白毛上
      var cx = kx + out;
      var capTop = floorAt + Math.round(press * 3);   // 地板被按下那么一点点
      var pwW = 13, pwH = 7;
      var pY = capTop - pwH + 2 - lift;
      var pX = cx - pwW / 2;
      var ax = cx - side * 2 - 6, aw = 11;            // 前腿，比爪子略靠内
      var top = Math.round(shY), aH = pY - top + 3;
      rect(ax, top, aw, aH, pal.O);                   // 腿：描边一层 + 毛色一层
      rect(ax + 2.5, top, aw - 5, aH, pal.C);
      rect(pX - 2, pY - 2, pwW + 4, pwH + 4, pal.O);  // 爪子：白色手套 + 描边
      rect(pX, pY, pwW, pwH, pal.W);
      if (lift >= 2) {                                // 抬起来才看得见方方的肉垫
        rect(cx - 3, pY + 3.5, 6, 3, '#ff8fa3');
        rect(cx - 6.5, pY + 0.5, 3, 3, '#ff8fa3');
        rect(cx - 1.5, pY, 3, 3, '#ff8fa3');
        rect(cx + 3.5, pY + 0.5, 3, 3, '#ff8fa3');
      } else {
        rect(cx - 1, pY + 2, 2, pwH - 2, pal.O);      // 按下去的时候是手套中间一道分缝
      }
    }
    paw(lcx, -1, lp);   // 左腿压在左边
    paw(rcx, 1, rp);    // 右腿压在右边
  }

  // 踩奶的节拍：快速下压、缓慢抬起（原版 renderTypeFront 的 snap）。
  function snapUp(v) { return Math.pow(Math.max(0, v), 0.6); }

  // ---- 脚底下的软垫（pixelpets 那儿是两个带字母的键帽）------------------------
  // 原版让猫趴在**一个真键盘**上：drawKey 画两个 24x11 的键帽，还用 fillText 把 F / J
  // 写在上面。那是它作为「陪你打字」的桌面宠物的设定——猫在你的键盘上。
  //
  // 这个房间的地板上没有键盘。但「双爪按在一个东西上」这个形体是踩奶读感的一半：
  // 抬爪、下压、爪垫翻出来，都需要有个东西垫着。所以换成一块不带字的软垫——尺寸
  // 和键帽一样（每个爪子 24 宽、11 厚，贴着地板），只是材料从塑料变成布。
  //
  // 顶边分左右两半、各跟各的爪子按下深度走，所以垫子是一边一边被压下去的，
  // 而不是整块一起沉——软垫该有的样子。
  var CUSHION = { top: '#d4b075', body: '#b08a4e', dark: '#7d6034' };

  function drawCushion(g, topY, lp, rp) {
    var halfW = 24, thick = 12;
    var x0 = SW / 2 - halfW;
    var lt = topY + Math.round(lp * 3), rt = topY + Math.round(rp * 3);
    var bot = topY + thick;
    function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
    rect(x0, lt, halfW, bot - lt, CUSHION.body);           // 左半边（跟着左爪沉）
    rect(SW / 2, rt, halfW, bot - rt, CUSHION.body);       // 右半边（跟着右爪沉）
    rect(x0, lt, halfW, 2, CUSHION.top);                   // 顶面的布光
    rect(SW / 2, rt, halfW, 2, CUSHION.top);
    rect(x0, bot - 2, halfW * 2, 2, CUSHION.dark);         // 贴地的暗边，做出厚度
    rect(x0, lt, 1, bot - lt, CUSHION.dark);
    rect(x0 + halfW * 2 - 1, rt, 1, bot - rt, CUSHION.dark);
  }

  // 在画布上的某个位置冒几颗闪光（拍到飞虫时用）。位置是 canvas 的 CSS 像素，
  // 换算成爱心那套「精灵原生像素」再塞进 hearts[] —— 复用现成的粒子管线，
  // 不新写一套。原版在这处也是往 idleSparkles 里塞一颗，同一个意思。
  function popSparkAt(t, cssX, cssY, n) {
    var nx = (cssX - originX) / zoom, ny = (cssY - originY) / zoom;
    for (var i = 0; i < n; i++) {
      var a = (i + 0.5) / n * Math.PI * 2;
      hearts.push({
        x: nx + Math.cos(a) * 3, y: ny + Math.sin(a) * 3, t0: t, kind: 'spark',
        s: 0.7 + (i % 3) * 0.2, vy: 10 + (i % 2) * 8,
        wobA: 2 + (i % 3), wobF: 5 + (i % 2) * 2, ph: i * 1.3, life: 700 + (i % 3) * 150,
      });
    }
  }

  // ---- 摸猫的爱心与闪光（lifted from pixelpets effects.js + popLove）-------
  // 原版把它们画在屏幕像素坐标系里（那儿的猫就是 96x120，没有缩放）。这里保持
  // 完全一样的坐标系，只是整体乘上 zoom，所以这些数字——爱心的每一块矩形、
  // 上浮距离、飘移幅度、随机范围——全部是原样搬过来的，没有重新配过。
  //
  // 和这个文件里其它移植过来的函数一样：原版挂在模块级 ctx 上，这里改成传参。
  function drawHeart(g, x, y, color, alpha, s) {
    s = s || 1;
    g.globalAlpha = alpha; g.fillStyle = color;
    var r = function (dx, dy, w, h) {
      g.fillRect(Math.round(x + dx * s), Math.round(y + dy * s),
                 Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    };
    r(-5, -4, 3, 3); r(2, -4, 3, 3);                          // 两个顶上的圆瓣
    r(-5, -1, 10, 3);                                         // 中间最宽的一行
    r(-4, 2, 8, 2); r(-2, 4, 4, 2); r(-1, 6, 2, 1);           // 收成尖
    g.globalAlpha = 1;
  }

  // 粉色的四点星光，和爱心混着出现。同一套「像素辐条」画法。
  function drawSparkle(g, x, y, alpha, s) {
    s = s || 1;
    g.globalAlpha = alpha; g.fillStyle = '#ffd1e0';
    var r = Math.max(1, Math.round(3 * s));
    g.fillRect(Math.round(x), Math.round(y - r), 1, r * 2 + 1);  // 竖辐条
    g.fillRect(Math.round(x - r), Math.round(y), r * 2 + 1, 1);  // 横辐条
    var d = Math.max(1, Math.round(r * 0.6));                    // 四道斜光
    g.fillRect(Math.round(x - d), Math.round(y - d), 1, 1); g.fillRect(Math.round(x + d), Math.round(y - d), 1, 1);
    g.fillRect(Math.round(x - d), Math.round(y + d), 1, 1); g.fillRect(Math.round(x + d), Math.round(y + d), 1, 1);
    g.globalAlpha = 1;
  }

  // 冒一颗爱心，偶尔是 2-3 颗一起。大小和飘移都随机，所以没有两颗长得一样；
  // 约 1/6 是一颗闪光而不是爱心。
  function popLove(t, x, y, base, spreadX) {
    // 减弱动效时只冒一颗、不撒闪光。canvas 里的动效不受 css 的
    // prefers-reduced-motion 管（猫的呼吸和甩尾也一样在跑），所以在这儿自己认。
    var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var n = calm ? 1 : (Math.random() < 0.22 ? (Math.random() < 0.4 ? 3 : 2) : 1);
    for (var i = 0; i < n; i++) {
      hearts.push({
        x: x + (Math.random() - 0.5) * spreadX,
        y: y + (Math.random() - 0.5) * 6,
        t0: t,
        s: base * (0.7 + Math.random() * 0.8),                 // 基准大小的 0.7-1.5 倍
        kind: (!calm && Math.random() < 0.18) ? 'spark' : 'heart',
        vy: 24 + Math.random() * 18,                           // 一生里上升的距离（原生像素）
        wobA: 2 + Math.random() * 5,                           // 左右摇摆幅度
        wobF: 4 + Math.random() * 4,                           // 摇摆频率
        ph: Math.random() * Math.PI * 2,                       // 摇摆相位
        life: 950 + Math.random() * 500,                       // 存活时长（ms）
      });
    }
  }

  // ---- 色板 ----------------------------------------------------------------
  // 网格里的每个字符是一个「角色」，不是颜色。O=描边 C=主色 K=花纹 W=白
  // X=色块 I=耳内 N=鼻 E=眼 H=光晕 T=舌。
  function makePalette(P) {
    var rgb = {
      O: toRgb(P.outline), C: toRgb(P.coat), K: toRgb(P.mark), W: toRgb(P.white),
      X: toRgb(P.patch), I: toRgb(P.inner), N: toRgb(P.nose), E: toRgb(P.eye),
      H: toRgb(HALO), T: toRgb(P.tongue || '#e8747f'),
    };
    return {
      rgb: rgb,
      str: { O: rgbStr(rgb.O), C: rgbStr(rgb.C), W: rgbStr(rgb.W), N: rgbStr(rgb.N) },
    };
  }

  // ---- 物种表 --------------------------------------------------------------
  // 猫有 14 种毛色；狗在 pixelpets 里只定义了 1 个品种，但 DOG_BUILDS 里躺着
  // 14 套品种几何数据从没被用过。这里补几组色板把它们接上。
  //
  // 坑：DOG_PATTERNS 和 DOG_PATTERN_BUILD 必须严格 1:1 同步。DOG_TAILS 由
  // DOG_PATTERN_BUILD 派生，会自动跟上；但只加色板不加 build，buildFor 会读到
  // undefined 然后构建出一只「用猫骨架拼的狗」。
  function speciesTable(sp) {
    if (sp === 'dog') {
      // 狗没有自己的踩奶姿势——pixelpets 里那个是 composeTypeDog，但 app.js 从来没
      // 调用过 PET.setSpecies，狗在当前 UI 里根本走不到。这里回落用坐姿精灵 + 画出来
      // 的前爪（能看，不精致），不为走不到的路径搬一套狗版几何。
      return { patterns: DOG_PATTERNS, build: DOG_PATTERN_BUILD, tabby: DOG_PATTERN_BUILD.map(function () { return false; }), builds: DOG_BUILDS, sit: composeSitDog, loaf: composeCurlDog, knead: composeSitDog, isDog: true };
    }
    return { patterns: PATTERNS, build: PATTERN_BUILD, tabby: TABBY, builds: BUILDS, sit: composeSit, loaf: composeLoaf, knead: composeKnead, isDog: false };
  }

  var species = 'cat';
  var table = speciesTable(species);
  var coatIndex = 0;
  var sitSprites = [], loafSprites = [], kneadSprites = [], palettes = [], huntSprite = null;

  function isDog() { return species === 'dog'; }

  function buildAll() {
    sitSprites = []; loafSprites = []; kneadSprites = []; palettes = [];
    huntSprite = buildSprite(HUNT_COLS, HUNT_ROWS, composeHunt);   // 全毛色共用这一张
    for (var i = 0; i < table.patterns.length; i++) {
      var b = table.builds[table.build[i]] || {};
      var B = { bodyW: b.bodyW, headRx: b.headRx, headRy: b.headRy, earApexY: b.earApexY, earW: b.earW,
                earOut: b.earOut, eyeRx: b.eyeRx, eyeRy: b.eyeRy, cheek: b.cheek, fluff: b.fluff, tabby: !!table.tabby[i] };
      (function (BB) {
        sitSprites.push(buildSprite(COLS, ROWS, function () { table.sit(BB); }));
        loafSprites.push(buildSprite(COLS, ROWS, function () { table.loaf(BB); }));
        kneadSprites.push(buildSprite(COLS, ROWS, function () { table.knead(BB); }));
      })(B);
      palettes.push(makePalette(table.patterns[i]));
    }
  }

  // ---- 动画状态 ------------------------------------------------------------
  var canvas = null, ctx = null;
  var zoom = 2, dpr = 1;
  var originX = 0, originY = 0;        // 精灵左上角在 canvas 里的逻辑坐标
  var running = false;
  var nextBlink = 2000, blinkUntil = 0, lastActivity = 0;
  var look = { x: 0, y: 0 }, lookTarget = { x: 0, y: 0 };
  var tailFlickT0 = -1, reactUntil = 0;
  var cursor = { x: -1, y: -1 };
  // 摸猫的状态。handDown 是「按在猫身上的那只手还按着」，handOnCat 是「手底下
  // 此刻还是猫」——两个都成立才算正在摸，按着拖到猫身外就该停下来。
  var hearts = [], lastHeart = 0;
  var handDown = false, handOnCat = false, petBurstUntil = 0;
  // 打字 -> 踩奶。350ms 是 pixelpets 的窗口，每敲一下都会把它重新点着，所以只要
  // 你还在写，它就一直揉。
  var KEY_MS = 350, keyAt = -9999;
  // ---- 自主活动调度 --------------------------------------------------------
  // 猫没事的时候自己做什么，按「每分钟分到多少秒」分配。数字就是用户给的：
  // 抓飞虫 5 秒 / 分钟，踩奶地板 10 秒 / 分钟，剩下的时间是静坐呼吸。
  //
  // 用代币桶：每个动作按 per60/60（毫秒/毫秒）持续往自己的桶里注水，动作运行时从
  // 桶里扣。长期占比自然收敛到那个数字，而且**不需要在某一刻硬掐断动作**——
  // 「不做这件事」的间隔是从注水速度里长出来的：踩奶的桶注水速率是 1/6，所以
  // 揉满 2 秒要等 12 秒才攒得回来。
  //
  // 为什么不用「每 60 秒排一张时刻表」：那样猫会揉到一半突然收手，比一直揉还假。
  //
  // 现在这张表里只有踩奶。**追鼠标不在这里**——用户明确选了「纯反应式，照搬
  // pixelpets」：鼠标快速一甩就该触发，不该被配额拦住。原来「抓飞虫 5 秒/分钟」
  // 那一格随抓飞虫一起删了。
  var ACTIONS = [
    { id: 'knead', per60: 10, dwell: [1400, 2800] },
  ];
  // 桶的上限只留一轮多一点（不是半分钟的量）：被接管久了额度会一直囤着，上限给高了
  // 猫一闲下来就一口气揉好几秒——占比没错，但看着像憋坏了。
  var credit = { knead: 0 };
  var actId = null, actUntil = 0, restUntil = 0, lastActT = 0;
  function creditCap(a) { return Math.max(a.dwell[1], a.per60 * 1000 / 3); }

  function actionById(id) {
    for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i].id === id) return ACTIONS[i];
    return null;
  }

  // 返回当前该做的自主动作（'knead' / null）。
  // allowStart = 猫现在空着（不在被摸 / 打字 / 睡着 / 追鼠标）。
  // 不管空不空都要调它——代币要注水、进行中的会话要计时。
  function stepActions(t, allowStart) {
    var dt = lastActT ? Math.min(200, t - lastActT) : 0;
    lastActT = t;
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i];
      credit[a.id] = Math.min(creditCap(a), credit[a.id] + (a.per60 / 60) * dt);
    }
    if (actId) {
      credit[actId] -= dt;
      if (t >= actUntil) { actId = null; restUntil = t + 800 + Math.random() * 1600; return null; }
      return actId;
    }
    if (!allowStart || t < restUntil) return null;
    // 挑一个「攒够至少一轮」的动作，谁欠得多先做谁
    var best = null;
    for (var j = 0; j < ACTIONS.length; j++) {
      var b = ACTIONS[j];
      if (credit[b.id] < b.dwell[0]) continue;
      if (!best || credit[b.id] > credit[best.id]) best = b;
    }
    if (!best) return null;
    actId = best.id;
    actUntil = t + best.dwell[0] + Math.random() * (best.dwell[1] - best.dwell[0]);
    return actId;
  }

  // ---- 追鼠标（lifted from pixelpets renderer.js 的 hunt 状态机）--------------
  // 猫的位置。这个房间里它会沿地板走动，所以中心 x 是个变量，originX 由它算出来。
  // 只走水平方向：这是一间屋子，不是一整块到处都能站的桌面。
  var catX = 0, homeX = 0, walkL = 0, walkR = 0, catPlaced = false;

  // 追鼠标的节奏，数字照搬 pixelpets（renderer.js:1840-1842）。
  // 触发条件不是原版的（原版看鼠标甩得多快），见 tick 里的说明。
  var HUNT_SPEED = 6;           // 悄悄接近的速度（原生像素/帧）
  var STANDOFF = 28;            // 停在离目标这么远的地方
  var POUNCE_RANGE = 46;        // 进到这么近就蓄力起跳
  var POUNCE_WINDUP_MS = 300;   // 蓄力（压扁 + 扭屁股）
  var POUNCE_MS = 300;          // 起跳
  var POUNCE_LEAP = 32;         // 跳起来多高
  var WALK_HOME_SPEED = 0.9;    // 走回家速度——「慢慢」
  var prevCx = -1, prevCy = -1, lastTick = 0;
  // dragHunt：按住左键拖离猫、并且真的动过之后置位；松手清掉。
  // armed：扑过一次之后要等你把目标引开，才允许再扑——不然它会站在原地一秒扑好几次。
  var dragHunt = false, armed = true;
  var windingUp = false, windupT0 = 0, coil = 0;
  var pouncing = false, pounceT0 = 0, pounceFrom = null, pounceTarget = null;

  function now() { return performance.now(); }
  function sleeping() { return now() - lastActivity > SLEEP_AFTER_MS && now() > reactUntil; }

  // 指针在不在猫身上。pixelpets 那边只判「描边框内」，因为它是个贴身的桌面宠物
  // 窗口，框子里就是猫；这里画布是整块房间，描边框里有大片空白（两只耳朵之间、
  // 身体两侧），照搬会让点空处也冒爱心。所以再往下一层，按精灵网格的实际像素
  // 判定——网格里非 '.' 的格子就是猫的剪影，正好也是描边所在。
  function catHit(px, py) {
    var sx = (px - originX) / zoom, sy = (py - originY) / zoom;   // 换成原生精灵像素
    if (sx < 0 || sy < 0 || sx >= SW || sy >= SH) return false;
    var sp = sleeping() ? loafSprites[coatIndex] : sitSprites[coatIndex];
    if (!sp) return false;
    var row = sp.grid[Math.floor(sy / CELL)];
    if (!row) return false;
    var ch = row[Math.floor(sx / CELL)];
    return ch !== undefined && ch !== '.';
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.parentNode.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    dpr = window.devicePixelRatio || 1;
    // 必须和 room.js 的 zoomFor 完全一致：两边的像素密度不同步，猫和房间就会
    // 一个粗像素一个细像素，一眼穿帮。整数倍是硬要求——CELL=4，只有 4*1、4*2
    // 落在整数设备像素上，非整数倍会把格子拉成宽窄不一。
    zoom = Math.max(1, Math.min(2, Math.floor(Math.min(w / 280, h / 200))));

    // 画布的坐标单位统一成 CSS 像素：backing store 乘 dpr，绘制前 setTransform
    // 补回来。这样布局算的全是 CSS px，只有精灵本身按 zoom 放大。
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // 精灵站在地板上。0.08 这个地板比例必须和 room.js 的 floorY 一致，
    // 否则猫会悬空或者陷进地板里。
    originY = Math.round(h - SH * zoom - h * 0.08);

    // 猫会沿地板走动，所以水平位置是个变量（catX = 猫的中心 x）。房间中央就是地毯
    // 那儿，也是它的「家」——扑完鼠标要慢慢走回来的地方。
    // 可走范围是整条地板：床、盆栽、灯都是贴着后墙摆的，猫在它们**前面**的地板上
    // 走，不需要绕开；而且 pet 画布本来就在房间画布上层，天然压在它们前面。
    homeX = Math.round(w / 2);
    var half = SW * zoom / 2 + 6;
    walkL = half;
    walkR = w - half;
    if (!catPlaced) { catX = homeX; catPlaced = true; }
    catX = clamp(catX, walkL, walkR);
    originX = Math.round(catX - SW * zoom / 2);
  }

  function tick() {
    if (!running) return;
    var t = now();
    var dt = lastTick ? Math.min(100, t - lastTick) : 16;   // 帧间隔：移动要跟帧率无关
    lastTick = t;

    // 摸猫。按住不放就一直冒，松手后再冒 1.2 秒收尾——所以「点一下」拿到的也是
    // 一小串（约三颗），而不是孤零零一颗。被摸的时候猫一直是眯眼笑 + 腮红，所以
    // 这里把 reactUntil 往前推着走；顺带也让它睡不着（sleeping 会看 reactUntil）。
    var petting = t < petBurstUntil || (handDown && handOnCat);
    if (petting) {
      reactUntil = Math.max(reactUntil, t + 300);
      if (t - lastHeart > 520) { popLove(t, SW / 2, -4, 2.1, 14); lastHeart = t; }
    }

    // 视线跟随鼠标：缓动过去，不是瞬移——瞬移会像摄像头而不是眼睛
    if (cursor.x >= 0 && !sleeping()) {
      var cx = originX + SW * zoom / 2, cy = originY + SH * zoom * 0.30;
      lookTarget.x = clamp((cursor.x - cx) / 180, -1, 1);
      lookTarget.y = clamp((cursor.y - cy) / 140, -1, 1);
    } else {
      lookTarget.x = 0; lookTarget.y = 0;
    }
    look.x += (lookTarget.x - look.x) * 0.06;
    look.y += (lookTarget.y - look.y) * 0.06;

    // 眨眼。间隔随机，固定节奏会显得像机器。
    if (t > nextBlink && !sleeping()) {
      blinkUntil = t + 130;
      nextBlink = t + 2200 + Math.random() * 4200;
    }

    var asleep = sleeping();
    var reacting = t < reactUntil;
    // 呼吸：睡着的幅度更大更慢，醒着几乎看不出来但有
    var breatheAmp = asleep ? 1.6 : 0.9;
    var breatheRate = asleep ? 2600 : 1900;
    var bob = Math.sin(t / breatheRate) * breatheAmp + 0.9;

    // 踩奶有两个来源：你打字时插队揉（不受配额管，这是它最有意义的一刻），
    // 以及没事时自己揉一会儿（受配额管）。
    var typing = (t - keyAt) < KEY_MS;

    // ---- 追鼠标 ----------------------------------------------------------
    // 触发条件按用户定的来，不再是 pixelpets 的「鼠标甩得快」：那边只要光标划得
    // 够快就开一轮，结果你在页面上正常用鼠标，猫就一直在追。现在的规则是——
    // **按住左键、拖离猫的身体、并且真的动过**，猫才去追你手里拖着的东西。
    //
    // 按在猫身上还没松开的时候不算追：那是在摸它，猫待在原地冒爱心；一旦拖离猫的
    // 身体就转成追（再拖回猫身上又变回摸）。handOnCat 由 cursorAt / mousedown 维护。
    var moved = prevCx >= 0 && Math.hypot(cursor.x - prevCx, cursor.y - prevCy) > 1.5;
    prevCx = cursor.x; prevCy = cursor.y;

    if (handDown && !handOnCat && moved) dragHunt = true;
    if (!handDown) dragHunt = false;
    var hunting = dragHunt && !handOnCat;

    // 松手就别蓄力了；已经跳出去的那一下让它落地。摸头会打断蓄力（手回到猫身上）。
    if (!handDown || petting) windingUp = false;
    if (asleep) { pouncing = false; windingUp = false; dragHunt = false; hunting = false; }

    var leap = 0, stretchY = 1, wiggle = 0;
    if (hunting || pouncing) {
      var tgtX = clamp(cursor.x, walkL, walkR);
      var hdx = tgtX - catX, hd = Math.abs(hdx) || 1;
      // 蓄力结束 -> 弹出去
      if (windingUp && t - windupT0 >= POUNCE_WINDUP_MS) {
        windingUp = false; pouncing = true; pounceT0 = t; pounceTarget = tgtX;
      }
      if (pouncing) {
        var pe = clamp((t - pounceT0) / POUNCE_MS, 0, 1);
        var pease = 1 - Math.pow(1 - pe, 2);                 // 原版的缓动
        catX = pounceFrom + (pounceTarget - pounceFrom) * pease;
        leap = Math.sin(pe * Math.PI) * POUNCE_LEAP;         // 跳起来
        stretchY = 1 + Math.sin(pe * Math.PI) * 0.26;        // 身体拉长
        if (pe >= 1) {
          // 落地。追鼠标没有猎物可抓，所以只撒一把「扑到了」的闪光——原版对
          // cursor pounce 也是这么处理的（往 idleSparkles 里塞一颗）。
          // armed = false：要等你把目标重新引开，它才肯再扑（否则站在原地连扑）。
          pouncing = false; armed = false; tailFlickT0 = t;
          popSparkAt(t, originX + SW / 2 * zoom, originY + (SH - HH * 0.7) * zoom, 5);
        }
      } else if (windingUp) {
        // 蓄力：压扁 + 屁股左右扭，把「要扑了」演出来
        var wu = clamp((t - windupT0) / POUNCE_WINDUP_MS, 0, 1);
        coil = Math.sin(wu * Math.PI * 0.5);
        stretchY = 1 - coil * 0.14;
        wiggle = Math.sin(t / 55) * 2.4 * coil;
      } else if (hd < POUNCE_RANGE && armed) {
        windingUp = true; windupT0 = t; pounceFrom = catX;
      } else {
        if (hd >= POUNCE_RANGE) armed = true;       // 你把它引开了，重新上膛
        // 悄悄接近：留出 STANDOFF 那段距离
        catX += (hdx < 0 ? -1 : 1) * Math.min(Math.max(0, hd - STANDOFF), HUNT_SPEED * (dt / 16));
      }
    }

    // 调度器不管有没有被接管都要推进（代币要注水、进行中的会话要计时），但被接管时
    // 不开新会话——猫在忙，这时候开一轮只会白白花掉额度。
    var act = stepActions(t, !(asleep || petting || typing || hunting));
    if (asleep || petting || hunting) act = null;

    // 姿态优先级：追鼠标 > 摸头 > 踩奶 > 睡 > 坐。
    // 顺序是照 pixelpets 自己的排除条件来的：那边 hunting 压过 typing，而 grabbing
    // （也就是摸头）又会拦住 hunting 的开场。
    var kneading = !asleep && !petting && !hunting && (typing || act === 'knead');

    // 不在追鼠标、也没在干别的的时候，猫慢慢走回房间中央（地毯那儿）。
    // 做成「一个愿望」而不是一次性的计时器：被别的事情打断之后，它一闲下来还会
    // 接着往回走，不会永远停在半路。
    // 拖着鼠标的时候不往家走：它正在跟你手里那个东西玩
    var goingHome = false;
    if (!hunting && !kneading && !petting && !asleep && !handDown && Math.abs(catX - homeX) > 0.5) {
      goingHome = true;
      var ws = WALK_HOME_SPEED * (dt / 16);
      catX = Math.abs(homeX - catX) <= ws ? homeX : catX + (homeX > catX ? 1 : -1) * ws;
    }

    catX = clamp(catX, walkL, walkR);
    originX = Math.round(catX - SW * zoom / 2);

    // 踩奶的动作数学全部来自 pixelpets renderTypeFront（renderer.js:905-911）：
    // 快速下压、缓慢抬起；身体跟着压下去、朝正在压的那只爪子倾；眼睛盯着自己的手；
    // 每 4.5 秒双爪齐按一下——猫踩奶踩到满足的时候就是这么来的。
    //
    // 没有移植的是 overheat：原版打字打多了 heat 会累积，超过 0.7 猫就「过热」，
    // 毛色被染红、节拍从 60ms 加快到 36ms、头顶冒蒸汽。在安慰类的产品里那个笑点
    // 会拐弯成「你写多了，把猫累坏了」，所以整块砍掉，节拍固定 60ms。
    var lp = 0, rp = 0, dip = 0, kneeLean = 0;
    if (kneading) {
      var wave = Math.sin(t / 60);
      var cyc = t % 4500;
      var both = cyc > 3900 ? Math.sin(((cyc - 3900) / 600) * Math.PI) : 0;
      lp = Math.max(snapUp(wave), both);
      rp = Math.max(snapUp(-wave), both);
      dip = (lp + rp) * 1.6;
      kneeLean = (rp - lp) * 0.05 * (1 - both);
    }

    var sp = kneading ? kneadSprites[coatIndex] : (asleep ? loafSprites[coatIndex] : sitSprites[coatIndex]);
    if (!sp) return;
    var pal = palettes[coatIndex];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // 尾巴和身体共用一套精灵坐标系（原点在精灵左上角，单位是格子像素）。
    // 尾巴先画，身体盖在上面，所以尾巴根部被身体挡住，看起来是从身下伸出来的。
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(zoom, zoom);

    if (hunting || windingUp || pouncing || goingHome) {
      // 蹲伏姿势（30x20，比坐姿宽、比坐姿矮）。底边落在地板线上，和别的姿势同一个
      // 地板——原版是 oy = pos.y - HH，也就是精灵底边压在地板上。
      //
      // 朝向靠水平翻转：追鼠标时朝目标，走回家时朝家。原版只翻横向；纵向的压扁/
      // 拉伸（蓄力和起跳）是另一码事，见下面对 stretchY 的说明。
      var spotX = (hunting || windingUp || pouncing) ? cursor.x : homeX;
      var facingLeft = spotX < catX;
      var ox = SW / 2 - HW / 2 + wiggle;                       // wiggle = 蓄力时的扭动
      // 蓄力时把精灵整体按 stretchY 缩、且顶边相应下移，这样脚不离地（原版的巧劲）
      var oy = SH - (windingUp ? HH * stretchY : HH) - leap;

      // 起跳：身后拖三道残影，顶点时两只前爪往前伸。原版画在屏幕坐标里，
      // 这里换到精灵坐标系；7 / 17 / 3.4 / 4.5 这些数都是原版的。
      if (pouncing && pounceFrom != null && pounceTarget != null) {
        var pe = clamp((t - pounceT0) / POUNCE_MS, 0, 1);
        var pdx = pounceTarget - pounceFrom, plen = Math.abs(pdx) || 1, ux = pdx / plen;
        for (var bi = 1; bi <= 3; bi++) {
          ctx.globalAlpha = (0.28 - bi * 0.07) * Math.sin(pe * Math.PI);
          ctx.fillStyle = pal.str.C;
          ctx.fillRect(Math.round(SW / 2 - ux * bi * 7 - 2), Math.round(SH - leap - HH * 0.5 - 3), 4, 6);
        }
        var reach = Math.sin(pe * Math.PI) * 17;
        var pawx = SW / 2 + ux * reach, pawy = SH - leap - HH * 0.5;
        ctx.globalAlpha = Math.sin(pe * Math.PI);
        ctx.fillStyle = pal.str.C;
        [-4.5, 4.5].forEach(function (so) {
          ctx.beginPath(); ctx.ellipse(pawx + so, pawy, 3.4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = '#f3d2e2';                             // 爪垫
        [-4.5, 4.5].forEach(function (so) { ctx.fillRect(Math.round(pawx + so - 1), Math.round(pawy - 1), 2, 2); });
        ctx.globalAlpha = 1;
      }

      ctx.save();
      if (facingLeft) { ctx.translate(ox + HW, oy); ctx.scale(-1, stretchY); }
      else { ctx.translate(ox, oy); ctx.scale(1, stretchY); }
      drawCat(ctx, huntSprite, t, pal.rgb, {
        bob: Math.round(Math.sin(t / 90) * 1.5),                // 原版的 creep：一小下一小下地挪
        blinking: t < blinkUntil,
        look: look,                                             // 眼睛仍旧跟着你的鼠标
        eyeMode: 'open',
        dilate: pouncing ? 1.5 : (windingUp ? 1.32 + coil * 0.2 : 1.32),
      });
      ctx.restore();
    } else if (kneading) {
      // 身体：以脚为中心旋转（朝正在压的那只爪子倾）+ 跟着下压一起沉。动作活在
      // 一条变换里，而不是逐帧四舍五入的像素偏移上——后者会抖。
      // 踩奶姿势的尾巴是烤进精灵里的，所以这里不单独画尾巴。
      ctx.save();
      ctx.translate(SW / 2, SH + dip);
      ctx.rotate(kneeLean);
      ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sp, t, pal.rgb, {
        bob: 0,
        blinking: t < blinkUntil,
        look: { x: (rp - lp) * 0.5, y: 0.6 },
        blush: true,
      });
      ctx.restore();
      // 软垫和前爪都画在旋转之外：它们贴在地上，不跟着身体转。
      // 前爪的落脚高度就是软垫的顶面（原版那儿是两个键帽的顶面）。
      drawCushion(ctx, SH - 12, lp, rp);
      drawKneadPaws(ctx, pal.str, SW / 2 - 15, SW / 2 + 15, SH - 12, lp, rp, SH - 29 + dip);
    } else {
      if (!asleep) {
        var footY = SH;
        if (isDog()) {
          drawDogTail(ctx, 0, footY, t, pal.str, DOG_TAILS[coatIndex] || 'straight', tailFlickT0, false, reacting ? 0.5 : 0.1);
        } else {
          drawTail(ctx, 0, footY, t, pal.str, tailFlickT0, false, reacting ? 0.45 : 0.08);
        }
      }

      drawCat(ctx, sp, t, pal.rgb, {
        bob: bob,
        blinking: t < blinkUntil,
        look: asleep ? { x: 0, y: 0.4 } : look,
        eyeMode: asleep || reacting ? 'happy' : 'open',
        blush: reacting,
        dilate: asleep ? 0.85 : 1,
      });
    }
    ctx.restore();

    // 飞虫。画在猫之后、爱心之前——它是小物件，在前面才看得见。
    // 它现在只是背景（猫不再扑它），所以完全不知道猫在哪。
    window.CRITTER.tick(t);

    // 爱心和闪光。退回精灵左上角、乘上 zoom，就回到了 popLove 用的那套坐标系
    // （原点在精灵左上角，单位是原生精灵像素，所以头顶正上方是 y = -4）。
    // 画在这一层的意义是它们从头顶往上升时不会被猫自己盖住。
    if (hearts.length) hearts = hearts.filter(function (h) { return t - h.t0 < (h.life || 1100); });
    if (hearts.length) {
      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(zoom, zoom);
      for (var hi = 0; hi < hearts.length; hi++) {
        var h = hearts[hi];
        var life = h.life || 1100, a = (t - h.t0) / life;
        var hx = Math.round(h.x + Math.sin(a * (h.wobF || 6) + (h.ph || 0)) * (h.wobA != null ? h.wobA : 4));
        var hy = Math.round(h.y - a * (h.vy || 30));
        var alpha = (1 - a) * 0.95;
        // 前半生是浓一点的桃红，后半生褪成浅粉——同一颗爱心自己会变淡
        if (h.kind === 'spark') drawSparkle(ctx, hx, hy, alpha, h.s || 1);
        else drawHeart(ctx, hx, hy, a < 0.5 ? '#ff5a6e' : '#ff8a98', alpha, h.s || 1);
      }
      ctx.restore();
    }

    requestAnimationFrame(tick);
  }

  // ---- 对外接口 ------------------------------------------------------------
  var PET = {
    mount: function (el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      lastActivity = now();
      buildAll();      // 先建精灵，resize 之后第一帧就有东西可画
      resize();
      window.addEventListener('resize', resize);
      // 飞虫画在同一块画布上（它盖在猫上面），所以由 pet.js 挂载——但飞行和状态
      // 全归 critter.js 自己管，这边只负责「什么时候画」。
      window.CRITTER.mount(canvas);

      // 点击互动。只有落在猫身上才算数——点房间的空处什么都不发生。
      // 用 pointer 事件而不是 mouse：手指按在屏幕上不动是不会发 mouse 事件的，而
      // 这间屋子的「按住」本身就是触摸时的常态。pointerup / pointercancel 挂在
      // window 上而不是画布上：按着猫拖出画布再松手也收得住。
      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        var r = canvas.getBoundingClientRect();
        handDown = true;                 // 按在房间里的任何地方都算「按住了」（拖动要用来追）
        PET.touch();                     // 唤醒原本挂在 document 的 click 上，触摸时那个 click
                                         // 会被下面 touchstart 的 preventDefault 吃掉，这里补回来
        handOnCat = catHit(e.clientX - r.left, e.clientY - r.top);
        if (!handOnCat) return;          // 按在空处：先什么都不做，拖动起来才追
        lastActivity = now();
        petBurstUntil = now() + 1200;   // 点一下也要有一小串，不是孤零零一颗
        reactUntil = now() + REACT_MS;
        tailFlickT0 = now();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;   // 手指没有「悬停」，别去猜光标形状
        var r = canvas.getBoundingClientRect();
        // 不给这个提示就没谁知道猫是可以点的：它没有按钮的样子，也没有文字
        canvas.style.cursor = catHit(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : '';
      });
      // 松手、或者手势被浏览器接管（pointercancel）都要把「手」放下，否则猫会一直
      // 以为你还按着它。
      function handOff() { handDown = false; handOnCat = false; }
      window.addEventListener('pointerup', handOff);
      window.addEventListener('pointercancel', handOff);

      // 手机上长按这块会弹出浏览器自己的菜单（标记广告 / 页面内查找），按住摸猫根本
      // 没机会跑。把画布上的默认触摸行为整个关掉。
      // 挂在画布而不是 stage 上：气泡里那个「×」是块真按钮，别把它的点击也一起吃了。
      // 滚动 / 选择的关闭在 css 里（见 .stage 的 touch-action）。
      canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      return PET;
    },
    start: function () {
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    },
    stop: function () { running = false; },

    coats: function () { return table.patterns.map(function (p, i) { return { index: i, name: p.name }; }); },
    coat: function () { return coatIndex; },
    setCoat: function (i) {
      if (i >= 0 && i < table.patterns.length) { coatIndex = i; tailFlickT0 = now(); }
      return coatIndex;
    },
    species: function () { return species; },
    setSpecies: function (sp) {
      species = sp === 'dog' ? 'dog' : 'cat';
      table = speciesTable(species);
      buildAll();
      PET.setCoat(0);
      resize();
    },

    // 用户有任何动作就叫一下：唤醒睡着的猫，并重置入睡倒计时。
    touch: function () { lastActivity = now(); },

    // 在输入框里敲了一下。唤醒猫，并让它开始踩奶——你写，它揉。
    keys: function () { keyAt = now(); lastActivity = now(); },

    // 一次安慰动作：凑近、眯眼笑、腮红、尾巴一甩。
    comfort: function () {
      lastActivity = now();
      reactUntil = now() + REACT_MS;
      tailFlickT0 = now();
    },

    // 鼠标位置（用于视线跟随）。
    // 只有位置真的变了才算「有动静」——浏览器会在光标静止时也补发 mousemove
    // （窗口重排、DPR 变化等）。照单全收的话，光标停在房间里不动，猫就永远睡
    // 不着，而用户明明什么都没做。
    cursorAt: function (x, y) {
      if (Math.abs(x - cursor.x) < 2 && Math.abs(y - cursor.y) < 2) return;
      cursor.x = x; cursor.y = y;
      lastActivity = now();
      // 「手还在不在猫身上」在这里维护，不在画布的 mousemove 上：按着拖动时鼠标
      // 会被拖出画布，画布就收不到 mousemove 了。而追鼠标全靠这个信号来切换。
      if (handDown) handOnCat = catHit(x, y);
    },

    size: function () { return { sw: SW * zoom, sh: SH * zoom, originX: originX, originY: originY }; },
  };

  window.PET = PET;
})();
