console.log("JS読み込まれた"); // デバッグ用
let player;
let playlist = [];
let selectedList = [];
let currentIndex = 0;
let isPlaying = false;
let isPlayerReady = false;

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:json&gid=2072097352";


// ▼ 初期化 （ページ読み込み後の再生回避）
async function loadPlaylist() {
console.log("loadPlaylist呼ばれた"); // デバッグ用
  const res = await fetch(SHEET_URL);
  const text = await res.text();

  const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1];
  const json = JSON.parse(jsonText);

  const rows = json.table.rows || [];


  playlist = rows.map((r, i) => ({
    id: i,
    date: r.c?.[0]?.v || "",
    streamTitle: r.c?.[1]?.v || "",
    url: (r.c?.[2]?.v || "").replace("&amp;", "&"),
    start: Number(r.c?.[3]?.v || 0),
    end: Number(r.c?.[4]?.v || 0),
    song: r.c?.[5]?.v || "曲名なし",
    artist: r.c?.[6]?.v || ""
  }));

  console.log("playlist:", playlist);

  renderList();
  loadSelection();
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("DOM読み込み完了");
  loadPlaylist();
});


// YYYY年の切り出し
function extractYear(date) {
  if (!date) return "不明";

  const match = String(date).match(/Date\((\d{4})/);
  return match ? match[1] : "不明";
}

// ▼ リスト表示用のグループ化
function groupByYearAndStream(data) {
  const result = {};

  data.forEach(item => {
    const year = extractYear(item.date);
    const stream = item.streamTitle || "不明";

    if (!result[year]) result[year] = {};
    if (!result[year][stream]) result[year][stream] = [];

    result[year][stream].push(item);
  });

  return result;
}

// ▼ リスト表示
function renderList() {
  const container = document.getElementById("list");

  if (!container) {
    console.error("list要素がない");
    return;
  }

  container.innerHTML = "";

  const grouped = groupByYearAndStream(playlist);

  console.log("grouped:", grouped);

  Object.keys(grouped).sort().forEach(year => {
    const yearBlock = document.createElement("div");

    const yearTitle = document.createElement("details");
    yearTitle.innerHTML = `<summary>${year}年</summary>`;

    Object.keys(grouped[year]).forEach(stream => {
      const streamBlock = document.createElement("details");
      streamBlock.innerHTML = `<summary>${stream}</summary>`;

      grouped[year][stream].forEach(item => {
        const div = document.createElement("div");

        div.innerHTML = `
          <label>
            <input type="checkbox" value="${item.id}">
            ${item.song} - ${item.artist}
          </label>
        `;

        streamBlock.appendChild(div);
      });

      yearTitle.appendChild(streamBlock);
    });

    yearBlock.appendChild(yearTitle);
    container.appendChild(yearBlock);
  });
}

// ▼ 再生リスト復元
function loadSelection() {
  const saved = JSON.parse(localStorage.getItem("playlistSelection") || "[]");

  document.querySelectorAll("input[type=checkbox]").forEach(cb => {
    if (saved.includes(cb.value)) {
      cb.checked = true;
    }
  });
}

// ▼ 再生リスト保存
function saveSelection() {
  const checked = [];

  document.querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
    checked.push(cb.value);
  });

  localStorage.setItem("playlistSelection", JSON.stringify(checked));
}

// ▼ 再生遅延ボタン
function waitForPlayerReady(callback) {
  const interval = setInterval(() => {
    if (isPlayerReady) {
      clearInterval(interval);
      callback();
    }
  }, 200);
}


// ▼ 再生開始
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
window.onYouTubeIframeAPIReady = function () {
  console.log("YouTube API呼ばれた");
  
  player = new YT.Player('player', {
    events: {
      'onReady': () => {
        console.log("player ready");
        isPlayerReady = true;
      }
    }
  });
}

// ▼ 再生
function loadVideo(index) {
  if (!player || !player.loadVideoById) {
    console.log("player未準備");
    return;
  }

  const item = selectedList[index];

  document.getElementById("nowPlaying").innerText =
    `再生中: ${item.song} - ${item.artist}`;

  player.loadVideoById({
    videoId: getVideoId(item.url),
    startSeconds: item.start
  });

  player.playVideo();

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

// ▼ 自動保存
document.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    saveSelection();
  }
});