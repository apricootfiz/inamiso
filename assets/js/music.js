console.log("JS読み込まれた");

// ===============================================
// ■ グローバル状態
// ===============================================
let player;
let playlist = [];
let selectedList = [];
let currentIndex = 0;

let isPlaying = false;
let isPlayerReady = false;

let isShuffle = false;
let isLoop = false;

let endCheckInterval = null;


// ===============================================
// ■ 初期処理
// ===============================================
window.addEventListener("DOMContentLoaded", () => {
  loadPlaylist();
  setupSearchInput();
  updatePlayButton();
});


// ===============================================
// ■ JSON読み込み
// ===============================================
async function loadPlaylist() {
  try {
    const raw = await fetch("assets/data/playlist.json").then(res => res.json());

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
    updateVisibleCount();

  } catch (e) {
    console.error("JSON読み込み失敗", e);
  }
}


// ===============================================
// ■ 曲一覧表示（日付の新しい順）
// ===============================================
function renderList() {
  const container = document.getElementById("list");
  if (!container) return;

  container.innerHTML = "";

  const sorted = [...playlist].sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);

    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;

    return db - da;
  });

  sorted.forEach(item => {
    const row = document.createElement("div");
    row.className = "song-row";

    row.innerHTML = `
      <div class="song-row-inner">
        <div class="col-song">
          <div class="song-name">${item.song}</div>
          <div class="stream-title">${item.streamTitle}</div>
        </div>

        <div class="col-artist">
          ${item.artist}
        </div>

        <div class="col-check">
          <input type="checkbox" class="song-checkbox" value="${item.id}">
        </div>
      </div>
    `;

    row.dataset.search = [
      item.song,
      item.artist,
      item.streamTitle
    ].join(" ").toLowerCase();

    // ▼ 行クリックで即再生
    row.addEventListener("click", e => {
      if (e.target.classList.contains("song-checkbox")) return;
      playNow(item.id);
    });

    // ▼ チェック状態保存
    row.querySelector(".song-checkbox")
      .addEventListener("change", saveSelection);

    container.appendChild(row);
  });
}


// ===============================================
// ■ 検索処理
// ===============================================
function setupSearchInput() {
  const input = document.getElementById("searchInput");
  if (!input) return;

  input.addEventListener("input", e => {
    const keyword = e.target.value.toLowerCase();

    document.querySelectorAll(".song-row").forEach(row => {
      const text = row.dataset.search || "";
      row.style.display = text.includes(keyword) ? "" : "none";
    });

    updateVisibleCount();
  });
}


// ===============================================
// ■ 表示件数更新
// ===============================================
function updateVisibleCount() {
  const el = document.getElementById("songCount");
  if (!el) return;

  const rows = document.querySelectorAll(".song-row");
  const visible = [...rows].filter(row => row.style.display !== "none").length;

  el.textContent = `${visible} / ${playlist.length} 曲`;
}


// ===============================================
// ■ チェック状態保存
// ===============================================
function saveSelection() {
  const checked = [...document.querySelectorAll(".song-checkbox:checked")]
    .map(cb => cb.value);

  localStorage.setItem("playlistSelection", JSON.stringify(checked));
}


// ===============================================
// ■ チェック状態復元
// ===============================================
function loadSelection() {
  const saved = JSON.parse(localStorage.getItem("playlistSelection") || "[]");

  document.querySelectorAll(".song-checkbox").forEach(cb => {
    cb.checked = saved.includes(cb.value);
  });
}


// ===============================================
// ■ 表示中の曲を全選択 / 全解除
// ===============================================
function toggleSelectAll() {
  const visible = [...document.querySelectorAll(".song-checkbox")]
    .filter(cb => {
      const row = cb.closest(".song-row");
      return row && row.style.display !== "none";
    });

  if (visible.length === 0) return;

  const allChecked = visible.every(cb => cb.checked);

  visible.forEach(cb => {
    cb.checked = !allChecked;
  });

  saveSelection();
}


// ===============================================
// ■ チェック済みの曲を取得
// ===============================================
function getSelectedList() {
  return [...document.querySelectorAll(".song-checkbox:checked")]
    .map(cb => playlist.find(p => p.id == cb.value))
    .filter(Boolean);
}


// ===============================================
// ■ 再生 / 停止ボタン
// ===============================================
function playSelected() {
  if (isPlaying) {
    stopVideo();
    return;
  }

  waitForPlayerReady(() => {
    selectedList = getSelectedList();

    if (selectedList.length === 0) {
      alert("曲を選択してください");
      return;
    }

    currentIndex = 0;
    loadVideo(currentIndex);
  });
}


// ===============================================
// ■ リスト行クリックで1曲再生
// ===============================================
function playNow(itemId) {
  waitForPlayerReady(() => {
    const item = playlist.find(p => p.id == itemId);
    if (!item) return;

    selectedList = [item];
    currentIndex = 0;

    loadVideo(currentIndex);
  });
}


// ===============================================
// ■ 前の曲へ
// ===============================================
function prevVideo() {
  if (!isPlaying) return;
  if (selectedList.length === 0) return;

  if (currentIndex > 0) {
    currentIndex--;
  } else if (isLoop) {
    currentIndex = selectedList.length - 1;
  } else {
    return;
  }

  loadVideo(currentIndex);
}


// ===============================================
// ■ 次の曲へ
// ===============================================
function nextVideo() {
  if (!isPlaying) return;

  if (selectedList.length === 0) {
    stopVideo();
    return;
  }

  if (currentIndex + 1 < selectedList.length) {
    currentIndex++;
    loadVideo(currentIndex);
    return;
  }

  if (isLoop) {
    currentIndex = 0;
    loadVideo(currentIndex);
    return;
  }

  stopVideo();
}


// ===============================================
// ■ シャッフル切替
// ===============================================
function toggleShuffle() {
  isShuffle = !isShuffle;

  const btn = document.getElementById("shuffleBtn");
  btn?.classList.toggle("active", isShuffle);

  if (!isShuffle) return;

  if (selectedList.length === 0) {
    selectedList = getSelectedList();
  }

  if (selectedList.length <= 1) return;

  const currentItem = selectedList[currentIndex];

  shuffleList(selectedList);

  if (currentItem) {
    currentIndex = selectedList.findIndex(item => item.id === currentItem.id);
  }
}


// ===============================================
// ■ ループ切替
// ===============================================
function toggleLoop() {
  isLoop = !isLoop;

  const btn = document.getElementById("loopBtn");
  btn?.classList.toggle("active", isLoop);
}


// ===============================================
// ■ 配列シャッフル
// ===============================================
function shuffleList(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [list[i], list[randomIndex]] = [list[randomIndex], list[i]];
  }
}


// ===============================================
// ■ 再生ボタンUI更新
// ===============================================
function updatePlayButton() {
  const btn = document.getElementById("playBtn");
  if (!btn) return;

  btn.classList.toggle("playing", isPlaying);
}


// ===============================================
// ■ YouTube API 初期化
// ===============================================
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("player", {
    events: {
      onReady: () => {
        isPlayerReady = true;
        console.log("YouTube Player Ready");
      },
      onStateChange: onPlayerStateChange
    }
  });
};


// ===============================================
// ■ YouTubeプレイヤー準備待ち
// ===============================================
function waitForPlayerReady(callback) {
  if (isPlayerReady) {
    callback();
    return;
  }

  const timer = setInterval(() => {
    if (isPlayerReady) {
      clearInterval(timer);
      callback();
    }
  }, 200);
}


// ===============================================
// ■ YouTube再生状態変更時
// ===============================================
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    const item = selectedList[currentIndex];
    if (!item) return;

    checkEnd(item.start, item.end);
  }
}


// ===============================================
// ■ 動画読み込み・再生
// ===============================================
function loadVideo(index) {
  const item = selectedList[index];
  if (!item) return;

  isPlaying = true;
  updatePlayButton();
  updatePlayingRow();
  clearEndCheck();

  const nowPlaying = document.getElementById("nowPlaying");
  if (nowPlaying) {
    nowPlaying.innerText = `再生中: ${item.song} - ${item.artist}`;
  }

  player.loadVideoById({
    videoId: item.videoId,
    startSeconds: item.start
  });
}


// ===============================================
// ■ 再生中の行ハイライト更新
// ===============================================
function updatePlayingRow() {
  // ▼ いったん全行からplayingを外す
  document.querySelectorAll(".song-row").forEach(row => {
    row.classList.remove("playing");
  });

  const item = selectedList[currentIndex];
  if (!item) return;

  // ▼ valueが現在の曲IDと一致するチェックボックスを探す
  const checkbox = document.querySelector(`.song-checkbox[value="${item.id}"]`);
  if (!checkbox) return;

  const row = checkbox.closest(".song-row");
  if (!row) return;

  row.classList.add("playing");
}

// ===============================================
// ■ 再生中ハイライト解除
// ===============================================
function clearPlayingRow() {
  document.querySelectorAll(".song-row").forEach(row => {
    row.classList.remove("playing");
  });
}

// ===============================================
// ■ 停止処理
// ===============================================
function stopVideo() {
  player?.stopVideo();

  clearEndCheck();

  isPlaying = false;
  updatePlayButton();
  updatePlayingRow();

  const nowPlaying = document.getElementById("nowPlaying");
  if (nowPlaying) {
    nowPlaying.innerText = "停止中";
  }
}


// ===============================================
// ■ end監視クリア
// ===============================================
function clearEndCheck() {
  if (endCheckInterval) {
    clearInterval(endCheckInterval);
    endCheckInterval = null;
  }
}


// ===============================================
// ■ end時間監視
// ===============================================
function checkEnd(start, end) {
  if (!end || end <= start) return;

  clearEndCheck();

  endCheckInterval = setInterval(() => {
    const current = player?.getCurrentTime?.();

    if (current === undefined || current === null) return;

    if (current >= end) {
      clearEndCheck();

      if (isPlaying) {
        nextVideo();
      }
    }
  }, 300);
}