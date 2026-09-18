/* =====================================================================
   FIREBASE 設定 —— 已填好，正常情況下不需要再改。
   （來源：Firebase Console → 專案設定 → 一般 → 你的應用程式）
   ===================================================================== */

var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAswFmVjohV8lGr03S4_8iJ5rAFAdZo7fE",
  authDomain:        "price-it-8a4a4.firebaseapp.com",
  databaseURL:       "https://price-it-8a4a4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "price-it-8a4a4",
  storageBucket:     "price-it-8a4a4.firebasestorage.app",
  messagingSenderId: "845815508309",
  appId:             "1:845815508309:web:5ea5883e23ffb24f6553dc"
};

/* 主持人 PIN —— 想改就改這四個數字 */
var HOST_PIN = "0926";

/* 這場活動在資料庫裡的房間名稱。
   同一個 Firebase 專案要辦第二場（或想整個清空重來）時，把它改成別的字即可。 */
var ROOM_ID = "teambuilding";
