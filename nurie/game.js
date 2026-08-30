(function () {
  "use strict";

  var PAGES = [
    { id: "sun", src: "pages/sun.png", label: "たいようヒーロー" },
    { id: "moon", src: "pages/moon.png", label: "つきヒーロー" },
    { id: "kaiju-green", src: "pages/kaiju-green.png", label: "みどりの怪獣" },
    { id: "kaiju-red", src: "pages/kaiju-red.png", label: "あかの怪獣" }
  ];

  var COLORS = [
    { name: "あか", hex: "#ff3b30" },
    { name: "オレンジ", hex: "#ff9500" },
    { name: "きいろ", hex: "#ffd60a" },
    { name: "みどり", hex: "#34c759" },
    { name: "みずいろ", hex: "#5ac8fa" },
    { name: "あお", hex: "#007aff" },
    { name: "むらさき", hex: "#af52de" },
    { name: "ピンク", hex: "#ff2d55" },
    { name: "ちゃいろ", hex: "#c58b4e" },
    { name: "はだいろ", hex: "#ffd1a4" },
    { name: "しろ", hex: "#ffffff" }
  ];

  var LINE_LUM = 145;
  var UNDO_LIMIT = 20;
  var NEAR_SEARCH = 14;

  var canvas = document.getElementById("paper");
  var stage = document.getElementById("stage");
  var pagesEl = document.getElementById("pages");
  var paletteEl = document.getElementById("palette");
  var undoBtn = document.getElementById("undo");
  var resetBtn = document.getElementById("reset");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });

  var walls = null;
  var original = null;
  var undoStack = [];
  var currentColor = COLORS[0];
  var currentPage = PAGES[0];
  var filling = false;
  var pointerDown = false;

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function fitCanvas() {
    var iw = canvas.width;
    var ih = canvas.height;
    var sw = stage.clientWidth;
    var sh = stage.clientHeight;
    if (!sw || !sh || !iw || !ih) return;
    var scale = Math.min(sw / iw, sh / ih);
    canvas.style.width = Math.max(1, Math.floor(iw * scale)) + "px";
    canvas.style.height = Math.max(1, Math.floor(ih * scale)) + "px";
  }

  function eventToPixel(e) {
    var rect = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    var y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x >= canvas.width) x = canvas.width - 1;
    if (y >= canvas.height) y = canvas.height - 1;
    return { x: x, y: y };
  }

  function buildWalls(imageData) {
    var d = imageData.data;
    var n = imageData.width * imageData.height;
    var mask = new Uint8Array(n);
    var i;
    var o;
    var lum;
    for (i = 0; i < n; i++) {
      o = i * 4;
      lum = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      if (lum < LINE_LUM) mask[i] = 1;
    }
    return mask;
  }

  function nearestOpen(x, y) {
    var w = canvas.width;
    var h = canvas.height;
    var i = y * w + x;
    if (!walls[i]) return i;
    var r;
    var dx;
    var dy;
    var nx;
    var ny;
    var ni;
    for (r = 1; r <= NEAR_SEARCH; r++) {
      for (dy = -r; dy <= r; dy++) {
        for (dx = -r; dx <= r; dx++) {
          if (dx !== r && dx !== -r && dy !== r && dy !== -r) continue;
          nx = x + dx;
          ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          ni = ny * w + nx;
          if (!walls[ni]) return ni;
        }
      }
    }
    return -1;
  }

  function floodFill(sx, sy, rgb) {
    if (!walls || filling) return false;
    var w = canvas.width;
    var h = canvas.height;
    var start = nearestOpen(sx, sy);
    if (start < 0) return false;

    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var o = start * 4;
    if (d[o] === rgb.r && d[o + 1] === rgb.g && d[o + 2] === rgb.b) return false;

    undoStack.push(new Uint8ClampedArray(d));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();

    filling = true;
    var visited = new Uint8Array(w * h);
    var stack = [start];
    visited[start] = 1;
    var p;
    var x;
    var y;
    var i;
    var n;

    while (stack.length) {
      p = stack.pop();
      i = p * 4;
      d[i] = rgb.r;
      d[i + 1] = rgb.g;
      d[i + 2] = rgb.b;
      d[i + 3] = 255;
      x = p % w;
      y = (p / w) | 0;
      if (x > 0) {
        n = p - 1;
        if (!visited[n] && !walls[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (x + 1 < w) {
        n = p + 1;
        if (!visited[n] && !walls[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y > 0) {
        n = p - w;
        if (!visited[n] && !walls[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y + 1 < h) {
        n = p + w;
        if (!visited[n] && !walls[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    filling = false;
    syncUndo();
    return true;
  }

  function syncUndo() {
    undoBtn.disabled = undoStack.length === 0;
  }

  function loadPage(page) {
    currentPage = page;
    undoStack = [];
    syncUndo();
    walls = null;
    original = null;
    Array.prototype.forEach.call(pagesEl.querySelectorAll(".page-btn"), function (btn) {
      var on = btn.getAttribute("data-id") === page.id;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    var img = new Image();
    img.onload = function () {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      original = ctx.getImageData(0, 0, canvas.width, canvas.height);
      walls = buildWalls(original);
      fitCanvas();
    };
    img.src = page.src;
  }

  function undoFill() {
    if (!undoStack.length) return;
    var prev = undoStack.pop();
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img.data.set(prev);
    ctx.putImageData(img, 0, 0);
    syncUndo();
  }

  function resetPage() {
    if (!original) return;
    ctx.putImageData(original, 0, 0);
    undoStack = [];
    syncUndo();
  }

  function renderPages() {
    pagesEl.innerHTML = "";
    PAGES.forEach(function (page) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-btn";
      btn.setAttribute("data-id", page.id);
      btn.setAttribute("aria-pressed", "false");
      var thumb = document.createElement("img");
      thumb.src = page.src;
      thumb.alt = "";
      btn.appendChild(thumb);
      btn.appendChild(document.createTextNode(page.label));
      btn.addEventListener("click", function () {
        loadPage(page);
      });
      pagesEl.appendChild(btn);
    });
  }

  function renderPalette() {
    paletteEl.innerHTML = "";
    COLORS.forEach(function (color, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch" + (color.hex === "#ffffff" ? " is-white" : "");
      btn.style.backgroundColor = color.hex;
      btn.setAttribute("aria-label", color.name);
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", idx === 0 ? "true" : "false");
      if (idx === 0) btn.classList.add("is-on");
      btn.addEventListener("click", function () {
        currentColor = color;
        Array.prototype.forEach.call(paletteEl.querySelectorAll(".swatch"), function (el) {
          el.classList.remove("is-on");
          el.setAttribute("aria-selected", "false");
        });
        btn.classList.add("is-on");
        btn.setAttribute("aria-selected", "true");
      });
      paletteEl.appendChild(btn);
    });
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerDown) return;
    pointerDown = true;
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
    e.preventDefault();
    var pt = eventToPixel(e);
    floodFill(pt.x, pt.y, hexToRgb(currentColor.hex));
  }

  function onPointerMove(e) {
    if (!pointerDown) return;
    e.preventDefault();
  }

  function onPointerUp(e) {
    pointerDown = false;
    e.preventDefault();
  }

  function preventScroll(e) {
    e.preventDefault();
  }

  renderPages();
  renderPalette();
  loadPage(PAGES[0]);
  fitCanvas();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", function () {
    pointerDown = false;
  });
  canvas.addEventListener("contextmenu", preventScroll);
  canvas.addEventListener("touchstart", preventScroll, { passive: false });
  canvas.addEventListener("touchmove", preventScroll, { passive: false });
  stage.addEventListener("touchmove", preventScroll, { passive: false });

  document.addEventListener(
    "touchmove",
    function (e) {
      if (e.target === canvas || (e.target.closest && e.target.closest(".stage"))) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  undoBtn.addEventListener("click", undoFill);
  resetBtn.addEventListener("click", resetPage);
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", function () {
    setTimeout(fitCanvas, 120);
  });
})();
