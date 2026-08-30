(function () {
  "use strict";

  var field = document.getElementById("field");
  var countEl = document.getElementById("count");
  var heroEl = document.getElementById("hero");
  var heroImg = document.getElementById("hero-img");
  var heroName = document.getElementById("hero-name");

  var KAIJU = [
    { src: "assets/kaiju-green.jpg", label: "みどりのかいじゅう" },
    { src: "assets/kaiju-red.jpg", label: "あかいかいじゅう" }
  ];

  var HEROES = [
    { src: "assets/hero-sun.jpg", name: "たいようヒーロー" },
    { src: "assets/hero-moon.jpg", name: "つきヒーロー" }
  ];

  var bgm = new Audio("audio/bgm-loop.ogg");
  bgm.loop = true;
  bgm.volume = 0.85;
  var hajike = new Audio("audio/hajike.ogg");
  hajike.volume = 1;
  var fanfare = new Audio("audio/nakama-fanfare.ogg");
  fanfare.volume = 1;
  var audioReady = false;

  function playEl(el, restart) {
    try {
      if (restart) el.currentTime = 0;
      var playing = el.play();
      if (playing && typeof playing.catch === "function") {
        playing.catch(function (err) {
          console.error(err || "音が出せない");
        });
      }
    } catch (err) {
      console.error(err || "音が出せない");
    }
  }

  function unlockAudio() {
    if (audioReady) return;
    audioReady = true;
    playEl(bgm, false);
  }

  var MIN_ON = 1;
  var MAX_ON = 3;
  var score = 0;
  var tapsToHero = 3 + Math.floor(Math.random() * 3);
  var nextId = 1;
  var spawnTimer = 0;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function liveKaiju() {
    return field.querySelectorAll(".kaiju:not(.is-popping)");
  }

  function kaijuSize() {
    var shortSide = Math.min(window.innerWidth, window.innerHeight);
    return Math.round(shortSide * 0.5);
  }

  function pad() {
    return {
      top: 86 + (window.visualViewport ? 0 : 0),
      side: 10,
      bottom: 18
    };
  }

  function overlaps(a, b, gap) {
    return !(
      a.x + a.size + gap < b.x ||
      b.x + b.size + gap < a.x ||
      a.y + a.size + gap < b.y ||
      b.y + b.size + gap < a.y
    );
  }

  function existingBoxes() {
    var boxes = [];
    liveKaiju().forEach(function (el) {
      boxes.push({
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
        size: parseFloat(el.style.width) || 200
      });
    });
    return boxes;
  }

  function randomBox(size) {
    var p = pad();
    var w = window.innerWidth;
    var h = window.innerHeight;
    var maxX = Math.max(p.side, w - size - p.side);
    var maxY = Math.max(p.top, h - size - p.bottom);
    var others = existingBoxes();
    var box = { x: 0, y: 0, size: size };
    var i;
    for (i = 0; i < 18; i += 1) {
      box.x = rand(p.side, maxX);
      box.y = rand(p.top, maxY);
      var hit = others.some(function (other) {
        return overlaps(box, other, 18);
      });
      if (!hit) return box;
    }
    box.x = rand(p.side, maxX);
    box.y = rand(p.top, maxY);
    return box;
  }

  function playHajike() {
    unlockAudio();
    playEl(hajike, true);
  }

  function playFanfare() {
    unlockAudio();
    playEl(fanfare, true);
  }

  function burstStars(x, y) {
    var marks = ["★", "☆", "✦", "★"];
    var i;
    for (i = 0; i < 5; i += 1) {
      var spark = document.createElement("div");
      spark.className = "spark";
      spark.textContent = marks[i % marks.length];
      spark.style.left = x + "px";
      spark.style.top = y + "px";
      spark.style.setProperty("--dx", Math.round(rand(-70, 70)) + "px");
      spark.style.setProperty("--dy", Math.round(rand(-110, -40)) + "px");
      spark.style.fontSize = rand(1.4, 2.4) + "rem";
      field.appendChild(spark);
      window.setTimeout(function (node) {
        node.remove();
      }, 720, spark);
    }
  }

  function flashHero() {
    var hero = pick(HEROES);
    heroImg.src = hero.src;
    heroImg.alt = hero.name;
    heroName.textContent = hero.name;
    heroEl.classList.remove("is-flash");
    void heroEl.offsetWidth;
    heroEl.classList.add("is-flash");
    window.setTimeout(function () {
      heroEl.classList.remove("is-flash");
    }, 920);
  }

  function bumpScore(x, y) {
    score += 1;
    countEl.textContent = String(score);
    burstStars(x, y);
    tapsToHero -= 1;
    if (tapsToHero <= 0) {
      playFanfare();
      flashHero();
      tapsToHero = 4 + Math.floor(Math.random() * 3);
    }
  }

  function onTap(event) {
    event.preventDefault();
    event.stopPropagation();
    var el = event.currentTarget;
    if (!el || el.classList.contains("is-popping")) return;
    el.classList.add("is-popping");
    el.classList.remove("is-bob");
    playHajike();
    var rect = el.getBoundingClientRect();
    bumpScore(rect.left + rect.width / 2, rect.top + rect.height / 2);
    window.setTimeout(function () {
      el.remove();
      ensureKaiju();
    }, 480);
  }

  function spawnKaiju() {
    if (liveKaiju().length >= MAX_ON) return;
    var kind = pick(KAIJU);
    var size = kaijuSize();
    var box = randomBox(size);
    var el = document.createElement("button");
    el.type = "button";
    el.className = "kaiju is-bob";
    el.setAttribute("aria-label", kind.label);
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.left = box.x + "px";
    el.style.top = box.y + "px";
    el.style.backgroundImage = 'url("' + kind.src + '")';
    el.style.animationDelay = "0s, " + rand(0, 0.8).toFixed(2) + "s";
    el.style.zIndex = String(5 + (nextId % 6));
    nextId += 1;
    el.addEventListener("pointerdown", onTap);
    field.appendChild(el);
  }

  function ensureKaiju() {
    var n = liveKaiju().length;
    var want = Math.max(MIN_ON, 1 + Math.floor(Math.random() * MAX_ON));
    while (n < want && n < MAX_ON) {
      spawnKaiju();
      n += 1;
    }
    if (n < MIN_ON) spawnKaiju();
  }

  function lockScroll() {
    var block = function (event) {
      if (event.target && event.target.closest && event.target.closest("a.hub-back")) {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("gesturestart", function (event) {
      event.preventDefault();
    });
    document.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
  }

  lockScroll();
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  ensureKaiju();
  spawnTimer = window.setInterval(function () {
    if (liveKaiju().length < MAX_ON) spawnKaiju();
  }, 1600);

  window.addEventListener("resize", function () {
    liveKaiju().forEach(function (el) {
      var size = parseFloat(el.style.width) || kaijuSize();
      var p = pad();
      var maxX = Math.max(p.side, window.innerWidth - size - p.side);
      var maxY = Math.max(p.top, window.innerHeight - size - p.bottom);
      var x = Math.min(maxX, Math.max(p.side, parseFloat(el.style.left) || p.side));
      var y = Math.min(maxY, Math.max(p.top, parseFloat(el.style.top) || p.top));
      el.style.left = x + "px";
      el.style.top = y + "px";
    });
  });
})();
