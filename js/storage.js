// 本地存储。全部内容只留在这台设备上，不上传任何地方。
//
// 隐私模式、配额写满、或者用户禁用了本地存储时，读写都会抛异常。这种时候我们
// 悄悄退回内存态——网站照常能用，只是关掉就没了。绝不弹错误提示：一个人是来
// 倒情绪的，不该在门口先处理一个技术问题。
(function () {
  'use strict';

  var KEY = 'clairenocry.v1';
  var VERSION = 1;

  function blank() {
    return {
      version: VERSION,
      name: '来柯洁',
      pet: { species: 'cat', coat: 1 },
      entries: [],
      seenOpenings: [],
      lastVisit: null,
    };
  }

  var memory = null;      // localStorage 不可用时的落点
  var canPersist = true;

  function read() {
    if (memory) return memory;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) { memory = blank(); return memory; }
      var parsed = JSON.parse(raw);
      memory = migrate(parsed);
    } catch (e) {
      canPersist = false;
      memory = blank();
    }
    return memory;
  }

  // 版本迁移的挂点。目前只有 v1，所以只做结构补全——旧数据或手改坏的数据
  // 不该让整个页面白屏。
  function migrate(data) {
    var base = blank();
    if (!data || typeof data !== 'object') return base;
    if (!Array.isArray(data.entries)) data.entries = [];
    if (!Array.isArray(data.seenOpenings)) data.seenOpenings = [];
    if (!data.pet || typeof data.pet !== 'object') data.pet = base.pet;
    if (typeof data.name !== 'string' || !data.name) data.name = base.name;
    data.version = VERSION;
    return data;
  }

  function flush() {
    if (!canPersist) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(memory));
    } catch (e) {
      canPersist = false;
    }
  }

  // 本地日期，不能用 toISOString()——那会转成 UTC，晚上记录的条目会被算到
  // 第二天，按天解锁的成长进度就错一天。
  function today(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function save(patch) {
    var data = read();
    if (patch) for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) data[k] = patch[k];
    }
    flush();
    return data;
  }

  function addEntry(entry) {
    var data = read();
    entry.id = 'e' + Date.now() + Math.floor(Math.random() * 1000);
    entry.date = entry.date || today();
    entry.ts = entry.ts || Date.now();
    data.entries.push(entry);
    flush();
    return entry;
  }

  function removeEntry(id) {
    var data = read();
    for (var i = 0; i < data.entries.length; i++) {
      if (data.entries[i].id === id) { data.entries.splice(i, 1); break; }
    }
    flush();
  }

  // 成长按「记录过的不同天数」算，不按条数——按条数会鼓励一天里反复刷，
  // 那是效率工具的逻辑，不是这个房间的逻辑。
  function distinctDays() {
    var seen = {}, n = 0;
    var entries = read().entries;
    for (var i = 0; i < entries.length; i++) {
      var d = entries[i] && entries[i].date;
      if (d && !seen[d]) { seen[d] = 1; n++; }
    }
    return n;
  }

  function entriesNewestFirst() {
    return read().entries.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  // 下次打开时的开场白：优先挑没出现过的，全出现过了就随机。
  // 避免同一句话连续两次出现
  function nextOpeningIndex() {
    var data = read();
    var pool = [];
    for (var i = 0; i < window.DIALOGUE.OPENINGS.length; i++) {
      if (data.seenOpenings.indexOf(i) === -1) pool.push(i);
    }
    if (!pool.length) {
      data.seenOpenings = [];
      pool = [];
      for (var j = 0; j < window.DIALOGUE.OPENINGS.length; j++) pool.push(j);
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    data.seenOpenings.push(pick);
    flush();
    return pick;
  }

  window.STORE = {
    KEY: KEY,
    VERSION: VERSION,
    load: read,
    save: save,
    addEntry: addEntry,
    removeEntry: removeEntry,
    distinctDays: distinctDays,
    entriesNewestFirst: entriesNewestFirst,
    nextOpeningIndex: nextOpeningIndex,
    today: today,
    canPersist: function () { return canPersist; },
  };
})();
