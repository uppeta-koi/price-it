/* host.js — 主持人大螢幕 + 全場控制 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- PIN gate ---------------- */
  var GATE_KEY = 'priceit.host.ok';
  function openHost() {
    $('gate').hidden = true;
    $('stage').hidden = false;
    start();
  }
  function tryPin() {
    if ($('pinInput').value.trim() === String(HOST_PIN)) {
      try { sessionStorage.setItem(GATE_KEY, '1'); } catch (e) {}
      openHost();
    } else {
      $('pinErr').textContent = 'PIN 不正確';
      $('pinInput').value = '';
      $('pinInput').focus();
    }
  }
  $('pinBtn').addEventListener('click', tryPin);
  $('pinInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPin(); });

  var alreadyIn = false;
  try { alreadyIn = sessionStorage.getItem(GATE_KEY) === '1'; } catch (e) {}
  if (alreadyIn) { openHost(); } else { setTimeout(function () { $('pinInput').focus(); }, 60); }

  /* ---------------- state ---------------- */
  var game = { round: 1, state: 'waiting', actual: null };
  var players = {};
  var submitted = {};
  var guesses = {};
  var results = {};
  var started = false;

  function start() {
    if (started) return;
    started = true;

    if (DB.isMock) $('mockBanner').hidden = false;

    /* join URL + QR */
    var base = location.origin + location.pathname.replace(/[^\/]*$/, '');
    var joinUrl = base + 'play.html';
    $('joinUrl').textContent = joinUrl.replace(/^https?:\/\//, '');
    try {
      QRCode.render($('qrbox'), joinUrl, { size: 300, margin: 2, dark: '#20374F' });
    } catch (e) {
      $('qrbox').innerHTML = '<div style="color:#20374F;font:12px sans-serif;padding:20px">QR 產生失敗<br>請直接輸入網址</div>';
    }

    DB.onConnection(function (ok) {
      $('connDot').className = 'dot' + (ok ? '' : ' off');
      $('connText').textContent = ok
        ? (DB.isMock ? 'LOCAL TEST MODE' : 'LIVE · ' + Object.keys(players).length + ' JOINED')
        : 'RECONNECTING';
    });

    DB.on('game', function (v) {
      game = v || { round: 1, state: 'waiting', actual: null };
      if (!game.round) game.round = 1;
      if (!game.state) game.state = 'waiting';
      resubscribe();
      render();
    }, function (err) { console.error('game read failed', err); });

    DB.on('players', function (v) { players = v || {}; render(); });
    DB.on('results', function (v) { results = v || {}; render(); });

    bindControls();

    /* 先畫一次預設畫面：Firebase 還沒回應時，投影幕也不會是一片空白 */
    render();
  }

  function resubscribe() {
    var r = game.round;
    DB.watch('submitted', 'submitted/r' + r, function (v) { submitted = v || {}; render(); });

    var canReadGuesses = (game.state === 'revealed' || game.state === 'actual_revealed' || game.state === 'finished');
    if (canReadGuesses) {
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

    $('roundLabel').textContent = 'ROUND ' + pad2(round) + ' / ' + pad2(TOTAL_ROUNDS);
    $('presenterLabel').innerHTML = 'THIS ROUND &nbsp; <b>' + nameOf(pres) + '</b>';
    $('presenterLabel').hidden = (st === 'waiting' || st === 'finished');
    $('roundLabel').hidden = (st === 'finished');

    show('viewLobby', st === 'waiting');
    show('viewCollect', st === 'collecting');
    show('viewReveal', st === 'revealed' || st === 'actual_revealed');
    show('viewFinish', st === 'finished');

    if (st === 'waiting') renderLobby();
    if (st === 'collecting') renderCollect(round, list);
    if (st === 'revealed' || st === 'actual_revealed') renderReveal(round, list);
    if (st === 'finished') renderFinish();

    /* controls */
    show('btnStart', st === 'waiting');
    show('btnReveal', st === 'collecting');
    show('actualForm', st === 'revealed');
    show('actualSummary', st === 'actual_revealed');
    show('btnNext', st === 'actual_revealed');
    $('btnNext').textContent = (round >= TOTAL_ROUNDS) ? 'Finish game' : 'Next round';

    if (!DB.isMock && $('connText').textContent.indexOf('LIVE') === 0) {
      $('connText').textContent = 'LIVE · ' + Object.keys(players).length + ' JOINED';
    }
  }

  function renderLobby() {
    var html = '';
    PLAYERS.forEach(function (p) {
      var inRoom = !!players[p.id];
      html += '<div class="chip' + (inRoom ? ' in' : '') + '">' +
              '<span>' + p.name + '</span>' +
              '<span class="tick">' + (inRoom ? '✓' : '') + '</span></div>';
    });
    $('lobbyRoster').innerHTML = html;
  }

  function renderCollect(round, list) {
    var done = 0, html = '';
    list.forEach(function (p) {
      var ok = !!submitted[p.id];
      if (ok) done++;
      html += '<div class="status-row' + (ok ? ' done' : '') + '">' +
              '<span>' + p.name + '</span><span class="mk">' + (ok ? '✓' : '—') + '</span></div>';
    });
    $('statusList').innerHTML = html;
    $('progN').textContent = done;
    $('progD').textContent = '/ ' + list.length;
    $('progBar').style.width = (list.length ? (done / list.length * 100) : 0) + '%';
    $('collectSub').textContent = '分享者：' + nameOf(presenterOf(round)) + '（本輪不出價）';

    var all = done === list.length && list.length > 0;
    $('progCap').textContent = all ? 'ALL LOCKED IN.' : '已完成鑒價 · WAITING FOR EVERYONE…';
    $('btnReveal').className = 'btn solid' + (all ? '' : '');
  }

  function renderReveal(round, list) {
    var actual = (game.state === 'actual_revealed') ? Number(game.actual) : null;
    var res = results['r' + round] || {};
    var winners = (game.state === 'actual_revealed' && res.winners) ? res.winners : [];

    $('revealHead').textContent = (actual === null) ? 'ALL PRICES' : 'ACTUAL NT$' + money(actual);

    var rows = splitRows(list.length);
    var html1 = '', html2 = '', i = 0;
    list.forEach(function (p) {
      var g = guesses[p.id];
      var has = g && typeof g.price === 'number';
      var win = winners.indexOf(p.id) >= 0;
      var diffTxt = '';
      if (actual !== null && has) diffTxt = (win ? 'CLOSEST · ' : '') + 'Δ NT$' + money(Math.abs(g.price - actual));
      var card =
        '<div class="card' + (win ? ' win' : '') + (has ? '' : ' miss') + '" style="animation-delay:.02s">' +
          '<div class="nm">' + p.name + '</div>' +
          '<div>' +
            '<div class="pr num">' + (has ? '<small>NT$</small>' + money(g.price) : '—') + '</div>' +
            '<div class="df">' + diffTxt + '</div>' +
          '</div>' +
        '</div>';
      if (i < rows[0]) html1 += card; else html2 += card;
      i++;
    });
    $('row1').innerHTML = html1;
    $('row2').innerHTML = html2;
    $('row2').hidden = (rows[1] === 0);

    if (game.state === 'actual_revealed') {
      $('sumActual').textContent = 'NT$' + money(actual);
      var names = winners.map(function (id) { return nameOf(id); }).join(' + ');
      var wp = winners.length && guesses[winners[0]] ? guesses[winners[0]].price : null;
      $('sumClosest').textContent = winners.length ? (names + '  ·  NT$' + money(wp)) : '—';
      $('sumDiff').textContent = (res.diff === null || res.diff === undefined) ? '—' : 'NT$' + money(res.diff);
    }
  }

  function renderFinish() {
    var tally = {};
    for (var k in results) {
      if (!Object.prototype.hasOwnProperty.call(results, k)) continue;
      var w = results[k] && results[k].winners;
      if (!w) continue;
      w.forEach(function (id) { tally[id] = (tally[id] || 0) + 1; });
    }
    var best = 0, champs = [];
    for (var id in tally) {
      if (tally[id] > best) { best = tally[id]; champs = [id]; }
      else if (tally[id] === best) champs.push(id);
    }
    if (best > 0) {
      $('masterBlock').hidden = false;
      $('masterName').textContent = champs.map(nameOf).join('  ·  ');
      $('masterWins').textContent = best + (best === 1 ? ' WIN' : ' WINS');
    } else {
      $('masterBlock').hidden = true;
    }
  }

  /* ---------------- controls ---------------- */
  function bindControls() {
    $('btnStart').addEventListener('click', function () {
      DB.update('game', { round: game.round || 1, state: 'collecting', actual: null });
    });

    $('btnReveal').addEventListener('click', function () {
      DB.update('game', { state: 'revealed' });
    });

    var ai = $('actualInput');
    ai.addEventListener('input', function () {
      var v = ai.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
      ai.value = v;
    });
    ai.addEventListener('keydown', function (e) { if (e.key === 'Enter') doActual(); });
    $('btnActual').addEventListener('click', doActual);

    function doActual() {
      var v = parseInt(ai.value.replace(/[^0-9]/g, ''), 10);
      if (!(v > 0)) { ai.focus(); return; }
      var round = game.round;
      DB.get('guesses/r' + round).then(function (g) {
        g = g || {};
        var w = computeWinners(g, v);
        return DB.set('results/r' + round, {
          actual: v, winners: w.winners, diff: (w.diff === null ? -1 : w.diff)
        }).then(function () {
          return DB.update('game', { actual: v, state: 'actual_revealed' });
        });
      }).then(function () { ai.value = ''; })
        .catch(function (err) { console.error('actual price failed', err); alertLine('寫入失敗，請再按一次'); });
    }

    $('btnNext').addEventListener('click', function () {
      var round = game.round;
      if (round >= TOTAL_ROUNDS) {
        DB.update('game', { state: 'finished' });
        return;
      }
      var n = round + 1;
      Promise.all([DB.remove('guesses/r' + n), DB.remove('submitted/r' + n)])
        .then(function () {
          return DB.update('game', { round: n, state: 'collecting', actual: null });
        })
        .catch(function (err) { console.error('next round failed', err); });
    });

    /* Reset with inline confirmation (no blocking browser dialog) */
    var btnReset = $('btnReset');
    var confirmWrap = document.createElement('span');
    confirmWrap.className = 'ctrl-group';
    confirmWrap.hidden = true;
    confirmWrap.innerHTML =
      '<span class="eyebrow" style="color:#F2B8A0">確定要重置整場遊戲？</span>' +
      '<button class="btn ghost" id="resetYes">確定重置</button>' +
      '<button class="btn ghost" id="resetNo">取消</button>';
    btnReset.parentNode.appendChild(confirmWrap);

    btnReset.addEventListener('click', function () {
      confirmWrap.hidden = false; btnReset.hidden = true;
    });
    confirmWrap.querySelector('#resetNo').addEventListener('click', function () {
      confirmWrap.hidden = true; btnReset.hidden = false;
    });
    confirmWrap.querySelector('#resetYes').addEventListener('click', function () {
      confirmWrap.hidden = true; btnReset.hidden = false;
      Promise.all([DB.remove('guesses'), DB.remove('submitted'), DB.remove('results')])
        .then(function () {
          return DB.set('game', { round: 1, state: 'waiting', actual: null });
        })
        .catch(function (err) { console.error('reset failed', err); });
    });
  }

  function alertLine(msg) {
    $('connText').textContent = msg;
    setTimeout(function () { $('connText').textContent = DB.isMock ? 'LOCAL TEST MODE' : 'LIVE'; }, 2500);
  }

  /* keyboard shortcuts for the host: space = primary action */
  document.addEventListener('keydown', function (e) {
    if ($('stage').hidden) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (game.state === 'waiting') $('btnStart').click();
      else if (game.state === 'collecting') $('btnReveal').click();
      else if (game.state === 'revealed') $('actualInput').focus();
      else if (game.state === 'actual_revealed') $('btnNext').click();
    }
  });
})();
