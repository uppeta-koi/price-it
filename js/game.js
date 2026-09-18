/* game.js — 共用常數與小工具（host 與 participant 都會載入） */

var PLAYERS = [
  { id: 'koi',     name: 'Koi' },
  { id: 'xiaomi',  name: '小米' },
  { id: 'chile',   name: 'Chile' },
  { id: 'ruth',    name: 'Ruth' },
  { id: 'tina',    name: 'Tina' },
  { id: 'haley',   name: 'Haley' },
  { id: 'william', name: 'William' },
  { id: 'bonnie',  name: 'Bonnie' }
];

/* 8 個 Round 的分享者順序（依序對應 Round 01 ~ 08） */
var ROUND_ORDER = ['koi', 'xiaomi', 'chile', 'ruth', 'tina', 'haley', 'william', 'bonnie'];
var TOTAL_ROUNDS = ROUND_ORDER.length;

function playerById(id) {
  for (var i = 0; i < PLAYERS.length; i++) if (PLAYERS[i].id === id) return PLAYERS[i];
  return null;
}
function nameOf(id) { var p = playerById(id); return p ? p.name : id; }
function presenterOf(round) { return ROUND_ORDER[(round - 1) % TOTAL_ROUNDS]; }
function guessersOf(round) {
  var pres = presenterOf(round);
  return PLAYERS.filter(function (p) { return p.id !== pres; });
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function money(n) { return Number(n).toLocaleString('en-US'); }

/* 依規則挑出「與實際價格差距最小」的人（可能並列） */
function computeWinners(guesses, actual) {
  var best = Infinity, winners = [];
  for (var id in guesses) {
    if (!Object.prototype.hasOwnProperty.call(guesses, id)) continue;
    var g = guesses[id];
    if (!g || typeof g.price !== 'number') continue;
    var d = Math.abs(g.price - actual);
    if (d < best) { best = d; winners = [id]; }
    else if (d === best) { winners.push(id); }
  }
  return { winners: winners, diff: (best === Infinity ? null : best) };
}

/* 4 + 3 置中的分列規則（少於等於 4 人時只排一列） */
function splitRows(n) {
  if (n <= 4) return [n, 0];
  var top = Math.min(4, Math.ceil(n / 2));
  return [top, n - top];
}
