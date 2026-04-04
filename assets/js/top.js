// ===============================
// 設定：スプレッドシートCSV URL
// ===============================
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1fnYlyOuVm6bl21crPuUXCmWE6jQuxjeAfl-T0z-PhcA/gviz/tq?tqx=out:csv";

// 月リストを表示するDOM
const monthList = document.getElementById("monthList");


// ===============================
// CSV取得 → 月一覧生成
// ===============================
fetch(sheetUrl)
  .then(res => res.text())
  .then(csv => {

    // CSVを1行ずつ分解（1行目はヘッダーなので除外）
    const lines = csv.split(/\r?\n/).slice(1);

    // 月の重複を防ぐためにSetを使用
    const monthSet = new Set();

    lines.forEach(line => {
      if (!line.trim()) return; // 空行スキップ

      // CSVを安全に分割（カンマを含む文字列対応）
      const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      if (!cols) return;

      // 1列目（日付）を取得
      const dateRaw = (cols[0] || "").replace(/^"|"$/g, "").trim();
      if (!dateRaw) return;

      // Date型に変換
      const d = new Date(dateRaw);
      if (isNaN(d)) return; // 日付として解釈できない場合は無視

      // YYYY-MM形式に変換
      const key =
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      // Setに追加（重複自動排除）
      monthSet.add(key);
    });

    // 月一覧を配列に変換して昇順ソート
    const availableMonths = Array.from(monthSet).sort().reverse();

    // 表示処理へ
    renderMonthList(availableMonths);
  });


// ===============================
// 月リスト描画処理
// ===============================
function renderMonthList(availableMonths) {

  // 表示先がなければ何もしない
  if (!monthList) return;

  // 年ごとにグループ化するためのオブジェクト
  const byYear = {};

  // YYYY-MM → 年ごとにまとめる
  availableMonths.forEach(key => {
    const [y, m] = key.split("-");

    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(m);
  });

  // 年ごとに処理（昇順）
  Object.keys(byYear).sort().forEach(year => {

    // 年のLI作成
    const yearLi = document.createElement("li");
    yearLi.className = "year-item";
    yearLi.innerHTML = `<span class="year">${year}年</span>`;

    // 月リスト用UL
    const ul = document.createElement("ul");
    ul.className = "month-list";

    // 月を昇順で並べる
    byYear[year].sort().reverse().forEach(month => {

      const li = document.createElement("li");
      li.className = "month-item";

      const a = document.createElement("a");

      // カレンダーページへのリンク
      // a.href = `calendar/${year}/${month}/`;
      a.href = `calendar/index.html?month=${year}-${month.padStart(2, "0")}`;

      // 表示テキスト（01 → 1月）
      a.textContent = `${Number(month)}月`;

      li.appendChild(a);
      ul.appendChild(li);
    });

    // 年の中に月リストを入れる
    yearLi.appendChild(ul);

    // 最終的に画面へ追加
    monthList.appendChild(yearLi);
  });
}