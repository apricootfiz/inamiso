/* ===============================
   設定
================================ */
const parts = location.pathname.split('/').filter(Boolean);
const year = parts.at(-2);
const month = Number(parts.at(-1)) - 1;
const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:csv";

/* ===============================
   YouTube動画ID抽出
================================ */
function extractVideoId(url) {
  if (!url) return null;
  try { url = decodeURIComponent(url); } catch (e) {}

  const patterns = [
    /youtube\.com\/watch\?v=([0-9A-Za-z_-]{11})/,
    /youtube\.com\/live\/([0-9A-Za-z_-]{11})/,
    /youtu\.be\/([0-9A-Za-z_-]{11})/
  ];

  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/* ===============================
   日付正規化
================================ */
function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr.trim();
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

      const dateRaw    = (cols[0] || "").replace(/^"|"$/g, "").trim();
      const commentRaw = (cols[1] || "").replace(/^"|"$/g, "").trim();
      const urlRaw     = (cols[2] || "").replace(/^"|"$/g, "").trim();

      if (!dateRaw) return;

      const date = normalizeDate(dateRaw);

      if (!dayMap[date]) {
        dayMap[date] = { videos: [], comments: [] };
      }

      if (commentRaw) {
        dayMap[date].comments.push(commentRaw);
      }

      if (urlRaw && /^https?:\/\//i.test(urlRaw)) {
        const videoId = extractVideoId(urlRaw);
        if (videoId) {
          dayMap[date].videos.push({
            id: videoId,
            url: urlRaw
          });
        }
      }
    });

    renderCalendar(dayMap);
  });

/* ===============================
   カレンダー描画
================================ */
function renderCalendar(dayMap) {
  const calendar = document.getElementById("calendar");

  for (let day = 1; day <= 31; day++) {
    const dateObj = new Date(year, month, day);
    const weekDay = weekDays[dateObj.getDay()];
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const div = document.createElement("div");
    div.className = "day";

    if (weekDay === "日") div.classList.add("sun");
    if (weekDay === "土") div.classList.add("sat");

    div.innerHTML = `<strong>${day}（${weekDay}）</strong>`;

    if (dayMap[dateStr]) {
      const { videos, comments } = dayMap[dateStr];

      if (comments.length) {
        const commentBox = document.createElement("div");
        commentBox.className = "comments";
        comments.forEach(text => {
          const p = document.createElement("div");
          p.textContent = "・" + text;
          commentBox.appendChild(p);
        });
        div.appendChild(commentBox);
      }

      if (videos.length) {
        const thumbs = document.createElement("div");
        thumbs.className = "thumbs";

        videos.forEach(v => {
          const img = document.createElement("img");
          img.src = `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`;
          img.onclick = () => window.open(v.url, "_blank");
          thumbs.appendChild(img);
        });

        div.appendChild(thumbs);
      }
    }

    calendar.appendChild(div);
  }
}
