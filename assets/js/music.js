console.log("JS読み込まれた");

let player;
let playlist = [];
let selectedList = [];
let currentIndex = 0;
let isPlaying = false;
let isPlayerReady = false;
let interruptBackup = null;
let isInterrupting = false;


// ===============================================
// 初期ロード
// ===============================================
window.addEventListener("DOMContentLoaded", () => {
  loadPlaylist();
});


// ===============================================
// JSON読み込み＋整形
// ===============================================
async function loadPlaylist() {
  try {
    const raw = await fetch("assets/data/playlist.json").then(res => res.json());

    // ▼ JSON → アプリ用に変換
    playlist = raw.map((item, index) => ({
      id: index,
      date: item["配信日"],
      streamTitle: item["配信タイトル"],
      videoId: item["URL"],
      start: Number(item["start"]) || 0,
      end: Number(item["end"]) || 0,
      song: item["曲名"],
      artist: item["アーティスト"]
    }));

    renderList();
    loadSelection();

  } catch (e) {
    console.error("JSON読み込み失敗", e);
  }
}


// ===============================================
// グループ化
// ===============================================
function groupByYearAndStream(data) {
  const result = {};

  data.forEach(item => {
    const dateObj = new Date(item.date);
    const year = isNaN(dateObj) ? "不明" : dateObj.getFullYear();

    const stream = item.streamTitle || item.videoId || "不明";

    if (!result[year]) result[year] = {};
    if (!result[year][stream]) result[year][stream] = [];

    result[year][stream].push(item);
  });

  return result;
}


// ===============================================
// リスト表示（曲名一覧表示）
// ===============================================
function renderList() {
  const container = document.getElementById("list");
  if (!container) return;

  container.innerHTML = "";

  const grouped = groupByYearAndStream(playlist);

  Object.keys(grouped).sort((a, b) => b - a).forEach(year => {

    Object.keys(grouped[year]).forEach((stream, streamIndex) => {

      const items = grouped[year][stream];
      const streamId = `stream-${year}-${streamIndex}`;

      items.forEach(item => {

        const row = document.createElement("div");
        row.className = "song-row";

        row.innerHTML = `
          <label class="song-label">

            <input type="checkbox" value="${item.id}" data-stream="${streamId}">

            <div class="song-info">
              <div class="song-main">
                <span class="song-name">${item.song}</span>
                <span class="artist-name">${item.artist}</span>
              </div>

              <div class="stream-title">
                ${item.streamTitle}
              </div>
            </div>

          </label>
        `;

        container.appendChild(row);
      });

    });

  });
  
  row.addEventListener("dblclick", () => {
  playNow(item.id);
  });
  
}


// ===============================================
// チェック連動（配信単位）
// ===============================================
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("stream-checkbox")) {

    const stream = e.target.dataset.stream;
    const checked = e.target.checked;
    const container = e.target.closest("details");

    container
      .querySelectorAll(`input[data-stream="${stream}"]:not(.stream-checkbox)`)
      .forEach(cb => cb.checked = checked);

    saveSelection();
  }
});


// ===============================================
// 選択保存
// ===============================================
function saveSelection() {
  const checked = [];

  document.querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
    checked.push(cb.value);
  });

  localStorage.setItem("playlistSelection", JSON.stringify(checked));
}

function loadSelection() {
  const saved = JSON.parse(localStorage.getItem("playlistSelection") || "[]");

  document.querySelectorAll("input[type=checkbox]").forEach(cb => {
    if (saved.includes(cb.value)) {
      cb.checked = true;
    }
  });
}


// ===============================================
// ボタン
// ===============================================
function selectAll() {
  document.querySelectorAll('#list input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });
  saveSelection();
}

function clearAll() {
  document.querySelectorAll('#list input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });
  saveSelection();
}


// ===============================================
// 再生
// ===============================================
function playSelected() {
  waitForPlayerReady(() => {
    startPlayback();
  });
}

function startPlayback() {
  selectedList = [];

  document.querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
    const item = playlist.find(p => p.id == cb.value);
    if (item) selectedList.push(item);
  });

  if (selectedList.length === 0) {
    alert("曲を選択してください");
    return;
  }

  currentIndex = 0;
  isPlaying = true;
  loadVideo(currentIndex);
}


// ===============================================
// クリック再生
// ===============================================
function playNow(itemId) {
  const item = playlist.find(p => p.id == itemId);
  if (!item) return;

  // ▼ 再生中なら割り込み
  if (isPlaying && selectedList.length > 0) {

    interruptBackup = {
      list: [...selectedList],
      index: currentIndex
    };

    isInterrupting = true;
  }

  // ▼ 1曲だけ再生
  selectedList = [item];
  currentIndex = 0;
  isPlaying = true;

  loadVideo(0);
}


// ===============================================
// 再生リストの取得
// ===============================================
function getSelectedList() {
  const list = [];

  document.querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
    const item = playlist.find(p => p.id == cb.value);
    if (item) list.push(item);
  });

  return list;
}


// ===============================================
// 前後移動
// ===============================================
function prevVideo() {
  if (!isPlaying) return;

  if (currentIndex > 0) {
    currentIndex--;
  } else if (document.getElementById("loop").checked) {
    currentIndex = selectedList.length - 1;
  } else {
    return;
  }

  loadVideo(currentIndex);
}

function nextVideo() {
  if (!isPlaying) return;

  // ▼ 毎回再取得
  selectedList = getSelectedList();

  if (selectedList.length === 0) return;

  if (currentIndex + 1 < selectedList.length) {
    currentIndex++;
  } else if (document.getElementById("loop").checked) {
    currentIndex = 0;
  } else {
    return;
  }

  loadVideo(currentIndex);
}


// ===============================================
// YouTube
// ===============================================
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('player', {
    events: {
      'onReady': () => {
        isPlayerReady = true;
      }
    }
  });
};

function waitForPlayerReady(callback) {
  const interval = setInterval(() => {
    if (isPlayerReady) {
      clearInterval(interval);
      callback();
    }
  }, 200);
}





// ===============================================
// 再生処理
// ===============================================
function loadVideo(index) {
  const item = selectedList[index];

  document.getElementById("nowPlaying").innerText =
    `再生中: ${item.song} - ${item.artist}`;

  player.loadVideoById({
    videoId: item.videoId,
    startSeconds: item.start
  });

  player.playVideo();

  checkEnd(item.start, item.end);
}


// ===============================================
// 終了時間制御
// ===============================================
let endCheckInterval = null;

function checkEnd(startTime, endTime) {
  if (!endTime || endTime <= startTime) return;

  if (endCheckInterval) clearInterval(endCheckInterval);

  endCheckInterval = setInterval(() => {
    const current = player.getCurrentTime();

    if (current >= endTime) {
      clearInterval(endCheckInterval);
      nextVideo();
    }
  }, 500);
}