/**
 * tray-quicklook.js — Quick Look 面板脚本（无框架，走 trayQl preload）。
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  function fmtTime(ms) {
    if (!ms) return "尚未检查";
    var d = Date.now() - ms;
    if (d < 60000) return "刚刚检查";
    var m = Math.floor(d / 60000);
    if (m < 60) return m + " 分钟前检查";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " 小时前检查";
    return Math.floor(h / 24) + " 天前检查";
  }

  function render(snap) {
    if (!snap) return;
    $("n-up").textContent = String(snap.updatable != null ? snap.updatable : 0);
    $("n-ok").textContent = String(snap.upToDateCount != null ? snap.upToDateCount : 0);
    $("n-all").textContent = String(snap.total != null ? snap.total : 0);
    $("sub").textContent = fmtTime(snap.lastCheckAt);

    var list = $("list");
    list.innerHTML = "";
    var updates = snap.updates || [];
    if (!snap.hasChecked) {
      list.innerHTML =
        '<div class="empty"><div class="empty-icon">⏳</div><div>尚未检查更新</div><div>点下方「检查更新」开始</div></div>';
      return;
    }
    if (updates.length === 0) {
      list.innerHTML =
        '<div class="empty"><div class="empty-icon">✓</div><div>全部已是最新</div></div>';
      return;
    }
    updates.forEach(function (u) {
      var row = document.createElement("div");
      row.className = "row";
      row.title = "在主面板中定位并升级 " + u.name;
      row.innerHTML =
        '<span class="row-name"></span><span class="row-ver"></span>';
      row.querySelector(".row-name").textContent = u.name;
      row.querySelector(".row-ver").textContent =
        (u.installed || "?") + " → " + (u.latest || "?");
      row.addEventListener("click", function () {
        if (window.trayQl) {
          window.trayQl.action({ action: "focus-update", rowName: u.name });
        }
      });
      list.appendChild(row);
    });
  }

  async function load() {
    if (!window.trayQl) return;
    try {
      var snap = await window.trayQl.getSnapshot();
      if (snap && snap.ok !== false) render(snap);
      else $("sub").textContent = "加载失败";
    } catch (e) {
      $("sub").textContent = "加载失败";
    }
  }

  $("btn-open").addEventListener("click", function () {
    if (window.trayQl) window.trayQl.action({ action: "open-panel" });
  });
  $("btn-check").addEventListener("click", function () {
    if (window.trayQl) window.trayQl.action({ action: "check" });
    $("sub").textContent = "检查中…";
  });

  if (window.trayQl && window.trayQl.onRefresh) {
    window.trayQl.onRefresh(function (snap) {
      render(snap);
    });
  }

  load();
})();
