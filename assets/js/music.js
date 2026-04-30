console.log("JS読み込まれた");

// ===============================================
// ■ グローバル状態
// ===============================================
// アプリ全体で共有する状態をここに集約
let player;              // YouTubeプレイヤーインスタンス
let playlist = [];       // JSONから読み込んだ全曲データ
let selectedList = [];   // 再生対象リスト（チェック or 単体再生）
let currentIndex = 0;    // 現在再生中のインデックス

let isPlaying = false;       // 再生中フラグ（UI制御にも使用）
let isPlayerReady = false;   // YouTube API準備完了フラグ

let isShuffle = false;   // シャッフル状態
let isLoop = false;      // ループ状態

let endCheckInterval = null; // end時間監視用タイマー


// ===============================================
// ■ 初期処理（ページ読み込み時）
// ===============================================
window.addEventListener("DOMContentLoaded", () => {
  loadPlaylist();     // JSON読み込み
  setupSearchInput(); // 検索イベント設定
  updatePlayButton(); // ボタン初期状態
});


// ===============================================
// ■ JSON読み込み＆整形
// ===============================================
async function loadPlaylist() {
  try {
    const raw = await fetch("assets/data/playlist.json").then(res => res.json());

    // ▼ 日本語キー → JSで扱いやすい形式に変換
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

    renderList();     // 一覧表示
    loadSelection();  // 保存済みチェック復元
    updateVisibleCount();

  } catch (e) {
    console.error("JSON読み込み失敗", e);
  }
}


// ===============================================
// ■ 年 + 配信タイトルでグループ化
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
// 曲一覧を日付順で表示（新しい順）
// ===============================================
function renderList() {
  const container = document.getElementById("list");
  if (!container) return;

  container.innerHTML = "";

  // ============================================
  // ▼ 日付でソート（新しい → 古い）
  // ============================================
  const sorted = [...playlist].sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });

  // ============================================
  // ▼ フラット表示
  // ============================================
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

    // ▼ 検索用
    row.dataset.search = [
      item.song,
      item.artist,
      item.streamTitle
    ].join(" ").toLowerCase();

    // ▼ 行クリックで再生
    row.addEventListener("click", e => {
      if (e.target.classList.contains("song-checkbox")) return;
      playNow(item.id);
    });

    // ▼ チェック保存
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
  const visible = [...rows].filter(r => r.style.display !== "none").length;

  el.textContent = `${visible} / ${playlist.length} 曲`;
}


// ===============================================
// ■ チェック状態保存（localStorage）
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
// ■ 全選択 / 全解除（表示中のみ）
// ===============================================
function toggleSelectAll() {
  const visible = [...document.querySelectorAll(".song-checkbox")]
    .filter(cb => cb.closest(".song-row").style.display !== "none");

  if (visible.length === 0) return;

  const allChecked = visible.every(cb => cb.checked);
  visible.forEach(cb => cb.checked = !allChecked);

  saveSelection();
}


// ===============================================
// ■ チェックされた曲リスト取得
// ===============================================
function getSelectedList() {
  return [...document.querySelectorAll(".song-checkbox:checked")]
    .map(cb => playlist.find(p => p.id == cb.value))
    .filter(Boolean);
}


// ===============================================
// ■ 再生 / 停止ボタン処理
// ===============================================
function playSelected() {

  // ▼ 再生中なら停止（トグル動作）
  if (isPlaying) {
    stopVideo();
    return;
  }

  // ▼ 停止中なら再生開始
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
// ■ 即再生（1曲クリック）
// ===============================================
function playNow(itemId) {
  waitForPlayerReady(() => {
    const item = playlist.find(p => p.id == itemId);
    if (!item) return;

    selectedList = [item];
    currentIndex = 0;

    loadVideo(0);
  });
}


// ===============================================
// ■ 次の曲
// ===============================================
function nextVideo() {
  if (!isPlaying) return;

  if (currentIndex + 1 < selectedList.length) {
    currentIndex++;
    loadVideo(currentIndex);
  } else if (isLoop) {
    currentIndex = 0;
    loadVideo(currentIndex);
  } else {
    stopVideo();
  }
}


// ===============================================
// ■ シャッフル切替（押した瞬間に並び替え）
// ===============================================
function toggleShuffle() {
  isShuffle = !isShuffle;

  document.getElementById("shuffleBtn")
    ?.classList.toggle("active", isShuffle);

  if (!isShuffle) return;

  if (selectedList.length === 0) {
    selectedList = getSelectedList();
  }

  if (selectedList.length <= 1) return;

  const currentItem = selectedList[currentIndex];

  shuffleList(selectedList);

  if (currentItem) {
    currentIndex = selectedList.findIndex(i => i.id === currentItem.id);
  }
}


// ===============================================
// ■ 再生ボタンUI更新（ここ重要）
// ===============================================
// playingクラスでSVG切替する
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
      onReady: () => isPlayerReady = true,
      onStateChange: onPlayerStateChange
    }
  });
};


// ===============================================
// ■ プレイヤー準備待ち
// ===============================================
function waitForPlayerReady(callback) {
  if (isPlayerReady) return callback();

  const timer = setInterval(() => {
    if (isPlayerReady) {
      clearInterval(timer);
      callback();
    }
  }, 200);
}


// ===============================================
// ■ 動画再生
// ===============================================
function loadVideo(index) {
  const item = selectedList[index];
  if (!item) return;

  isPlaying = true;
  updatePlayButton(); // ←ここでSVG切替

  clearEndCheck();

  document.getElementById("nowPlaying").innerText =
    `再生中: ${item.song} - ${item.artist}`;

  player.loadVideoById({
    videoId: item.videoId,
    startSeconds: item.start
  });
}


// ===============================================
// ■ 停止処理
// ===============================================
function stopVideo() {
  player?.stopVideo();

  clearEndCheck();

  isPlaying = false;
  updatePlayButton(); // ←ここで戻す

  document.getElementById("nowPlaying").innerText = "停止中";
}


// ===============================================
// ■ end監視
// ===============================================
function checkEnd(start, end) {
  if (!end || end <= start) return;

  clearEndCheck();

  endCheckInterval = setInterval(() => {
    const current = player?.getCurrentTime?.();
    if (!current) return;

    if (current >= end) {
      clearEndCheck();
      if (isPlaying) nextVideo();
    }
  }, 300);
}