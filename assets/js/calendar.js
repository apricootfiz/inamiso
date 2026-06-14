/* ===============================
   配信記録カレンダー
   - 7列固定の月間カレンダー
   - サムネのみ表示
   - タップでその日の配信一覧モーダル表示
================================ */


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

  const year = Number(parts.at(-2));
  const month = Number(parts.at(-1));

  if (!isNaN(year) && !isNaN(month)) {
    return new Date(year, month - 1, 1);
  }

  // ③ fallback
  return new Date();
}

let currentDate = getMonthFromURL();


/* ===============================
   Google Spreadsheet CSV URL
================================ */
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:csv";


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
        return u.pathname.split("/live/")[1].split("?")[0];
      }

      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/shorts/")[1].split("?")[0];
      }
    }

    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("?")[0];
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
   CSV 1行パース
   - カンマ入りタイトル対策
================================ */
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);

  return result.map(v => v.trim());
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

      const cols = parseCsvLine(line);

      const dateRaw = cols[0] || "";
      const commentRaw = cols[1] || "";
      const urlRaw = cols[2] || "";

      // タイトルもURLもない行は無視
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

      dayMap[date].push({
        comment: commentRaw,
        url: urlRaw,
        videoId: videoId
      });
    });

    renderCalendar(dayMap);
  })
  .catch(error => {
    console.error("CSVの取得に失敗しました:", error);

    const calendar = document.getElementById("calendar");
    if (calendar) {
      calendar.innerHTML = `<p class="error-message">配信データを読み込めませんでした。</p>`;
    }
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

  updateTitle();
  updateNavigation();

  const firstDay = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const firstWeekday = firstDay.getDay();

  // 月初前の空白セル
  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "day empty";
    calendar.appendChild(blank);
  }

  // 日付セル
  for (let d = 1; d <= lastDate; d++) {
    const dateObj = new Date(year, month, d);
    const weekday = dateObj.getDay();

    const dateKey =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    const cell = document.createElement("div");
    cell.className = "day";

    if (weekday === 0) cell.classList.add("sun");
    if (weekday === 6) cell.classList.add("sat");

    const dateEl = document.createElement("div");
    dateEl.className = "date";
    dateEl.textContent = d;
    cell.appendChild(dateEl);

    const data = dayMap[dateKey];

    if (data && data.length > 0) {
      cell.classList.add("has-stream");

      // サムネがある配信を優先して1枚だけ表示
      const firstVideo = data.find(item => item.videoId);

      if (firstVideo) {
        const img = document.createElement("img");
        img.className = "calendar-thumb";
        img.src = `https://img.youtube.com/vi/${firstVideo.videoId}/mqdefault.jpg`;
        img.alt = firstVideo.comment || `${dateKey}の配信サムネイル`;
        img.loading = "lazy";

        cell.appendChild(img);
      } else {
        // URLなし・タイトルのみの日
        const noThumb = document.createElement("div");
        noThumb.className = "no-thumb";
        noThumb.textContent = "配信";
        cell.appendChild(noThumb);
      }

      // 複数件ある場合は件数バッジ
      if (data.length > 1) {
        const badge = document.createElement("div");
        badge.className = "count-badge";
        badge.textContent = `+${data.length - 1}`;
        cell.appendChild(badge);
      }

      // タップでモーダル
      cell.addEventListener("click", () => {
        openModal(dateKey, data);
      });
    }

    calendar.appendChild(cell);
  }

  // 最終週の空白セルを追加して見た目を揃える
  const totalCells = firstWeekday + lastDate;
  const remainder = totalCells % 7;

  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      const blank = document.createElement("div");
      blank.className = "day empty";
      calendar.appendChild(blank);
    }
  }
  
  renderStreamList(dayMap);
  
}


/* ===============================
   タイトル更新
================================ */
function updateTitle() {
  const titleEl = document.getElementById("title");
  if (!titleEl) return;

  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;

  titleEl.textContent = `${y}年${m}月`;
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

  const prevDate = new Date(year, month - 1, 1);
  const prevY = prevDate.getFullYear();
  const prevM = String(prevDate.getMonth() + 1).padStart(2, "0");

  prevLink.href = `?month=${prevY}-${prevM}`;
  prevLink.textContent = `← ${prevY}年${prevM}月`;
  prevLink.style.visibility = "visible";

  const nextDate = new Date(year, month + 1, 1);
  const nextY = nextDate.getFullYear();
  const nextM = String(nextDate.getMonth() + 1).padStart(2, "0");

  nextLink.href = `?month=${nextY}-${nextM}`;
  nextLink.textContent = `${nextY}年${nextM}月 →`;
  nextLink.style.visibility = "visible";
}


/* ===============================
   モーダル表示
================================ */
function openModal(dateKey, data) {
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");

  if (!modal || !modalBody) return;

  const [year, month, day] = dateKey.split("-");

  modalBody.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "modal-title";
  title.textContent = `${Number(month)}月${Number(day)}日の配信`;
  modalBody.appendChild(title);

	data.forEach((item, index) => {
	  const block = document.createElement("div");
	  block.className = "modal-item";

	  if (item.videoId) {
	    const a = document.createElement("a");
	    a.href = `https://www.youtube.com/watch?v=${item.videoId}`;
	    a.target = "_blank";
	    a.rel = "noopener noreferrer";

	    const img = document.createElement("img");
	    img.src = `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;
	    img.alt = item.comment || "配信サムネイル";
	    img.className = "modal-thumb";

	    a.appendChild(img);
	    block.appendChild(a);
	  }

	  if (item.comment) {
	    const comment = document.createElement("p");
	    comment.className = "modal-comment";
	    comment.textContent = item.comment;
	    block.appendChild(comment);
	  }

	  /* ===============================
	     自分用メモ
	     - videoIdがある場合はvideoId単位
	     - videoIdがない場合は日付＋連番で保存
	  ================================ */
	  const memoKey = item.videoId
	    ? `streamMemo_${item.videoId}`
	    : `streamMemo_${dateKey}_${index}`;

	  const memoBox = document.createElement("div");
	  memoBox.className = "memo-box";

	  const memoLabel = document.createElement("div");
	  memoLabel.className = "memo-label";
	  memoLabel.textContent = "📝 メモ";

	  const memoTextarea = document.createElement("textarea");
	  memoTextarea.className = "memo-textarea";
	  memoTextarea.placeholder = "＿φ(.. )";
	  memoTextarea.value = localStorage.getItem(memoKey) || "";

	  const saveButton = document.createElement("button");
	  saveButton.type = "button";
	  saveButton.className = "memo-save-button";
	  saveButton.textContent = "保存";

	  const savedText = document.createElement("span");
	  savedText.className = "memo-saved-text";

	  saveButton.addEventListener("click", () => {
	    localStorage.setItem(memoKey, memoTextarea.value);
	    savedText.textContent = "保存しました";

	    setTimeout(() => {
	      savedText.textContent = "";
	    }, 1500);
	  });

	  memoBox.appendChild(memoLabel);
	  memoBox.appendChild(memoTextarea);
	  memoBox.appendChild(saveButton);
	  memoBox.appendChild(savedText);

	  block.appendChild(memoBox);

	  modalBody.appendChild(block);
	});

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "modal-close-button";
  closeButton.textContent = "閉じる";
  closeButton.addEventListener("click", closeModal);

  modalBody.appendChild(closeButton);

  modal.style.display = "flex";
  document.body.classList.add("modal-open");
}


/* ===============================
   モーダルを閉じる
================================ */
function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;

  modal.style.display = "none";
  document.body.classList.remove("modal-open");
}


/* ===============================
   モーダル外クリックで閉じる
================================ */
window.addEventListener("click", e => {
  const modal = document.getElementById("modal");

  if (modal && e.target === modal) {
    closeModal();
  }
});


/* ===============================
   ×ボタンで閉じる
================================ */
document.addEventListener("DOMContentLoaded", () => {

  const closeBtn = document.getElementById("modalClose");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

});

/* ===============================
   Escキーで閉じる
================================ */
window.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeModal();
  }
});

/* ===============================
   配信一覧用
================================ */
function renderStreamList(dayMap) {

  const currentYear = currentDate.getFullYear();
  const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${currentYear}-${currentMonth}`;

  const listEl = document.getElementById("streamList");

  if (!listEl) return;

  listEl.innerHTML = "";

  const rows = [];

  Object.entries(dayMap).forEach(([date, items]) => {
  
    if (!date.startsWith(monthPrefix)) return;

    items.forEach(item => {

      rows.push({
        date,
        title: item.comment || "",
        videoId: item.videoId
      });

    });

  });

  // 新しい順
  rows.sort((a, b) => b.date.localeCompare(a.date));
  
  const titleEl = document.getElementById("streamListTitle");

  if (titleEl) {
    titleEl.textContent = `💡配信一覧 (${rows.length}件)`;
  }

  rows.forEach(row => {

    const div = document.createElement("div");

    div.className = "stream-row";

    if (row.videoId) {

      div.innerHTML = `
        <a
          href="https://www.youtube.com/watch?v=${row.videoId}"
          target="_blank"
          class="stream-link">

          <span class="stream-date">
            ${row.date}
          </span>

          <span class="stream-title">
            ${row.title}
          </span>

        </a>
      `;

    } else {

  div.innerHTML = `
    <div class="stream-link no-link">

      <span class="stream-date">
        ${row.date}
      </span>

      <span class="stream-title">
        ${row.title}
      </span>

    </div>
  `;

  });
}