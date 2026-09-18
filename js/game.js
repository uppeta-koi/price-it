/* game.js — 共用常數與小工具（host 與 participant 都會載入） */

/* 參加者名單。順序 = 手機上名字按鈕的排列順序，也是主持人挑選分享者時的預設順序。
   要加人或改名，改這裡就好（id 只能用英文小寫，且不能重複）。 */
var PLAYERS = [
  { id: 'luis',    name: 'Luis' },
  { id: 'hc',      name: 'HC' },
  { id: 'koi',     name: 'Koi' },
  { id: 'xiaomi',  name: 'Mii' },
  { id: 'chile',   name: 'Chile' },
  { id: 'ruth',    name: 'Ruth' },
  { id: 'tina',    name: 'Tina' },
  { id: 'haley',   name: 'Haley' },
  { id: 'william', name: 'William' },
  { id: 'bonnie',  name: 'Bonnie' }
];

/* 總共幾輪。預設 = 每個人都分享一次。
   如果有人不分享禮物，不用改這裡：主持人隨時可以按 FINISH GAME 提早結束。 */
var TOTAL_ROUNDS = PLAYERS.length;

function playerById(id) {
  for (var i = 0; i < PLAYERS.length; i++) if (PLAYERS[i].id === id) return PLAYERS[i];
  return null;
}
function nameOf(id) { var p = playerById(id); return p ? p.name : (id || '—'); }

/* 這一輪出價的人 = 除了分享者以外的所有人 */
function guessersOf(presenterId) {
  return PLAYERS.filter(function (p) { return p.id !== presenterId; });
}

/* 主持人挑選分享者時的預設建議：名單順序中第一個還沒分享過的人 */
function suggestPresenter(presented) {
  presented = presented || {};
  for (var i = 0; i < PLAYERS.length; i++) {
    if (!presented[PLAYERS[i].id]) return PLAYERS[i].id;
  }
  return PLAYERS[0].id;
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

/* 價格卡的分列方式：盡量兩排、上排不少於下排，且一排最多 5 張 */
function splitRows(n) {
  if (n <= 5) return [n, 0];
  var top = Math.ceil(n / 2);
  if (top > 5) top = 5;
  return [top, n - top];
}

/* 一排最多幾張卡（用來決定卡片寬度與字級） */
function maxCols(n) {
  var r = splitRows(n);
  return Math.max(r[0], r[1]) || 1;
}
