/**
 * スーパーマインスイーパー — ゲーム本体
 * 機雷の配置は「最初のクリックのあと」に行う（そのマスと周囲8マスを除外）。
 */
(function () {
  "use strict";

  var DIFFS = {
    beginner: { rows: 9, cols: 9, mines: 10, label: "初級" },
    intermediate: { rows: 16, cols: 16, mines: 40, label: "中級" },
    expert: { rows: 16, cols: 30, mines: 99, label: "上級" }
  };

  var LONG_PRESS_MS = 450;
  var MOVE_CANCEL_PX = 12;

  var state = {
    rows: 9,
    cols: 9,
    mines: 10,
    board: [],
    status: "ready", // ready | playing | won | lost
    flags: 0,
    opened: 0,
    seconds: 0,
    timerId: null,
    minesPlaced: false,
    autoFlag: true,
    showProb: false,
    hintSafe: {},
    hintSource: null,
    lastAnalysis: null,
    message: "",
    messageKind: "",
    focusR: 0,
    focusC: 0,
    custom: { cols: 16, rows: 16, mines: 40 }
  };

  var els = {};
  var suppressClick = false;
  var pressTimer = null;
  var pressStart = null;
  var buttonsDown = 0;
  var didChord = false;

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function neighbors(r, c) {
    var out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
          out.push(state.board[nr][nc]);
        }
      }
    }
    return out;
  }

  function emptyBoard(rows, cols) {
    var board = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        row.push({
          r: r,
          c: c,
          mine: false,
          revealed: false,
          flagged: false,
          adj: 0,
          exploded: false,
          wrongFlag: false
        });
      }
      board.push(row);
    }
    return board;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /**
   * 最初のクリック後に機雷を置く。
   * クリックしたマスとその周囲（最大8）には機雷を置かない。
   */
  function placeMines(safeR, safeC) {
    var forbidden = {};
    forbidden[safeR + "," + safeC] = true;
    var nbs = neighbors(safeR, safeC);
    for (var i = 0; i < nbs.length; i++) {
      forbidden[nbs[i].r + "," + nbs[i].c] = true;
    }

    var candidates = [];
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (!forbidden[r + "," + c]) candidates.push({ r: r, c: c });
      }
    }

    // カスタム上限は cells-9 なので、通常は forbidden を全部除ける。
    // 万一足りなければクリックマスだけ除外する。
    if (candidates.length < state.mines) {
      candidates = [];
      for (var r2 = 0; r2 < state.rows; r2++) {
        for (var c2 = 0; c2 < state.cols; c2++) {
          if (!(r2 === safeR && c2 === safeC)) candidates.push({ r: r2, c: c2 });
        }
      }
    }

    shuffle(candidates);
    var placed = Math.min(state.mines, candidates.length);
    for (var m = 0; m < placed; m++) {
      state.board[candidates[m].r][candidates[m].c].mine = true;
    }

    for (var rr = 0; rr < state.rows; rr++) {
      for (var cc = 0; cc < state.cols; cc++) {
        if (state.board[rr][cc].mine) continue;
        var count = 0;
        var around = neighbors(rr, cc);
        for (var k = 0; k < around.length; k++) if (around[k].mine) count++;
        state.board[rr][cc].adj = count;
      }
    }

    // 第一クリック安全の自己チェック
    if (typeof console !== "undefined" && console.assert) {
      console.assert(!state.board[safeR][safeC].mine, "first click cell must not be a mine");
      var allNSafe = true;
      for (var ni = 0; ni < nbs.length; ni++) {
        if (nbs[ni].mine) allNSafe = false;
      }
      // 機雷数が足りる盤面では周囲も安全であるべき
      if (state.rows * state.cols - state.mines >= 1 + nbs.length) {
        console.assert(allNSafe, "first-click neighborhood should have no mines");
      }
    }

    state.minesPlaced = true;
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    if (state.timerId) return;
    state.timerId = setInterval(function () {
      if (state.status !== "playing") return;
      state.seconds = Math.min(999, state.seconds + 1);
      renderHUD();
    }, 1000);
  }

  function canPlay() {
    return state.status === "ready" || state.status === "playing";
  }

  function clearHint() {
    state.hintSafe = {};
    state.hintSource = null;
  }

  function setMessage(text, kind) {
    state.message = text || "";
    state.messageKind = kind || "";
    renderMessage();
  }

  function startGame(rows, cols, mines, diffKey) {
    stopTimer();
    state.rows = rows;
    state.cols = cols;
    state.mines = mines;
    state.board = emptyBoard(rows, cols);
    state.status = "ready";
    state.flags = 0;
    state.opened = 0;
    state.seconds = 0;
    state.minesPlaced = false;
    state.lastAnalysis = null;
    state.focusR = 0;
    state.focusC = 0;
    clearHint();
    if (diffKey) {
      var btns = document.querySelectorAll("[data-diff]");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("is-active", btns[i].getAttribute("data-diff") === diffKey);
        btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-diff") === diffKey ? "true" : "false");
      }
      $("custom-form").hidden = diffKey !== "custom";
    }
    setMessage("最初のマスを開いてください。そことその周りは安全です。", "info");
    renderAll();
  }

  function countFlags() {
    var n = 0;
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (state.board[r][c].flagged) n++;
      }
    }
    return n;
  }

  function floodOpen(sr, sc) {
    var stack = [{ r: sr, c: sc }];
    var seen = {};
    while (stack.length) {
      var cur = stack.pop();
      var k = cur.r + "," + cur.c;
      if (seen[k]) continue;
      seen[k] = true;
      var cell = state.board[cur.r][cur.c];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      state.opened++;
      if (cell.adj === 0) {
        var nbs = neighbors(cur.r, cur.c);
        for (var i = 0; i < nbs.length; i++) {
          if (!nbs[i].revealed && !nbs[i].flagged) {
            stack.push({ r: nbs[i].r, c: nbs[i].c });
          }
        }
      }
    }
  }

  function checkWin() {
    var need = state.rows * state.cols - state.mines;
    if (state.opened < need) return;
    state.status = "won";
    stopTimer();
    // 残りの機雷に旗を立てて「疑いなし」にする
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = state.board[r][c];
        if (cell.mine && !cell.flagged) cell.flagged = true;
      }
    }
    state.flags = countFlags();
    clearHint();
    setMessage("クリア！すべての安全なマスを開けました。", "win");
    renderAll();
  }

  function explode(cell) {
    state.status = "lost";
    stopTimer();
    cell.exploded = true;
    cell.revealed = true;
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var x = state.board[r][c];
        if (x.mine && !x.flagged) {
          x.revealed = true;
        }
        if (x.flagged && !x.mine) {
          x.wrongFlag = true;
        }
      }
    }
    clearHint();
    setMessage("爆発してしまいました。赤いマスが踏んだ機雷、×は誤った旗です。", "lose");
    renderAll();
  }

  function openCell(r, c, keepMessage) {
    if (!canPlay()) return;
    var cell = state.board[r][c];
    if (cell.revealed || cell.flagged) return;

    if (!state.minesPlaced) {
      placeMines(r, c);
      state.status = "playing";
      startTimer();
    }

    if (cell.mine) {
      explode(cell);
      return;
    }

    floodOpen(r, c);
    clearHint();
    applyAutoFlag();
    if (!keepMessage && (state.status === "playing" || state.status === "ready")) {
      setMessage("", "");
    }
    renderAll();
    checkWin();
  }

  function toggleFlag(r, c) {
    if (!canPlay()) return;
    var cell = state.board[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flags = countFlags();
    clearHint();
    if (state.minesPlaced) applyAutoFlag();
    setMessage("", "");
    renderAll();
  }

  function chordAt(r, c) {
    if (!canPlay()) return;
    var cell = state.board[r][c];
    if (!cell.revealed || cell.mine) return;
    var nbs = neighbors(r, c);
    var flags = 0;
    for (var i = 0; i < nbs.length; i++) if (nbs[i].flagged) flags++;
    if (flags !== cell.adj) return;

    if (!state.minesPlaced) return;

    var hitMine = null;
    for (var j = 0; j < nbs.length; j++) {
      var nb = nbs[j];
      if (nb.flagged || nb.revealed) continue;
      if (nb.mine) {
        hitMine = nb;
        break;
      }
    }
    if (hitMine) {
      explode(hitMine);
      return;
    }
    for (var k = 0; k < nbs.length; k++) {
      var n2 = nbs[k];
      if (!n2.flagged && !n2.revealed) floodOpen(n2.r, n2.c);
    }
    clearHint();
    applyAutoFlag();
    setMessage("", "");
    renderAll();
    checkWin();
  }

  function analyzeNow() {
    if (!state.minesPlaced) {
      state.lastAnalysis = null;
      return null;
    }
    state.lastAnalysis = window.MinesweeperSolver.analyze(state.board, state.mines);
    return state.lastAnalysis;
  }

  function applyAutoFlag() {
    if (!state.autoFlag || !canPlay() || !state.minesPlaced) return;
    var guard = 0;
    while (guard++ < 40) {
      var result = analyzeNow();
      if (!result || result.certainMine.length === 0) break;
      var flaggedAny = false;
      for (var i = 0; i < result.certainMine.length; i++) {
        var p = result.certainMine[i];
        var cell = state.board[p.r][p.c];
        if (!cell.revealed && !cell.flagged) {
          cell.flagged = true;
          flaggedAny = true;
        }
      }
      if (!flaggedAny) break;
    }
    state.flags = countFlags();
  }

  function pickSafeDeduction(result) {
    var order = ["single-safe", "subset-safe", "overlap-safe", "enum-safe", "global-safe"];
    for (var t = 0; t < order.length; t++) {
      for (var i = 0; i < result.deductions.length; i++) {
        if (result.deductions[i].type === order[t]) return result.deductions[i];
      }
    }
    return null;
  }

  function pickMineDeduction(result) {
    var order = ["single-mine", "subset-mine", "overlap-mine", "enum-mine", "global-mine"];
    for (var t = 0; t < order.length; t++) {
      for (var i = 0; i < result.deductions.length; i++) {
        if (result.deductions[i].type === order[t]) return result.deductions[i];
      }
    }
    return null;
  }

  function showHint() {
    if (!canPlay()) {
      setMessage("ゲーム終了後は新しいゲームを始めてください。", "info");
      return;
    }
    if (!state.minesPlaced) {
      setMessage("最初のマスはどこを開いても安全です。好きなところを開いてください。", "info");
      return;
    }
    applyAutoFlag();
    var result = analyzeNow();
    clearHint();
    if (!result) return;

    var safeD = pickSafeDeduction(result);
    if (safeD) {
      for (var i = 0; i < result.certainSafe.length; i++) {
        var s = result.certainSafe[i];
        var cell = state.board[s.r][s.c];
        if (!cell.revealed && !cell.flagged) {
          state.hintSafe[s.r + "," + s.c] = true;
        }
      }
      // 説明の根拠になった数字マスを強調
      if (safeD.source) state.hintSource = safeD.source.r + "," + safeD.source.c;
      setMessage(window.MinesweeperSolver.explainDeduction(safeD), "hint");
      renderAll();
      return;
    }

    if (result.certainMine.length > 0) {
      setMessage("安全と確定できるマスはありませんが、機雷と確定できるマスはあります。「一手進める」か自動フラグを使ってください。", "info");
      renderAll();
      return;
    }

    setMessage("今の盤面では、確定できる安全なマスも機雷もありません。推測が必要です。", "warn");
    renderAll();
  }

  function stepOnce() {
    if (!canPlay()) {
      setMessage("ゲーム終了後は新しいゲームを始めてください。", "info");
      return;
    }
    if (!state.minesPlaced) {
      setMessage("最初の一手は盤面を見て選んでください。どこを開いても安全です。", "info");
      return;
    }
    var result = analyzeNow();
    if (!result) return;

    // 確定安全を1つ開く（自動フラグは旗だけ。一手は開くか旗か1手）
    var safeD = pickSafeDeduction(result);
    if (safeD) {
      for (var i = 0; i < result.certainSafe.length; i++) {
        var s = result.certainSafe[i];
        var cell = state.board[s.r][s.c];
        if (!cell.revealed && !cell.flagged) {
          setMessage("確定した安全マスを1つ開けました。" + window.MinesweeperSolver.explainDeduction(safeD), "hint");
          openCell(s.r, s.c, true);
          return;
        }
      }
    }

    var mineD = pickMineDeduction(result);
    if (mineD) {
      for (var j = 0; j < result.certainMine.length; j++) {
        var m = result.certainMine[j];
        var mc = state.board[m.r][m.c];
        if (!mc.revealed && !mc.flagged) {
          mc.flagged = true;
          state.flags = countFlags();
          clearHint();
          applyAutoFlag();
          setMessage("確定した機雷に旗を1つ立てました。" + window.MinesweeperSolver.explainDeduction(mineD), "hint");
          renderAll();
          return;
        }
      }
    }

    setMessage("確定できる手がありません。次は推測が必要です。", "warn");
    renderAll();
  }

  function pad3(n) {
    var sign = n < 0 ? "-" : "";
    var s = String(Math.abs(n));
    while (s.length < 3) s = "0" + s;
    return sign + s;
  }

  function faceEmoji() {
    if (state.status === "won") return "😎";
    if (state.status === "lost") return "😵";
    return "🙂";
  }

  function renderHUD() {
    $("mine-count").textContent = pad3(state.mines - state.flags);
    $("timer").textContent = pad3(state.seconds);
    $("face").textContent = faceEmoji();
    $("face").setAttribute(
      "aria-label",
      state.status === "won" ? "クリア。新しいゲーム" :
      state.status === "lost" ? "失敗。新しいゲーム" : "新しいゲーム"
    );
    document.body.classList.toggle("is-won", state.status === "won");
    document.body.classList.toggle("is-lost", state.status === "lost");
  }

  function renderMessage() {
    var box = $("message");
    box.textContent = state.message;
    box.className = "message" + (state.messageKind ? " is-" + state.messageKind : "") + (state.message ? " is-visible" : "");
    box.hidden = !state.message;
  }

  function renderBoard() {
    var boardEl = $("board");
    boardEl.style.setProperty("--cols", String(state.cols));
    boardEl.style.setProperty("--rows", String(state.rows));
    boardEl.setAttribute("aria-rowcount", String(state.rows));
    boardEl.setAttribute("aria-colcount", String(state.cols));

    var analysis = null;
    if (state.showProb && state.minesPlaced && canPlay()) {
      analysis = analyzeNow();
    }

    var html = [];
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        var cell = state.board[r][c];
        var cls = ["cell"];
        var label = "マス " + (r + 1) + "行 " + (c + 1) + "列";
        var inner = "";

        if (cell.revealed) {
          cls.push("is-open");
          if (cell.mine) {
            cls.push("is-mine");
            if (cell.exploded) cls.push("is-exploded");
            inner = '<span class="icon-mine" aria-hidden="true"></span>';
            label += "、機雷";
            if (cell.exploded) label += "、爆発";
          } else if (cell.adj > 0) {
            cls.push("n" + cell.adj);
            inner = String(cell.adj);
            label += "、周囲" + cell.adj;
          } else {
            label += "、空";
          }
        } else {
          cls.push("is-closed");
          if (cell.flagged) {
            cls.push("is-flag");
            inner = '<span class="icon-flag" aria-hidden="true"></span>';
            label += "、旗";
            if (cell.wrongFlag) {
              cls.push("is-wrong");
              inner += '<span class="icon-wrong" aria-hidden="true">×</span>';
              label += "、誤り";
            }
          } else if (state.showProb && analysis && canPlay()) {
            var pk = r + "," + c;
            if (analysis.certainMineSet[pk]) {
              inner = '<span class="prob">100%</span>';
            } else if (analysis.certainSafeSet[pk]) {
              inner = '<span class="prob is-zero">0%</span>';
            } else if (analysis.probability[pk] !== undefined) {
              var pct = Math.round(analysis.probability[pk] * 100);
              pct = clamp(pct, 1, 99);
              inner = '<span class="prob">' + pct + "%</span>";
            }
          }
        }

        if (state.hintSafe[r + "," + c] && !cell.revealed && !cell.flagged) {
          cls.push("is-hint-safe");
        }
        if (state.hintSource === r + "," + c) {
          cls.push("is-hint-source");
        }
        if (state.focusR === r && state.focusC === c) {
          cls.push("is-focus");
        }

        html.push(
          '<button type="button" class="' + cls.join(" ") +
          '" role="gridcell" data-r="' + r + '" data-c="' + c +
          '" aria-label="' + label +
          '" tabindex="' + (r === state.focusR && c === state.focusC ? "0" : "-1") +
          '">' + inner + "</button>"
        );
      }
    }
    boardEl.innerHTML = html.join("");

    var focusEl = boardEl.querySelector(".is-focus");
    if (focusEl && document.activeElement && document.activeElement.classList.contains("cell")) {
      focusEl.focus({ preventScroll: true });
    }
  }

  function renderAll() {
    renderHUD();
    renderBoard();
    renderMessage();
  }

  function cellFromEvent(e) {
    var t = e.target.closest ? e.target.closest("[data-r]") : null;
    if (!t) return null;
    return { r: +t.getAttribute("data-r"), c: +t.getAttribute("data-c"), el: t };
  }

  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressStart = null;
  }

  function bindBoard() {
    var boardEl = $("board");

    boardEl.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var loc = cellFromEvent(e);
      if (!loc || didChord) return;
      toggleFlag(loc.r, loc.c);
    });

    boardEl.addEventListener("mousedown", function (e) {
      buttonsDown = e.buttons;
      didChord = false;
      var loc = cellFromEvent(e);
      if (!loc) return;
      if ((e.buttons & 3) === 3) {
        didChord = true;
        chordAt(loc.r, loc.c);
        e.preventDefault();
      }
    });

    boardEl.addEventListener("mouseup", function (e) {
      buttonsDown = e.buttons;
    });

    boardEl.addEventListener("click", function (e) {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        return;
      }
      if (didChord) {
        didChord = false;
        return;
      }
      var loc = cellFromEvent(e);
      if (!loc) return;
      state.focusR = loc.r;
      state.focusC = loc.c;
      var cell = state.board[loc.r][loc.c];
      if (cell.revealed && cell.adj > 0) {
        chordAt(loc.r, loc.c);
      } else {
        openCell(loc.r, loc.c);
      }
    });

    boardEl.addEventListener("touchstart", function (e) {
      var loc = cellFromEvent(e);
      if (!loc) return;
      var touch = e.changedTouches[0];
      pressStart = { x: touch.clientX, y: touch.clientY, r: loc.r, c: loc.c };
      cancelPress();
      pressTimer = setTimeout(function () {
        pressTimer = null;
        if (!pressStart) return;
        suppressClick = true;
        toggleFlag(pressStart.r, pressStart.c);
        if (navigator.vibrate) {
          try { navigator.vibrate(18); } catch (err) {}
        }
      }, LONG_PRESS_MS);
    }, { passive: true });

    boardEl.addEventListener("touchmove", function (e) {
      if (!pressStart) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - pressStart.x;
      var dy = touch.clientY - pressStart.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        cancelPress();
      }
    }, { passive: true });

    boardEl.addEventListener("touchend", function () {
      cancelPress();
    });

    boardEl.addEventListener("touchcancel", function () {
      cancelPress();
    });
  }

  function applyCustom() {
    var w = parseInt($("custom-cols").value, 10);
    var h = parseInt($("custom-rows").value, 10);
    var m = parseInt($("custom-mines").value, 10);
    if (isNaN(w) || isNaN(h) || isNaN(m)) {
      setMessage("幅・高さ・機雷数は整数で入力してください。", "warn");
      renderMessage();
      return;
    }
    w = clamp(w, 5, 30);
    h = clamp(h, 5, 24);
    var maxM = w * h - 9;
    m = clamp(m, 1, maxM);
    $("custom-cols").value = String(w);
    $("custom-rows").value = String(h);
    $("custom-mines").value = String(m);
    state.custom = { cols: w, rows: h, mines: m };
    startGame(h, w, m, "custom");
  }

  function moveFocus(dr, dc) {
    state.focusR = clamp(state.focusR + dr, 0, state.rows - 1);
    state.focusC = clamp(state.focusC + dc, 0, state.cols - 1);
    renderBoard();
    var el = $("board").querySelector(".is-focus");
    if (el) el.focus();
  }

  function bindUI() {
    var diffs = document.querySelectorAll("[data-diff]");
    for (var i = 0; i < diffs.length; i++) {
      diffs[i].addEventListener("click", function () {
        var key = this.getAttribute("data-diff");
        if (key === "custom") {
          $("custom-form").hidden = false;
          var btns = document.querySelectorAll("[data-diff]");
          for (var j = 0; j < btns.length; j++) {
            btns[j].classList.toggle("is-active", btns[j].getAttribute("data-diff") === "custom");
            btns[j].setAttribute("aria-pressed", btns[j].getAttribute("data-diff") === "custom" ? "true" : "false");
          }
          applyCustom();
          return;
        }
        var d = DIFFS[key];
        startGame(d.rows, d.cols, d.mines, key);
      });
    }

    $("custom-form").addEventListener("submit", function (e) {
      e.preventDefault();
      applyCustom();
    });

    $("face").addEventListener("click", function () {
      var active = document.querySelector("[data-diff].is-active");
      var key = active ? active.getAttribute("data-diff") : "beginner";
      if (key === "custom") applyCustom();
      else {
        var d = DIFFS[key] || DIFFS.beginner;
        startGame(d.rows, d.cols, d.mines, key);
      }
    });

    $("hint-btn").addEventListener("click", showHint);
    $("step-btn").addEventListener("click", stepOnce);

    $("autoflag").addEventListener("change", function () {
      state.autoFlag = this.checked;
      if (state.autoFlag && canPlay() && state.minesPlaced) {
        applyAutoFlag();
        renderAll();
      }
    });

    $("probs").addEventListener("change", function () {
      state.showProb = this.checked;
      if (state.showProb && state.minesPlaced) analyzeNow();
      renderAll();
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      var onBoard = e.target && e.target.classList && e.target.classList.contains("cell");
      if (!onBoard && !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        // 盤外でも矢印以外は無視（ボタン操作を邪魔しない）
        if (e.key !== "Enter" && e.key !== " " && e.key !== "f" && e.key !== "F") return;
        if (!onBoard) return;
      }
      if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1, 0); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(1, 0); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(0, -1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(0, 1); }
      else if (e.key === "Enter") {
        if (!onBoard) return;
        e.preventDefault();
        var cell = state.board[state.focusR][state.focusC];
        if (cell.revealed) chordAt(state.focusR, state.focusC);
        else openCell(state.focusR, state.focusC);
      } else if (e.key === " " || e.key === "f" || e.key === "F") {
        if (!onBoard) return;
        e.preventDefault();
        toggleFlag(state.focusR, state.focusC);
      }
    });

    bindBoard();
  }

  function init() {
    els.board = $("board");
    $("autoflag").checked = true;
    $("probs").checked = false;
    state.autoFlag = true;
    state.showProb = false;
    bindUI();
    startGame(9, 9, 10, "beginner");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
