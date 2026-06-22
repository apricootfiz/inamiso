// ===============================================
// アプリ全体で使う状態
// ===============================================

// YouTube IFrame API が作るプレイヤー本体
let player;

// playlist.json から読み込んだ全曲データを入れる
let playlist = [];

// 配信単位の一覧は playlist 読み込み後に一度だけ作り、表示時に使い回す
let streamListCache = [];

// 再生ボタンで再生する曲の並び
let playQueue = [];

// 画面上の「再生リスト」タブに表示する曲の並び
let queuedSongs = [];

// 再生リストの重複判定用。配列検索を避けるため queuedSongs と同期する
let queuedSongIdSet = new Set();

// playQueue の何番目を再生しているかを表す
let currentIndex = 0;

// YouTube プレイヤーが操作可能になったかどうかを表す
let isPlayerReady = false;

// プレイヤー準備前に受け取った再生処理を一時的にためる
let playerReadyCallbacks = [];

// 曲の終了秒を監視する setInterval の ID
let endCheckInterval = null;

// ID から曲をすぐ取り出すための辞書
let playlistMap = new Map();

// 画面上の表示モード。all / favorite / queue のどれかが入る
let currentView = "all";

// 現在の再生を開始した表示モード。曲送り時の再取得に使う
let currentPlaybackView = "all";

// 再生開始時の検索文字。曲送り時も同じ絞り込み条件を使う
let playbackSearchKeyword = "";

// 現在の再生セッションで、すでに再生を始めた曲IDを記録する
let playedSongIds = new Set();

// 検索欄に入力されている文字
let searchKeyword = "";

// 検索入力中の連続描画を抑えるためのタイマー
let searchRenderTimer = null;

// 入力停止からこの時間だけ待って一覧を描画する
const SEARCH_DEBOUNCE_MS = 200;

// お気に入りIDは Set で保持し、曲ごとの判定を軽くする
let favoriteIdSet = new Set();

// 前へ・次への連打で処理が重ならないようにするためのフラグ
let isChangingVideo = false;

// 再生やシャッフルなど、ボタンの見た目にも関係する状態
const playerState = {
  isPlaying: false,
  isShuffle: false,
  isLoop: false
};


// ===============================================
// 初期化
// ===============================================

// ページ読み込み後に、イベント設定とデータ読み込みを始める
function init() {
  loadFavoriteCache();
  setupViewTabs();
  setupSearchInput();
  setupSearchToggle();
  loadPlaylist();
  updatePlayerCollapseButton();
  updateControls();
}

// HTML がまだ読み込み中なら待ち、読み込み済みならすぐ初期化する
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init);
} else {
  init();
}


// ===============================================
// データ読み込み
// ===============================================

// playlist.json を読み込み、アプリで扱いやすい形に整える
async function loadPlaylist() {
  try {
    const raw = await fetch("assets/data/playlist.json").then(response => response.json());

    playlist = raw.map((item, index) => {
      const song = {
        id: index,
        date: item.date || "",
        streamTitle: item.streamTitle || "",
        videoId: item.videoId || "",
        song: item.song || "",
        artist: item.artist || "",
        keyword: item.keyword || "",
        start: item.start ?? 0,
        end: item.end ?? null
      };

      // 検索時の文字列結合を避けるため、読み込み時に検索用テキストを作る
      song.searchText = createSongSearchText(song);

      return song;
    });

    // クリックされた曲IDから、対応する曲データをすぐ探せるようにする
    playlistMap = new Map(playlist.map(song => [String(song.id), song]));
    streamListCache = createStreamList(playlist);

    renderList();
  } catch (error) {
    console.error("playlist.json の読み込みに失敗しました", error);
  }
}


// ===============================================
// 表示切り替えと検索
// ===============================================

// 「曲一覧」「お気に入り」「再生リスト」のタブを押したときの動きを設定する
function setupViewTabs() {
  const tabs = document.querySelectorAll(".view-tab");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      currentView = tab.dataset.view || "all";

      tabs.forEach(item => item.classList.remove("active"));
      tab.classList.add("active");

      renderList();
    });
  });
}

// 検索欄に入力されたら、今の表示モードのまま一覧を描き直す
function setupSearchInput() {
  const input = document.getElementById("searchInput");

  if (!input) {
    console.error("searchInput が見つかりません");
    return;
  }

  input.addEventListener("input", event => {
    searchKeyword = event.target.value.trim().toLowerCase();
    scheduleSearchRender();
  });
}

// 曲が検索キーワードに一致するかを判定する
// 入力のたびに描画せず、最後の入力から少し待って一覧を更新する
// 虫眼鏡ボタンで検索欄を開閉する
function setupSearchToggle() {
  const button = document.getElementById("searchToggleBtn");
  const searchArea = document.getElementById("searchArea");
  const input = document.getElementById("searchInput");

  if (!button || !searchArea || !input) return;

  button.addEventListener("click", () => {
    const willOpen = !searchArea.classList.contains("is-open");

    searchArea.classList.toggle("is-open", willOpen);
    button.classList.toggle("active", willOpen);
    button.setAttribute("aria-expanded", String(willOpen));
    button.setAttribute("aria-label", willOpen ? "Close search" : "Open search");

    if (willOpen) {
      input.focus();
      return;
    }

    // 閉じた検索欄の条件で絞り込み続けないよう、閉じる時は検索を解除する
    if (searchKeyword) {
      input.value = "";
      searchKeyword = "";
      renderList();
    }
  });
}

function scheduleSearchRender() {
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(renderList, SEARCH_DEBOUNCE_MS);
}

function matchesSearch(song) {
  return matchesKeyword(song, searchKeyword);
}

// 一覧の件数表示を更新する
function updateVisibleCount(visibleCount, totalCount) {
  const count = document.getElementById("songCount");
  if (!count) return;

  count.textContent = `${visibleCount} / ${totalCount}`;
}


// ===============================================
// 一覧表示
// ===============================================

// currentView に合わせて、画面の一覧部分を描き直す
function renderList() {
  const container = document.getElementById("list");
  if (!container) return;

  container.innerHTML = "";

  if (currentView === "all") {
    renderStreamList(container);
    return;
  }

  renderSongList(container);
}

// 配信単位のサムネイル一覧を表示する
function renderStreamList(container) {
  const streamList = streamListCache
    .filter(stream => stream.songs.some(matchesSearch));

  container.classList.add("thumb-list");
  container.classList.remove("song-list");

  // 画面への追加は最後に1回だけ行い、DOM更新回数を抑える
  const fragment = document.createDocumentFragment();

  streamList.forEach(stream => {
    const row = document.createElement("div");
    row.className = "song-row";

    row.innerHTML = `
      <div class="thumb-card">
        <img
          class="thumb-img"
          src="https://img.youtube.com/vi/${stream.videoId}/mqdefault.jpg"
          loading="lazy"
          alt="${escapeHtml(stream.streamTitle)}"
        >
      </div>
    `;

    row.addEventListener("click", () => {
      openSongModal(stream);
    });

    fragment.appendChild(row);
  });

  container.appendChild(fragment);

  updateVisibleCount(streamList.length, streamListCache.length);
}

// お気に入りまたは再生リストの曲一覧を表示
function renderSongList(container) {
  const baseSongs = getSongsForCurrentView();
  const songs = baseSongs.filter(matchesSearch);

  container.classList.remove("thumb-list");
  container.classList.add("song-list");

  // 画面への追加は最後に1回だけ行い、DOM更新回数を抑える
  const fragment = document.createDocumentFragment();

  songs.forEach(song => {
    fragment.appendChild(createSongListRow(song));
  });

  container.appendChild(fragment);

  updateVisibleCount(songs.length, baseSongs.length);
}

// お気に入り・再生リストに表示する1曲分の行を作る
function createSongListRow(song) {
  const row = document.createElement("div");
  row.className = "favorite-song-row";
  row.dataset.songId = String(song.id);
  row.classList.toggle("playing", isCurrentSong(song.id));

  row.innerHTML = `
    <div class="favorite-song-info">
      <div class="favorite-song-name">${escapeHtml(song.song)}</div>
      <div class="favorite-artist-name">${escapeHtml(song.artist)}</div>
    </div>

    <div class="modal-song-actions">
      <button class="modal-add-btn" type="button" aria-label="再生リストに追加">
        <svg viewBox="0 -960 960 960" class="modal-icon">
          <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
        </svg>
      </button>

      <button class="modal-fav-btn" type="button" aria-label="お気に入り">
        <svg viewBox="0 -960 960 960" class="modal-icon">
          <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
        </svg>
      </button>
    </div>
  `;

  setupSongActionButtons(row, song);

  row.addEventListener("click", () => {
    playNow(song.id);
  });

  return row;
}

// 現在再生中の曲かどうかを判定する
function isCurrentSong(songId) {
  if (!playerState.isPlaying) return false;

  const currentSong = playQueue[currentIndex];
  return currentSong?.id === songId;
}

// 表示中のタブに対応する曲リストを返す
// 曲移動時は一覧全体を作り直さず、再生中表示だけを付け替える
function updatePlayingRowState() {
  document.querySelectorAll(".favorite-song-row.playing").forEach(row => {
    row.classList.remove("playing");
  });

  if (!playerState.isPlaying) return;

  const currentSong = playQueue[currentIndex];
  if (!currentSong) return;

  document
    .querySelectorAll(`.favorite-song-row[data-song-id="${currentSong.id}"]`)
    .forEach(row => {
      row.classList.add("playing");
    });
}

function getSongsForCurrentView() {
  return getSongsForView(currentView);
}

// 全曲データを、同じ videoId ごとの配信単位にまとめる
function createStreamList(songs) {
  const streamMap = new Map();

  songs.forEach(song => {
    if (!streamMap.has(song.videoId)) {
      streamMap.set(song.videoId, {
        videoId: song.videoId,
        streamTitle: song.streamTitle,
        date: song.date,
        songs: []
      });
    }

    streamMap.get(song.videoId).songs.push(song);
  });

  const streams = [...streamMap.values()];

  // 新しい配信が上に来るように並べ替える
  streams.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    if (isNaN(dateA)) return 1;
    if (isNaN(dateB)) return -1;

    return dateB - dateA;
  });

  return streams;
}


// ===============================================
// 曲一覧モーダル
// ===============================================

// サムネイルを押したときに、その配信に含まれる曲をモーダルで表示する
function openSongModal(stream) {
  const modal = document.getElementById("songModal");
  const thumb = document.getElementById("modalThumb");
  const title = document.getElementById("modalStreamTitle");
  const date = document.getElementById("modalDate");
  const songList = document.getElementById("modalSongList");

  if (!modal || !thumb || !title || !date || !songList) return;

  thumb.src = `https://img.youtube.com/vi/${stream.videoId}/hqdefault.jpg`;
  title.innerText = stream.streamTitle || "";
  date.innerText = stream.date || "";
  songList.innerHTML = "";

  // モーダル内の曲行もまとめて追加し、表示時の再計算を抑える
  const fragment = document.createDocumentFragment();

  stream.songs
    .filter(matchesSearch)
    .forEach(song => {
      fragment.appendChild(createModalSongButton(song));
    });

  songList.appendChild(fragment);

  modal.classList.remove("hidden");
}

// モーダル内に表示する1曲分の行を作る
function createModalSongButton(song) {
  const button = document.createElement("div");
  button.className = "modal-song-btn";

  button.innerHTML = `
    <div class="modal-song-info">
      <div class="modal-song-name">${escapeHtml(song.song)}</div>
      <div class="modal-artist-name">${escapeHtml(song.artist)}</div>
    </div>

    <div class="modal-song-actions">
      <button class="modal-add-btn" type="button" aria-label="再生リストに追加">
        <svg viewBox="0 -960 960 960" class="modal-icon">
          <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
        </svg>
      </button>

      <button class="modal-fav-btn" type="button" aria-label="お気に入り">
        <svg viewBox="0 -960 960 960" class="modal-icon">
          <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/>
        </svg>
      </button>
    </div>
  `;

  setupSongActionButtons(button, song);

  // 曲行そのものを押したら、その曲をすぐ再生する
  button.addEventListener("click", () => {
    closeSongModal();
    playNow(song.id);
  });

  return button;
}

// 曲行にある「＋」「ハート」ボタンの状態とクリック処理を設定する
function setupSongActionButtons(root, song) {
  const addButton = root.querySelector(".modal-add-btn");
  const favoriteButton = root.querySelector(".modal-fav-btn");

  if (!addButton || !favoriteButton) return;

  setQueueButtonState(addButton, isInQueue(song.id));
  favoriteButton.classList.toggle("active", isFavorite(song.id));

  addButton.addEventListener("click", event => {
    event.stopPropagation();

    if (addToQueue(song)) {
      setQueueButtonState(addButton, true);
    }
  });

  favoriteButton.addEventListener("click", event => {
    event.stopPropagation();

    const active = toggleFavorite(song.id);
    favoriteButton.classList.toggle("active", active);

    syncQueueAfterFavoriteChange(song, active);

    if (currentView === "favorite") {
      renderList();
    }
  });
}

// モーダルを閉じる。HTML の onclick からも呼ばれる
function closeSongModal() {
  document.getElementById("songModal")?.classList.add("hidden");
}


// ===============================================
// お気に入り
// ===============================================

// localStorage からお気に入りの曲ID一覧を取り出す
function getFavorites() {
  return [...favoriteIdSet];
}

// localStorage のお気に入りを起動時に読み込み、以降の判定は Set を使う
function loadFavoriteCache() {
  favoriteIdSet = new Set(JSON.parse(localStorage.getItem("favorites") || "[]"));
}

// お気に入り保存時は localStorage と Set の両方を更新する
function saveFavorites(favorites) {
  favoriteIdSet = new Set(favorites);
  localStorage.setItem("favorites", JSON.stringify(favorites));
}

// 指定した曲がお気に入り済みかどうかを返す
function isFavorite(songId) {
  return favoriteIdSet.has(songId);
}

// お気に入りを追加または解除し、追加後の状態を返す
function toggleFavorite(songId) {
  if (favoriteIdSet.has(songId)) {
    const favorites = getFavorites().filter(id => id !== songId);
    saveFavorites(favorites);
    return false;
  }

  const favorites = [...favoriteIdSet, songId];
  saveFavorites(favorites);
  return true;
}


// ===============================================
// 再生リスト
// ===============================================

// 同じ曲を重複させずに再生リストへ追加する
function addToQueue(song) {
  if (isInQueue(song.id)) {
    return false;
  }

  queuedSongs.push(song);
  queuedSongIdSet.add(song.id);
  addToActivePlaybackQueue(song);

  if (currentView === "queue") {
    renderList();
  }

  return true;
}

// 再生中に＋追加された曲を、今の再生元に関係なく次曲候補へ入れる
function addToActivePlaybackQueue(song) {
  if (!playerState.isPlaying) return;
  if (playedSongIds.has(song.id)) return;
  if (playQueue.some(item => item.id === song.id)) return;

  playQueue.splice(currentIndex + 1, 0, song);
}

// 指定した曲が再生リストに入っているかを返す
function isInQueue(songId) {
  return queuedSongIdSet.has(songId);
}

// 再生リスト追加ボタンを、追加済みなら押せない見た目にする
function setQueueButtonState(button, added) {
  button.disabled = added;
  button.classList.toggle("is-added", added);
  button.setAttribute(
    "aria-label",
    added ? "再生リストに追加済み" : "再生リストに追加"
  );
}

// お気に入りから再生を始めたとき、再生リストにも同じ曲を表示する
function syncQueueFromFavorites(songs) {
  if (currentView !== "favorite") return;

  queuedSongs = [...songs];
  syncQueuedSongIdSet();
}

// お気に入り再生中に追加した曲を、再生リスト表示にもすぐ反映する
function syncQueueAfterFavoriteChange(song, active) {
  if (!active) return;
  if (currentPlaybackView !== "favorite") return;

  addToQueue(song);
}

// queuedSongs をまとめて差し替えた後、ID Set も同じ内容にそろえる
function syncQueuedSongIdSet() {
  queuedSongIdSet = new Set(queuedSongs.map(song => song.id));
}

// 指定した表示モードに対応する曲リストを返す
function getSongsForView(view) {
  if (view === "favorite") {
    return playlist.filter(song => favoriteIdSet.has(song.id));
  }

  if (view === "queue") {
    return queuedSongs;
  }

  return playlist;
}

// 指定した検索文字に曲が一致するかを判定する
function matchesKeyword(song, keyword) {
  if (!keyword) return true;

  return song.searchText.includes(keyword);
}

// 検索対象の項目を1つの小文字文字列にまとめる
function createSongSearchText(song) {
  return [
    song.song,
    song.artist,
    song.streamTitle,
    song.keyword
  ].join(" ").toLowerCase();
}

// 再生中の曲を保ったまま、お気に入り・再生リストを最新状態から取り直す
function refreshPlaybackQueue() {
  if (currentPlaybackView !== "favorite" && currentPlaybackView !== "queue") return;

  const currentSong = playQueue[currentIndex];
  if (!currentSong) return;

  const manuallyQueuedSongs = playQueue.filter(song =>
    song.id !== currentSong.id
    && !playedSongIds.has(song.id)
    && queuedSongIdSet.has(song.id)
  );

  const latestSongs = getSongsForView(currentPlaybackView)
    .filter(song => matchesKeyword(song, playbackSearchKeyword));

  if (latestSongs.length === 0) {
    playQueue = [currentSong];
    currentIndex = 0;
    return;
  }

  if (playerState.isShuffle) {
    const remainingSongs = mergeUniqueSongs([
      ...latestSongs,
      ...manuallyQueuedSongs
    ]).filter(song =>
      song.id !== currentSong.id && !playedSongIds.has(song.id)
    );

    shuffleList(remainingSongs);
    playQueue = [currentSong, ...remainingSongs];
    currentIndex = 0;
    return;
  }

  const remainingSongs = mergeUniqueSongs([
    ...latestSongs,
    ...manuallyQueuedSongs
  ]).filter(song =>
    song.id !== currentSong.id && !playedSongIds.has(song.id)
  );

  playQueue = [currentSong, ...remainingSongs];
  currentIndex = 0;
}

// IDが同じ曲を1つにまとめ、先に出てきた順番を残す
function mergeUniqueSongs(songs) {
  const songMap = new Map();

  songs.forEach(song => {
    if (!songMap.has(song.id)) {
      songMap.set(song.id, song);
    }
  });

  return [...songMap.values()];
}

// 再生順を作る。シャッフルONなら並び替え、開始曲があれば先頭に固定する
function createPlayQueue(baseList, startItem = null) {
  if (!baseList || baseList.length === 0) return [];

  if (!startItem) {
    const queue = [...baseList];

    if (playerState.isShuffle) {
      shuffleList(queue);
    }

    return queue;
  }

  const rest = baseList.filter(item => item.id !== startItem.id);

  if (playerState.isShuffle) {
    shuffleList(rest);
  }

  return [startItem, ...rest];
}

// 配列をその場でシャッフルする
function shuffleList(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [list[i], list[randomIndex]] = [list[randomIndex], list[i]];
  }
}


// ===============================================
// 再生操作
// ===============================================

// 中央の再生ボタンから呼ばれる。表示中のタブに合わせて再生対象を決める
function playSelected() {
  if (playerState.isPlaying) {
    stopVideo();
    return;
  }

  const songs = getSongsForCurrentView().filter(matchesSearch);

  if (songs.length === 0) {
    alert("再生できる曲がありません");
    return;
  }

  currentPlaybackView = currentView;
  playbackSearchKeyword = searchKeyword;
  playedSongIds = new Set();
  syncQueueFromFavorites(songs);
  playQueue = createPlayQueue(songs);
  currentIndex = 0;

  waitForPlayerReady(() => {
    loadVideo(currentIndex);
    updatePlayingRowState();
  });
}

// 曲行をクリックしたとき、その曲から再生を始める
function playNow(songId) {
  waitForPlayerReady(() => {
    const clickedSong = playlistMap.get(String(songId));
    if (!clickedSong) return;

    const baseList = getSongsForCurrentView().filter(matchesSearch);
    currentPlaybackView = currentView;
    playbackSearchKeyword = searchKeyword;
    playedSongIds = new Set();
    syncQueueFromFavorites(baseList);
    playQueue = createPlayQueue(baseList, clickedSong);
    currentIndex = 0;

    loadVideo(currentIndex);
    updatePlayingRowState();
  });
}

// ひとつ前の曲に戻る
function prevVideo() {
  if (isChangingVideo || !playerState.isPlaying || playQueue.length === 0) return;

  isChangingVideo = true;

  try {
    if (currentIndex > 0) {
      currentIndex--;
    } else if (playerState.isLoop) {
      currentIndex = playQueue.length - 1;
    } else {
      return;
    }

    loadVideo(currentIndex);
    updatePlayingRowState();
  } finally {
    setTimeout(() => {
      isChangingVideo = false;
    }, 300);
  }
}

// 次の曲へ進む。最後まで来たら、ループONなら先頭へ戻る
function nextVideo() {
  if (isChangingVideo || !playerState.isPlaying) return;

  isChangingVideo = true;

  try {
    refreshPlaybackQueue();

    if (playQueue.length === 0) {
      stopVideo();
      return;
    }

    if (currentIndex + 1 < playQueue.length) {
      currentIndex++;
      loadVideo(currentIndex);
      updatePlayingRowState();
      return;
    }

    if (playerState.isLoop) {
      if (currentPlaybackView === "favorite" || currentPlaybackView === "queue") {
        const currentSong = playQueue[currentIndex];
        playedSongIds = new Set(currentSong ? [currentSong.id] : []);
        refreshPlaybackQueue();

        if (currentIndex + 1 < playQueue.length) {
          currentIndex++;
          loadVideo(currentIndex);
          updatePlayingRowState();
          return;
        }
      }

      currentIndex = 0;
      loadVideo(currentIndex);
      updatePlayingRowState();
      return;
    }

    stopVideo();
  } finally {
    setTimeout(() => {
      isChangingVideo = false;
    }, 300);
  }
}

// ループON/OFFを切り替える
function toggleLoop() {
  playerState.isLoop = !playerState.isLoop;
  updateControls();
}

// シャッフルON/OFFを切り替える。再生中にONにした場合は現在曲を先頭にして並び替える
function toggleShuffle() {
  playerState.isShuffle = !playerState.isShuffle;
  updateControls();

  if (!playerState.isShuffle || !playerState.isPlaying) return;

  const currentSong = playQueue[currentIndex];
  if (!currentSong) return;

  if (currentPlaybackView === "favorite" || currentPlaybackView === "queue") {
    refreshPlaybackQueue();
  } else {
    playQueue = createPlayQueue(playQueue, currentSong);
    currentIndex = 0;
  }

  updatePlayingRowState();
}

// 再生・シャッフル・ループボタンの見た目を、現在の状態に合わせる
function updateControls() {
  document.getElementById("playBtn")
    ?.classList.toggle("playing", playerState.isPlaying);

  document.getElementById("shuffleBtn")
    ?.classList.toggle("active", playerState.isShuffle);

  document.getElementById("loopBtn")
    ?.classList.toggle("active", playerState.isLoop);
}

// YouTube表示部分を開閉する。再生操作と曲名表示は残す
function togglePlayerCollapse() {
  const playerArea = document.getElementById("playerArea");
  if (!playerArea) return;

  playerArea.classList.toggle("collapsed");
  updatePlayerCollapseButton();
}

// 折りたたみボタンの表示とアクセシビリティ情報を現在状態に合わせる
function updatePlayerCollapseButton() {
  const playerArea = document.getElementById("playerArea");
  const button = document.getElementById("playerToggleBtn");

  if (!playerArea || !button) return;

  const collapsed = playerArea.classList.contains("collapsed");

  button.textContent = collapsed ? "▽" : "△";
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute(
    "aria-label",
    collapsed ? "プレイヤーを表示" : "プレイヤーを折りたたむ"
  );
}

// HTML の onclick から確実に呼べるように window に公開する
window.togglePlayerCollapse = togglePlayerCollapse;


// ===============================================
// YouTube プレイヤー
// ===============================================

// YouTube IFrame API の読み込みが終わると、自動でこの関数が呼ばれる
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("player", {
    events: {
      onReady: () => {
        isPlayerReady = true;

        playerReadyCallbacks.forEach(callback => callback());
        playerReadyCallbacks = [];
      },
      onStateChange: onPlayerStateChange
    }
  });
};

// プレイヤー準備前に再生しようとした処理は、準備完了後に実行する
function waitForPlayerReady(callback) {
  if (isPlayerReady) {
    callback();
    return;
  }

  playerReadyCallbacks.push(callback);
}

// YouTube側で再生が始まったら、曲ごとの終了秒監視を始める
function onPlayerStateChange(event) {
  if (event.data !== YT.PlayerState.PLAYING) return;

  const currentSong = playQueue[currentIndex];
  if (!currentSong) return;

  checkEnd(currentSong.start, currentSong.end);
}

// 指定された曲を YouTube プレイヤーに読み込ませる
function loadVideo(index) {
  const song = playQueue[index];
  if (!song) return;

  playerState.isPlaying = true;
  playedSongIds.add(song.id);
  updateControls();
  clearEndCheck();
  updateNowPlaying(song);

  player.loadVideoById({
    videoId: song.videoId,
    startSeconds: song.start
  });
}

// 曲名表示を更新する
function updateNowPlaying(song) {
  const nowPlaying = document.getElementById("nowPlaying");
  if (!nowPlaying) return;

  nowPlaying.innerText = `♪${song.song} - ${song.artist} (${currentIndex + 1}/${playQueue.length})`;
}

// 再生を停止し、画面上の状態も停止中に戻す
function stopVideo() {
  player?.stopVideo();
  clearEndCheck();

  playerState.isPlaying = false;
  updateControls();
  updatePlayingRowState();

  const nowPlaying = document.getElementById("nowPlaying");
  if (nowPlaying) {
    nowPlaying.innerText = "停止";
  }
}

// 終了秒の監視タイマーを止める
function clearEndCheck() {
  if (!endCheckInterval) return;

  clearInterval(endCheckInterval);
  endCheckInterval = null;
}

// 曲に end 秒がある場合、その秒数に到達したら次の曲へ進む
function checkEnd(start, end) {
  if (end === null || end <= start) return;

  clearEndCheck();

  endCheckInterval = setInterval(() => {
    const currentTime = player?.getCurrentTime?.();

    if (currentTime === undefined || currentTime === null) return;

    if (currentTime >= end) {
      clearEndCheck();
      nextVideo();
    }
  }, 300);
}


// ===============================================
// 小さな共通処理
// ===============================================

// HTMLに文字列を埋め込む前に、タグとして解釈されない形へ変換する
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// iPhoneなどで 100vh がずれる問題を避けるため、実際の画面高さをCSS変数へ入れる
function updateAppHeight() {
  document.documentElement.style.setProperty(
    "--app-height",
    `${window.innerHeight}px`
  );
}

// 検索欄からフォーカスが外れたとき、スマホの画面位置ずれを戻す
document.getElementById("searchInput")?.addEventListener("blur", () => {
  window.scrollTo(0, 0);
});

window.addEventListener("resize", updateAppHeight);
updateAppHeight();
