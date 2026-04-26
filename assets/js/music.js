let player;
let playlist = [];
let currentIndex = 0;

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:json&gid=2072097352";


// ▼ スプレッドシート読み込み
async function loadPlaylist() {
  const res = await fetch(SHEET_URL);
  const text = await res.text();

  const json = JSON.parse(text.substr(47).slice(0, -2));
  const rows = json.table.rows;

  // ▼ 1行目はヘッダーなのでスキップ
  playlist = rows.slice(1).map(r => ({
    date: r.c[0]?.v || "",
    streamTitle: r.c[1]?.v || "",
    url: (r.c[2]?.v || "").replace("&amp;", "&"),
    start: Number(r.c[3]?.v || 0),
    end: Number(r.c[4]?.v || 0),
    song: r.c[5]?.v || "",
    artist: r.c[6]?.v || ""
  }));

  console.log(playlist);

  loadVideo(0);
}

// ▼ URLからvideoId取得
function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
  return match ? match[1] : null;
}

// ▼ YouTube API準備完了時
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '360',
    width: '640',
    playerVars: {
      autoplay: 1,
      mute: 1
    },
    events: {
      'onReady': loadPlaylist,
      'onStateChange': onPlayerStateChange
    }
  });
}

// ▼ 動画読み込み
function loadVideo(index) {
  currentIndex = index;
  const item = playlist[index];

  console.log("再生中:", item.song, "-", item.artist);

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

    const current = player.getCurrentTime();

    if (endTime && current >= endTime) {
      clearInterval(interval);
      nextVideo();
    }
  }, 500);
}

// ▼ 次の動画
function nextVideo() {
  if (currentIndex + 1 < playlist.length) {
    loadVideo(currentIndex + 1);
  } else {
    console.log("再生終了");
    player.stopVideo();
  }
}

// ▼ 動画終了時
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    nextVideo();
  }
}