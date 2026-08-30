(function () {
  "use strict";

  var BRIGHT = [
    { id: "hero-sun", src: "assets/hero-sun.jpg", label: "たいようヒーロー" },
    { id: "hero-moon", src: "assets/hero-moon.jpg", label: "つきヒーロー" },
    { id: "kaiju-red", src: "assets/kaiju-red.jpg", label: "あかいかいじゅう" },
    { id: "kaiju-green", src: "assets/kaiju-green.jpg", label: "みどりかいじゅう" },
    { id: "dino-stego", src: "assets/dino-stego.jpg", label: "とげきょうりゅう" },
    { id: "dino-raptor", src: "assets/dino-raptor.jpg", label: "はやいきょうりゅう" },
    { id: "dino-plesio", src: "assets/dino-plesio.jpg", label: "うみきょうりゅう" }
  ];

  var OLDER = [
    { id: "usagi", src: "assets/usagi.jpg", label: "うさぎ" },
    { id: "neko", src: "assets/neko.jpg", label: "ねこ" },
    { id: "kuma", src: "assets/kuma.jpg", label: "くま" },
    { id: "hiyoko", src: "assets/hiyoko.jpg", label: "ひよこ" },
    { id: "hoshi", src: "assets/hoshi.jpg", label: "ほし" },
    { id: "hana", src: "assets/hana.jpg", label: "はな" }
  ];

  var LEVELS = {
    easy: { id: "easy", bright: 6, older: 0 },
    mid: { id: "mid", bright: 7, older: 3 },
    hard: { id: "hard", bright: 7, older: 6 }
  };

  var CONFETTI_COLORS = [
    "#ffd54a",
    "#ffe78a",
    "#fff6e4",
    "#7ec8ea",
    "#5eb4e0",
    "#f0b429",
    "#b9e4f6",
    "#ff9f43"
  ];

  var MUTE_KEY = "nakama-awase-mute";

  var AUDIO_BGM = "audio/rumble_jungle.ogg";
  var AUDIO_JUNGLE = "audio/jungle_loop.ogg";
  var AUDIO_FLIP = "audio/small_dino.mp3";
  var AUDIO_ROAR = "audio/t-rex_calls.mp3";
  var AUDIO_GROWL = "audio/monster_roar.wav";

  var VOL_BGM = 0.85;
  var VOL_SFX = 1;
  var MATCH_ROAR_MS = 2100;
  var MISMATCH_ROAR_MS = 1500;
  var CLEAR_ROAR_MS = 5200;
  var TENSION_PULSE_MS = 720;
  var TENSION_GAP_MS = 1280;

  var boardEl = document.getElementById("board");
  var countEl = document.getElementById("matched-count");
  var pairTotalEl = document.getElementById("pair-total");
  var celebrationEl = document.getElementById("celebration");
  var confettiEl = document.getElementById("confetti");
  var againBtn = document.getElementById("again");
  var winMessageEl = document.getElementById("win-message");
  var muteBtn = document.getElementById("mute");
  var muteMark = document.getElementById("mute-mark");
  var muteText = document.getElementById("mute-text");
  var audioToastEl = document.getElementById("audio-toast");
  var levelBtns = document.querySelectorAll(".level");

  var busy = false;
  var openCards = [];
  var matchCount = 0;
  var pairTotal = 6;
  var currentLevel = "easy";
  var gameOn = false;

  var audioReady = false;
  var muted = false;
  var tensionTimer = null;
  var fadeTimer = null;
  var audioToastTimer = null;
  var slots = {};

  try {
    muted = window.sessionStorage.getItem(MUTE_KEY) === "1";
  } catch (err) {
    muted = false;
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function flipMs() {
    return prefersReducedMotion() ? 80 : 800;
  }

  function mismatchPauseMs() {
    return prefersReducedMotion() ? 280 : 900;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function pickN(list, n) {
    if (n <= 0) return [];
    if (n >= list.length) return list.slice();
    return shuffle(list).slice(0, n);
  }

  function pairsForLevel(levelId) {
    var level = LEVELS[levelId] || LEVELS.easy;
    return pickN(BRIGHT, level.bright).concat(pickN(OLDER, level.older));
  }

  function preload() {
    BRIGHT.concat(OLDER).forEach(function (pair) {
      var img = new Image();
      img.src = pair.src;
    });
    var back = new Image();
    back.src = "assets/back.jpg";
  }

  function deck() {
    var pairs = pairsForLevel(currentLevel);
    pairTotal = pairs.length;
    var doubled = [];
    pairs.forEach(function (pair) {
      doubled.push(pair);
      doubled.push(pair);
    });
    return shuffle(doubled);
  }

  function canPlay() {
    return !!(audioReady && !muted);
  }

  function clamp01(v) {
    if (v > 1) return 1;
    if (v < 0) return 0;
    return v;
  }

  function showAudioError(err) {
    console.error(err || "音が出せない");
    if (!audioToastEl) return;
    audioToastEl.classList.add("is-on");
    audioToastEl.setAttribute("aria-hidden", "false");
    if (audioToastTimer) clearTimeout(audioToastTimer);
    audioToastTimer = setTimeout(function () {
      audioToastEl.classList.remove("is-on");
      audioToastEl.setAttribute("aria-hidden", "true");
      audioToastTimer = null;
    }, 2800);
  }

  function makeSlot(src, loop) {
    var el = new Audio();
    el.preload = "auto";
    el.loop = !!loop;
    el.src = src;
    try {
      el.setAttribute("playsinline", "");
      el.playsInline = true;
    } catch (err) {}
    var slot = {
      el: el,
      failed: false,
      level: 1,
      stopTimer: null
    };
    el.addEventListener("error", function () {
      slot.failed = true;
    });
    try {
      el.load();
    } catch (err) {}
    return slot;
  }

  function initSlots() {
    if (slots.bgm) return;
    slots.bgm = makeSlot(AUDIO_BGM, true);
    slots.jungle = makeSlot(AUDIO_JUNGLE, true);
    slots.flip = makeSlot(AUDIO_FLIP, false);
    slots.roar = makeSlot(AUDIO_ROAR, false);
    slots.growl = makeSlot(AUDIO_GROWL, false);
    slots.tension = makeSlot(AUDIO_GROWL, false);
  }

  function setSlotLevel(slot, v) {
    if (!slot) return;
    slot.level = v;
    try {
      slot.el.volume = muted ? 0 : clamp01(v);
    } catch (err) {}
  }

  function applyMuteVolumes() {
    var k;
    for (k in slots) {
      if (Object.prototype.hasOwnProperty.call(slots, k)) {
        setSlotLevel(slots[k], slots[k].level);
      }
    }
  }

  function clearSlotStop(slot) {
    if (slot && slot.stopTimer) {
      clearTimeout(slot.stopTimer);
      slot.stopTimer = null;
    }
  }

  function stopSlot(slot, reset) {
    if (!slot) return;
    clearSlotStop(slot);
    try {
      slot.el.pause();
      if (reset) {
        try {
          slot.el.currentTime = 0;
        } catch (err) {}
      }
    } catch (err) {}
  }

  function handlePlayPromise(p) {
    if (p && typeof p.then === "function") {
      p.then(undefined, function (err) {
        showAudioError(err);
      });
    }
  }

  function playSlot(slot, opts) {
    if (!slot || slot.failed || !canPlay()) return;
    opts = opts || {};
    clearSlotStop(slot);
    try {
      if (opts.restart !== false) {
        try {
          slot.el.currentTime = opts.offset || 0;
        } catch (err) {}
      }
      slot.el.loop = !!opts.loop;
      try {
        slot.el.playbackRate = opts.rate != null ? opts.rate : 1;
      } catch (err) {}
      setSlotLevel(slot, opts.gain != null ? opts.gain : VOL_SFX);
      handlePlayPromise(slot.el.play());
      if (opts.stopAfter) {
        slot.stopTimer = setTimeout(function () {
          stopSlot(slot, true);
        }, opts.stopAfter);
      }
    } catch (err) {
      showAudioError(err);
    }
  }

  function playLoopKeepPos(slot, gain) {
    if (!slot || slot.failed || !canPlay()) return;
    slot.el.loop = true;
    try {
      slot.el.playbackRate = 1;
    } catch (err) {}
    setSlotLevel(slot, gain);
    if (slot.el.paused) {
      try {
        handlePlayPromise(slot.el.play());
      } catch (err) {
        showAudioError(err);
      }
    }
  }

  function cancelFade() {
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function stopLoops() {
    cancelFade();
    stopSlot(slots.bgm, false);
    stopSlot(slots.jungle, false);
    if (slots.bgm) setSlotLevel(slots.bgm, VOL_BGM);
    if (slots.jungle) setSlotLevel(slots.jungle, VOL_BGM);
  }

  function startLoops() {
    cancelFade();
    playLoopKeepPos(slots.bgm, VOL_BGM);
    playLoopKeepPos(slots.jungle, VOL_BGM);
  }

  function fadeLoops(ms) {
    if (!slots.bgm && !slots.jungle) return;
    cancelFade();
    var startB = slots.bgm ? slots.bgm.level : 0;
    var startJ = slots.jungle ? slots.jungle.level : 0;
    var steps = 14;
    var i = 0;
    fadeTimer = setInterval(function () {
      i += 1;
      var v = 1 - i / steps;
      if (v < 0) v = 0;
      if (slots.bgm) setSlotLevel(slots.bgm, startB * v);
      if (slots.jungle) setSlotLevel(slots.jungle, startJ * v);
      if (i >= steps) {
        cancelFade();
        stopSlot(slots.bgm, false);
        stopSlot(slots.jungle, false);
        if (slots.bgm) setSlotLevel(slots.bgm, VOL_BGM);
        if (slots.jungle) setSlotLevel(slots.jungle, VOL_BGM);
      }
    }, Math.max(24, Math.floor(ms / steps)));
  }

  function stopAllSfx() {
    stopSlot(slots.flip, true);
    stopSlot(slots.roar, true);
    stopSlot(slots.growl, true);
    stopSlot(slots.tension, true);
  }

  function playFlip() {
    playSlot(slots.flip, { gain: VOL_SFX, restart: true });
  }

  function playRoar() {
    playSlot(slots.roar, {
      gain: VOL_SFX,
      restart: true,
      stopAfter: MATCH_ROAR_MS
    });
  }

  function playGrowl() {
    playSlot(slots.growl, {
      gain: VOL_SFX,
      restart: true,
      stopAfter: MISMATCH_ROAR_MS
    });
  }

  function playFanfare() {
    playSlot(slots.roar, {
      gain: VOL_SFX,
      restart: true,
      stopAfter: CLEAR_ROAR_MS
    });
  }

  function lastPairCount() {
    return pairTotal - 1;
  }

  function startTension() {
    if (tensionTimer || !canPlay()) return;
    function pulse() {
      if (!canPlay() || matchCount !== lastPairCount() || !gameOn) return;
      playSlot(slots.tension, {
        offset: 0.12,
        gain: VOL_SFX,
        rate: 0.76,
        restart: true,
        stopAfter: TENSION_PULSE_MS
      });
    }
    pulse();
    tensionTimer = setInterval(pulse, TENSION_GAP_MS);
  }

  function stopTension() {
    if (tensionTimer) {
      clearInterval(tensionTimer);
      tensionTimer = null;
    }
    stopSlot(slots.tension, true);
  }

  function syncAmbience() {
    if (!audioReady || muted || !gameOn || matchCount >= pairTotal) {
      if (matchCount >= pairTotal && audioReady && !muted) {
        fadeLoops(720);
      } else {
        stopLoops();
      }
      stopTension();
      if (muted) {
        stopAllSfx();
      }
      return;
    }
    startLoops();
    if (matchCount === lastPairCount()) {
      startTension();
    } else {
      stopTension();
    }
  }

  function unlockAudio() {
    initSlots();
    audioReady = true;
    applyMuteVolumes();
    syncAmbience();
    return Promise.resolve();
  }

  function persistMute() {
    try {
      window.sessionStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (err) {}
  }

  function renderMute() {
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? "おとけす" : "おと");
    muteMark.textContent = muted ? "🔇" : "🔊";
    muteText.textContent = muted ? "おとけす" : "おと";
  }

  function setMuted(next) {
    muted = !!next;
    persistMute();
    renderMute();
    applyMuteVolumes();
    syncAmbience();
  }

  function renderLevels() {
    var i;
    for (i = 0; i < levelBtns.length; i++) {
      var on = levelBtns[i].getAttribute("data-level") === currentLevel;
      levelBtns[i].classList.toggle("is-on", on);
      levelBtns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    boardEl.setAttribute("data-level", currentLevel);
  }

  function setLevel(levelId) {
    if (!LEVELS[levelId]) return;
    currentLevel = levelId;
    newGame();
  }

  function buildCard(pair, index) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.dataset.pair = pair.id;
    btn.dataset.index = String(index);
    btn.setAttribute("aria-label", "カード");

    var inner = document.createElement("span");
    inner.className = "card-inner";

    var back = document.createElement("span");
    back.className = "card-face card-back";
    back.setAttribute("aria-hidden", "true");

    var front = document.createElement("span");
    front.className = "card-face card-front";
    front.setAttribute("aria-hidden", "true");
    front.style.backgroundImage = 'url("' + pair.src + '")';

    inner.appendChild(back);
    inner.appendChild(front);
    btn.appendChild(inner);

    btn.addEventListener("click", function () {
      onCardTap(btn, pair);
    });

    return btn;
  }

  function updateCounter() {
    countEl.textContent = String(matchCount);
    if (pairTotalEl) pairTotalEl.textContent = String(pairTotal);
  }

  function markLastPair() {
    var cards = boardEl.querySelectorAll(".card");
    var remaining = [];
    var i;
    for (i = 0; i < cards.length; i++) {
      cards[i].classList.remove("is-last-pair");
      if (!cards[i].classList.contains("is-matched")) {
        remaining.push(cards[i]);
      }
    }
    if (matchCount === lastPairCount() && remaining.length === 2) {
      remaining[0].classList.add("is-last-pair");
      remaining[1].classList.add("is-last-pair");
    }
  }

  function clearCelebration() {
    celebrationEl.classList.remove("is-on");
    celebrationEl.setAttribute("aria-hidden", "true");
    confettiEl.innerHTML = "";
  }

  function tremble(card) {
    if (prefersReducedMotion()) return;
    card.classList.remove("is-flipping");
    void card.offsetWidth;
    card.classList.add("is-flipping");
    setTimeout(function () {
      card.classList.remove("is-flipping");
    }, flipMs() + 40);
  }

  function dimBeat() {
    document.body.classList.add("is-dim");
    return wait(prefersReducedMotion() ? 180 : 380).then(function () {
      document.body.classList.remove("is-dim");
    });
  }

  function newGame() {
    busy = true;
    openCards = [];
    matchCount = 0;
    gameOn = true;
    renderLevels();
    clearCelebration();
    document.body.classList.remove("is-dim");
    boardEl.innerHTML = "";

    var cards = deck();
    updateCounter();
    cards.forEach(function (pair, index) {
      boardEl.appendChild(buildCard(pair, index));
    });

    syncAmbience();
    busy = false;
  }

  function isFaceUp(card) {
    return (
      card.classList.contains("is-flipped") ||
      card.classList.contains("is-matched")
    );
  }

  async function onCardTap(card, pair) {
    await unlockAudio();
    if (busy) return;
    if (isFaceUp(card)) return;
    if (openCards.length >= 2) return;

    busy = true;
    card.classList.add("is-flipped");
    card.setAttribute("aria-label", pair.label);
    tremble(card);
    playFlip();
    await wait(flipMs());

    openCards.push(card);

    if (openCards.length < 2) {
      busy = false;
      return;
    }

    var a = openCards[0];
    var b = openCards[1];
    var same = a.dataset.pair === b.dataset.pair;

    if (same) {
      a.classList.add("is-matched");
      b.classList.add("is-matched");
      a.setAttribute("aria-label", pair.label + "、そろった");
      b.setAttribute("aria-label", pair.label + "、そろった");
      matchCount += 1;
      updateCounter();
      markLastPair();

      if (matchCount >= pairTotal) {
        gameOn = false;
        syncAmbience();
        await wait(prefersReducedMotion() ? 120 : 420);
        celebrate();
        return;
      }

      playRoar();
      syncAmbience();
      await wait(prefersReducedMotion() ? 120 : 720);
      openCards = [];
      busy = false;
      return;
    }

    playGrowl();
    dimBeat();
    await wait(mismatchPauseMs());
    a.classList.remove("is-flipped");
    b.classList.remove("is-flipped");
    a.setAttribute("aria-label", "カード");
    b.setAttribute("aria-label", "カード");
    tremble(a);
    tremble(b);
    await wait(flipMs());
    openCards = [];
    busy = false;
  }

  function spawnConfetti() {
    confettiEl.innerHTML = "";
    if (prefersReducedMotion()) return;

    var n = 52;
    for (var i = 0; i < n; i++) {
      var bit = document.createElement("span");
      var petal = Math.random() > 0.42;
      bit.className = "bit " + (petal ? "petal" : "paper");
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      bit.style.animationDelay = Math.random() * 1.7 + "s";
      bit.style.animationDuration = 4.2 + Math.random() * 3.6 + "s";
      bit.style.setProperty("--rot", Math.random() * 360 + "deg");
      bit.style.setProperty("--drift", Math.random() * 90 - 45 + "px");
      var scale = 0.75 + Math.random() * 0.7;
      bit.style.width = (petal ? 12 : 9) * scale + "px";
      bit.style.height = (petal ? 17 : 13) * scale + "px";
      confettiEl.appendChild(bit);
    }
  }

  function celebrate() {
    spawnConfetti();
    playFanfare();
    celebrationEl.classList.add("is-on");
    celebrationEl.setAttribute("aria-hidden", "false");
    winMessageEl.setAttribute("role", "status");
    againBtn.focus();
    /* busy stays true until もういちど — extra taps on cards are ignored */
  }

  function onFirstGesture() {
    unlockAudio();
  }

  initSlots();

  document.addEventListener("pointerdown", onFirstGesture, true);
  document.addEventListener("touchstart", onFirstGesture, true);
  document.addEventListener("keydown", onFirstGesture, true);

  muteBtn.addEventListener("click", function () {
    unlockAudio().then(function () {
      setMuted(!muted);
    });
  });

  var li;
  for (li = 0; li < levelBtns.length; li++) {
    levelBtns[li].addEventListener("click", function (event) {
      var id = event.currentTarget.getAttribute("data-level");
      unlockAudio();
      setLevel(id);
    });
  }

  boardEl.addEventListener("dragstart", function (event) {
    event.preventDefault();
  });

  boardEl.addEventListener("contextmenu", function (event) {
    event.preventDefault();
  });

  againBtn.addEventListener("click", function () {
    unlockAudio();
    newGame();
  });

  renderMute();
  preload();
  newGame();
})();
