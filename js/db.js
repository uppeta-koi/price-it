/* db.js — 一層很薄的資料庫介面。
   有填 Firebase 設定 → 走 Firebase Realtime Database（真正的多手機同步）
   沒填          → 自動退回 LOCAL TEST MODE（同一台電腦的多個分頁之間同步，
                    只能用來排練流程，現場請務必填好 Firebase）        */

var DB = (function () {
  'use strict';

  var configured = (typeof FIREBASE_CONFIG === 'object') &&
                   FIREBASE_CONFIG.databaseURL &&
                   FIREBASE_CONFIG.databaseURL.indexOf('PASTE_') === -1 &&
                   FIREBASE_CONFIG.apiKey &&
                   FIREBASE_CONFIG.apiKey.indexOf('PASTE_') === -1;

  var root = 'rooms/' + (typeof ROOM_ID === 'string' ? ROOM_ID : 'teambuilding');
  var mode = configured ? 'firebase' : 'mock';
  var api = {};

  /* ============ FIREBASE ============ */
  function initFirebase() {
    firebase.initializeApp(FIREBASE_CONFIG);
    var db = firebase.database();

    api.on = function (path, cb, onErr) {
      var ref = db.ref(root + '/' + path);
      var h = ref.on('value', function (snap) { cb(snap.val()); },
        function (err) { if (onErr) onErr(err); });
      return function () { ref.off('value', h); };
    };
    api.get = function (path) {
      return db.ref(root + '/' + path).once('value').then(function (s) { return s.val(); });
    };
    api.set = function (path, value) { return db.ref(root + '/' + path).set(value); };
    api.update = function (path, obj) { return db.ref(root + '/' + path).update(obj); };
    api.remove = function (path) { return db.ref(root + '/' + path).remove(); };
    api.onConnection = function (cb) {
      db.ref('.info/connected').on('value', function (s) { cb(!!s.val()); });
    };
  }

  /* ============ LOCAL TEST MODE ============ */
  function initMock() {
    var KEY = 'priceit.mockdb.' + root;
    var listeners = [];
    var chan = null;
    try { chan = new BroadcastChannel('priceit-' + root); } catch (e) { chan = null; }

    function load() {
      try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
    }
    function save(store) {
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
    }
    function dig(store, path) {
      var parts = path.split('/'), cur = store;
      for (var i = 0; i < parts.length; i++) {
        if (cur === null || typeof cur !== 'object') return null;
        cur = cur[parts[i]];
        if (cur === undefined) return null;
      }
      return cur === undefined ? null : cur;
    }
    function put(store, path, value) {
      var parts = path.split('/'), cur = store, i;
      for (i = 0; i < parts.length - 1; i++) {
        if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      if (value === null) delete cur[parts[parts.length - 1]];
      else cur[parts[parts.length - 1]] = value;
    }
    function fireAll() {
      var store = load();
      listeners.forEach(function (l) {
        var v = dig(store, l.path);
        var sig = JSON.stringify(v);
        if (sig !== l.sig) { l.sig = sig; l.cb(v); }
      });
    }
    function broadcast() {
      if (chan) { try { chan.postMessage(Date.now()); } catch (e) {} }
      fireAll();
    }
    if (chan) chan.onmessage = fireAll;
    window.addEventListener('storage', function (e) { if (e.key === KEY) fireAll(); });

    api.on = function (path, cb) {
      var l = { path: path, cb: cb, sig: 'INIT_SENTINEL' };
      listeners.push(l);
      setTimeout(function () { var v = dig(load(), path); l.sig = JSON.stringify(v); cb(v); }, 0);
      return function () { var i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    };
    api.get = function (path) { return Promise.resolve(dig(load(), path)); };
    api.set = function (path, value) {
      var s = load(); put(s, path, value); save(s); broadcast(); return Promise.resolve();
    };
    api.update = function (path, obj) {
      var s = load();
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) put(s, path + '/' + k, obj[k]);
      save(s); broadcast(); return Promise.resolve();
    };
    api.remove = function (path) { return api.set(path, null); };
    api.onConnection = function (cb) { setTimeout(function () { cb(true); }, 0); };
  }

  if (mode === 'firebase') {
    try { initFirebase(); }
    catch (e) { console.error('Firebase init failed, falling back to local mode:', e); mode = 'mock'; initMock(); }
  } else {
    initMock();
  }

  api.mode = mode;
  api.isMock = (mode === 'mock');
  api.root = root;

  /* 訂閱管理：路徑會隨 round 改變，用 key 重新掛載，避免重複監聽 */
  var subs = {};
  api.watch = function (key, path, cb, onErr) {
    if (subs[key]) {
      if (subs[key].path === path) return;
      subs[key].off();
      delete subs[key];
    }
    if (!path) return;
    var off = api.on(path, cb, onErr);
    subs[key] = { path: path, off: off };
  };
  api.unwatch = function (key) {
    if (subs[key]) { subs[key].off(); delete subs[key]; }
  };

  return api;
})();
