// 房间和整页的颜色跟着真实时间走。
//
// 三个阶段：白天 7:00-17:00、黄昏 17:00-19:00、其余是夜晚。
// 这个模块只管两件事——「现在是什么时刻」和「那个时刻长什么样」。它不碰 DOM、
// 不碰 canvas：应用它的是 app.js（写 <html data-phase>）和 room.js（取调色板）。
//
// 白天的定位是「柔和的白天」：低饱和暖白，是透过窗帘的自然光，不是拉开灯的白光。
// 夜里才是真的暗。三个时刻各有各的好看，任何时刻打开都不该让人觉得「走错了」。
//
// 为什么要有 watch()：跨时刻这件事本身要能看见。开着页面从 16:59 走到 17:00，
// 房间自己暗下来——「时间在流动」是陪伴感的一部分，不是技术细节。
(function () {
  'use strict';

  var DAY_FROM = 7;      // 7:00 起是白天
  var DUSK_FROM = 17;    // 17:00 起是黄昏
  var NIGHT_FROM = 19;   // 19:00 起是夜晚

  function phaseAt(d) {
    var h = (d || new Date()).getHours();
    if (h >= DAY_FROM && h < DUSK_FROM) return 'day';
    if (h >= DUSK_FROM && h < NIGHT_FROM) return 'dusk';
    return 'night';
  }

  // ---- 房间调色板 ----------------------------------------------------------
  // 键和 room.js 原来那组写死的常量一一对应。夜晚那组就是原来那份，没动。
  var ROOM_PALETTES = {
    day: {
      wall: '#cec0a8', wallTop: '#bcae96', wallLow: '#dccfb8',
      floor: '#b28a66', floorLine: '#9d7957', floorBack: '#a8825e',
      board: '#9c8873',
      sky: '#a8cbe8', skyLow: '#c8e0f2', cloud: '#f7f5ee', sun: '#f5e6bd',
      moon: '#f2e6c0', star: '#fff8dc',
      frame: '#a98a63', glass: 'rgba(255,252,240,0.20)',
      lampGlow: 'rgba(255,206,120,0)',
    },
    dusk: {
      wall: '#5c4c4e', wallTop: '#4d4044', wallLow: '#6b5858',
      floor: '#7d5c44', floorLine: '#6a4b37', floorBack: '#72533d',
      board: '#5c4a42',
      // 黄昏时窗外是全屋最亮的地方。真实日落是上紫下橙——把紫色留在上面，
      // 正好和夜晚那组调色板接上，天黑下来是一个色调往前走，不是换一套。
      sky: '#6b3a52', skyLow: '#e08a3c', cloud: '#4a2438', sun: '#ffdd96',
      moon: '#f2e6c0', star: '#fff8dc',
      frame: '#7a5a44', glass: 'rgba(255,206,150,0.10)',
      lampGlow: 'rgba(255,206,120,0.14)',
    },
    night: {
      wall: '#453d57', wallTop: '#3a3350', wallLow: '#4d4460',
      floor: '#6d564a', floorLine: '#5c473d', floorBack: '#614b41',
      board: '#4f4038',
      sky: '#1b2340', skyLow: '#232c4c', cloud: '#2a3350', sun: '#f2e6c0',
      moon: '#f2e6c0', star: '#fff8dc',
      frame: '#8b7355', glass: 'rgba(255,246,214,0.07)',
      lampGlow: 'rgba(255,206,120,0.16)',
    },
  };

  var PHASES = ['day', 'dusk', 'night'];

  function roomPalette(phase) {
    return ROOM_PALETTES[phase] || ROOM_PALETTES.night;
  }

  // 夜里才亮灯、才有星星——这两件事本来就该跟着时刻走，不是额外功能。
  // 灯是 14 天解锁、星星是 60 天，所以这个判断让那两个解锁更有意义。
  function lampLit(phase) { return phase !== 'day'; }
  function starsVisible(phase) { return phase !== 'day'; }

  // 窗外的内容也换。白天是一块云（不是月亮），黄昏是落日。
  function skyKind(phase) {
    return phase === 'day' ? 'cloud' : phase === 'dusk' ? 'sunset' : 'moon';
  }

  // ---- 飞虫 ----------------------------------------------------------------
  // 白天是蝴蝶，黄昏和夜晚是萤火虫。黄昏算萤火虫：日落之后出来的正是它。
  function critter(phase) {
    return phase === 'day' ? 'butterfly' : 'firefly';
  }

  // ---- 当前时刻 ------------------------------------------------------------
  var current = phaseAt();

  function phase() { return current; }

  // 每 60 秒查一次，只在时刻真的跨过去时回调。不是每分钟都刷——那个代价没必要，
  // 而且会把「时间在流动」变成「页面在抖」。
  function watch(fn) {
    fn(current);
    var timer = setInterval(function () {
      var next = phaseAt();
      if (next === current) return;
      current = next;
      fn(current);
    }, 60000);
    return function () { clearInterval(timer); };
  }

  window.DAYTIME = {
    PHASES: PHASES,
    phase: phase,
    phaseAt: phaseAt,
    roomPalette: roomPalette,
    lampLit: lampLit,
    starsVisible: starsVisible,
    skyKind: skyKind,
    critter: critter,
    watch: watch,
  };
})();
