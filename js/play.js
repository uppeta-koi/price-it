/* play.js — 參加者手機端 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var ME_KEY = 'priceit.me';
  var me = null;                 // player id
  var game = { round: 1, state: 'waiting', actual: null };
  var submitted = {};
  var guesses = {};
  var results = {};
  var editing = false;
  var lastRound = null;

  if (DB.isMock) $('mockBanner').hidden = false;

  try { me = localStorage.getItem(ME_KEY); } catch (e) { me = null; }
  if (me && !playerById(me)) me = null;

  /* ---------------- 名字選擇 ---------------- */
  function renderNameGrid(playersInRoom) {
    var html = '';
    PLAYERS.forEach(function (p) {
      var taken = playersInRoom && playersInRoom[p.id];
      html += '<button class="namebtn" data-id="' + p.id + '">' +
              '<span>' + p.name + '</span>' +
              '<small>' + (taken ? 'ALREADY JOINED' : '&nbsp;') + '</small></button>';
    });
    $('nameGrid').innerHTML = html;
    Array.prototype.forEach.call($('nameGrid').querySelectorAll('.namebtn'), function (b) {
      b.addEventListener('click', function () { pick(b.getAttribute('data-id')); });
    });
  }

  function pick(id) {
    me = id;
    try { localStorage.setItem(ME_KEY, id); } catch (e) {}
    DB.set('players/' + id, { name: nameOf(id), ts: Date.now() });
    render();
  }

  /* ---------------- 本機記住自己的出價 ---------------- */
  function guessKey(round) { return 'priceit.guess.' + DB.root + '.' + me + '.r' + round; }
  function myLocalPrice(round) {
    try {
      var v = localStorage.getItem(guessKey(round));
      return v === null ? null : parseInt(v, 10);
    } catch (e) { return null; }
  }
  function saveLocalPrice(round, price) {
    try { localStorage.setItem(guessKey(round), String(price)); } catch (e) {}
  }

  /* ---------------- 訂閱 ---------------- */
  DB.on('game', function (v) {
    game = v || { round: 1, state: 'waiting', actual: null };
    if (!game.round) game.round = 1;
    if (!game.state) game.state = 'waiting';
    if (lastRound !== game.round) { lastRound = game.round; editing = false; $('priceInput').value = ''; }
    resubscribe();
    render();
  }, function (err) { console.error('game read failed', err); });

  /* 先用本機名單立刻畫出 8 個名字：網路慢或 Firebase 還沒回應時也選得到，
     資料回來後再補上「ALREADY JOINED」標記。 */
  renderNameGrid({});

  DB.on('players', function (v) { renderNameGrid(v || {}); render(); });
  DB.on('results', function (v) { results = v || {}; render(); });

  function resubscribe() {
    var r = game.round;
    DB.watch('submitted', 'submitted/r' + r, function (v) { submitted = v || {}; render(); });
    var open = (game.state === 'revealed' || game.state === 'actual_revealed' || game.state === 'finished');
    if (open) {
      DB.watch('guesses', 'guesses/r' + r, function (v) { guesses = v || {}; render(); },
        function (err) { console.error('guesses read failed', err); });
    } else {
      DB.unwatch('guesses');
      guesses = {};
    }
  }

  /* ---------------- render ---------------- */
  function show(id, on) { $(id).hidden = !on; }

  function render() {
    var round = game.round, st = game.state;
    var pres = presenterOf(round);
    var list = guessersOf(round);
    var iAmPresenter = (me === pres);
    var iSubmitted = !!(me && submitted[me]);

    $('whoami').innerHTML = me ? ('YOU &nbsp; <b>' + nameOf(me) + '</b>') : 'NOT JOINED';
    $('btnSwitch').hidden = !me;
    $('roundTag').textContent = me ? ('ROUND ' + pad2(round) + ' / ' + pad2(TOTAL_ROUNDS)) : 'PRICE IT.';

    var noName = !me;
    show('viewName', noName);
    if (noName) {
      ['viewStandby', 'viewPresenter', 'viewGuess', 'viewLocked', 'viewRevealed', 'viewFinished']
        .forEach(function (v) { show(v, false); });
      return;
    }

    var v = 'standby';
    if (st === 'finished') v = 'finished';
    else if (st === 'revealed' || st === 'actual_revealed') v = 'revealed';
    else if (st === 'collecting') {
      if (iAmPresenter) v = 'presenter';
      else if (iSubmitted && !editing) v = 'locked';
      else v = 'guess';
    }

    show('viewStandby', v === 'standby');
    show('viewPresenter', v === 'presenter');
    show('viewGuess', v === 'guess');
    show('viewLocked', v === 'locked');
    show('viewRevealed', v === 'revealed');
    show('viewFinished', v === 'finished');

    var done = 0;
    list.forEach(function (p) { if (submitted[p.id]) done++; });

    if (v === 'presenter') {
      $('presRound').textContent = pad2(round);
      $('presProgress').textContent = '目前 ' + done + ' / ' + list.length + ' 已完成鑒價' +
        (done === list.length ? ' — 全部完成，等主持人開價。' : '');
    }

    if (v === 'guess') {
      $('guessRound').textContent = pad2(round);
      $('guessPresenter').textContent = nameOf(pres);
      $('btnLock').textContent = editing ? 'Update →' : 'Lock in →';
      $('guessHint').textContent = editing ? '改完按 Update，Reveal 前都可以改' : '只能輸入正整數';
    }

    if (v === 'locked') {
      var p = myLocalPrice(round);
      var known = !(p === null || isNaN(p));
      $('lockedCur').hidden = !known;
      $('lockedPrice').textContent = known ? money(p) : '已送出';
      $('lockedWait').textContent = (done >= list.length)
        ? '全部完成，等主持人開價…'
        : ('等待其他人完成鑒價… ' + done + ' / ' + list.length);
    }

    if (v === 'revealed') renderRevealed(round, list);

    if (v === 'finished') {
      var wins = 0, total = 0;
      for (var k in results) {
        if (!Object.prototype.hasOwnProperty.call(results, k)) continue;
        total++;
        var w = results[k] && results[k].winners;
        if (w && w.indexOf(me) >= 0) wins++;
      }
      $('myScore').textContent = '你在 ' + total + ' 個回合中，贏下 ' + wins + ' 次最接近。';
    }
  }

  function renderRevealed(round, list) {
    var isActual = (game.state === 'actual_revealed');
    var res = results['r' + round] || {};
    var winners = (isActual && res.winners) ? res.winners : [];

    $('revealTitle').textContent = isActual ? 'RESULT.' : '開價！';
    $('actualBlock').hidden = !isActual;
    if (isActual) {
      $('actualPrice').textContent = money(Number(game.actual));
      var names = winners.map(nameOf).join(' + ');
      $('closestLine').textContent = winners.length
        ? ('最接近：' + names + '（差 NT$' + money(res.diff < 0 ? 0 : res.diff) + '）')
        : '—';
    }

    var html = '';
    list.forEach(function (p) {
      var g = guesses[p.id];
      var has = g && typeof g.price === 'number';
      var win = winners.indexOf(p.id) >= 0;
      html += '<div class="prow' + (win ? ' win' : '') + (has ? '' : ' dim') + '">' +
              '<span class="n">' + p.name + '</span>' +
              '<span class="v num">' + (has ? 'NT$' + money(g.price) : '—') + '</span></div>';
    });
    $('revealList').innerHTML = html;
  }

  /* ---------------- 出價 ---------------- */
  var input = $('priceInput');
  input.addEventListener('input', function () {
    var v = input.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    if (v.length > 9) v = v.slice(0, 9);
    input.value = v;
  });
  input.addEventListener('focus', function () {
    $('moneyBox').classList.add('focus');
    setTimeout(function () {
      try { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }, 250);
  });
  input.addEventListener('blur', function () { $('moneyBox').classList.remove('focus'); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); lockIn(); } });
  $('btnLock').addEventListener('click', lockIn);

  function lockIn() {
    var raw = input.value.replace(/[^0-9]/g, '');
    var price = parseInt(raw, 10);
    if (!(price > 0)) {
      $('guessHint').textContent = '請輸入大於 0 的整數金額';
      input.focus();
      return;
    }
    var round = game.round;
    $('btnLock').disabled = true;
    Promise.all([
      DB.set('guesses/r' + round + '/' + me, { name: nameOf(me), price: price, ts: Date.now() }),
      DB.set('submitted/r' + round + '/' + me, true)
    ]).then(function () {
      saveLocalPrice(round, price);
      editing = false;
      input.blur();
      $('btnLock').disabled = false;
      render();
    }).catch(function (err) {
      console.error('submit failed', err);
      $('guessHint').textContent = '送出失敗，請再按一次';
      $('btnLock').disabled = false;
    });
  }

  $('btnEdit').addEventListener('click', function () {
    editing = true;
    var p = myLocalPrice(game.round);
    input.value = (p === null || isNaN(p)) ? '' : String(p);
    render();
    setTimeout(function () { input.focus(); }, 60);
  });

  $('btnSwitch').addEventListener('click', function () {
    try { localStorage.removeItem(ME_KEY); } catch (e) {}
    me = null;
    editing = false;
    render();
  });

  render();
})();
