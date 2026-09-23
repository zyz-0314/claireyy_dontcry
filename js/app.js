// 页面与交互。
//
// 这一层负责三件事：把房间和猫挂起来、在三个视图之间切换、以及「把烦恼扔进
// 垃圾桶」那一段动画。回应本身全部来自 dialogue.js，这里不做任何文本分析——
// 用户自己点的心情就是唯一的分类依据。
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    stage: $('stage'), room: $('room'), pet: $('pet'), bin: $('bin'),
    bubble: $('bubble'), fly: $('fly'), sparks: $('sparks'),
    greet: $('greet'), houseNote: $('house-note'), diaryNote: $('diary-note'),
    words: $('words'), chips: $('chips'), chipHint: $('chip-hint'),
    goBin: $('go-bin'), throwBtn: $('throw'), cancel: $('cancel'),
    weather: $('weather'), entries: $('entries'),
    viewHouse: $('view-house'), viewBin: $('view-bin'), viewDiary: $('view-diary'),
  };

  var mood = null;         // 当前选中的心情，null = 没选
  var busy = false;        // 动画进行中，防止连点

  // ---- 垃圾桶的像素图 ------------------------------------------------------
  var BIN_ART = {
    key: { L: '#98a1b1', l: '#7b8494', B: '#5a6273', b: '#6f7a8c' },
    art: [
      '....LLLL....',
      '..LLLLLLLL..',
      '.LLLLLLLLLL.',
      '..BBBBBBBB..',
      '..BbbbbbbB..',
      '..BbbbbbbB..',
      '...BbbbbB...',
      '...BbbbbB...',
      '....BbbB....',
      '....BbbB....',
      '....BBBB....',
    ],
  };

  function drawBin() {
    var g = els.bin.getContext('2d');
    g.clearRect(0, 0, els.bin.width, els.bin.height);
    g.imageSmoothingEnabled = false;
    // 用一个和房间/精灵无关的固定格子尺寸：垃圾桶是独立小图，按自身尺寸铺满
    var u = 4;
    ROOM.stamp(g, u, BIN_ART, 0, 0);
  }

  // ---- 视图切换 ------------------------------------------------------------
  function show(name) {
    els.viewHouse.hidden = name !== 'house';
    els.viewBin.hidden = name !== 'bin';
    els.viewDiary.hidden = name !== 'diary';
    els.bin.classList.toggle('show', name === 'bin');
    for (var i = 0; i < document.querySelectorAll('[data-nav]').length; i++) {
      var a = document.querySelectorAll('[data-nav]')[i];
      a.classList.toggle('on', a.getAttribute('data-nav') === name);
    }
    // 离开垃圾桶页就把气泡收掉、输入区恢复。用户可能点气泡的「嗯」走，也可能
    // 直接点顶部导航走——只处理前者的话，后者会把输入区留在塌陷状态、按钮留在
    // 禁用状态，下次进来对着一个不能用的界面。
    if (name !== 'bin') { hideBubble(); resetBin(); }
    PET.touch();
  }

  // ---- 心情 chips ----------------------------------------------------------
  function renderChips() {
    els.chips.innerHTML = '';
    DIALOGUE.MOODS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = m.emoji + ' ' + m.label;
      b.addEventListener('click', function () {
        // 再点一次可以取消选择——「不想说」也是一种选择，误点要能退回去
        mood = (mood === m.key) ? null : m.key;
        syncChips();
        PET.touch();
      });
      els.chips.appendChild(b);
      b.dataset.key = m.key;
    });
    syncChips();
  }

  function syncChips() {
    var all = els.chips.querySelectorAll('.chip');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('on', all[i].dataset.key === mood);
    }
    els.chipHint.textContent = mood ? '' : '可以不选。';
  }

  // ---- 对话气泡 ------------------------------------------------------------
  // 一次显示一行，行与行之间留停顿。这个节奏就是产品本身——文案库的短句和分行
  // 是有呼吸的，一次性糊上去就变成了系统提示。
  //
  // 逐行「追加」而不是先占好位置再逐行淡入：后者会让气泡一开始就是一个空盒子，
  // 高度先撑满，看着像加载失败。
  var LINE_MS = 520;
  var BUBBLE_HOLD_MS = 8000;   // 开场先完整呈现这么久，然后开始淡出
  var BUBBLE_AGAIN_MS = 6000;  // 点小屋把它唤回来之后，这次停得短一点
  var BUBBLE_FADE_MS = 800;    // 淡出时长，要和 css 里 .bubble 的 transition 对齐
  var bubbleTimers = [];

  function clearBubbleTimers() {
    for (var i = 0; i < bubbleTimers.length; i++) clearTimeout(bubbleTimers[i]);
    bubbleTimers = [];
  }

  function fitBubble() {
    // 先把上一次的收紧撤掉再量，否则会越量越小
    els.bubble.classList.remove('tight');
    var stageH = els.stage.getBoundingClientRect().height;
    var headTop = PET.size().originY;
    var top = Math.round(stageH * 0.07);
    if (top + els.bubble.offsetHeight <= headTop - 6) {
      els.bubble.style.top = top + 'px';
      return;
    }
    // 放不下就先收紧行距，还放不下就整体上移——宁可贴住房间上沿，
    // 也不要把猫的脸盖住。气泡尾巴朝下，轻轻搭在耳朵上是能接受的。
    els.bubble.classList.add('tight');
    var overflow = top + els.bubble.offsetHeight - (headTop - 6);
    els.bubble.style.top = Math.max(8, top - overflow) + 'px';
  }

  function showBubble(lines, rare) {
    clearBubbleTimers();
    // 上一次可能是淡出后留下的状态。先摘掉 .gone 再取消 hidden，开场就是
    // 「直接出现」；淡入过渡只留给点小屋把它唤回来那一次。
    els.bubble.classList.remove('gone');
    els.bubble.hidden = false;
    els.bubble.innerHTML = '';
    els.bubble.classList.remove('tight');
    els.bubble.style.top = Math.round(els.stage.getBoundingClientRect().height * 0.07) + 'px';

    lines.forEach(function (line, i) {
      bubbleTimers.push(setTimeout(function () {
        var span = document.createElement('span');
        span.className = 'ln';
        span.textContent = line;
        els.bubble.appendChild(span);
        fitBubble();
      }, i * LINE_MS));
    });

    bubbleTimers.push(setTimeout(function () {
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'bubble-close';
      close.textContent = rare ? '好' : '嗯';
      // show() 会把气泡收掉并把输入区恢复，所以这里只需要切视图
      close.addEventListener('click', function () { show('house'); });
      els.bubble.appendChild(close);
      fitBubble();
    }, lines.length * LINE_MS));

    fadeBubbleOut(BUBBLE_HOLD_MS);
  }

  // 淡出但**不删内容**：内容留着，点小屋才能原样再浮现出来。
  // hidden 要等过渡走完再置——立刻置会变成硬切，淡出就没了。
  function fadeBubbleOut(holdMs) {
    bubbleTimers.push(setTimeout(function () {
      els.bubble.classList.add('gone');
      bubbleTimers.push(setTimeout(function () {
        els.bubble.hidden = true;
      }, BUBBLE_FADE_MS));
    }, holdMs));
  }

  // 点小屋像素区域把它叫回来。只在它已经淡掉或收起时才响应：还亮着的时候点房间
  // 不该重置计时，否则 8 秒会变成「点一下就续命」，它就一直挂在那了。
  function fadeBubbleIn() {
    if (!els.bubble.innerHTML) return;
    if (!els.bubble.hidden && !els.bubble.classList.contains('gone')) return;
    els.bubble.hidden = false;
    // 先让浏览器认下 opacity:0 这个起点，再摘 .gone。中间不隔一次强制布局的话，
    // 起止值会在同一个样式刷新里被合并，过渡不触发，成了直接闪现。
    void els.bubble.offsetWidth;
    els.bubble.classList.remove('gone');
    fadeBubbleOut(BUBBLE_AGAIN_MS);
  }

  function hideBubble() {
    clearBubbleTimers();
    els.bubble.hidden = true;
    els.bubble.innerHTML = '';
  }

  // ---- 纸团飞行 ------------------------------------------------------------
  function bezier(x0, y0, cx, cy, x1, y1, u) {
    var v = 1 - u;
    return [v * v * x0 + 2 * v * u * cx + u * u * x1,
            v * v * y0 + 2 * v * u * cy + u * u * y1];
  }

  // 分两段：先把文字揉成一个纸团（原地），再把纸团抛进桶里。
  //
  // 不能做成一段「一边飞一边缩」——那样纸团前半程是输入框那么宽的一条，
  // 带着 500 多度旋转，看起来像一块翻飞的板子，而且宽扁元素旋转后的包围盒
  // 会甩出屏幕外。
  function flyToBin(fromRect, done) {
    var binRect = els.bin.getBoundingClientRect();
    // 输入框在屏幕外时（页面滚过），把起点拉回可见范围，否则看不到「揉成团」那一下
    var y0 = Math.min(fromRect.top + fromRect.height / 2, window.innerHeight - 24);
    var x0 = fromRect.left + fromRect.width / 2;
    var x1 = binRect.left + binRect.width / 2;
    var y1 = binRect.top + binRect.height * 0.35;
    // 控制点抛到空中，让它看起来是被「扔」出去的而不是被吸过去的
    var cx = (x0 + x1) / 2 + (x1 > x0 ? 70 : -70);
    var cy = Math.min(y0, y1) - 130;

    els.fly.getAnimations().forEach(function (a) { a.cancel(); });
    els.fly.hidden = false;
    // 先站到输入框的位置再开始揉——否则揉团那 300ms 里它会待在视口左上角
    els.fly.style.transform = 'translate(' + x0 + 'px,' + y0 + 'px) translate(-50%,-50%)';

    var crumple = els.fly.animate([
      { width: fromRect.width + 'px', height: fromRect.height + 'px', opacity: 1 },
      { width: '58px', height: '48px', opacity: 1, offset: 0.65 },
      { width: '26px', height: '26px', opacity: 1 },
    ], { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });

    crumple.onfinish = function () {
      var STEPS = 22, frames = [];
      for (var i = 0; i <= STEPS; i++) {
        var u = i / STEPS;
        var p = bezier(x0, y0, cx, cy, x1, y1, u);
        frames.push({
          transform: 'translate(' + p[0] + 'px,' + p[1] + 'px) translate(-50%,-50%) rotate(' + (u * 200) + 'deg)',
          opacity: u < 0.9 ? 1 : 0.15,
        });
      }
      var toss = els.fly.animate(frames, { duration: 620, easing: 'linear', fill: 'forwards' });
      // 只负责通报「到了」——收尾（藏起来、取消动画）由调用方的 land() 统一做，
      // 因为保险定时器也可能先到。
      toss.onfinish = done;
    };
  }

  function sparkle(rect) {
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.3;
    for (var i = 0; i < 12; i++) {
      var s = document.createElement('div');
      s.className = 'spark';
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      els.sparks.appendChild(s);
      var ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      var dist = 26 + Math.random() * 40;
      s.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + (Math.cos(ang) * dist) + 'px,' +
            (Math.sin(ang) * dist - 12) + 'px) scale(0.2)', opacity: 0 },
      ], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' })
        .onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
  }

  // ---- 扔进去 --------------------------------------------------------------
  function throwIt() {
    if (busy) return;
    busy = true;

    var text = els.words.value.trim();
    var fromRect = els.words.getBoundingClientRect();
    var chosen = mood;
    els.throwBtn.disabled = true;
    // 输入区塌下去，像纸被抽走了
    els.viewBin.classList.add('collapsing');

    // 记录在「点击」这一刻就落库，不等动画。
    // 之前是等纸团落进桶里（动画的 onfinish）才写——可是浏览器会暂停隐藏标签页的
    // 动画时间线，用户扔完立刻切走，onfinish 就迟迟不来甚至永远不来，这条记录会
    // 静默丢失，按钮还永久禁用着。数据不该依赖装饰性动画跑完。
    var reply = DIALOGUE.respond(chosen);
    STORE.addEntry({
      mood: chosen || DIALOGUE.DEFAULT_MOOD,
      text: text,
      reply: reply.lines.slice(),
      rare: reply.rare,
    });

    // 落到桶里之后才让猫开口。landed 保证只会兑现一次——正常路径和下面那个
    // 保险定时器谁先到算谁的。
    var landed = false;
    function land() {
      if (landed) return;
      landed = true;
      els.fly.hidden = true;
      els.fly.getAnimations().forEach(function (a) { a.cancel(); });
      sparkle(els.bin.getBoundingClientRect());
      PET.comfort();
      setTimeout(function () {
        showBubble(reply.lines, reply.rare);
        // 成长用「记录过的不同天数」算，不是条数
        ROOM.setDays(STORE.distinctDays());
        renderHouseNote();
        busy = false;
      }, 260);
    }

    flyToBin(fromRect, land);
    // 保险：动画没按时跑完也要把回应给出来，否则按钮一直禁用着，界面就死了
    setTimeout(land, 2500);
  }

  function resetBin() {
    els.words.value = '';
    mood = null;
    syncChips();
    els.viewBin.classList.remove('collapsing');
    els.throwBtn.disabled = false;
  }

  // ---- 时刻 ----------------------------------------------------------------
  // 房间和整页的颜色跟着真实时间走。这里只负责把时刻「应用」下去——哪个时刻是什么
  // 颜色，是 daytime.js 和 css/style.css 的事。
  function applyPhase(phase) {
    document.documentElement.setAttribute('data-phase', phase);
    ROOM.setPhase(phase);
    // 窗外飞的东西也按时刻换：白天蝴蝶，黄昏和夜晚萤火虫
    CRITTER.setKind(DAYTIME.critter(phase));
  }

  // ---- 小屋文案 ------------------------------------------------------------
  function renderHouseNote() {
    var days = STORE.distinctDays();
    var next = ROOM.nextUnlock(days);
    var data = STORE.load();
    els.greet.textContent = data.name + '，欢迎回家';
    if (!days) {
      els.houseNote.textContent = '';
    } else if (next) {
      // 不写「还差 N 天解锁」——那会把陪伴变成任务。只轻轻提一句已经有的东西。
      var have = ROOM.unlocks.filter(function (u) { return days >= u.days; });
      els.houseNote.textContent = have.length
        ? have[have.length - 1].note
        : '它记得你来过 ' + days + ' 天。';
    } else {
      els.houseNote.textContent = '它记得你来过 ' + days + ' 天。';
    }
  }

  // ---- 小情绪天气与记录 ----------------------------------------------------
  function renderDiary() {
    var all = STORE.entriesNewestFirst();
    // 「最近」按天数算，不是条数
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    var since = STORE.today(cutoff);
    var recent = all.filter(function (e) { return e.date >= since; });

    els.weather.innerHTML = '';
    if (!recent.length) {
      els.weather.hidden = true;
    } else {
      els.weather.hidden = false;
      DIALOGUE.weather(recent).forEach(function (w) {
        var s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.emoji + ' ' + w.count + ' 次' + w.label;
        els.weather.appendChild(s);
      });
    }

    els.entries.innerHTML = '';
    if (!all.length) {
      els.diaryNote.textContent = '这里还空着。什么时候想写，就什么时候来。';
      return;
    }
    els.diaryNote.textContent = '';

    all.forEach(function (e) {
      var li = document.createElement('li');
      var info = DIALOGUE.moodInfo(e.mood);

      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = e.date + ' · ' + info.emoji + ' ' + info.label;
      li.appendChild(meta);

      var said = document.createElement('div');
      said.className = 'said' + (e.text ? '' : ' empty');
      said.textContent = e.text || '（今天什么都不想说）';
      li.appendChild(said);

      if (e.reply && e.reply.length) {
        var rep = document.createElement('div');
        rep.className = 'replied';
        rep.innerHTML = '';
        e.reply.forEach(function (line, i) {
          if (i) rep.appendChild(document.createElement('br'));
          rep.appendChild(document.createTextNode(line));
        });
        li.appendChild(rep);
      }

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '删掉';
      del.addEventListener('click', function () {
        STORE.removeEntry(e.id);
        ROOM.setDays(STORE.distinctDays());
        renderHouseNote();
        renderDiary();
      });
      li.insertBefore(del, meta);
      els.entries.appendChild(li);
    });
  }

  // ---- 接线 ----------------------------------------------------------------
  function wire() {
    els.goBin.addEventListener('click', function () { show('bin'); els.words.focus(); });
    els.throwBtn.addEventListener('click', throwIt);
    els.cancel.addEventListener('click', function () { show('house'); });

    for (var i = 0; i < document.querySelectorAll('[data-nav]').length; i++) {
      var a = document.querySelectorAll('[data-nav]')[i];
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var target = this.getAttribute('data-nav');
        if (target === 'diary') renderDiary();
        show(target);
      });
    }

    // 有动静就把猫叫醒，并重置入睡倒计时。
    // 挂在 document 上而不是 stage 上：猫要追鼠标，而你会把鼠标移出房间（比如移到
    // 下面的输入框）。挂在 stage 上的话，鼠标一离开房间猫就看不见你了。
    // 坐标仍旧换算成「相对房间」的——房间外的位置就是超出边界的数，追鼠标那边会
    // 把它夹进可走范围内。
    // 用 pointermove 而不是 mousemove：手机上按住拖动只会发 pointer 事件，而
    // 拖着手指在房间里走正是「追」的那个手势。
    document.addEventListener('pointermove', function (e) {
      var r = els.stage.getBoundingClientRect();
      PET.cursorAt(e.clientX - r.left, e.clientY - r.top);
    });
    document.addEventListener('keydown', function () { PET.touch(); });
    document.addEventListener('click', function () { PET.touch(); });
    // 房间这一块（stage 里有房间、猫、垃圾桶、气泡）点一下就再请它说一次。
    // 触摸那条路上这个 click 会被画布上的 touchstart preventDefault 吃掉，所以手指
    // 单独走 pointerup。只认非鼠标，否则桌面上一次点击会跑两遍。
    els.stage.addEventListener('click', fadeBubbleIn);
    els.stage.addEventListener('pointerup', function (e) {
      if (e.pointerType !== 'mouse') fadeBubbleIn();
    });

    // 输入框里按 Cmd/Ctrl+Enter 也能扔
    els.words.addEventListener('keydown', function (e) {
      // 在输入框里写字 = 你在倒烦恼。猫会醒过来开始踩奶——这是这个房间里
      // 最要紧的一处「它陪着你」。所以这个信号只接输入框，不接全局键盘。
      PET.keys();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); throwIt(); }
    });
  }

  // ---- 启动 ----------------------------------------------------------------
  function boot() {
    var data = STORE.load();
    var days = STORE.distinctDays();

    ROOM.mount(els.room);
    // 首帧就用对的时刻（instant），否则白天打开会先闪一下夜晚再渐变过去
    ROOM.setPhase(DAYTIME.phase(), true);
    ROOM.setDays(days);
    DAYTIME.watch(applyPhase);
    PET.mount(els.pet);
    PET.setCoat(Math.min(data.pet.coat || 0, PET.coats().length - 1));
    PET.start();
    drawBin();

    els.greet.textContent = data.name + '，欢迎回家';
    renderHouseNote();
    renderChips();
    wire();
    show('house');

    // 开场白：每次打开换一句。同一句话连着出现两次，会让人意识到这只是个程序。
    var openLines = DIALOGUE.opening(STORE.nextOpeningIndex(), data.name);
    setTimeout(function () { showBubble(openLines, false); }, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
