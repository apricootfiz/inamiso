/* ===============================
   URLから 年・月 を取得
================================ */
function getMonthFromURL() {
  // ① ?month=2026-03
  const params = new URLSearchParams(window.location.search);
  const m = params.get("month");

  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1);
  }

  // ② /calendar/2026/03/
  const parts = location.pathname.split("/").filter(Boolean);

  const year  = Number(parts.at(-2));
  const month = Number(parts.at(-1));

  if (!isNaN(year) && !isNaN(month)) {
    return new Date(year, month - 1, 1);
  }

  // ③ fallback
  return new Date();
}

let currentDate = getMonthFromURL();

const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

/* ===============================
   Google Spreadsheet CSV URL
================================ */
const sheetUrl =
  `https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:csv`;

/* ===============================
   YouTube動画ID抽出
================================ */
function extractVideoId(url) {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) {
        return u.searchParams.get("v");
      }

      if (u.pathname.startsWith("/live/")) {
        return u.pathname.split("/live/")[1];
      }
    }

    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1);
    }

  } catch (e) {
    return null;
  }
  return null;
}

/* ===============================
   日付正規化
================================ */
function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ===============================
   CSV取得 & パース
================================ */
fetch(sheetUrl)
  .then(res => res.text())
  .then(csv => {
    const lines = csv.split(/\r?\n/).slice(1);
    const dayMap = {};

    lines.forEach(line => {
      if (!line.trim()) return;

      const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      if (!cols) return;

      const dateRaw = (cols[0] || "").replace(/^"|"$/g, "").trim();
      const commentRaw = (cols[1] || "").replace(/^"|"$/g, "").trim();
      const urlRaw = (cols[2] || "").replace(/^"|"$/g, "").trim();

      // ★ 空行完全ガード（タイトルもURLもない行は無視）
      if (!commentRaw && !urlRaw) return;

      const date = normalizeDate(dateRaw);
      if (!date) return;

      if (!dayMap[date]) {
        dayMap[date] = [];
      }

      let videoId = null;

      if (/^https?:\/\//i.test(urlRaw)) {
        videoId = extractVideoId(urlRaw);
      }

      // ★ タイトルのみでも保持
      dayMap[date].push({
        comment: commentRaw || "",
        videoId: videoId || null
      });
    });

    renderCalendar(dayMap);
  });

/* ===============================
   カレンダー描画
================================ */
function renderCalendar(dayMap) {
  const calendar = document.getElementById("calendar");
  if (!calendar) return;

  calendar.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();

  const startDay = firstDay.getDay();

  // 空白セル
  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement("div");
    empty.className = "day empty";
    calendar.appendChild(empty);
  }

  const week = ["日", "月", "火", "水", "木", "金", "土"];

  // 日付セル
  for (let d = 1; d <= lastDate; d++) {

    const dateKey =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    const cell = document.createElement("div");
    cell.className = "day";

    // 日付表示エリアの作成
    const dateEl = document.createElement("div");
    dateEl.className = "date";
    
    const w = new Date(year, month, d).getDay(); // 曜日を取得 (0:日, 6:土)
    dateEl.textContent = `${d} (${week[w]})`;

    // 土日の判定をして背景色用のクラスを付与
    if (w === 0) {
      dateEl.classList.add("sun"); // 日曜日のクラス
    } else if (w === 6) {
      dateEl.classList.add("sat"); // 土曜日のクラス
    }
    
    cell.appendChild(dateEl);

    const data = dayMap[dateKey];

    if (data) {

      // ★ 1行＝1セットで順番保持
      data.forEach(item => {
      
      // ★ タイトルと画像を包む枠（コンテナ）を作成
      const itemContainer = document.createElement("div");
      itemContainer.className = "schedule-item";
      
        // タイトル（あれば表示）
        if (item.comment) {
          const comment = document.createElement("div");
          comment.className = "comment";
          comment.textContent = `${item.comment}`;
          itemContainer.appendChild(comment);
        }

        // 動画（あれば表示）
        if (item.videoId) {
          const a = document.createElement("a");
          a.href = `https://www.youtube.com/watch?v=${item.videoId}`;
          a.target = "_blank";

          const img = document.createElement("img");
          img.src = `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;

          a.appendChild(img);
          itemContainer.appendChild(a);
        }
        
        // 最後に、枠ごと cell に追加
        cell.appendChild(itemContainer);
      });
    }

	// 最後にナビゲーションを更新
	  updateNavigation();
	  
	  // タイトルも更新[cite: 1]
	  const titleEl = document.getElementById("title");
	  if (titleEl) {
	    titleEl.textContent = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
	  }

    calendar.appendChild(cell);
  }

/* ===============================
   タイトル自動設定
================================ */
const titleEl = document.getElementById("title");
if (titleEl) {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();

  titleEl.textContent = `${y}年${m + 1}月`;
  }
  

/* ===============================
   翌月設定
================================ */
function updateTitle() {
  const titleEl = document.getElementById("title");
  if (!titleEl) return;

  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();

  titleEl.textContent = `${y}年${m + 1}月`;
  }
  

/* ===============================
   前月・翌月リンクの更新
================================ */
function updateNavigation() {
  const prevLink = document.getElementById("prevLink");
  const nextLink = document.getElementById("nextLink");

  if (!prevLink || !nextLink) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 前月の計算
  const prevDate = new Date(year, month - 1, 1);
  const prevY = prevDate.getFullYear();
  const prevM = String(prevDate.getMonth() + 1).padStart(2, "0");
  // ?month=YYYY-MM 形式のパラメータを設定
  prevLink.href = `?month=${prevY}-${prevM}`;
  prevLink.textContent = `← ${prevY}年${prevM}月`;
  prevLink.style.visibility = "visible"; // 非表示設定を解除

  // 翌月の計算
  const nextDate = new Date(year, month + 1, 1);
  const nextY = nextDate.getFullYear();
  const nextM = String(nextDate.getMonth() + 1).padStart(2, "0");
  nextLink.href = `?month=${nextY}-${nextM}`;
  nextLink.textContent = `${nextY}年${nextM}月 →`;
  nextLink.style.visibility = "visible"; // 非表示設定を解除[cite: 2]
  }


}