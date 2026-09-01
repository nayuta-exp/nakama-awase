import * as THREE from "three";

const GOAL = 10;
const BASE_SPEED = 3.05;
const SEG_LEN = 30;
const GROUND_N = 3;
const GROUND_W = 22;
const JUMP_DUR = 0.72;
const JUMP_PEAK = 2.4;
const MAGNET_R = 3.4;
const CATCH_R = 1.55;
const STAR_FIRST_Z = 16;
const STAR_GAP = 10;
const SPARK_POOL = 72;
const LANES = [-2.35, 0, 2.35];
const STAR_LANE = [1, 0, 2, 1, 0, 2, 1, 0, 2, 1];
const STAR_HIGH = { 3: 1, 8: 1 };
const SPARK_COLORS = [0xffe066, 0xfff6d0, 0xff7eb3, 0x7ec8ea, 0xff9f43, 0xffffff];

const canvas = document.getElementById("view");
const countEl = document.getElementById("count");
const clearEl = document.getElementById("clear");
const againBtn = document.getElementById("again");
const startEl = document.getElementById("start");
const jumpBtn = document.getElementById("jump");
const sayEl = document.getElementById("say");

const bgm = new Audio("audio/bgm-loop.ogg");
bgm.loop = true;
bgm.volume = 0.72;
const starSnd = new Audio("audio/star.ogg");
starSnd.volume = 0.95;
const jumpSnd = new Audio("audio/punch.ogg");
jumpSnd.volume = 0.9;
const punchSnd = new Audio("audio/punch.ogg");
punchSnd.volume = 1;
const bumpSnd = new Audio("audio/bump.ogg");
bumpSnd.volume = 0.9;
const fanfare = new Audio("audio/dodon-big.ogg");
fanfare.volume = 1;
const dodon = new Audio("audio/dodon.ogg");
dodon.volume = 1;

function playEl(el, restart) {
  try {
    if (restart) el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  } catch (err) {}
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function loadTex(loader, url) {
  return new Promise(function (resolve) {
    loader.load(
      url,
      function (t) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.anisotropy = 4;
        resolve(t);
      },
      undefined,
      function () {
        resolve(null);
      }
    );
  });
}

function makeRoadTex() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a2a18";
  ctx.fillRect(0, 0, 256, 512);
  let i;
  for (i = 0; i < 1800; i += 1) {
    ctx.fillStyle = "rgba(20," + (40 + ((Math.random() * 30) | 0)) + ",22," + rand(0.12, 0.35) + ")";
    ctx.fillRect((Math.random() * 256) | 0, (Math.random() * 512) | 0, 3, 3);
  }
  const x0 = 58;
  const x1 = 198;
  ctx.fillStyle = "#2a2c33";
  ctx.fillRect(x0, 0, x1 - x0, 512);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x0 + 6, 0);
  ctx.lineTo(x0 + 6, 512);
  ctx.moveTo(x1 - 6, 0);
  ctx.lineTo(x1 - 6, 512);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 214, 90, 0.7)";
  ctx.lineWidth = 6;
  ctx.setLineDash([28, 22]);
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 512);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGlowTex() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,240,170,0.95)");
  g.addColorStop(0.35, "rgba(255,200,70,0.45)");
  g.addColorStop(1, "rgba(255,180,40,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const FOG = 0x152044;
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(1, 1, false);
renderer.setClearColor(FOG, 1);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 16, 56);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
camera.position.set(0, 5.1, -11);
camera.lookAt(0, 0.9, 8);

scene.add(new THREE.HemisphereLight(0x8aa0d0, 0x1a140c, 1.05));
const sun = new THREE.DirectionalLight(0xffe2a8, 0.9);
sun.position.set(-4, 12, 4);
sun.castShadow = false;
scene.add(sun);

const clock = new THREE.Clock();
const grounds = [];
const stars = [];
const sparks = [];
const kaiju = [];

let heroRoot;
let heroMesh;
let heroShadow;
let mode = "start";
let jumpT = -1;
let starsGot = 0;
let audioOn = false;
let time = 0;
let lane = 1;
let targetLane = 1;
let friends = 0;
let shake = 0;
let sayT = 0;

function speedNow() {
  return BASE_SPEED * (1 + starsGot * 0.045);
}

function resize() {
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || Math.max(1, window.innerHeight - 180));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);

function unlockAudio() {
  if (audioOn) return;
  audioOn = true;
  playEl(bgm, false);
}

function jumpY() {
  if (jumpT < 0 || jumpT >= JUMP_DUR) return 0;
  return Math.sin((jumpT / JUMP_DUR) * Math.PI) * JUMP_PEAK;
}

function say(text) {
  sayEl.textContent = text;
  sayEl.hidden = false;
  sayT = 1.4;
}

function buildGrounds(roadTex) {
  const geo = new THREE.PlaneGeometry(GROUND_W, SEG_LEN);
  const mat = new THREE.MeshLambertMaterial({ map: roadTex, color: 0xffffff });
  let i;
  for (i = 0; i < GROUND_N; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, i * SEG_LEN);
    scene.add(mesh);
    grounds.push(mesh);
  }
}

function recycleGrounds() {
  const behind = camera.position.z;
  const span = SEG_LEN * GROUND_N;
  let i;
  for (i = 0; i < GROUND_N; i += 1) {
    const g = grounds[i];
    if (g.position.z + SEG_LEN * 0.5 < behind) g.position.z += span;
  }
}

function starY(i) {
  return STAR_HIGH[i] ? 3.15 : 1.35;
}

function placeStars() {
  let i;
  for (i = 0; i < GOAL; i += 1) {
    const s = stars[i];
    s.taken = false;
    s.magnet = false;
    s.group.visible = true;
    s.group.scale.set(1, 1, 1);
    s.group.position.set(LANES[STAR_LANE[i]], starY(i), STAR_FIRST_Z + i * STAR_GAP);
  }
}

function collectStar(s) {
  if (!s || s.taken) return;
  s.taken = true;
  s.magnet = false;
  s.group.visible = false;
  starsGot += 1;
  countEl.textContent = String(starsGot);
  burst(s.group.position.x, s.group.position.y, s.group.position.z, 14);
  if (audioOn) playEl(starSnd, true);
  if (bgm && audioOn) bgm.playbackRate = Math.min(1.35, 1 + starsGot * 0.03);
  maybeSpawnKaiju();
  if (starsGot >= GOAL) win();
}

function maybeSpawnKaiju() {
  let i;
  for (i = 0; i < kaiju.length; i += 1) {
    const k = kaiju[i];
    if (!k.live && starsGot >= k.at) {
      k.live = true;
      k.friend = false;
      k.group.visible = true;
      k.group.position.set(k.sideX, 0, 18);
    }
  }
}

function punchNearby() {
  let i;
  let hit = false;
  const hx = heroRoot ? heroRoot.position.x : 0;
  for (i = 0; i < kaiju.length; i += 1) {
    const k = kaiju[i];
    if (!k.live || k.friend) continue;
    const z = k.group.position.z;
    const dx = Math.abs(k.group.position.x - hx);
    if (z > -1 && z < 10 && dx < 4.2) {
      k.friend = true;
      friends += 1;
      hit = true;
      burst(k.group.position.x, 1.6, k.group.position.z, 18);
      say("なかまになれ！");
      if (audioOn) playEl(punchSnd, true);
    }
  }
  return hit;
}

function win() {
  if (mode !== "play") return;
  mode = "clear";
  jumpT = -1;
  if (heroRoot) heroRoot.position.y = 0;
  playEl(friends >= 2 ? fanfare : dodon, true);
  clearEl.classList.add("is-on");
}

function resetRun() {
  mode = "play";
  jumpT = -1;
  starsGot = 0;
  friends = 0;
  lane = 1;
  targetLane = 1;
  shake = 0;
  countEl.textContent = "0";
  clearEl.classList.remove("is-on");
  startEl.classList.remove("is-on");
  sayEl.hidden = true;
  if (bgm) bgm.playbackRate = 1;
  let i;
  for (i = 0; i < GROUND_N; i += 1) grounds[i].position.z = i * SEG_LEN;
  for (i = 0; i < sparks.length; i += 1) {
    sparks[i].alive = false;
    sparks[i].mesh.visible = false;
  }
  for (i = 0; i < kaiju.length; i += 1) {
    kaiju[i].live = false;
    kaiju[i].friend = false;
    kaiju[i].group.visible = false;
    kaiju[i].group.position.set(kaiju[i].sideX, 0, 40);
  }
  if (heroRoot) {
    heroRoot.position.set(0, 0, 0);
    heroRoot.scale.set(1, 1, 1);
  }
  placeStars();
}

function burst(x, y, z, n) {
  let spawned = 0;
  let i;
  for (i = 0; i < sparks.length && spawned < n; i += 1) {
    const sp = sparks[i];
    if (sp.alive) continue;
    sp.alive = true;
    sp.life = rand(0.35, 0.62);
    sp.max = sp.life;
    sp.vx = rand(-3.8, 3.8);
    sp.vy = rand(2.4, 7.2);
    sp.vz = rand(-3.2, 3.2);
    sp.mesh.position.set(x, y, z);
    sp.mesh.visible = true;
    sp.mat.color.setHex(SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0]);
    sp.mat.opacity = 1;
    spawned += 1;
  }
}

function startJump() {
  if (mode !== "play") return;
  if (jumpT < 0 || jumpT >= JUMP_DUR) jumpT = 0;
  burst(heroRoot ? heroRoot.position.x : 0, 1.2 + jumpY(), 0, 16);
  if (audioOn) playEl(jumpSnd, true);
}

function onPointer(ev) {
  if (ev.target && ev.target.closest) {
    if (ev.target.closest("a.hub-back") || ev.target.closest("#again") || ev.target.closest("#jump")) return;
  }
  ev.preventDefault();
  unlockAudio();
  if (mode === "start") {
    resetRun();
    return;
  }
  if (mode !== "play") return;
  if (punchNearby()) return;
  const x = ev.clientX;
  const mid = window.innerWidth * 0.5;
  if (x < mid - 24) targetLane = Math.max(0, targetLane - 1);
  else if (x > mid + 24) targetLane = Math.min(2, targetLane + 1);
  else startJump();
}

function updateHero(dt) {
  if (jumpT >= 0) {
    jumpT += dt;
    if (jumpT >= JUMP_DUR) jumpT = -1;
  }
  lane += (targetLane - lane) * Math.min(1, 10 * dt);
  const x = LANES[0] + (LANES[2] - LANES[0]) * (lane / 2);
  const y = Math.max(0, jumpY());
  if (heroRoot) {
    heroRoot.position.set(x, y, 0);
    const squash = jumpT >= 0 ? 1 - Math.sin((jumpT / JUMP_DUR) * Math.PI) * 0.06 : 1;
    heroRoot.scale.set(2 - squash, squash, 1);
    if (heroMesh) heroMesh.lookAt(camera.position.x, y + 1.1, camera.position.z);
  }
  if (heroShadow) {
    const s = 1 - Math.min(0.55, y * 0.22);
    heroShadow.position.x = x;
    heroShadow.scale.set(s, s, 1);
    heroShadow.material.opacity = 0.32 * s;
  }
  if (shake > 0) {
    shake -= dt;
    camera.position.x = Math.sin(time * 48) * 0.12 * Math.max(0, shake);
  } else {
    camera.position.x = 0;
  }
}

function updateStars(dt) {
  if (mode !== "play") return;
  const hx = heroRoot ? heroRoot.position.x : 0;
  const hy = heroRoot ? heroRoot.position.y : 0;
  const sp = speedNow();
  let i;
  for (i = 0; i < stars.length; i += 1) {
    const s = stars[i];
    if (s.taken) continue;
    if (!s.magnet) s.group.position.z -= sp * dt;
    const dx = s.group.position.x - hx;
    const dz = s.group.position.z;
    const d = Math.hypot(dx, dz);
    const needJump = !!STAR_HIGH[i];
    const highOk = !needJump || hy > 1.2;
    if (!s.magnet && d < MAGNET_R && highOk) s.magnet = true;
    if (s.magnet) {
      s.group.position.x += (hx - s.group.position.x) * Math.min(1, 10 * dt);
      s.group.position.y += (1.15 + hy * 0.35 - s.group.position.y) * Math.min(1, 10 * dt);
      s.group.position.z += (0 - s.group.position.z) * Math.min(1, 10 * dt);
    } else {
      s.group.position.y = starY(i) + Math.sin(time * 2.2 + s.phase) * 0.16;
    }
    const spin = time * 1.6 + s.phase;
    s.mesh.rotation.y = spin;
    s.mesh.rotation.x = spin * 0.35;
    const pulse = 1 + Math.sin(time * 3 + s.phase) * 0.08;
    s.group.scale.setScalar(pulse);
    const d2 = Math.hypot(s.group.position.x - hx, s.group.position.z);
    if (d2 < CATCH_R) collectStar(s);
    else if (s.group.position.z < -4) {
      s.group.position.z += STAR_GAP * GOAL;
      s.magnet = false;
    }
  }
}

function updateKaiju(dt) {
  if (mode !== "play") return;
  const sp = speedNow();
  let i;
  for (i = 0; i < kaiju.length; i += 1) {
    const k = kaiju[i];
    if (!k.live) continue;
    if (k.group.position.z > 5.5) k.group.position.z -= sp * dt;
    else k.group.position.z = 5.5;
    k.group.position.y = k.friend ? 0.12 : 0;
    if (k.mesh) k.mesh.lookAt(camera.position.x, 1.4, camera.position.z);
    const hx = heroRoot ? heroRoot.position.x : 0;
    if (!k.friend && Math.abs(k.group.position.x - hx) < 1.2 && k.group.position.z < 7 && jumpY() < 0.4) {
      shake = 0.28;
      if (audioOn) playEl(bumpSnd, true);
    }
  }
}

function updateGrounds(dt) {
  if (mode !== "play") return;
  const sp = speedNow();
  let i;
  for (i = 0; i < GROUND_N; i += 1) grounds[i].position.z -= sp * dt;
  recycleGrounds();
}

function updateSparks(dt) {
  let i;
  for (i = 0; i < sparks.length; i += 1) {
    const sp = sparks[i];
    if (!sp.alive) continue;
    sp.life -= dt;
    sp.mesh.position.x += sp.vx * dt;
    sp.mesh.position.y += sp.vy * dt;
    sp.mesh.position.z += sp.vz * dt;
    sp.vy -= 9 * dt;
    sp.mat.opacity = Math.max(0, sp.life / sp.max);
    sp.mesh.scale.setScalar(0.35 + sp.life / sp.max);
    sp.mesh.lookAt(camera.position);
    if (sp.life <= 0 || sp.mesh.position.y < 0) {
      sp.alive = false;
      sp.mesh.visible = false;
    }
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  if (sayT > 0) {
    sayT -= dt;
    if (sayT <= 0) sayEl.hidden = true;
  }
  updateHero(dt);
  updateStars(dt);
  updateKaiju(dt);
  updateGrounds(dt);
  updateSparks(dt);
  renderer.render(scene, camera);
}

function lockScroll() {
  document.addEventListener(
    "touchmove",
    function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("a.hub-back")) return;
      ev.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("gesturestart", function (ev) {
    ev.preventDefault();
  });
  document.addEventListener("contextmenu", function (ev) {
    ev.preventDefault();
  });
}

function billboard(tex, w, h) {
  const mat = tex
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color: 0xc43b2a, side: THREE.DoubleSide, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.y = h * 0.5;
  return mesh;
}

function buildHero(tex) {
  heroRoot = new THREE.Group();
  scene.add(heroRoot);
  heroMesh = billboard(tex, 1.9, 2.35);
  heroRoot.add(heroMesh);
  heroShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  heroShadow.rotation.x = -Math.PI / 2;
  heroShadow.position.y = 0.03;
  scene.add(heroShadow);
}

function buildKaiju(gTex, rTex) {
  function add(tex, sideX, at) {
    const group = new THREE.Group();
    const mesh = billboard(tex, 2.4, 2.8);
    group.add(mesh);
    group.visible = false;
    group.position.set(sideX, 0, 40);
    scene.add(group);
    kaiju.push({ group: group, mesh: mesh, sideX: sideX, at: at, live: false, friend: false });
  }
  add(gTex, -4.2, 4);
  add(rTex, 4.2, 7);
}

function buildStarPool() {
  const starGeo = new THREE.IcosahedronGeometry(0.78, 0);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066, fog: true });
  const glowMat = new THREE.SpriteMaterial({
    map: makeGlowTex(),
    color: 0xffe088,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true
  });
  let i;
  for (i = 0; i < GOAL; i += 1) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(starGeo, starMat);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(2.6, 2.6, 1);
    group.add(mesh);
    group.add(glow);
    scene.add(group);
    stars.push({ group: group, mesh: mesh, glow: glow, taken: false, magnet: false, phase: rand(0, Math.PI * 2) });
  }
}

function buildSparkPool() {
  const sparkGeo = new THREE.PlaneGeometry(0.28, 0.28);
  let i;
  for (i = 0; i < SPARK_POOL; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh: mesh, mat: mat, vx: 0, vy: 0, vz: 0, life: 0, max: 1, alive: false });
  }
}

function buildMoon() {
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 0.38, depthWrite: false, fog: false })
  );
  moon.position.set(-5.5, 12, 36);
  scene.add(moon);
}

async function boot() {
  lockScroll();
  resize();
  const loader = new THREE.TextureLoader();
  const heroTex = await loadTex(loader, "assets/hero.png");
  const gTex = await loadTex(loader, "assets/kaiju-g.png");
  const rTex = await loadTex(loader, "assets/kaiju-r.png");
  buildGrounds(makeRoadTex());
  buildHero(heroTex);
  buildKaiju(gTex, rTex);
  buildStarPool();
  buildSparkPool();
  buildMoon();
  placeStars();
  canvas.addEventListener("pointerdown", onPointer, { passive: false });
  startEl.addEventListener("pointerdown", onPointer, { passive: false });
  jumpBtn.addEventListener("pointerdown", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    unlockAudio();
    if (mode === "start") resetRun();
    startJump();
  });
  againBtn.addEventListener("click", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    resetRun();
  });
  tick();
}

boot();
