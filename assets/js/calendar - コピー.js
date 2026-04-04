/* ===============================
   URLから 年・月 を取得
================================ */
// 例: assets/calendar/2026/01/
const parts = location.pathname.split("/").filter(Boolean);

const year  = Number(parts.at(-2));
const month = Number(parts.at(-1)) - 1; // JSは0始まり

const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
const daysInMonth = new Date(year, month + 1, 0).getDate();

/* ===============================
   タイトル自動設定
================================ */
const titleEl = document.getElementById("title");
if (titleEl) {
  titleEl.textContent = `${year}年${month + 1}月`;
}

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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

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

    // 日付
    const dateEl = document.createElement("div");
    dateEl.className = "date";
    const w = new Date(year, month, d).getDay();
    dateEl.textContent = `${d} (${week[w]})`;
    cell.appendChild(dateEl);

    const data = dayMap[dateKey];

    if (data) {

      // ★ 1行＝1セットで順番保持
      data.forEach(item => {

        // タイトル（あれば表示）
        if (item.comment) {
          const comment = document.createElement("div");
          comment.className = "comment";
          comment.textContent = `・${item.comment}`;
          cell.appendChild(comment);
        }

        // 動画（あれば表示）
        if (item.videoId) {
          const a = document.createElement("a");
          a.href = `https://www.youtube.com/watch?v=${item.videoId}`;
          a.target = "_blank";

          const img = document.createElement("img");
          img.src = `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;

          a.appendChild(img);
          cell.appendChild(a);
        }
      });
    }

    calendar.appendChild(cell);
  }
}