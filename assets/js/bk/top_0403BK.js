// 利用可能な月
const availableMonths = [
  "2026-01",
  "2026-02",
  "2026-03"
];

const monthList = document.getElementById("monthList");

if (monthList) {

  // 年ごとにまとめる
  const byYear = {};
  availableMonths.forEach(key => {
    const [y, m] = key.split("-");
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(m);
  });

  // 年→月の順で表示
  Object.keys(byYear).sort().forEach(year => {
    const yearLi = document.createElement("li");
    yearLi.className = "year-item";
    yearLi.innerHTML = `<span class="year">${year}年</span>`;

    const ul = document.createElement("ul");
    ul.className = "month-list";

    byYear[year].sort().forEach(month => {
      const li = document.createElement("li");
      li.className = "month-item";

      const a = document.createElement("a");
      a.href = `calendar/${year}/${month}/`;
      a.textContent = `${Number(month)}月`;

      li.appendChild(a);
      ul.appendChild(li);
    });

    yearLi.appendChild(ul);
    monthList.appendChild(yearLi);
  });

}
