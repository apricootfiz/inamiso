let player;
let playlist = [];
let selectedList = [];
let currentIndex = 0;
let isPlaying = false;

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:json&gid=2072097352";

// ▼ 初期化（※ここで再生しない）
async function loadPlaylist() {
  const res = await fetch(SHEET_URL);
  const text = await res.text();

  const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1];
  const json = JSON.parse(jsonText);

  const rows = json.table.rows;

  playlist = rows.map((r, i) => ({
    id: i,
    url: (r.c?.[2]?.v || "").replace("&amp;", "&"),
    start: Number(r.c?.[3]?.v || 0),
    end: Number(r.c?.[4]?.v || 0),
    song: r.c?.[5]?.v || "曲名なし",
    artist: r.c?.[6]?.v || ""
  }));

  renderList();
}

// ▼ リスト表示
function renderList() {
  const container = document.getElementById("list");
  container.innerHTML = "";

  playlist.forEach(item => {
    const div = document.createElement("div");
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${item.id}">
        ${item.song} - ${item.artist}
      </label>
    `;
    container.appendChild(div);
  });
}

// ▼ 再生開始（ここで初めて再生）
function playSelected() {
  selectedList = [];

  document.querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
    const item = playlist.find(p => p.id == cb.value);
    if (item) selectedList.push(item);
  });

  if (selectedList.length === 0) {
    alert("曲を選択してください");
    return;
  }

  // シャッフル
  if (document.getElementById("shuffle").checked) {
    selectedList.sort(() => Math.random() - 0.5);
  }

  currentIndex = 0;
  isPlaying = true;
  loadVideo(currentIndex);
}

// ▼ 前へ
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

// ▼ 次へ
function nextVideo() {
  if (!isPlaying) return;

  if (currentIndex + 1 < selectedList.length) {
    currentIndex++;
  } else if (document.getElementById("loop").checked) {
    currentIndex = 0;
  } else {
    isPlaying = false;
    document.getElementById("nowPlaying").innerText = "再生終了";
    player.stopVideo();
    return;
  }

  loadVideo(currentIndex);
}

// ▼ YouTube準備
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '360',
    width: '640',
    playerVars: {
      autoplay: 0
    },
    events: {
      'onReady': loadPlaylist,
      'onStateChange': onPlayerStateChange
    }
  });
}

// ▼ 再生
function loadVideo(index) {
  const item = selectedList[index];

  document.getElementById("nowPlaying").innerText =
    `再生中: ${item.song} - ${item.artist} (${index + 1}/${selectedList.length})`;

  player.loadVideoById({
    videoId: getVideoId(item.url),
    startSeconds: item.start
  });

  checkEnd(item.end);
}

// ▼ 終了時間チェック
function checkEnd(endTime) {
  const interval = setInterval(() => {
    if (!player || !player.getCurrentTime) return;

    if (endTime && player.getCurrentTime() >= endTime) {
      clearInterval(interval);
      nextVideo();
    }
  }, 500);
}

// ▼ 動画ID取得
function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
  return match ? match[1] : null;
}

// ▼ 動画終了時
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    nextVideo();
  }
}