console.log("JS読み込まれた");

// ===============================================
// グローバル状態管理
// ===============================================
let player;              // YouTubeプレイヤー
let playlist = [];       // 全曲データ
let selectedList = [];   // 再生対象リスト
let currentIndex = 0;    // 現在の再生位置

let isPlaying = false;       // 再生中フラグ
let isPlayerReady = false;   // YouTube準備完了フラグ

let isShuffle = false;   // シャッフルON/OFF
let isLoop = false;      // ループON/OFF

let endCheckInterval = null; // end監視用タイマー


// ===============================================
// 初期処理
// ===============================================
window.addEventListener("DOMContentLoaded", () => {
  loadPlaylist();     // JSON読み込み
  setupSearchInput(); // 検索イベント設定
});


// ===============================================
// JSON読み込み＆整形
// ===============================================
async function loadPlaylist() {
  try {
    const raw = await fetch("assets/data/playlist.json").then(res => res.json());

    // ▼ 日本語キー → JS用に変換
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

    renderList();     // 画面描画
    loadSelection();  // 保存済みチェック復元
    updateVisibleCount();

  } catch (e) {
    console.error("JSON読み込み失敗", e);
  }
}


// ===============================================
// 年＆配信単位でグループ化
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
// 曲一覧をDOMに描画
// ===============================================
function renderList() {
  const container = document.getElementById("list");
  if (!container) return;

  container.innerHTML = "";

  const grouped = groupByYearAndStream(playlist);

  Object.keys(grouped)
    .sort((a, b) => b - a) // 新しい年から表示
    .forEach(year => {

      Object.keys(grouped[year]).forEach(stream => {
        const items = grouped[year][stream];

        items.forEach(item => {
          const row = document.createElement("div");
          row.className = "song-row";

          // ▼ HTML構造
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

          // ▼ 検索用データ
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

          // ▼ チェック変更時は保存
          row.querySelector(".song-checkbox")
             .addEventListener("change", saveSelection);

          container.appendChild(row);
        });
      });
    });
}


// ===============================================
// 検索入力イベント
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
// 表示件数更新
// ===============================================
function updateVisibleCount() {
  const el = document.getElementById("songCount");
  if (!el) return;

  const rows = document.querySelectorAll(".song-row");
  const visible = [...rows].filter(r => r.style.display !== "none").length;

  el.textContent = `${visible} / ${playlist.length} 曲`;
}


// ===============================================
// チェック状態保存（localStorage）
// ===============================================
function saveSelection() {
  const checked = [...document.querySelectorAll(".song-checkbox:checked")]
    .map(cb => cb.value);

  localStorage.setItem("playlistSelection", JSON.stringify(checked));
}


// ===============================================
// チェック状態復元
// ===============================================
function loadSelection() {
  const saved = JSON.parse(localStorage.getItem("playlistSelection") || "[]");

  document.querySelectorAll(".song-checkbox").forEach(cb => {
    cb.checked = saved.includes(cb.value);
  });
}


// ===============================================
// 表示中の曲だけ全選択/解除
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
// チェックされている曲を取得
// ===============================================
function getSelectedList() {
  return [...document.querySelectorAll(".song-checkbox:checked")]
    .map(cb => playlist.find(p => p.id == cb.value))
    .filter(Boolean);
}


// ===============================================
// 再生 / 停止ボタン押下時
// ===============================================
function playSelected() {

  // ▼ 再生中なら停止
  if (isPlaying) {
    stopVideo();
    return;
  }

  // ▼ 停止中なら選択曲を再生
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
// 即再生（1曲）
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
// 前の曲
// ===============================================
function prevVideo() {
  if (!isPlaying) return;

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
// 次の曲
// ===============================================
function nextVideo() {
  if (!isPlaying) return;

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
// シャッフル切替
// ===============================================
function toggleShuffle() {
  isShuffle = !isShuffle;

  const btn = document.getElementById("shuffleBtn");
  btn?.classList.toggle("active", isShuffle);

  // ▼ シャッフルON時だけ並び替え
  if (isShuffle && selectedList.length > 1) {

    // ▼ 現在再生中の曲を保持
    const currentItem = selectedList[currentIndex];

    // ▼ シャッフル実行
    shuffleList(selectedList);

    // ▼ 再生位置を維持（同じ曲を指すようにする）
    currentIndex = selectedList.findIndex(item => item.id === currentItem.id);
  }
}


// ===============================================
// ループ切替
// ===============================================
function toggleLoop() {
  isLoop = !isLoop;
  document.getElementById("loopBtn")?.classList.toggle("active", isLoop);
}


// ===============================================
// 配列シャッフル
// ===============================================
function shuffleList(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}


// ===============================================
// YouTube API 初期化
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
// プレイヤー準備待ち
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
// 再生状態変更時
// ===============================================
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    const item = selectedList[currentIndex];
    if (item) checkEnd(item.start, item.end);
  }
}


// ===============================================
// 再生ボタン表示更新
// ===============================================
function updatePlayButton() {
  const btn = document.getElementById("playBtn");
  if (!btn) return;

  btn.classList.toggle("playing", isPlaying);
}


// ===============================================
// 動画再生
// ===============================================
function loadVideo(index) {
  const item = selectedList[index];
  if (!item) return;

  isPlaying = true;
  updatePlayButton();
  
  clearEndCheck();

  document.getElementById("nowPlaying").innerText =
    `再生中: ${item.song} - ${item.artist}`;

  player.loadVideoById({
    videoId: item.videoId,
    startSeconds: item.start
  });
}


// ===============================================
// 停止処理
// ===============================================
function stopVideo() {
  player?.stopVideo();
  clearEndCheck();
  
  isPlaying = false;
  updatePlayButton();

  document.getElementById("nowPlaying").innerText = "停止中";
}


// ===============================================
// end監視クリア
// ===============================================
function clearEndCheck() {
  if (endCheckInterval) {
    clearInterval(endCheckInterval);
    endCheckInterval = null;
  }
}


// ===============================================
// end時間監視 → 次の曲へ
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