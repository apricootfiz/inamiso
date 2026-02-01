/* ===============================
   トップページ：月リンク自動生成
================================ */

// 利用可能な月（YYYY-MM）
const availableMonths = [
  "2026-01",
  "2026-02"
];

const monthList = document.getElementById("monthList");

// 念のためガード
if (monthList) {
  const byYear = {};

  // 年ごとにまとめる
  availableMonths.forEach(key => {
    const [year, month] = key.split("-");
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(month);
  });

  // 年・月を昇順で表示
  Object.keys(byYear).sort().forEach(year => {
    // 年見出し
    const yearLi = document.createElement("li");
    yearLi.textContent = `${year}年`;
    yearLi.style.fontWeight = "bold";
    monthList.appendChild(yearLi);

    const ul = document.createElement("ul");

    byYear[year].sort().forEach(month => {
      const li = document.createElement("li");
      const a = document.createElement("a");

      a.href = `assets/calendar/${year}/${month}/`;
      a.textContent = `${Number(month)}月`;

      li.appendChild(a);
      ul.appendChild(li);
    });

    monthList.appendChild(ul);
  });
}
