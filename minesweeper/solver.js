/**
 * スーパーマインスイーパー — 制約ソルバー
 *
 * 初心者向けの考え方
 * ------------------
 * 開いた数字マスは次の「制約」になる:
 *   「周囲の、まだ閉じていて旗も付いていないマスのうち、
 *    ちょうど N 個が機雷である」
 *
 * ここから *絶対に確実な* ことだけを導く。
 *
 *  (1) 単独制約
 *      N === 0        → その周囲は全部安全
 *      N === マス数    → その周囲は全部機雷
 *
 *  (2) 部分集合（包含）
 *      制約 A のマスが、制約 B のマスにすっぽり入っているとき
 *      「B にはみ出したマス」の機雷数 = B.N - A.N と決まる。
 *      これが 0 ならはみ出しは安全、マス数と等しければ全部機雷。
 *      いわゆる 1-2-1 パターンもこの規則で解ける。
 *
 *  (3) 交差（重なり）
 *      ふたつの制約が一部だけ重なるとき、重なり部分に置ける
 *      機雷の最小/最大が一致すれば、そこも確定できる。
 *
 *  (4) 盤面全体
 *      残り機雷が 0 なら未開きは全部安全。
 *      残り機雷 === 未開き数 なら全部機雷。
 *
 * 確率
 * ----
 * 確定したあと、残りの「数字に隣接する閉じたマス」（境界）を
 * 重なりでつながったグループに分け、小さいグループは全列挙する。
 * 大きすぎるグループは、各制約の N/サイズ を平均する局所近似。
 * 近似では 0% / 100% を「確定」とは呼ばない。
 */
(function (global) {
  "use strict";

  function key(r, c) {
    return r + "," + c;
  }

  function parseKey(k) {
    var p = k.split(",");
    return { r: +p[0], c: +p[1] };
  }

  function neighborsOf(rows, cols, r, c) {
    var out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          out.push({ r: nr, c: nc });
        }
      }
    }
    return out;
  }

  function cellSet(arr) {
    var s = {};
    for (var i = 0; i < arr.length; i++) s[arr[i]] = true;
    return s;
  }

  function setKeys(s) {
    return Object.keys(s);
  }

  function setSize(s) {
    var n = 0;
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) n++;
    return n;
  }

  function isSubset(a, b) {
    for (var k in a) {
      if (Object.prototype.hasOwnProperty.call(a, k) && !b[k]) return false;
    }
    return true;
  }

  function difference(a, b) {
    var d = {};
    for (var k in a) {
      if (Object.prototype.hasOwnProperty.call(a, k) && !b[k]) d[k] = true;
    }
    return d;
  }

  function intersection(a, b) {
    var d = {};
    for (var k in a) {
      if (Object.prototype.hasOwnProperty.call(a, k) && b[k]) d[k] = true;
    }
    return d;
  }

  function copySet(s) {
    var d = {};
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) d[k] = true;
    return d;
  }

  function sameSet(a, b) {
    return setSize(a) === setSize(b) && isSubset(a, b);
  }

  /**
   * 盤面から制約リストを作る。
   * board[r][c] = { mine, revealed, flagged, adj }
   */
  function buildConstraints(board) {
    var rows = board.length;
    var cols = board[0].length;
    var constraints = [];

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = board[r][c];
        if (!cell.revealed || cell.mine) continue;
        if (cell.adj <= 0) continue;

        var hidden = [];
        var flagged = 0;
        var nbs = neighborsOf(rows, cols, r, c);
        for (var i = 0; i < nbs.length; i++) {
          var nb = board[nbs[i].r][nbs[i].c];
          if (nb.flagged) flagged++;
          else if (!nb.revealed) hidden.push(key(nbs[i].r, nbs[i].c));
        }
        var remain = cell.adj - flagged;
        if (hidden.length === 0) continue;
        // 旗の付け間違いで remain が負や過大になり得る。その場合は壊れた制約なので捨てる。
        if (remain < 0 || remain > hidden.length) continue;

        constraints.push({
          cells: cellSet(hidden),
          mines: remain,
          source: { r: r, c: c, adj: cell.adj, flagged: flagged, hidden: hidden.length }
        });
      }
    }
    return constraints;
  }

  function cloneConstraints(list) {
    return list.map(function (con) {
      return {
        cells: copySet(con.cells),
        mines: con.mines,
        source: con.source
      };
    });
  }

  function addDeduction(deductions, type, cells, source, extra) {
    var item = {
      type: type,
      cells: cells.slice(),
      source: source || null
    };
    if (extra) {
      for (var k in extra) item[k] = extra[k];
    }
    deductions.push(item);
  }

  /**
   * 単独・包含・交差を、変化がなくなるまで繰り返す。
   */
  function deduce(startConstraints, certainSafe, certainMine, deductions) {
    var constraints = cloneConstraints(startConstraints);
    var changed = true;
    var guard = 0;

    function markSafe(k, type, source, extra) {
      if (certainMine[k] || certainSafe[k]) return false;
      certainSafe[k] = true;
      addDeduction(deductions, type, [k], source, extra);
      return true;
    }

    function markMine(k, type, source, extra) {
      if (certainSafe[k] || certainMine[k]) return false;
      certainMine[k] = true;
      addDeduction(deductions, type, [k], source, extra);
      return true;
    }

    function stripKnown() {
      var next = [];
      var any = false;
      for (var i = 0; i < constraints.length; i++) {
        var con = constraints[i];
        var cells = {};
        var mines = con.mines;
        var stripped = false;
        for (var k in con.cells) {
          if (!Object.prototype.hasOwnProperty.call(con.cells, k)) continue;
          if (certainMine[k]) {
            mines--;
            stripped = true;
          } else if (certainSafe[k]) {
            stripped = true;
          } else {
            cells[k] = true;
          }
        }
        if (mines < 0) mines = 0;
        var sz = setSize(cells);
        if (sz === 0) {
          any = true;
          continue;
        }
        if (mines > sz) mines = sz;
        if (stripped) any = true;
        next.push({ cells: cells, mines: mines, source: con.source });
      }
      constraints = next;
      return any;
    }

    while (changed && guard++ < 80) {
      changed = false;
      if (stripKnown()) changed = true;

      // (1) 単独制約
      for (var i = 0; i < constraints.length; i++) {
        var con = constraints[i];
        var keys = setKeys(con.cells);
        if (con.mines === 0) {
          for (var a = 0; a < keys.length; a++) {
            if (markSafe(keys[a], "single-safe", con.source)) changed = true;
          }
        } else if (con.mines === keys.length) {
          for (var b = 0; b < keys.length; b++) {
            if (markMine(keys[b], "single-mine", con.source)) changed = true;
          }
        }
      }
      if (changed) continue;

      // (2) 部分集合
      for (var x = 0; x < constraints.length; x++) {
        for (var y = 0; y < constraints.length; y++) {
          if (x === y) continue;
          var A = constraints[x];
          var B = constraints[y];
          if (setSize(A.cells) === 0 || setSize(B.cells) === 0) continue;
          if (sameSet(A.cells, B.cells)) continue;
          if (!isSubset(A.cells, B.cells)) continue;
          var diff = difference(B.cells, A.cells);
          var diffN = B.mines - A.mines;
          var dkeys = setKeys(diff);
          if (dkeys.length === 0) continue;
          if (diffN < 0 || diffN > dkeys.length) continue;
          if (diffN === 0) {
            for (var d = 0; d < dkeys.length; d++) {
              if (markSafe(dkeys[d], "subset-safe", B.source, { other: A.source })) changed = true;
            }
          } else if (diffN === dkeys.length) {
            for (var e = 0; e < dkeys.length; e++) {
              if (markMine(dkeys[e], "subset-mine", B.source, { other: A.source })) changed = true;
            }
          } else {
            // 差集合を新しい制約として追加（重複がなければ）
            var exists = false;
            for (var z = 0; z < constraints.length; z++) {
              if (sameSet(constraints[z].cells, diff) && constraints[z].mines === diffN) {
                exists = true;
                break;
              }
            }
            if (!exists && dkeys.length < setSize(B.cells)) {
              constraints.push({
                cells: diff,
                mines: diffN,
                source: B.source
              });
              changed = true;
            }
          }
        }
      }
      if (changed) continue;

      // (3) 交差: 重なりに置ける機雷の min/max
      for (var p = 0; p < constraints.length; p++) {
        for (var q = p + 1; q < constraints.length; q++) {
          var C = constraints[p];
          var D = constraints[q];
          var inter = intersection(C.cells, D.cells);
          var interN = setSize(inter);
          if (interN === 0) continue;
          var onlyC = setSize(difference(C.cells, D.cells));
          var onlyD = setSize(difference(D.cells, C.cells));
          var minI = Math.max(0, C.mines - onlyC, D.mines - onlyD);
          var maxI = Math.min(interN, C.mines, D.mines);
          if (minI > maxI) continue;
          var ikeys = setKeys(inter);
          if (minI === maxI && minI === interN) {
            for (var u = 0; u < ikeys.length; u++) {
              if (markMine(ikeys[u], "overlap-mine", C.source, { other: D.source })) changed = true;
            }
          } else if (minI === maxI && minI === 0) {
            for (var v = 0; v < ikeys.length; v++) {
              if (markSafe(ikeys[v], "overlap-safe", C.source, { other: D.source })) changed = true;
            }
          }
        }
      }
    }

    return constraints;
  }

  function unionFindMake(ids) {
    var parent = {};
    for (var i = 0; i < ids.length; i++) parent[ids[i]] = ids[i];
    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    function union(a, b) {
      var ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }
    return { find: find, union: union, parent: parent };
  }

  /**
   * 重なる制約を連結成分に分ける。
   */
  function partition(constraints) {
    var cellIds = {};
    for (var i = 0; i < constraints.length; i++) {
      for (var k in constraints[i].cells) {
        if (Object.prototype.hasOwnProperty.call(constraints[i].cells, k)) {
          cellIds[k] = true;
        }
      }
    }
    var ids = setKeys(cellIds);
    if (ids.length === 0) return [];
    var uf = unionFindMake(ids);
    for (var c = 0; c < constraints.length; c++) {
      var ks = setKeys(constraints[c].cells);
      for (var j = 1; j < ks.length; j++) uf.union(ks[0], ks[j]);
    }
    var groups = {};
    for (var t = 0; t < ids.length; t++) {
      var root = uf.find(ids[t]);
      if (!groups[root]) groups[root] = [];
      groups[root].push(ids[t]);
    }
    var components = [];
    for (var rootKey in groups) {
      var cells = groups[rootKey];
      var belong = cellSet(cells);
      var cons = [];
      for (var u = 0; u < constraints.length; u++) {
        var hit = false;
        for (var ck in constraints[u].cells) {
          if (belong[ck]) { hit = true; break; }
        }
        if (hit) cons.push(constraints[u]);
      }
      components.push({ cells: cells, constraints: cons });
    }
    return components;
  }

  /**
   * 1 グループを全列挙。n<=16。各マスが機雷である配置の個数を返す。
   */
  function enumerateGroup(cells, constraints) {
    var n = cells.length;
    var indexOf = {};
    for (var i = 0; i < n; i++) indexOf[cells[i]] = i;

    var cons = constraints.map(function (con) {
      var idxs = [];
      for (var k in con.cells) {
        if (Object.prototype.hasOwnProperty.call(con.cells, k) && indexOf[k] !== undefined) {
          idxs.push(indexOf[k]);
        }
      }
      return { idxs: idxs, mines: con.mines };
    });

    var assign = new Array(n);
    var total = 0;
    var mineHits = new Array(n);
    for (var z = 0; z < n; z++) mineHits[z] = 0;
    var MAX_CONFIGS = 200000;
    var aborted = false;

    function feasible(filled) {
      for (var i = 0; i < cons.length; i++) {
        var mines = 0, unknown = 0;
        var idxs = cons[i].idxs;
        for (var j = 0; j < idxs.length; j++) {
          var idx = idxs[j];
          if (idx >= filled) unknown++;
          else mines += assign[idx];
        }
        if (mines > cons[i].mines) return false;
        if (mines + unknown < cons[i].mines) return false;
      }
      return true;
    }

    function rec(i) {
      if (aborted) return;
      if (total > MAX_CONFIGS) {
        aborted = true;
        return;
      }
      if (i === n) {
        total++;
        for (var k = 0; k < n; k++) if (assign[k]) mineHits[k]++;
        return;
      }
      assign[i] = 0;
      if (feasible(i + 1)) rec(i + 1);
      assign[i] = 1;
      if (feasible(i + 1)) rec(i + 1);
    }

    rec(0);
    if (aborted || total === 0) return null;
    return { total: total, mineHits: mineHits, cells: cells };
  }

  function localApprox(cells, constraints) {
    // 各マスについて、それを含む制約の (mines/size) の平均
    var acc = {};
    var cnt = {};
    for (var i = 0; i < cells.length; i++) {
      acc[cells[i]] = 0;
      cnt[cells[i]] = 0;
    }
    for (var c = 0; c < constraints.length; c++) {
      var keys = setKeys(constraints[c].cells);
      if (keys.length === 0) continue;
      var p = constraints[c].mines / keys.length;
      for (var j = 0; j < keys.length; j++) {
        if (acc[keys[j]] === undefined) continue;
        acc[keys[j]] += p;
        cnt[keys[j]]++;
      }
    }
    var out = {};
    for (var i2 = 0; i2 < cells.length; i2++) {
      var k = cells[i2];
      out[k] = cnt[k] > 0 ? acc[k] / cnt[k] : 0.5;
    }
    return out;
  }

  function analyze(board, totalMines) {
    var rows = board.length;
    var cols = board[0] ? board[0].length : 0;
    var certainSafe = {};
    var certainMine = {};
    var deductions = [];
    var probability = {};
    var exactEnum = true;

    var hiddenUnflagged = [];
    var flagCount = 0;
    var revealedSafe = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = board[r][c];
        if (cell.flagged) flagCount++;
        if (cell.revealed && !cell.mine) revealedSafe++;
        if (!cell.revealed && !cell.flagged) hiddenUnflagged.push(key(r, c));
      }
    }

    var remainingMines = totalMines - flagCount;
    if (remainingMines < 0) remainingMines = 0;

    // (4) グローバル制約
    if (hiddenUnflagged.length > 0) {
      if (remainingMines === 0) {
        for (var g = 0; g < hiddenUnflagged.length; g++) {
          certainSafe[hiddenUnflagged[g]] = true;
          addDeduction(deductions, "global-safe", [hiddenUnflagged[g]], null);
        }
      } else if (remainingMines === hiddenUnflagged.length) {
        for (var h = 0; h < hiddenUnflagged.length; h++) {
          certainMine[hiddenUnflagged[h]] = true;
          addDeduction(deductions, "global-mine", [hiddenUnflagged[h]], null);
        }
      }
    }

    var raw = buildConstraints(board);
    var leftover = deduce(raw, certainSafe, certainMine, deductions);

    // 確定マスを除いた境界
    leftover = leftover.filter(function (con) {
      var cells = {};
      var mines = con.mines;
      for (var k in con.cells) {
        if (!Object.prototype.hasOwnProperty.call(con.cells, k)) continue;
        if (certainMine[k]) mines--;
        else if (!certainSafe[k]) cells[k] = true;
      }
      if (setSize(cells) === 0) return false;
      if (mines < 0) mines = 0;
      if (mines > setSize(cells)) mines = setSize(cells);
      con.cells = cells;
      con.mines = mines;
      return true;
    });

    var components = partition(leftover);
    var ENUM_LIMIT = 16;

    for (var ci = 0; ci < components.length; ci++) {
      var comp = components[ci];
      var unknownCells = comp.cells.filter(function (k) {
        return !certainSafe[k] && !certainMine[k];
      });
      if (unknownCells.length === 0) continue;

      if (unknownCells.length <= ENUM_LIMIT) {
        var enumResult = enumerateGroup(unknownCells, leftover);
        if (enumResult) {
          for (var ei = 0; ei < enumResult.cells.length; ei++) {
            var ek = enumResult.cells[ei];
            var p = enumResult.mineHits[ei] / enumResult.total;
            if (p === 0) {
              if (!certainSafe[ek] && !certainMine[ek]) {
                certainSafe[ek] = true;
                addDeduction(deductions, "enum-safe", [ek], null);
              }
            } else if (p === 1) {
              if (!certainSafe[ek] && !certainMine[ek]) {
                certainMine[ek] = true;
                addDeduction(deductions, "enum-mine", [ek], null);
              }
            } else {
              probability[ek] = p;
            }
          }
        } else {
          exactEnum = false;
          var approx = localApprox(unknownCells, leftover);
          for (var ak in approx) {
            if (!certainSafe[ak] && !certainMine[ak]) {
              var ap = approx[ak];
              // 近似では確定扱いにしない
              if (ap < 0.001) ap = 0.02;
              if (ap > 0.999) ap = 0.98;
              probability[ak] = ap;
            }
          }
        }
      } else {
        exactEnum = false;
        var approx2 = localApprox(unknownCells, leftover);
        for (var bk in approx2) {
          if (!certainSafe[bk] && !certainMine[bk]) {
            var bp = approx2[bk];
            if (bp < 0.001) bp = 0.02;
            if (bp > 0.999) bp = 0.98;
            probability[bk] = bp;
          }
        }
      }
    }

    // 推論・列挙のあと、残り機雷と未知マスの個数が一致すれば確定（近似は使わない）
    var unknownLeft = [];
    for (var ui = 0; ui < hiddenUnflagged.length; ui++) {
      var uk = hiddenUnflagged[ui];
      if (!certainSafe[uk] && !certainMine[uk]) unknownLeft.push(uk);
    }
    var minesLeft = remainingMines - setSize(certainMine);
    if (minesLeft < 0) minesLeft = 0;
    if (unknownLeft.length > 0 && minesLeft === 0) {
      for (var uj = 0; uj < unknownLeft.length; uj++) {
        certainSafe[unknownLeft[uj]] = true;
        addDeduction(deductions, "global-safe", [unknownLeft[uj]], null);
        delete probability[unknownLeft[uj]];
      }
    } else if (unknownLeft.length > 0 && minesLeft === unknownLeft.length) {
      for (var um = 0; um < unknownLeft.length; um++) {
        certainMine[unknownLeft[um]] = true;
        addDeduction(deductions, "global-mine", [unknownLeft[um]], null);
        delete probability[unknownLeft[um]];
      }
    }

    // 数字に隣接していない「海」マス: 期待値の按分。近似なので 0/100 にはしない。
    var frontier = {};
    for (var fi = 0; fi < leftover.length; fi++) {
      for (var fk in leftover[fi].cells) {
        if (!certainSafe[fk] && !certainMine[fk]) frontier[fk] = true;
      }
    }
    var sea = [];
    var frontierProbMines = 0;
    for (var si = 0; si < hiddenUnflagged.length; si++) {
      var hk = hiddenUnflagged[si];
      if (certainSafe[hk] || certainMine[hk]) continue;
      if (probability[hk] !== undefined || frontier[hk]) {
        if (probability[hk] !== undefined) frontierProbMines += probability[hk];
      } else {
        sea.push(hk);
      }
    }
    var seaMines = remainingMines - setSize(certainMine) - frontierProbMines;
    if (seaMines < 0) seaMines = 0;
    if (sea.length > 0) {
      var seaP = seaMines / sea.length;
      if (seaP < 0.02) seaP = 0.02;
      if (seaP > 0.98) seaP = 0.98;
      for (var sl = 0; sl < sea.length; sl++) {
        if (!certainSafe[sea[sl]] && !certainMine[sea[sl]]) probability[sea[sl]] = seaP;
      }
    }

    function toCells(setObj) {
      return setKeys(setObj).map(parseKey);
    }

    return {
      certainSafe: toCells(certainSafe),
      certainMine: toCells(certainMine),
      certainSafeSet: certainSafe,
      certainMineSet: certainMine,
      probability: probability,
      deductions: deductions,
      exactEnum: exactEnum
    };
  }

  function explainDeduction(d) {
    var src = d.source;
    var n = src ? src.adj : null;
    var flagged = src ? src.flagged : 0;
    var hidden = src ? src.hidden : 0;

    switch (d.type) {
      case "single-safe":
        return "この「" + n + "」の周りに立った旗がもう" + n + "つなので、残りの閉じたセルは安全です。";
      case "single-mine":
        if (n === 1 && hidden === 1) {
          return "この「1」の周りの未開きセルは1つだけなので、そこが機雷です。";
        }
        return "この「" + n + "」の周りの未開きセルは" + hidden + "つで、残り機雷も" + (n - flagged) + "つなので、そこが機雷です。";
      case "subset-safe":
        return "隣り合う数字の範囲が入れ子になっているので、はみ出したマスに機雷は入りません。安全です。";
      case "subset-mine":
        return "隣り合う数字の範囲が入れ子になっているので、はみ出したマスは機雷です。";
      case "overlap-safe":
        return "ふたつの数字の重なりを考えると、このマスは機雷ではありえません。";
      case "overlap-mine":
        return "ふたつの数字の重なりを考えると、このマスは機雷です。";
      case "global-safe":
        return "残りの機雷はもう0個なので、閉じているマスはすべて安全です。";
      case "global-mine":
        return "残りの機雷数と未開きマスの数が同じなので、それらはすべて機雷です。";
      case "enum-safe":
        return "周囲の数字を同時に満たす置き方を調べると、このマスに機雷を置く方法がありません。安全です。";
      case "enum-mine":
        return "周囲の数字を同時に満たす置き方を調べると、どの置き方でもこのマスは機雷です。";
      default:
        return "現在の数字から、このマスは確定できます。";
    }
  }

  global.MinesweeperSolver = {
    analyze: analyze,
    explainDeduction: explainDeduction,
    key: key
  };
})(typeof window !== "undefined" ? window : globalThis);
