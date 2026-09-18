# PRICE IT. — uppeta Team Building 即時鑒價遊戲

多支手機同時加入、即時同步、主持人控制 Reveal。
純 HTML / CSS / Vanilla JS + Firebase Realtime Database，放在 GitHub Pages 就能跑，**不需要任何 server**。

---

## 一、檔案結構

```
price-it/
├── index.html              首頁：JOIN GAME / HOST
├── play.html               參加者（手機）
├── host.html               主持人（桌機投影）
├── css/
│   └── style.css           全站樣式（uppeta 深藍品牌語言）
├── js/
│   ├── firebase-config.js  ★ 唯一需要你修改的檔案
│   ├── game.js             8 個人、8 個 Round、勝負計算
│   ├── db.js               資料庫連線層
│   ├── qrcode.js           QR Code 產生器（自帶，不依賴外部服務）
│   ├── host.js             主持人畫面邏輯
│   └── play.js             參加者畫面邏輯
├── database.rules.json     ★ 要貼到 Firebase 的安全規則
├── README.md               這份說明
├── _e2e.html               （選用）自動跑完整場 8 輪的自我測試頁，平常不用理它
└── _shot.html              （選用）不用 8 支手機也能預覽每個畫面，平常不用理它
```

---

## 二、最快上線路線（大約 15 分鐘）

1. 建立 Firebase 專案 + Realtime Database → **第三節**
2. 把設定貼進 `js/firebase-config.js` → **第四節**
3. 貼上安全規則 → **第五節**
4. 上傳到 GitHub 並開啟 Pages → **第六節**
5. 手機掃 QR Code 測一輪 → **第八節**

---

## 三、建立 Firebase（照著點就好）

1. 打開 <https://console.firebase.google.com> ，用 Google 帳號登入。
2. 點 **建立專案 / Create a project**。
   - 專案名稱輸入 `price-it`（或任何名字）。
   - Google Analytics 選 **不要啟用 / Disable**（比較快，也用不到）。
   - 按建立，等它跑完，按「繼續」。
3. 左側選單找到 **建構 / Build → Realtime Database**，點進去按 **建立資料庫 / Create Database**。
   - 位置：選 **Singapore (asia-southeast1)**，台灣連線最快。
   - 安全規則：先選 **以測試模式啟動 / Start in test mode**，按啟用。
     （等一下我們會在第五節換成正式規則。）
4. 資料庫建好後，畫面上方會有一行網址，長得像：
   ```
   https://price-it-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app
   ```
   **把這行複製起來**，等一下要用。
5. 回到左上角齒輪 ⚙ → **專案設定 / Project settings**。
6. 往下捲到 **你的應用程式 / Your apps**，點那個 **`</>`（網頁）** 圖示。
   - App nickname 輸入 `price-it-web`，**不要**勾 Firebase Hosting，按註冊。
   - 它會給你一段程式碼，裡面有：
     ```js
     const firebaseConfig = {
       apiKey: "AIza....",
       authDomain: "price-it-xxxxx.firebaseapp.com",
       projectId: "price-it-xxxxx",
       storageBucket: "price-it-xxxxx.appspot.com",
       messagingSenderId: "123456789",
       appId: "1:123456789:web:abcdef"
     };
     ```
   - **把 `{ }` 裡面整段複製起來。**

---

## 四、貼上設定（唯一要改的檔案）

用文字編輯器打開 `js/firebase-config.js`，把上面複製的內容填進去。
**特別注意 `databaseURL` 這一行**——Console 給的片段常常沒有這一行，請把第三節第 4 步複製的那行網址貼進去。

改完長這樣（每個人的值都不一樣）：

```js
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD....",
  authDomain:        "price-it-xxxxx.firebaseapp.com",
  databaseURL:       "https://price-it-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "price-it-xxxxx",
  storageBucket:     "price-it-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef"
};

var HOST_PIN = "0926";
var ROOM_ID  = "teambuilding";
```

> 只要 `apiKey` 或 `databaseURL` 還留著 `PASTE_...`，網頁會自動切到
> **LOCAL TEST MODE**（畫面上方出現橘色橫條），那個模式只能在同一台電腦的不同分頁之間同步，
> **手機不會連上**。看到橘色橫條＝設定還沒貼好。

---

## 五、貼上安全規則（讓 Reveal 前價格真的藏得住）

1. Firebase Console → **Realtime Database** → 上方分頁 **規則 / Rules**。
2. 把整個編輯區清空，貼上 `database.rules.json` 的內容：

```json
{
  "rules": {
    "rooms": {
      "$room": {
        "game":      { ".read": true, ".write": true },
        "players":   { ".read": true, ".write": true },
        "submitted": { ".read": true, ".write": true },
        "results":   { ".read": true, ".write": true },

        "guesses": {
          ".write": "!newData.exists()",

          "$round": {
            ".read": "root.child('rooms').child($room).child('game').child('state').val() === 'revealed' || root.child('rooms').child($room).child('game').child('state').val() === 'actual_revealed' || root.child('rooms').child($room).child('game').child('state').val() === 'finished'",
            ".write": "!newData.exists()",

            "$player": {
              ".write": "root.child('rooms').child($room).child('game').child('state').val() === 'collecting'",
              ".validate": "newData.hasChildren(['name','price']) && newData.child('price').isNumber() && newData.child('price').val() > 0 && newData.child('name').isString()"
            }
          }
        }
      }
    }
  }
}
```

3. 按 **發布 / Publish**。

**這條規則做的事**：`guesses`（所有人的出價）在 `gameState` 還是 `collecting` 的時候
**任何人都讀不到**，連用開發者工具硬讀也讀不到；只有主持人按下 REVEAL、
狀態變成 `revealed` 之後才開放讀取。寫入則只在 `collecting` 期間允許，
所以 Reveal 之後沒有人能偷改自己的答案。

> 這是一場內部活動，所以 `game` / `players` 這類控制資料沒有加密碼保護
> （Host PIN 只是避免同事誤入 Host 畫面）。價格保密這件事是靠上面的規則真正鎖住的。

---

## 六、部署到 GitHub Pages

### 用網頁介面（不用裝 git）

1. 到 <https://github.com> 登入 → 右上角 **+ → New repository**。
2. Repository name 填 **`price-it`**，選 **Public**，按 **Create repository**。
3. 進到新的 repo 頁面，點 **uploading an existing file**。
4. 把 `price-it` 資料夾裡的東西拖進去 —— **注意：要拖「資料夾內的檔案」，不要拖整個資料夾**：
   - `index.html`、`play.html`、`host.html`、`README.md`、`database.rules.json`
   - 以及 `css` 資料夾、`js` 資料夾（整個資料夾拖進去，GitHub 會保留結構）
5. 按下方 **Commit changes**。
6. 上方分頁 **Settings** → 左側 **Pages**。
   - Source 選 **Deploy from a branch**
   - Branch 選 **main**，資料夾選 **/ (root)**，按 **Save**。
7. 等 1–2 分鐘，重新整理該頁，會出現網址：
   ```
   https://<你的帳號>.github.io/price-it/
   ```
   這就是唯一要記的網址。

### 如果你會用終端機

```bash
cd price-it
git init
git add .
git commit -m "PRICE IT. team building game"
git branch -M main
git remote add origin https://github.com/<你的帳號>/price-it.git
git push -u origin main
```
然後一樣到 Settings → Pages 開啟。

---

## 七、本機測試（上線前先排練）

在 `price-it` 資料夾打開終端機，執行：

```bash
python3 -m http.server 8000
```

瀏覽器打開 <http://localhost:8000/> 。
（**不要**直接用滑鼠雙擊 html 檔案打開，`file://` 會讓 Firebase 連不上。）

想模擬多人：開一個一般視窗當 Host，再開 2–3 個**無痕視窗**當參加者
（每個無痕視窗有獨立的 localStorage，等於不同的手機）。

測完要停掉伺服器，在終端機按 `Ctrl + C`。

---

## 八、現場流程（主持人照著做）

### 開場

1. 桌機接投影，開 `https://<你的帳號>.github.io/price-it/` → 按 **HOST** → 輸入 PIN **0926**。
2. 大螢幕出現 **PRICE IT.** 和 QR Code。
3. 請大家用手機掃 QR Code（或直接輸入畫面上那行網址）。
4. 每個人點自己的名字。大螢幕右下角會即時亮起 8 個名字。
   - 名字選過就會記住，**整場不用再選第二次**。
5. 八個人都亮了 → 按 **START ROUND**。

### 每一輪

| 步驟 | 大螢幕 | 你要做的事 |
|---|---|---|
| 1 | ROUND 01 / 08 · THIS ROUND **Koi** | 請 Koi 拿出禮物，分享 1 分鐘（不能講價格） |
| 2 | `0 / 7` 逐漸增加，右邊列出誰完成了 | 等大家出價；分享者手機上沒有輸入框，不用管他 |
| 3 | `7 / 7` · **ALL LOCKED IN.** | 喊「3、2、1、開價！」 |
| 4 | — | 按 **REVEAL** |
| 5 | 7 張價格卡同時出現 | 請分享者公布實際價格 |
| 6 | 下方 **ACTUAL PRICE** 輸入框 | 輸入實際價格，按 **REVEAL ACTUAL PRICE** |
| 7 | 最接近的人變成白色卡片，下方顯示 CLOSEST / DIFFERENCE | 恭喜他 |
| 8 | — | 按 **NEXT ROUND** |

所有手機會**自動**跟著進入下一輪，沒有人需要重新整理或重新加入。

### 鍵盤快速鍵（主持人）

按 **空白鍵** = 執行目前畫面的主要動作
（等待中→START ROUND、收集中→REVEAL、Reveal 後→跳到價格輸入框、公布後→NEXT ROUND）。

### 結束

第 8 輪按 **NEXT ROUND**（此時會顯示 **FINISH GAME**）→
大螢幕出現 **PRICE IT. FINISHED. / THANKS FOR PLAYING** 以及 **PRICE MASTER**（本場贏最多輪的人）。

### 重來

**RESET GAME** → 會先問「確定要重置整場遊戲？」→ 按 **確定重置**。
所有出價、實際價格、勝負紀錄清空，回到第 1 輪，**但大家的身份會保留**，不用重新加入。

---

## 九、8 個 Round 的分享者順序

```
01  Koi        05  Tina
02  小米        06  Haley
03  Chile      07  William
04  Ruth       08  Bonnie
```

當輪分享者自動排除，所以每輪都是 **7 個人出價**。
想改順序或改名單，開 `js/game.js` 最上面兩個清單改就好（兩邊的 `id` 要一致）。

---

## 十、規則細節

- 只能輸入正整數（自動過濾非數字、去掉開頭的 0）。
- **Reveal 前可以改自己的答案**：手機上按「修改我的鑒價」。
- 兩個人差距完全相同 → **兩個人都算本輪 Winner**，兩張卡都會 highlight。
- 有人沒出價也可以 Reveal（那張卡顯示 `—`，不列入計算）。
- 主持人不必等 7/7 才 REVEAL，按鈕隨時可按。

---

## 十一、疑難排解

| 狀況 | 原因 / 解法 |
|---|---|
| 畫面上方有**橘色 LOCAL TEST MODE 橫條** | `js/firebase-config.js` 還沒貼好，手機不會同步。回到第四節。 |
| 左下角顯示 **RECONNECTING** | 網路斷了。等它自己回來；Firebase 會自動重連並補上資料。 |
| 手機按 LOCK IN 沒反應 / 顯示「送出失敗」 | 多半是安全規則貼錯，或目前狀態不是 `collecting`。請主持人確認已按 START ROUND。 |
| 手機一直停在「等待主持人開始這一輪」 | 主持人還沒按 START ROUND，或兩邊 `ROOM_ID` 不一致。 |
| 有人手機換了 / 重新整理後身份跑掉 | 手機右下角按「換人」，重新點自己的名字即可，出價不會受影響。 |
| 想清空重來但不想動 Reset | 把 `js/firebase-config.js` 的 `ROOM_ID` 改成別的字（例如 `teambuilding2`），等於開一個全新房間。 |
| GitHub Pages 打開是 404 | Pages 剛開通要等 1–2 分鐘；確認 `index.html` 在 repo 根目錄，不是包在一層資料夾裡。 |
| QR Code 掃不到 | 投影太小的話請大家改用畫面上顯示的網址手動輸入。 |

---

## 十二、資料結構（給好奇的人）

```
rooms/teambuilding/
├── game
│   ├── round        1 ~ 8
│   ├── state        waiting | collecting | revealed | actual_revealed | finished
│   └── actual       本輪實際價格
├── players/<id>           { name, ts }              誰加入了
├── submitted/r<N>/<id>    true                      誰已完成（不含金額，Reveal 前可公開讀）
├── guesses/r<N>/<id>      { name, price, ts }       金額本體（Reveal 前規則禁止讀取）
└── results/r<N>           { actual, winners[], diff } 每輪結果，用來算 PRICE MASTER
```

把「誰交了」和「交了多少」拆成兩個節點，是為了讓主持人能看到 `5 / 7` 的進度，
同時價格在資料庫層級就是讀不到的——不是只有 UI 藏起來而已。
