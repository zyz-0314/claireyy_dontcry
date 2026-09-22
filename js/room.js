// 像素房间。
//
// 房间不用位图，而是按屏幕尺寸程序化画出来的：墙面分色带、地板画木纹线、
// 窗户里是夜空，装饰物是字符串网格拼的小像素图。这样它能自适应任何尺寸，
// 同时保持和猫一样的像素密度（同一个 U = 4*zoom），不会出现「猫是粗像素、
// 房间是细像素」的穿帮。
//
// 装饰按「记录过的不同天数」解锁。解锁是静悄悄发生的——不弹成就、不打勾、
// 不显示进度条。用户只是某天回来，发现房间里多了一盏灯。
(function () {
  'use strict';

  // ---- 颜色 --------------------------------------------------------------
  // 颜色不再写死在这里：房间跟着真实时间走（白天 / 黄昏 / 夜晚），三组调色板在
  // js/daytime.js 里。下面这组键是「房间用到了哪些颜色」的清单，由 syncPalette()
  // 按当前时刻填进来。
  var C = {};

  // ---- 装饰物：字符串网格 ------------------------------------------------
  // 每张图是一组等宽字符串，字符 -> 颜色见各图的 key。'.' 是透明。
  // 地毯 24 格宽：猫是 24 格宽，地毯窄了猫的爪子会踩出去
  var RUG = {
    key: { R: '#7d3f43', r: '#a4575c', Y: '#d8a06a' },
    art: [
      '....RRRRRRRRRRRRRRRR....',
      '..RRrrrrrrrrrrrrrrrrRR..',
      '.RrrrrrrrrrrrrrrrrrrrrR.',
      'RrrrYYrrrrrrrrrrrrYYrrrR',
      '.RrrrrrrrrrrrrrrrrrrrrR.',
      '..RRrrrrrrrrrrrrrrrrRR..',
      '....RRRRRRRRRRRRRRRR....',
    ],
  };

  // 一张侧视的低床：枕头、床垫、被子、木床板、两条腿。
  // 上一版只画了床头框和一块悬空的床垫，下面全是透明的，看起来像个空架子。
  var BED = {
    key: { P: '#e8dcc4', M: '#cdbfa6', W: '#efe8d8', B: '#8e9bb5', b: '#76839c', F: '#7a5a3e' },
    art: [
      '..PPP...............',
      '.PPPPP..............',
      'MMMMMMMMMMMMMMMMMMMM',
      'MWWWWWWWWWWWWWWWWWWM',
      'MBBBBBBBBBBBBBBBBBBM',
      'MbbbbbbbbbbbbbbbbbbM',
      'MBBBBBBBBBBBBBBBBBBM',
      'FFFFFFFFFFFFFFFFFFFF',
      'FF................FF',
      'FF................FF',
    ],
  };

  var LAMP = {
    key: { L: '#f4d79a', l: '#d9b46e', S: '#6f6152', B: '#5b5044', G: '#ffe9b0' },
    art: [
      '...LLL...',
      '..LlLlL..',
      '.LLLLLLL.',
      '..GGGGG..',
      '....S....',
      '....S....',
      '....S....',
      '....S....',
      '....S....',
      '....S....',
      '....S....',
      '...BBB...',
      '..BBBBB..',
    ],
  };

  var PLANT = {
    key: { G: '#5f8a52', g: '#7aa869', P: '#a9603f', p: '#8c4c31' },
    art: [
      '.....G.......',
      '....GGg......',
      '...GGgGG..G..',
      '..GGgGGgGGgG.',
      '.GGgGGgGGgGG.',
      '..GGgGGgGGg..',
      '...GGgGGgG...',
      '.....GGG.....',
      '.....ggg.....',
      '....PPPPP....',
      '...PPppPPP...',
      '...PPppPPP...',
      '....PPPPP....',
      '.....PPP.....',
    ],
  };

  // 解锁表：记录过的不同天数 -> 多出来的东西
  var UNLOCKS = [
    { days: 3, id: 'rug', note: '地上多了一块毯子。' },
    { days: 7, id: 'bed', note: '角落里多了一张小床。' },
    { days: 14, id: 'lamp', note: '屋里多了一盏小灯。' },
    { days: 30, id: 'plant', note: '窗边多了一盆植物。' },
    { days: 60, id: 'stars', note: '窗外开始有星星了。' },
  ];

  function unlockedIds(days) {
    var out = {};
    for (var i = 0; i < UNLOCKS.length; i++) if (days >= UNLOCKS[i].days) out[UNLOCKS[i].id] = true;
    return out;
  }

  function nextUnlock(days) {
    for (var i = 0; i < UNLOCKS.length; i++) if (days < UNLOCKS[i].days) return UNLOCKS[i];
    return null;
  }

  var canvas = null, ctx = null, dpr = 1;
  var days = 0, starLoop = null;

  var phase = 'night';
  var fade = null, fadeTimer = null;
  var FADE_MS = 1500;             // 换时刻的过渡时长

  function syncPalette() { C = window.DAYTIME.roomPalette(phase); }
  syncPalette();

  // 必须和 pet.js 的 zoom 用同一个公式，否则猫和房间的像素密度对不上。
  // 整数倍，且同时受宽高约束，房间才不会被拉扁。
  function zoomFor(w, h) {
    return Math.max(1, Math.min(2, Math.floor(Math.min(w / 280, h / 200))));
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.parentNode.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw();
  }

  // 把字符串网格按 unit 像素一格画出来
  function stamp(g, U, art, x, y) {
    for (var r = 0; r < art.art.length; r++) {
      var row = art.art[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row[c];
        if (ch === '.') continue;
        var col = art.key[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x + c * U, y + r * U, U, U);
      }
    }
  }

  // 窗外的东西按时刻换：白天是一块云，黄昏是落日，夜里才是月亮。
  // 白天挂一个月亮会立刻穿帮——窗外是这个房间唯一直接说出「现在几点」的地方。
  function drawWindow(U, w, floorY) {
    var WW = 18 * U, WH = 13 * U;
    var wx = Math.round(w * 0.60 / U) * U;
    var wy = Math.round((floorY - WH - 7 * U) / U) * U;
    // 天空。分上下两段——黄昏和白天都需要一条更亮的下沿，否则整扇窗就是一块纯色，
    // 看着像一块亮起来的板子而不是一片天。
    var horizon = wy + Math.round(WH * 0.55 / U) * U;
    ctx.fillStyle = C.sky;
    ctx.fillRect(wx, wy, WW, WH);
    ctx.fillStyle = C.skyLow;
    ctx.fillRect(wx, horizon, WW, wy + WH - horizon);

    var kind = window.DAYTIME.skyKind(phase);

    if (kind === 'moon') {
      // 月亮：三个方块拼出一个圆润的样子
      ctx.fillStyle = C.moon;
      ctx.fillRect(wx + WW - 6 * U, wy + 2 * U, 2 * U, 2 * U);
      ctx.fillRect(wx + WW - 7 * U, wy + 3 * U, 4 * U, 2 * U);
      ctx.fillRect(wx + WW - 6 * U, wy + 5 * U, 2 * U, 2 * U);
    } else if (kind === 'cloud') {
      // 云：平底、上面鼓三块，和房间里的家具一样是整格的方块
      var cx = wx + 3 * U, cy = wy + 4 * U;
      ctx.fillStyle = C.cloud;
      ctx.fillRect(cx, cy, 9 * U, 2 * U);
      ctx.fillRect(cx + U, cy - U, 3 * U, U);
      ctx.fillRect(cx + 4 * U, cy - 2 * U, 4 * U, 2 * U);
      ctx.fillRect(cx + 7 * U, cy - 3 * U, U, U);
    } else {
      // 落日：一个小太阳坐在天际线上，暗云剪影在它上面的紫天里。
      // 云在黄昏是剪影色、白天是白的——同一个位置，两种天色。
      var sx = wx + 4 * U, sy = wy + WH - 5 * U;
      ctx.fillStyle = C.sun;
      ctx.fillRect(sx + U, sy - U, U, U);
      ctx.fillRect(sx, sy, 3 * U, 2 * U);
      ctx.fillStyle = C.cloud;
      ctx.fillRect(wx + U, wy + 5 * U, 6 * U, U);
      ctx.fillRect(wx + 11 * U, wy + 3 * U, 5 * U, U);
    }

    // 星星（第 60 天解锁）。白天不画，所以这个解锁在白天是看不见的——
    // 它本来就是「夜里窗外有星星」这件事。
    if (window.DAYTIME.starsVisible(phase) && unlockedIds(days).stars) {
      var stars = [[3, 2], [7, 5], [5, 9], [12, 3], [2, 7], [9, 10], [14, 7]];
      ctx.fillStyle = C.star;
      for (var i = 0; i < stars.length; i++) {
        // 轻微闪烁，但慢到几乎注意不到——它不是装饰性的动效，只是让房间有呼吸
        var tw = 0.55 + 0.45 * Math.sin(performance.now() / 1600 + i * 1.7);
        ctx.globalAlpha = tw;
        ctx.fillRect(wx + stars[i][0] * U, wy + stars[i][1] * U, U, U);
      }
      ctx.globalAlpha = 1;
    }
    // 窗框 + 十字窗棂
    ctx.fillStyle = C.frame;
    ctx.fillRect(wx - U, wy - U, WW + 2 * U, U);
    ctx.fillRect(wx - U, wy + WH, WW + 2 * U, U);
    ctx.fillRect(wx - U, wy, U, WH);
    ctx.fillRect(wx + WW, wy, U, WH);
    ctx.fillRect(wx + WW / 2 - U / 2, wy, U, WH);
    ctx.fillRect(wx, wy + WH / 2 - U / 2, WW, U);
    // 玻璃反光
    ctx.fillStyle = C.glass;
    ctx.fillRect(wx + U, wy + U, WW / 2 - U, WH / 2 - U);
  }

  function draw() {
    if (!ctx) return;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    var U = 4 * zoomFor(w, h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // 地板线。pet.js 用同一个比例把猫的脚放在这条线上，两边必须一致，
    // 否则猫会悬空或者陷进地板里。
    var floorY = Math.round(h * 0.92 / U) * U;
    var wallBottom = Math.round((floorY - 2 * U) / U) * U;

    // 墙
    ctx.fillStyle = C.wall;
    ctx.fillRect(0, 0, w, wallBottom);
    // 顶部略暗，让房间有高度感
    ctx.fillStyle = C.wallTop;
    ctx.fillRect(0, 0, w, Math.round(h * 0.16 / U) * U);
    // 贴近地板的一条略亮，像灯从下往上打
    ctx.fillStyle = C.wallLow;
    ctx.fillRect(0, wallBottom - 3 * U, w, 3 * U);
    // 踢脚线
    ctx.fillStyle = C.board;
    ctx.fillRect(0, wallBottom, w, 2 * U);

    // 地板
    ctx.fillStyle = C.floor;
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.fillStyle = C.floorBack;
    ctx.fillRect(0, floorY, w, U);
    // 木纹线
    ctx.fillStyle = C.floorLine;
    for (var y = floorY + 3 * U; y < h; y += 3 * U) ctx.fillRect(0, y, w, Math.max(1, U / 4));

    drawWindow(U, w, floorY);

    var have = unlockedIds(days);
    var lampW = LAMP.art[0].length * U;
    var plantW = PLANT.art[0].length * U;
    var rugW = RUG.art[0].length * U;

    // 装饰靠两侧边缘锚定，中间留给猫——猫是主角，不能让家具挤到它。
    // 地毯例外，它铺在猫脚下。
    if (have.rug) {
      stamp(ctx, U, RUG, Math.round((w - rugW) / 2 / U) * U, floorY - 3 * U);
    }
    if (have.bed) {
      stamp(ctx, U, BED, 2 * U, floorY - (BED.art.length - 2) * U);
    }
    if (have.plant) {
      stamp(ctx, U, PLANT, w - plantW - 2 * U, floorY - (PLANT.art.length - 2) * U);
    }
    if (have.lamp) {
      var lampX = w - plantW - lampW - 5 * U;
      var lampY = floorY - (LAMP.art.length - 2) * U;
      // 灯下的暖光池——房间「温暖」的一大半来自这一层。白天不点：白天再点一盏灯，
      // 房间就不是「白天」了。灯本身照画，它是家具，白天只是没开。
      if (window.DAYTIME.lampLit(phase)) {
        var glow = ctx.createRadialGradient(
          lampX + lampW / 2, lampY + 2 * U, 0,
          lampX + lampW / 2, lampY + 2 * U, 15 * U);
        glow.addColorStop(0, C.lampGlow);
        glow.addColorStop(1, 'rgba(255,206,120,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(lampX - 14 * U, lampY - 10 * U, 34 * U, 30 * U);
      }
      stamp(ctx, U, LAMP, lampX, lampY);
    }

    // 换时刻的过渡：把上一时刻那一帧整个盖在上面，逐渐淡掉，底下露出来的是新时刻
    // 的房间。比逐色插值简单，而且渐变、玻璃反光、灯光这些没法逐色调的东西也一并
    // 处理了——包括肉眼可见的窗外内容变化。
    if (fade) {
      var p = (performance.now() - fade.t0) / FADE_MS;
      if (p >= 1) fade = null;
      else {
        ctx.globalAlpha = 1 - p;
        ctx.drawImage(fade.snap, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 换时刻。不硬切——上一帧存下来交给 draw() 去淡。
  // instant 用于首次挂载：页面打开时就该是对的时刻，不该先闪一下夜晚再渐变过去。
  function setPhase(next, instant) {
    if (next === phase) return;
    if (!instant && canvas && ctx) {
      var snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d').drawImage(canvas, 0, 0);
      fade = { snap: snap, t0: performance.now() };
    }
    phase = next;
    syncPalette();
    draw();
    // 过渡期间要持续重画才看得出渐变。50ms 一步，1.5 秒约 30 帧。
    if (fade && !fadeTimer) {
      fadeTimer = setInterval(function () {
        draw();
        if (!fade) { clearInterval(fadeTimer); fadeTimer = null; }
      }, 50);
    }
    syncStarLoop();
  }

  // 星星的闪烁是房间里唯一的动效，而且慢到几乎注意不到。只在解锁后才跑循环——
  // 而且只在看得见星星的时刻跑（白天画都不画，没必要每 220ms 重绘一次）。
  function syncStarLoop() {
    if (unlockedIds(days).stars && window.DAYTIME.starsVisible(phase)) {
      if (!starLoop) starLoop = setInterval(draw, 220);
    } else if (starLoop) {
      clearInterval(starLoop); starLoop = null;
    }
  }

  window.ROOM = {
    mount: function (el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      return this;
    },
    setDays: function (n) { days = n; draw(); syncStarLoop(); },
    setPhase: setPhase,
    // 飞虫要在这块地方飞。与其让 critter.js 再抄一遍 0.92 那个地板比例（room.js
    // 和 pet.js 已经各有一份，注释里互相写着「必须一致」），不如从这里问。
    bounds: function () {
      var w = canvas ? canvas.width / dpr : 0;
      var h = canvas ? canvas.height / dpr : 0;
      var U = 4 * zoomFor(w, h);
      return { w: w, h: h, U: U, floorY: Math.round(h * 0.92 / U) * U };
    },
    redraw: draw,
    unlocks: UNLOCKS,
    stamp: stamp,
    unlockedIds: unlockedIds,
    nextUnlock: nextUnlock,
  };
})();
