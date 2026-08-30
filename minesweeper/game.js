(function () {
  "use strict";

  var N = 3;
  var MINES = 3;
  var startEl = document.getElementById("start");
  var playEl = document.getElementById("play");
  var clearEl = document.getElementById("clear");
  var boardEl = document.getElementById("board");
  var againBtn = document.getElementById("again");

  var sfx = {
    tap: new Audio("audio/tap.wav"),
    star: new Audio("audio/star.wav"),
    nakama: new Audio("audio/nakama.wav"),
    dodon: new Audio("audio/dodon.wav")
  };
  Object.keys(sfx).forEach(function (k) { sfx[k].volume = 1; });

  var cells = [];
  var placed = false;
  var over = false;

  function play(el) {
    try {
      el.currentTime = 0;
      var p = el.play();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (err) {}
  }

  function idx(r, c) { return r * N + c; }

  function neighbors(i) {
    var r = (i / N) | 0;
    var c = i % N;
    var out = [];
    var dr, dc, nr, nc;
    for (dr = -1; dr <= 1; dr++) {
      for (dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        nr = r + dr;
        nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(idx(nr, nc));
      }
    }
    return out;
  }

  function countAdj(i) {
    var n = 0;
    neighbors(i).forEach(function (j) {
      if (cells[j].mine) n += 1;
    });
    return n;
  }

  function face(cell) {
    if (!cell.open) return "url(\"assets/cell-closed.jpg\")";
    if (cell.mine) return "url(\"assets/cell-kaiju-awake.jpg\")";
    if (cell.adj === 0) return "url(\"assets/cell-star.jpg\")";
    return "url(\"assets/cell-print-" + cell.adj + ".jpg\")";
  }

  function paint() {
    cells.forEach(function (cell) {
      cell.btn.style.backgroundImage = face(cell);
    });
  }

  function placeMines(safe) {
    var spots = [];
    var i;
    for (i = 0; i < N * N; i++) if (i !== safe) spots.push(i);
    var n = MINES;
    while (n && spots.length) {
      var k = Math.floor(Math.random() * spots.length);
      cells[spots[k]].mine = true;
      spots.splice(k, 1);
      n -= 1;
    }
    cells.forEach(function (cell, i) {
      cell.adj = cell.mine ? 0 : countAdj(i);
    });
    placed = true;
  }

  function remainingClosed() {
    return cells.filter(function (c) { return !c.open; });
  }

  function allMinesAwake() {
    return cells.filter(function (c) { return c.mine; }).every(function (c) { return c.open; });
  }

  function allOpen() {
    return cells.every(function (c) { return c.open; });
  }

  function autoWakeIfOnlyMines() {
    var closed = remainingClosed();
    if (!closed.length) return;
    if (closed.every(function (c) { return c.mine; })) {
      closed.forEach(function (c) { c.open = true; });
    }
  }

  function win() {
    if (over) return;
    over = true;
    autoWakeIfOnlyMines();
    cells.forEach(function (c) { c.open = true; });
    paint();
    play(sfx.dodon);
    clearEl.classList.add("is-on");
  }

  function openCell(i, fromFlood) {
    var cell = cells[i];
    if (over || cell.open) return;
    if (!placed) placeMines(i);
    cell = cells[i];
    if (cell.open) return;
    cell.open = true;
    if (!fromFlood) play(sfx.tap);
    if (cell.mine) {
      play(sfx.nakama);
    } else if (cell.adj === 0) {
      play(sfx.star);
      neighbors(i).forEach(function (j) {
        if (!cells[j].open && !cells[j].mine) openCell(j, true);
      });
    }
    autoWakeIfOnlyMines();
    paint();
    if (allOpen() || allMinesAwake()) win();
  }

  function build() {
    boardEl.innerHTML = "";
    cells = [];
    placed = false;
    over = false;
    clearEl.classList.remove("is-on");
    var i;
    for (i = 0; i < N * N; i++) {
      (function (i) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.setAttribute("aria-label", "いし");
        btn.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          openCell(i, false);
        });
        boardEl.appendChild(btn);
        cells.push({ btn: btn, mine: false, open: false, adj: 0 });
      })(i);
    }
    paint();
  }

  function goPlay() {
    startEl.classList.remove("is-on");
    playEl.classList.add("is-on");
    build();
  }

  startEl.addEventListener("pointerdown", function (e) {
    if (e.target && e.target.closest && e.target.closest("a.hub-back")) return;
    e.preventDefault();
    play(sfx.tap);
    goPlay();
  });

  againBtn.addEventListener("click", function () {
    clearEl.classList.remove("is-on");
    build();
  });

  document.addEventListener("touchmove", function (e) {
    if (e.target && e.target.closest && e.target.closest("a.hub-back")) return;
    e.preventDefault();
  }, { passive: false });
})();
