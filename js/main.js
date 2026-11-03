// FIRMENFEIER · Gaussian splat display (PlayCanvas 2.23.3, WebGL2)
import * as pc from 'playcanvas';
import { Orbit } from './orbit.js';
import { SplatFx } from './splat-fx.js';
import { Hud, scramble } from './hud.js';

// ─── scenes (tune here) ───────────────────────────────────────────────────
// Shared look of the point-cloud effect; each scene sets its own centre, edge and timing.
const FX = {
  axisScale: [1, 1, 1],
  band: 0.9,
  density: 0.32,
  point: 0.006,
  tint: [0.30, 0.95, 1.0],
  // exit wave (~1.4 s); far sparse points left beyond `end` vanish with the scene
  dissolve: { speed: 1.8, accel: 1.3, fade: 1.2, drift: 0.9, end: 7.5 },
};

const SCENES = [
  {
    id: 'firmenfeier',
    title: 'FIRMENFEIER',
    scan: '001 · GROUP',
    url: 'assets/scene.sog',
    bytes: 17305262,          // fallback when the server sends no Content-Length
    splats: 995790,
    rotation: [-90, 0, 0],    // scan is z-up -> PlayCanvas y-up
    view: {
      // the scan was captured from the head of the table; this is that viewpoint
      target: [0, 0.35, -0.45],
      yaw: 5, pitch: 16, dist: 3.7,
      autoSpeed: 3.2,         // deg/s while idle
      autoRange: [-13, 15],   // idle sway relative to home yaw
      autoPitch: 6,           // idle pitch sway amplitude (deg)
      limits: {
        pitch: [3, 58],
        dist: [1.4, 6.5],
        yaw: [-20, 24],       // relative to home yaw: single-viewpoint capture, sides break up beyond this
        target: [-1.6, -0.4, -2.2, 1.6, 1.4, 1.2],
      },
    },
    // fraction of the viewport height the orbit target is lifted, so the title has room below
    lift: { portrait: 0.10, landscape: 0.14 },
    fx: {
      ...FX,
      origin: [0, 0.3, -0.5],   // table centre
      edge: [1.9, 3.6, 1.0, 0.12], // the room behind the group dissolves into points from 1.9 m to 3.6 m
      reveal: { dotSpeed: 2.2, speed: 0.8, accel: 0.6, delay: 0.9, end: 16 },
    },
  },
  {
    id: 'donika',
    title: 'DONIKA',
    scan: '002 · PORTRAIT',
    url: 'assets/donika.sog',
    bytes: 45393893,
    splats: 2951528,
    rotation: [-90, 0, 0],
    view: {
      // the capture is a camera arc made from one photo: close to the photo the face stays clean,
      // towards the other end of the arc the wall on the right smears
      target: [0.15, 0.40, -0.50],
      yaw: -30, pitch: 15, dist: 3.0,
      portraitDist: 2.3,      // one person: come closer on phones
      autoSpeed: 2.6,
      autoRange: [-10, 12],
      autoPitch: 4,
      limits: {
        pitch: [4, 34],
        dist: [1.8, 4.4],     // closer than that the camera reaches dark floaters in front of the lens
        yaw: [-14, 16],
        target: [-1.0, -0.2, -1.6, 1.2, 1.2, 0.6],
      },
    },
    lift: { portrait: 0.10, landscape: 0.14 },
    fx: {
      ...FX,
      origin: [0.15, 0.35, -0.45],   // table between the glasses
      edge: [1.4, 3.0, 1.0, 0.12],
      reveal: { dotSpeed: 2.2, speed: 0.8, accel: 0.6, delay: 0.9, end: 9 },
    },
  },
  {
    id: 'bujanovac',
    title: 'BUJANOVAC',
    scan: '003 · STREET',
    credit: 'STREET VIEW PANORAMAS',
    url: 'assets/bujanovac.sog',
    bytes: 59215237,
    splats: 3979022,
    rotation: [-90, 0, 0],
    // Spirula's "up" is 36.5 deg off; all seven panoramas agree on the true vertical
    level: { axis: [-0.07685, -0.99704, 0], angle: 36.488 },
    scale: 29,               // scan units -> metres (panorama camera 0.085 above the street = 2.5 m)
    far: 800,
    view: {
      // free look from the street, between the 2nd and 3rd of seven panoramas along Kosovska
      mode: 'free',
      target: [-7.98, -0.96, -9.28], // eye, 2.1 m above the street
      yaw: 0, pitch: -3,
      moveSpeed: 5,           // m/s with WASD; scroll and pinch scale with it
      reach: 40,              // HUD bar: distance walked from the capture point
      autoSpeed: 4,           // slow sweep all the way round while idle
      autoPitch: 3,
      limits: {
        pitch: [-80, 80],
        target: [-45, -2.8, -65, 35, 40, 60], // stays above the street, otherwise free
      },
    },
    lift: { portrait: 0.06, landscape: 0.06 },
    fx: {
      ...FX,
      origin: [-7.98, -0.96, -9.28],
      band: 3,
      point: 0.012,
      edge: [30, 85, 0, 1],        // no edge dissolve: the whole street shows as captured, thin parts included
      reveal: { dotSpeed: 9, speed: 3, accel: 0.6, delay: 0.7, end: 95 },
      dissolve: { speed: 3, accel: 1.8, fade: 4, drift: 6, end: 65 },
    },
  },
];

for (const s of SCENES) { s.received = 0; s.total = s.bytes; }

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const $ = (id) => document.getElementById(id);
const body = document.body;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(msg);
  $('error-msg').textContent = String(msg?.message ?? msg);
  $('error').hidden = false;
  body.classList.remove('is-loading', 'waiting');
}

// #donika opens that scene directly
let cur = Math.max(0, SCENES.findIndex((s) => `#${s.id}` === location.hash));
const scene = () => SCENES[cur];
const neighbour = (step) => SCENES[(cur + step + SCENES.length) % SCENES.length];

// ─── title: split letters for the staggered entrance, fit to width ────────
const headline = $('headline');
const kicker = document.querySelector('.kicker');
const letters = (text) => [...text].map((c, i) => `<span class="ch" style="--i:${i}">${c}</span>`).join('');
headline.innerHTML = letters(scene().title);
function fitTitle() {
  const vw = innerWidth, vh = innerHeight;
  headline.style.setProperty('--title-size', '100px');
  const w = headline.scrollWidth || 1;
  const targetW = Math.min(vw * (vw < 760 ? 0.9 : 0.86), 1500);
  const size = Math.min(100 * targetW / w, vh * (vw < 760 ? 0.11 : 0.19));
  headline.style.setProperty('--title-size', `${size.toFixed(1)}px`);
  // scene arrows: beside the kicker on phones, beside the title on wide screens
  const r = (vw < 760 ? kicker : headline).getBoundingClientRect();
  document.documentElement.style.setProperty('--nav-y', `${(r.top + r.height / 2).toFixed(1)}px`);
}
document.fonts?.ready.then(fitTitle);
fitTitle();
setTimeout(() => body.classList.add('title-in'), 60);
document.querySelectorAll('[data-scramble]').forEach((el, i) => scramble(el, { delay: 250 + i * 200, duration: 1100 }));

function titleOut() { headline.classList.add('out'); }
function titleIn(text) {
  headline.classList.add('swap');
  headline.classList.remove('out');
  headline.innerHTML = letters(text);
  fitTitle();
  void headline.offsetWidth; // start the entrance from the hidden state
  headline.classList.remove('swap');
  scramble(kicker, { duration: 700 });
}

const isTouch = matchMedia('(pointer: coarse)').matches;
// phones: only the scene on screen is kept on the GPU; the next one is downloaded but decoded on arrival
const LEAN = isTouch || (navigator.deviceMemory ?? 8) < 8;
const HINTS = isTouch
  ? { orbit: 'DRAG · ROTATE  /  PINCH · ZOOM  /  2-FINGER · PAN', free: 'DRAG · LOOK  /  PINCH · WALK  /  2-FINGER · SLIDE' }
  : { orbit: 'DRAG · ROTATE  /  SCROLL · ZOOM  /  RIGHT-DRAG · PAN  /  ← → · SCENE', free: 'DRAG · LOOK  /  SCROLL · WALK  /  WASD · MOVE  /  ← → · SCENE' };
const TIPS = { free: isTouch ? 'WISCHEN ZUM UMSCHAUEN · ZWEI FINGER ZUM GEHEN' : 'ZIEHEN ZUM UMSCHAUEN · SCROLLEN ODER WASD ZUM GEHEN' };
if (!document.fullscreenEnabled) $('btn-full').hidden = true;

// ─── engine ───────────────────────────────────────────────────────────────
const canvas = $('stage');
let device;
try {
  device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
  });
} catch (e) {
  fail('Dieses Gerät unterstützt kein WebGL2. Bitte einen aktuellen Browser verwenden.');
  throw e;
}

const maxRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2);
let pixelRatio = Math.min(maxRatio, isTouch ? 1.5 : 2); // phones start a step lower and climb if they can
device.maxPixelRatio = pixelRatio;

const app = new pc.Application(canvas, { graphicsDevice: device });
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.gsplat.antiAlias = false;

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0, 0, 0, 0),
  fov: 45,
  nearClip: 0.05,
  farClip: 200,
  toneMapping: pc.TONEMAP_LINEAR,
  gammaCorrection: pc.GAMMA_SRGB,
});
app.root.addChild(camera);

// Off-axis projection: lift the orbit target above screen centre so the title sits below the people.
let lift = 0;
function updateLens() {
  const cam = camera.camera;
  // portrait: keep the horizontal angle, so a wide group still fits a phone
  cam.horizontalFov = portrait();
  cam.fov = portrait() ? 62 : 42;
  lift = portrait() ? scene().lift.portrait : scene().lift.landscape;
  document.documentElement.style.setProperty('--target-y', `${(50 - lift * 50).toFixed(1)}%`);
}
camera.camera.calculateProjection = (mat) => {
  const cam = camera.camera;
  mat.setPerspective(cam.fov, cam.aspectRatio, cam.nearClip, cam.farClip, cam.horizontalFov);
  mat.data[9] = -lift;
};

// home view of a scene for the current screen shape
const portrait = () => innerHeight > innerWidth;
function homeView(s) {
  return portrait() && s.view.portraitDist ? { ...s.view, dist: s.view.portraitDist } : s.view;
}

const orbit = new Orbit(camera, canvas, homeView(scene()));
orbit.onInteract = () => {
  body.classList.add('interacting');
  clearTimeout(orbit._t);
  orbit._t = setTimeout(() => body.classList.remove('interacting'), 900);
};

const hud = new Hud();
const fx = new SplatFx(app, scene().fx);

function onResize() {
  orbit.home = homeView(scene()); // turning the phone changes where RESET goes, not the camera
  updateLens();
  app.resizeCanvas();
  fitTitle();
}
addEventListener('resize', onResize);

// Labels, HUD, address and lens for the current scene.
function showScene() {
  const s = scene();
  const mode = s.view.mode === 'free' ? 'free' : 'orbit';
  $('hud-scan').textContent = s.scan;
  $('hud-hint').textContent = HINTS[mode];
  $('hud-src').textContent = s.credit ?? '';
  $('hud-src').parentElement.hidden = !s.credit;
  camera.camera.nearClip = s.near ?? 0.05;
  camera.camera.farClip = s.far ?? 200;
  hud.setSplats(s.splats);
  const label = (n) => `${String(SCENES.indexOf(n) + 1).padStart(2, '0')} · ${n.title}`;
  $('nav-prev-label').textContent = label(neighbour(-1));
  $('nav-next-label').textContent = label(neighbour(1));
  $('btn-prev').setAttribute('aria-label', `Zurück: ${neighbour(-1).title}`);
  $('btn-next').setAttribute('aria-label', `Weiter: ${neighbour(1).title}`);
  document.title = `${s.title} · Flugmodus X 405x`;
  history.replaceState(null, '', cur === 0 ? location.pathname + location.search : `#${s.id}`);
  onResize();
}
showScene();

// Adaptive resolution: drop the pixel ratio when the device cannot hold ~40 fps.
let perfTime = 0, perfFrames = 0, perfSettled = 0;
function adaptResolution(dt) {
  if (!scene().entity || fx.busy) return;
  perfTime += dt; perfFrames++;
  if (perfTime < 1.5) return;
  const fps = perfFrames / perfTime;
  perfTime = 0; perfFrames = 0;
  if (fps < 38 && pixelRatio > 0.75) {
    pixelRatio = Math.max(0.75, pixelRatio - 0.25);
    device.maxPixelRatio = pixelRatio;
    app.resizeCanvas();
    perfSettled = 0;
  } else if (fps > 57 && pixelRatio < maxRatio && ++perfSettled > 3) {
    pixelRatio = Math.min(maxRatio, pixelRatio + 0.25);
    device.maxPixelRatio = pixelRatio;
    app.resizeCanvas();
    perfSettled = 0;
  }
}

let debugT = 0;
app.on('update', (dt) => {
  orbit.update(dt);
  fx.update(dt);
  hud.update(dt, orbit, device);
  adaptResolution(dt);
  if (DEBUG && (debugT += dt) > 0.5) {
    debugT = 0;
    const t = orbit.target;
    $('hud-mode').textContent = `Y${orbit.yaw.toFixed(0)} P${orbit.pitch.toFixed(0)} D${orbit.dist.toFixed(2)} T${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`;
  }
});
app.start();

// ─── controls ─────────────────────────────────────────────────────────────
const btnAuto = $('btn-auto');
btnAuto.addEventListener('click', () => {
  orbit.autoRotate = !orbit.autoRotate;
  orbit.idle = orbit.idleDelay; // start right away when switched on
  btnAuto.setAttribute('aria-pressed', String(orbit.autoRotate));
});
$('btn-reset').addEventListener('click', () => orbit.reset());
$('btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
$('btn-prev').addEventListener('click', () => go(-1));
$('btn-next').addEventListener('click', () => go(1));
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
});

// ─── loading ──────────────────────────────────────────────────────────────
const ring = $('loader-prog');
const RING_LEN = 2 * Math.PI * 54;
let waitingFor = null; // the scene the loader ring is showing
function progress(s, state) {
  if (s !== waitingFor) return;
  const t = s.total ? Math.min(1, s.received / s.total) : 0;
  ring.style.strokeDashoffset = String(RING_LEN * (1 - t));
  $('loader-pct').innerHTML = `${String(Math.floor(t * 100)).padStart(3, '0')}<small>%</small>`;
  $('loader-bytes').textContent = `${(s.received / 1048576).toFixed(1)} / ${(s.total / 1048576).toFixed(1)} MB`;
  if (state) $('loader-state').textContent = state;
}

async function download(s) {
  s.received = 0; s.total = s.bytes;
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`Splat-Datei nicht gefunden (${res.status}).`);
  s.total = Number(res.headers.get('content-length')) || s.bytes;
  if (!res.body) { const b = await res.blob(); s.received = s.total = b.size; progress(s); return b; }
  const reader = res.body.getReader();
  const chunks = [];
  progress(s, 'RECEIVING');
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    s.received += value.length;
    s.total = Math.max(s.total, s.received);
    progress(s);
  }
  return new Blob(chunks);
}

function decode(blob, s) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const asset = new pc.Asset(s.id, 'gsplat', { url, filename: `${s.id}.sog` });
    asset.once('load', () => { URL.revokeObjectURL(url); resolve(asset); });
    asset.once('error', (err) => { URL.revokeObjectURL(url); reject(err); });
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

// Download once (the bytes wait until the scene is decoded).
function fetchScene(s) {
  s.fetching ??= download(s);
  s.fetching.catch(() => { s.fetching = null; }); // a failed download may be retried
  return s.fetching;
}

// Download and decode once; the entity waits disabled until its scene is shown.
function load(s) {
  s.loading ??= (async () => {
    const blob = await fetchScene(s);
    progress(s, 'DECODING');
    const asset = await decode(blob, s);
    s.fetching = null; // the splats live on the GPU now
    const e = new pc.Entity(s.id);
    const rot = new pc.Quat().setFromEulerAngles(...s.rotation);
    if (s.level) rot.mul(new pc.Quat().setFromAxisAngle(new pc.Vec3(...s.level.axis), s.level.angle));
    e.setLocalRotation(rot);
    if (s.scale) e.setLocalScale(s.scale, s.scale, s.scale);
    e.addComponent('gsplat', { asset, unified: true });
    e.enabled = false;
    app.root.addChild(e);
    s.entity = e;
    s.asset = asset;
    const n = asset.resource?.numSplats ?? asset.resource?.gsplatData?.numSplats;
    if (n) s.splats = n;
    return s;
  })();
  s.loading.catch(() => { s.loading = null; });
  return s.loading;
}

// Phones: free the GPU memory of a scene that is no longer shown (it reloads from the browser cache).
function unload(s) {
  if (!s.entity) return;
  s.entity.destroy();
  s.asset.unload();
  app.assets.remove(s.asset);
  s.entity = s.asset = s.loading = null;
}

function preload(s) {
  (LEAN ? fetchScene(s) : load(s)).catch(() => {});
}

// short on-screen tip when a scene works differently (free look)
let tipTimer = 0;
function showTip(text) {
  const el = $('scene-tip');
  clearTimeout(tipTimer);
  el.textContent = text ?? '';
  el.classList.toggle('show', !!text);
  if (text) tipTimer = setTimeout(() => el.classList.remove('show'), 5200);
}

// Bring the current scene in: wait for its data if needed, then the point-cloud reveal.
let phase = 'load'; // load -> reveal -> idle; dissolve while switching
let token = 0;
async function enter() {
  const s = scene(), my = token;
  if (!s.entity) {
    waitingFor = s;
    progress(s, s.received >= s.total ? 'DECODING' : s.received ? 'RECEIVING' : 'LINKING');
    hud.setMode('LINK');
    await load(s);
    waitingFor = null;
  }
  progress(s, 'RESOLVING');
  fx.setOptions(s.fx);
  s.entity.enabled = true;
  hud.setSplats(s.splats);
  await wait(120); // give the sorter a frame before the wave starts
  body.classList.remove('is-loading', 'waiting');
  body.classList.add('ready');
  hud.setMode('RESOLVE');
  orbit.idle = orbit.idleDelay - 2.5; // auto-rotate starts a moment after the reveal
  phase = 'reveal';
  const revealed = fx.reveal();
  if (my) titleIn(s.title); // the first title comes in with the page
  showTip(TIPS[s.view.mode]);
  preload(neighbour(1)); // the next scene loads in the background
  await revealed;
  if (my !== token) return; // a newer switch took over
  phase = 'idle';
  hud.setMode(s.view.mode === 'free' ? 'FREE' : 'ORBIT');
}

async function go(step) {
  if (SCENES.length < 2 || phase === 'load' || phase === 'dissolve') return;
  token++;
  phase = 'dissolve';
  const from = scene();
  preload(neighbour(step));
  titleOut();
  showTip(null);
  hud.setMode('DISSOLVE');
  await fx.dissolve();
  from.entity.enabled = false;
  if (LEAN) unload(from);
  cur = SCENES.indexOf(neighbour(step));
  phase = 'load';
  orbit.setView(homeView(scene()));
  showScene();
  if (!scene().entity) body.classList.add('waiting');
  try {
    await enter();
  } catch (e) {
    fail(e);
  }
}

// ?debug shows camera values in the HUD, ?shot only exposes the objects (used for og-image.jpg)
if (DEBUG || params.has('shot')) Object.assign(window, { app, pc, orbit, fx, camera, scene, SCENES, go });

try {
  waitingFor = scene();
  fx.attach();
  await enter();
} catch (e) {
  fail(e);
}
