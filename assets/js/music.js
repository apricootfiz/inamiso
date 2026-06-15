console.log("JS読み込まれた");

// ===============================================
// ■ グローバル状態
// ===============================================
let player;
let playlist = [];
let selectedList = [];
let currentIndex = 0;

let isPlayerReady = false;

let endCheckInterval = null;
let playlistMap = new Map();

const state = {
  isPlaying: false,
  isShuffle: false,
  isLoop: false
};

let isQueueMode = false;
let isChangingVideo = false;

// ===============================================
// ■ 初期処理
// ===============================================
function init() {
  loadPlaylist();
  setupSearchInput();
  updateControls();
  updateQueueButton();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ===============================================
// ■ JSON読み込み
// ===============================================
async function loadPlaylist() {
  try {
    const raw = await fetch("assets/data/playlist.json").then(res => res.json());

    playlist = raw.map((item, index) => ({
      id: index,

      date: item.date || "",
      streamTitle: item.streamTitle || "",
      videoId: item.videoId || "",
      song: item.song || "",
      artist: item.artist || "",
      keyword: item.keyword || "",
      start: item.start ?? 0,
      end: item.end ?? null
    }));

    // ▼ IDから曲をすぐ取得できるようにする
    playlistMap = new Map(playlist.map(item => [String(item.id), item]));
    
    renderList();        // 曲一覧表示
    loadSelection();     // 保存済みチェック復元
    updateVisibleCount(); // 件数更新

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

  let list;


	const streamMap = new Map();

	playlist.forEach(item => {
	  if (!streamMap.has(item.videoId)) {
	    streamMap.set(item.videoId, {
	      videoId: item.videoId,
	      streamTitle: item.streamTitle,
	      date: item.date,
	      songs: []
	    });
	  }

	  streamMap.get(item.videoId).songs.push(item);
	});

	list = [...streamMap.values()];

	// サムネを新しい順でソート
	list.sort((a, b) => {
	  const da = new Date(a.date);
	  const db = new Date(b.date);

	  if (isNaN(da)) return 1;
	  if (isNaN(db)) return -1;

	  return db - da;
	});



  list.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "song-row";

    const isPlayingRow =
      isQueueMode
        ? index === currentIndex
        : selectedList[currentIndex]?.id === item.id;

		row.innerHTML = `
		  <div class="thumb-card ${isPlayingRow ? "playing" : ""}">
		    <img
		      class="thumb-img"
		      src="https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg"
		      loading="lazy"
		      alt="${item.streamTitle || ""}"
		    >
		  </div>
		`;

    row.addEventListener("click", () => {
       openSongModal(item);
    });

    row.dataset.search = [
      item.song,
      item.artist,
      item.streamTitle,
      item.keyword
    ].join(" ").toLowerCase();

    container.appendChild(row);
  });

  updatePlayingRow();
}

// ===============================================
// ■ モーダル表示
// ===============================================
function openSongModal(stream) {

  // モーダル部品取得
  const modal = document.getElementById("songModal");
  const thumb = document.getElementById("modalThumb");
  const title = document.getElementById("modalStreamTitle");
  const date = document.getElementById("modalDate");
  const songList = document.getElementById("modalSongList");

  if (!modal) return;

  // サムネ
  thumb.src =
    `https://img.youtube.com/vi/${stream.videoId}/hqdefault.jpg`;

  // 配信タイトル
  title.innerText = stream.streamTitle || "";

  // 配信日
  date.innerText = stream.date || "";

  // 曲一覧を初期化
  songList.innerHTML = "";

  // 曲を並べる
  stream.songs.forEach(song => {

    const btn = document.createElement("div");

    btn.className = "modal-song-btn";

	btn.innerHTML = `
	  <div class="modal-song-info">
	    <div class="modal-song-name">
	      ${song.song}
	    </div>

	    <div class="modal-artist-name">
	      ${song.artist}
	    </div>
	  </div>

	  <div class="modal-song-actions">
	    <button class="modal-add-btn" type="button">
		  <svg viewBox="0 -960 960 960" class="modal-icon">
		    <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
		  </svg>
	    </button>

	    <button class="modal-fav-btn" type="button">
		  <svg viewBox="0 -960 960 960" class="modal-icon">
		    <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
		  </svg>
	    </button>
	  </div>
	`;

	const addBtn = btn.querySelector(".modal-add-btn");
	const favBtn = btn.querySelector(".modal-fav-btn");

	// モーダルを開いた時点で、お気に入り済みなら色を変える
	if (isFavorite(song.id)) {
	  favBtn.classList.add("active");
	}

    // 曲クリックで再生
    btn.addEventListener("click", () => {
      closeSongModal();
      playNow(song.id);
    });

	// ＋ボタンで再生リスト追加
	addBtn.addEventListener("click", e => {
	  e.stopPropagation();
	  console.log("再生リストに追加", song);
	});

	// ハートボタンを押した時の処理
	favBtn.addEventListener("click", e => {
	
		e.stopPropagation();
		
		// お気に入り追加・解除
		const active = toggleFavorite(song.id);
		
		// 状態に合わせて色を切り替える
		favBtn.classList.toggle("active", active);
	});

    songList.appendChild(btn);

  });

  // モーダル表示
  modal.classList.remove("hidden");
}

// ===============================================
// ■ お気に入り一覧を取得
// ===============================================
function getFavorites() {
  return JSON.parse(
    localStorage.getItem("favorites") || "[]"
  );
}

// ===============================================
// ■ お気に入り一覧を保存
// ===============================================
function saveFavorites(favorites) {
  localStorage.setItem(
    "favorites",
    JSON.stringify(favorites)
  );
}

// ===============================================
// ■ 指定した曲がお気に入り済みか判定
// ===============================================
function isFavorite(songId) {
  const favorites = getFavorites();

  return favorites.includes(songId);
}

// ===============================================
// ■ お気に入り追加・解除
// 戻り値 true  → お気に入り登録済み
// 戻り値 false → お気に入り解除済み
// ===============================================
function toggleFavorite(songId) {
  let favorites = getFavorites();

  if (favorites.includes(songId)) {

    favorites = favorites.filter(id => id !== songId);

    saveFavorites(favorites);

    return false;

  } else {

    favorites.push(songId);

    saveFavorites(favorites);

    return true;
  }
}


// ===============================================
// ■ モーダル閉じる
// ===============================================
function closeSongModal() {

  document
    .getElementById("songModal")
    ?.classList.add("hidden");

}


// ===============================================
// ■ 検索処理
// ===============================================
function setupSearchInput() {
  const input = document.getElementById("searchInput");

  if (!input) {
    console.error("searchInput が見つかりません");
    return;
  }

  input.addEventListener("input", e => {
    const keyword = e.target.value.trim().toLowerCase();

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

  el.textContent = `${visible} / ${playlist.length}`;
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
    .map(cb => playlistMap.get(cb.value))
    .filter(Boolean);
}

// ===============================================
// ■ 再生 / 停止ボタン
// ===============================================
function playSelected() {
  if (state.isPlaying) {
    stopVideo();
    return;
  }

  waitForPlayerReady(() => {
    const checkedList = getSelectedList();

    if (checkedList.length === 0) {
      alert("曲を選択してください");
      return;
    }

    selectedList = createPlayQueue(checkedList);
    currentIndex = 0;

    updateQueueButton();
    loadVideo(currentIndex);
    renderList();
  });
}

// ===============================================
// ■ リスト行クリック再生
// チェック済みの曲なら、その再生リスト内の位置から再生
// チェック外の曲なら、その曲だけ単体再生
// ===============================================
function playNow(itemId) {
  waitForPlayerReady(() => {
    const checkedList = getSelectedList();
    const clickedItem = playlistMap.get(String(itemId));

    if (!clickedItem) return;

    const isChecked = checkedList.some(item => item.id === clickedItem.id);

    if (isChecked) {
      selectedList = createPlayQueue(checkedList, clickedItem);
    } else {
      selectedList = [clickedItem];
    }

    currentIndex = 0;
    
    updateQueueButton();
    loadVideo(currentIndex);
    renderList();
  });
}

// ===============================================
// ■ 前の曲へ
// ===============================================
function prevVideo() {
  if (isChangingVideo) return;
  isChangingVideo = true;

  try {
    if (!state.isPlaying) return;
    if (selectedList.length === 0) return;

    if (currentIndex > 0) {
      currentIndex--;
    } else if (state.isLoop) {
      currentIndex = selectedList.length - 1;
    } else {
      return;
    }

    loadVideo(currentIndex);
    renderList();

  } finally {
    setTimeout(() => {
      isChangingVideo = false;
    }, 300);
  }
}

// ===============================================
// ■ 次の曲へ
// ===============================================
function nextVideo() {
  if (isChangingVideo) return;
  isChangingVideo = true;

  try {
    if (!state.isPlaying) return;

    if (selectedList.length === 0) {
      stopVideo();
      return;
    }

    if (currentIndex + 1 < selectedList.length) {
      currentIndex++;
      loadVideo(currentIndex);
      renderList();
      return;
    }

    if (state.isLoop) {
      currentIndex = 0;
      loadVideo(currentIndex);
      renderList();
      return;
    }

    stopVideo();

  } finally {
    setTimeout(() => {
      isChangingVideo = false;
    }, 300);
  }
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
// ■ ボタンUI更新
// ===============================================
function updateControls() {
  document.getElementById("playBtn")
    ?.classList.toggle("playing", state.isPlaying);

  document.getElementById("shuffleBtn")
    ?.classList.toggle("active", state.isShuffle);

  document.getElementById("loopBtn")
    ?.classList.toggle("active", state.isLoop);
}

// ===============================================
// ■ 再生キュー作成
// ===============================================
function createPlayQueue(baseList, startItem = null) {
  if (!baseList || baseList.length === 0) return [];

  // ▼ 開始曲が指定されていない場合
  if (!startItem) {
    const queue = [...baseList];

    if (state.isShuffle) {
      shuffleList(queue);
    }

    return queue;
  }

  // ▼ 開始曲がある場合は、必ず先頭固定
  const rest = baseList.filter(item => item.id !== startItem.id);

  if (state.isShuffle) {
    shuffleList(rest);
  }

  return [startItem, ...rest];
}

// ===============================================
// ■ ループ機能
// ===============================================
function toggleLoop() {
  state.isLoop = !state.isLoop;
  updateControls();
}

// ===============================================
// ■ シャッフル機能
// ===============================================
function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  updateControls();

  // ▼ OFF時は現在の再生キューを触らない
  if (!state.isShuffle) return;

  // ▼ 停止中は次回再生開始時に反映
  if (!state.isPlaying) return;

  const currentItem = selectedList[currentIndex];
  if (!currentItem) return;

  // ▼ 現在の再生キュー全体を対象に、現在曲だけ先頭固定
  selectedList = createPlayQueue(selectedList, currentItem);
  currentIndex = 0;

  updateQueueButton();
  renderList();
}

// ===============================================
// ■ 再生リスト表示機能
// ===============================================
function toggleQueueView() {
  if (selectedList.length === 0) return;

  isQueueMode = !isQueueMode;

  updateQueueButton();
  renderList();
}

// ===============================================
// ■ 再生リスト非活性
// ===============================================
function updateQueueButton() {
  const btn = document.getElementById("queueBtn");
  if (!btn) return;

  const hasQueue = selectedList.length > 0;

  // ▼ 非活性制御
  btn.disabled = !hasQueue;
  btn.classList.toggle("disabled", !hasQueue);

  // ▼ 表示中ならアクティブ色
  btn.classList.toggle("active", isQueueMode && hasQueue);
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

        playerReadyCallbacks.forEach(callback => callback());
        playerReadyCallbacks = [];
      },
      onStateChange: onPlayerStateChange
    }
  });
};

// ===============================================
// ■ YouTubeプレイヤー準備待ち
// ===============================================
let playerReadyCallbacks = [];

function waitForPlayerReady(callback) {
  if (isPlayerReady) {
    callback();
    return;
  }

  playerReadyCallbacks.push(callback);
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

  state.isPlaying = true;
  updateControls();
  updatePlayingRow();
  clearEndCheck();

  const nowPlaying = document.getElementById("nowPlaying");
  if (nowPlaying) {
    nowPlaying.innerText = `♪${item.song} - ${item.artist} (${currentIndex + 1}/${selectedList.length})`;
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

  if (isQueueMode) {
    const rows = document.querySelectorAll(".song-row");
    const row = rows[currentIndex];
    if (row) row.classList.add("playing");
    return;
  }

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

  state.isPlaying = false;
  updateControls();
  clearPlayingRow();

  const nowPlaying = document.getElementById("nowPlaying");
  if (nowPlaying) {
    nowPlaying.innerText = "停止";
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
  if (end === null || end <= start) return;

  clearEndCheck();

  endCheckInterval = setInterval(() => {
    const current = player?.getCurrentTime?.();

    if (current === undefined || current === null) return;

    if (current >= end) {
      clearEndCheck();

      if (state.isPlaying) {
        nextVideo();
      }
    }
  }, 300);
}

// ===============================================
// ■ iPhone viewport対策
// ===============================================
window.addEventListener("resize", () => {
  document.documentElement.style.setProperty(
    "--app-height",
    `${window.innerHeight}px`
  );
});

// 初回実行も必要
window.dispatchEvent(new Event("resize"));

document.getElementById("searchInput")?.addEventListener("blur", () => {
  window.scrollTo(0, 0);
});
