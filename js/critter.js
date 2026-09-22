// 房间里会飞的那个东西：白天是蝴蝶，黄昏和夜晚是萤火虫。
//
// 从 pixelpets 的 butterfly visitor（renderer.js:1958-2192）搬的是**飞行模型**，
// 不是它的画法：那边用 g.ellipse 画抗锯齿的软边蝴蝶，浮在真实桌面上很合适；这个
// 房间从头到尾是硬边像素（imageSmoothingEnabled = false，连猫都是网格图元光栅化
// 出来的），一个柔边物件会是全屏唯一一个不搭的东西。所以这里用房间自己的语言画
// ——字符串网格 + 整格填色，和地毯/床/灯/盆栽同一套，格子单位也取同一个 U。
//
// 飞行模型搬过来的部分：一个缓慢漂移的 8 字中心（每 3-4 秒重挑一次）+ 扑翅的
// 爆发式抬升。**没有**搬：捕蝶的扑击、被拍到就窜走、被抓住绕圈那一整套状态机——
// 用户把「抓虫子」整个删掉了，猫改成追鼠标（见 pet.js），所以这边不再需要知道
// 猫在哪，飞行区域也从「围着猫的头顶」改成了整面墙。
//
// 出现方式按用户定的：蝴蝶是「做客」——隔一阵飞进来待一会儿就走；萤火虫夜里常驻。
// 蝴蝶闯进来本身是件事，萤火虫则是房间的一部分。
(function () {
  'use strict';

  var SPACING_MS = [35000, 60000];    // 蝴蝶两趟之间隔多久
  var LINGER_MS = [14000, 22000];     // 一趟待多久

  // ---- 硬边像素画 ----------------------------------------------------------
  // 蝴蝶的翅膀做三帧开合：合 / 半开 / 全开。三帧都锚在身体那一列，所以开合时
  // 看起来是围绕身体在扇，而不是整只虫在缩放。
  var ART = {
    butterfly: {
      key: { o: '#2a2433', W: '#f7dfae', b: '#3a3140' },
      frames: [
        // 合翅（3 格宽）
        ['..o.o..', '..WbW..', '..WbW..', '..obo..', '..obo..', '...o...'],
        // 半开（5 格宽）
        ['..o.o..', '.oWbWo.', '.WWbWW.', '..obo..', '.oWbWo.', '..obo..'],
        // 全开（7 格宽）
        ['..o.o..', 'ooWoWoo', 'oWWbWWo', '..obo..', '.oWbWo.', '..obo..'],
      ],
    },
    firefly: {
      key: { g: '#7a6428', G: '#fff0a8' },
      frames: [['.g.', 'gGg', '.g.']],
    },
  };

  var canvas = null, g = null, dpr = 1;
  var kind = 'firefly';
  var st = null;                     // 当前这只飞虫，null = 现在没有
  var nextVisit = 0;
  var lastT = 0;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function roomBox() { return window.ROOM.bounds(); }

  // 能飞的地方：整面墙。上到墙顶，下沿留在地板之上——蝴蝶在屋子里飞，
  // 但不该贴在地上爬。边界全部由 room.js 的 bounds() 推出来，不在这里重新抄
  // 一遍 0.92 那个地板比例。
  function area() {
    var b = roomBox(), U = b.U;
    return {
      U: U,
      left: 3 * U,
      right: b.w - 3 * U,
      top: 4 * U,
      bottom: Math.max(8 * U, b.floorY - 6 * U),
      midX: b.w / 2,
    };
  }

  function gap() { return SPACING_MS[0] + Math.random() * (SPACING_MS[1] - SPACING_MS[0]); }

  function spawn(t, k) {
    var a = area();
    var resident = k === 'firefly';
    var w = a.right - a.left, h = a.bottom - a.top;
    var x = resident ? a.left + w * (0.25 + Math.random() * 0.5) : a.left - 6 * a.U;
    var y = a.top + h * (0.2 + Math.random() * 0.6);
    st = {
      kind: k,
      cx: x, cy: y,
      x: x, y: y,
      tx: x, ty: y,
      nextDrift: 0,
      phase: Math.random() * Math.PI * 2,
      flap: Math.random() * Math.PI * 2,
      blink: Math.random() * Math.PI * 2,
      frame: 0,
      alpha: 1,
      mode: resident ? 'linger' : 'in',
      until: t + LINGER_MS[0] + Math.random() * (LINGER_MS[1] - LINGER_MS[0]),
    };
  }

  function step(t, dt) {
    var a = area();
    var f = Math.min(3, dt / 16);          // 帧率无关，但别让掉帧时跳太远
    if (!st) {
      if (kind === 'firefly') { spawn(t, 'firefly'); return; }
      // 减弱动效时不请蝴蝶来做客——它整个行为就是动
      if (!reduced() && t >= nextVisit) spawn(t, 'butterfly');
      return;
    }

    var cx = st.cx, cy = st.cy;

    if (st.mode === 'in') {
      cx += (a.midX - cx) * 0.02 * f;
      cy += ((a.top + a.bottom) / 2 - cy) * 0.02 * f;
      if (cx > a.left + a.U) { st.mode = 'linger'; st.nextDrift = 0; }
    } else if (st.mode === 'out') {
      cx += (st.x < a.midX ? -1 : 1) * 3.2 * f;
      if (cx < a.left - 6 * a.U || cx > a.right + 6 * a.U) {
        st = null;
        nextVisit = t + gap();
        return;
      }
    } else {
      // 缓慢漂移的 8 字中心，每 3-4.2 秒重挑一次落脚点
      if (t > st.nextDrift) {
        st.nextDrift = t + 3000 + Math.random() * 1200;
        st.tx = a.left + (a.right - a.left) * (0.15 + Math.random() * 0.7);
        st.ty = a.top + (a.bottom - a.top) * (0.1 + Math.random() * 0.8);
      }
      if (!reduced()) {
        cx += (st.tx - cx) * 0.012 * f;
        cy += (st.ty - cy) * 0.012 * f;
      }
      // 待够了就走（萤火虫常驻，不设期限）
      if (st.kind !== 'firefly' && t > st.until) st.mode = 'out';
    }

    st.cx = cx; st.cy = cy;

    // 8 字摆动（pixelpets 的 Lissajous：横向一倍频、纵向两倍频）
    st.phase += 0.014 * f;
    var ax = (a.right - a.left) * 0.05, ay = (a.bottom - a.top) * 0.07;
    var bx = reduced() ? 0 : Math.sin(st.phase) * ax;
    var by = reduced() ? 0 : Math.sin(st.phase * 2) * ay;

    var x = cx + bx, y = cy + by;
    // 别飞到墙外或地板里
    x = Math.max(a.left - 4 * a.U, Math.min(a.right + 4 * a.U, x));
    y = Math.max(a.top, Math.min(a.bottom, y));
    st.x = x; st.y = y;

    // 扑翅：pixelpets 是 open = 0.30 + 0.70*|cos(flap)|，这里把它量化成三帧
    if (st.kind === 'butterfly') {
      var flapping = reduced() ? 0.18 : (0.18 + Math.abs(Math.sin(st.phase)) * 0.12);
      st.flap += flapping * f;
      var open = 0.30 + 0.70 * Math.abs(Math.cos(st.flap));
      st.frame = open > 0.72 ? 2 : open > 0.45 ? 1 : 0;
    } else {
      // 萤火虫一明一暗。慢，而且要有一段真正暗下去的时间——一直亮着就成了一颗灯。
      st.blink += 0.026 * f;
      var b2 = 0.5 + 0.5 * Math.sin(st.blink);
      st.alpha = 0.18 + 0.82 * b2 * b2;
    }

    draw(t, a);
  }

  // 网格贴图：锚点是图的正中心，整格填色。x0 取整 -> 格子边永远落在整数设备像素上
  // （U = 4*zoom，pet.js 里写死了「整数倍是硬要求」）。
  function stamp(art, key, cx, cy, U, alpha) {
    var rows = art.length, cols = art[0].length;
    var x0 = Math.round(cx - (cols / 2) * U), y0 = Math.round(cy - (rows / 2) * U);
    g.globalAlpha = alpha;
    for (var r = 0; r < rows; r++) {
      var row = art[r];
      for (var c = 0; c < cols; c++) {
        var ch = row[c];
        if (ch === '.') continue;
        var col = key[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x0 + c * U, y0 + r * U, U, U);
      }
    }
    g.globalAlpha = 1;
  }

  function draw(t, a) {
    if (!st) return;
    var U = a.U;

    if (st.kind === 'firefly') {
      // 光晕：照抄房间那盏灯的写法（径向渐变），芯子是硬边像素
      var rad = 7 * U;
      var glow = g.createRadialGradient(st.x, st.y, 0, st.x, st.y, rad);
      glow.addColorStop(0, 'rgba(255,240,168,' + (0.30 * st.alpha).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(255,240,168,0)');
      g.fillStyle = glow;
      g.fillRect(st.x - rad, st.y - rad, rad * 2, rad * 2);
    }

    var art = ART[st.kind];
    stamp(art.frames[st.frame], art.key, st.x, st.y, U, st.kind === 'firefly' ? Math.max(0.35, st.alpha) : 1);
  }

  window.CRITTER = {
    mount: function (el) {
      canvas = el;
      g = canvas.getContext('2d');
      dpr = window.devicePixelRatio || 1;
      nextVisit = performance.now() + gap();
      return this;
    },

    // 换时刻时换飞虫。换品种就把现在这只收掉——白天剩下的萤火虫不该在黄昏里继续飘。
    setKind: function (k) {
      k = k === 'butterfly' ? 'butterfly' : 'firefly';
      if (k === kind && st) return kind;
      if (k !== kind) { st = null; nextVisit = performance.now() + gap(); }
      kind = k;
      return kind;
    },

    kind: function () { return kind; },

    // 一帧。由 pet.js 的 tick 在画完猫之后调用——所以飞虫盖在猫上面，
    // 小物件在前面才看得见。
    tick: function (t) {
      if (!canvas || !g) return;
      var dt = lastT ? Math.min(80, t - lastT) : 16;
      lastT = t;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      step(t, dt);
    },
  };
})();
