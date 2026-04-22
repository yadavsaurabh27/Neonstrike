import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const canvas = document.querySelector("#scene");
const startScreen = document.querySelector("#start-screen");
const startButton = document.querySelector("#start-button");
const healthEl = document.querySelector("#health");
const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const ammoEl = document.querySelector("#ammo");
const messageEl = document.querySelector("#message");
const damageVignette = document.querySelector("#damage-vignette");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x071018, 0.028);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 2.0, 12);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.12);
composer.addPass(bloom);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const keys = new Set();
const enemies = [];
const shots = [];
const particles = [];
const arenaObjects = [];
const tmpVec = new THREE.Vector3();
const playerBox = new THREE.Box3();

let locked = false;
let yaw = 0;
let pitch = 0;
let health = 100;
let score = 0;
let wave = 1;
let ammo = 24;
let reloadTimer = 0;
let fireCooldown = 0;
let damagePulse = 0;
let isGameOver = false;
let nextSpawnTimer = 0;

const MAX_AMMO = 24;
const PLAYER_SPEED = 15;
const SPRINT_MULTIPLIER = 1.55;
const PLAYER_RADIUS = 0.72;

const materials = {
  floor: new THREE.MeshStandardMaterial({
    color: 0x111820,
    metalness: 0.55,
    roughness: 0.34,
  }),
  wall: new THREE.MeshStandardMaterial({
    color: 0x172331,
    metalness: 0.48,
    roughness: 0.38,
  }),
  trim: new THREE.MeshStandardMaterial({
    color: 0x88f2ff,
    emissive: 0x1bbdff,
    emissiveIntensity: 2.2,
  }),
  enemy: new THREE.MeshStandardMaterial({
    color: 0xff3349,
    emissive: 0xff0b3a,
    emissiveIntensity: 1.9,
    metalness: 0.35,
    roughness: 0.22,
  }),
  enemyCore: new THREE.MeshStandardMaterial({
    color: 0xfff0a5,
    emissive: 0xffd85a,
    emissiveIntensity: 2.8,
  }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xdfffff }),
  spark: new THREE.MeshBasicMaterial({
    color: 0x9dfff4,
    transparent: true,
    opacity: 0.95,
  }),
};

function buildArena() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(92, 0.22, 92), materials.floor);
  floor.position.y = -0.12;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(92, 46, 0x1ee3ff, 0x273643);
  grid.position.y = 0.006;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  scene.add(grid);

  const ambient = new THREE.HemisphereLight(0x9ee9ff, 0x161114, 0.68);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xe8fbff, 2.7);
  sun.position.set(-22, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  scene.add(sun);

  const accentA = new THREE.PointLight(0x25e8ff, 35, 54, 1.7);
  accentA.position.set(-28, 8, -26);
  scene.add(accentA);

  const accentB = new THREE.PointLight(0xf7ff64, 22, 48, 1.9);
  accentB.position.set(30, 9, 24);
  scene.add(accentB);

  addBoundary(0, 2.8, -46, 92, 5.6, 1.4);
  addBoundary(0, 2.8, 46, 92, 5.6, 1.4);
  addBoundary(-46, 2.8, 0, 1.4, 5.6, 92);
  addBoundary(46, 2.8, 0, 1.4, 5.6, 92);

  const coverPoints = [
    [-24, -18, 6, 4, 13],
    [18, -22, 5, 5, 8],
    [-12, 8, 8, 4, 5],
    [25, 12, 5, 6, 14],
    [-31, 22, 6, 5, 7],
    [2, -34, 13, 4, 5],
    [4, 25, 16, 4, 4],
  ];

  for (const [x, z, w, h, d] of coverPoints) {
    addCover(x, z, w, h, d);
  }

  for (let i = -36; i <= 36; i += 12) {
    addNeonStrip(i, -44, 8, 0.12, 0.2);
    addNeonStrip(i, 44, 8, 0.12, 0.2);
    addNeonStrip(-44, i, 0.12, 8, Math.PI / 2);
    addNeonStrip(44, i, 0.12, 8, Math.PI / 2);
  }
}

function addBoundary(x, y, z, width, height, depth) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials.wall);
  wall.position.set(x, y, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
  arenaObjects.push({ mesh: wall, box: new THREE.Box3().setFromObject(wall) });
}

function addCover(x, z, width, height, depth) {
  const cover = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials.wall);
  cover.position.set(x, height / 2, z);
  cover.castShadow = true;
  cover.receiveShadow = true;
  scene.add(cover);
  arenaObjects.push({ mesh: cover, box: new THREE.Box3().setFromObject(cover) });

  const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.08, depth + 0.18), materials.trim);
  trim.position.set(x, height + 0.07, z);
  scene.add(trim);
}

function addNeonStrip(x, z, width, depth, rotation) {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, depth), materials.trim);
  strip.position.set(x, 0.04, z);
  strip.rotation.y = rotation;
  scene.add(strip);
}

function buildWeapon() {
  const weapon = new THREE.Group();
  weapon.name = "weapon";

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.34, 1.12),
    new THREE.MeshStandardMaterial({
      color: 0x202a35,
      metalness: 0.82,
      roughness: 0.21,
    }),
  );
  body.position.set(0.34, -0.33, -0.86);
  weapon.add(body);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 1.15, 18),
    new THREE.MeshStandardMaterial({
      color: 0x0d1116,
      metalness: 0.94,
      roughness: 0.16,
    }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.34, -0.29, -1.48);
  weapon.add(barrel);

  const glow = new THREE.PointLight(0x8fffff, 1.5, 4);
  glow.position.set(0.34, -0.26, -1.98);
  weapon.add(glow);

  camera.add(weapon);
  scene.add(camera);
}

function createEnemy(x, z, tier = 1) {
  const group = new THREE.Group();
  const size = 0.9 + tier * 0.08;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 2), materials.enemy);
  body.castShadow = true;
  group.add(body);

  const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.34, 18, 18), materials.enemyCore);
  core.position.z = size * 0.72;
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.88, 0.035, 10, 42),
    new THREE.MeshBasicMaterial({ color: 0x9dfff4 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const light = new THREE.PointLight(0xff2747, 6, 8, 2);
  group.add(light);

  group.position.set(x, 1.35 + tier * 0.1, z);
  group.userData = {
    health: 44 + tier * 18,
    speed: 3.1 + tier * 0.22,
    damageCooldown: 0,
    hitRadius: size,
    tier,
  };
  scene.add(group);
  enemies.push(group);
}

function spawnWave() {
  const count = Math.min(5 + wave * 2, 18);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 24 + Math.random() * 18;
    createEnemy(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.ceil(wave / 3));
  }
  showMessage(`Wave ${wave}: hostile drones inbound`);
}

function shoot() {
  if (!locked || reloadTimer > 0 || fireCooldown > 0 || isGameOver) return;
  if (ammo <= 0) {
    reload();
    return;
  }

  ammo -= 1;
  fireCooldown = 0.105;
  updateHud();

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3());
  raycaster.set(origin, direction);
  raycaster.far = 96;
  const hits = raycaster.intersectObjects(enemies, true);
  const endPoint = origin.clone().add(direction.multiplyScalar(82));

  if (hits.length) {
    const enemy = findEnemyRoot(hits[0].object);
    if (enemy) {
      enemy.userData.health -= 34;
      endPoint.copy(hits[0].point);
      createImpact(hits[0].point, 0x9dfff4);
      if (enemy.userData.health <= 0) {
        destroyEnemy(enemy);
      }
    }
  }

  createTracer(origin, endPoint);
  createMuzzleFlash();
}

function findEnemyRoot(object) {
  let current = object;
  while (current && current.parent !== scene) current = current.parent;
  return enemies.includes(current) ? current : null;
}

function destroyEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index >= 0) enemies.splice(index, 1);
  createImpact(enemy.position, 0xffd85a, 20);
  scene.remove(enemy);
  score += 100 + enemy.userData.tier * 35;
  updateHud();

  if (enemies.length === 0) {
    wave += 1;
    nextSpawnTimer = 2.1;
    health = Math.min(100, health + 12);
    ammo = MAX_AMMO;
    updateHud();
    showMessage("Sector clear. Reloading and preparing next breach.");
  }
}

function createTracer(origin, target) {
  const distance = origin.distanceTo(target);
  const tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, distance, 8), materials.bullet);
  tracer.position.copy(origin).lerp(target, 0.5);
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().sub(origin).normalize());
  tracer.userData.life = 0.06;
  scene.add(tracer);
  shots.push(tracer);
}

function createMuzzleFlash() {
  const flash = new THREE.PointLight(0xe5ff74, 8, 9, 2);
  flash.position.copy(camera.position);
  flash.userData.life = 0.045;
  scene.add(flash);
  shots.push(flash);

  const weapon = camera.getObjectByName("weapon");
  if (weapon) {
    weapon.position.z = 0.08;
  }
}

function createImpact(position, color, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), materials.spark.clone());
    spark.material.color.setHex(color);
    spark.position.copy(position);
    spark.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 9,
      Math.random() * 7,
      (Math.random() - 0.5) * 9,
    );
    spark.userData.life = 0.4 + Math.random() * 0.32;
    scene.add(spark);
    particles.push(spark);
  }
}

function reload() {
  if (reloadTimer > 0 || ammo === MAX_AMMO) return;
  reloadTimer = 1.1;
  showMessage("Reloading");
}

function updatePlayer(delta) {
  const speed = PLAYER_SPEED * (keys.has("ShiftLeft") ? SPRINT_MULTIPLIER : 1);
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw) * -1);
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const movement = new THREE.Vector3();

  if (keys.has("KeyW")) movement.add(forward);
  if (keys.has("KeyS")) movement.sub(forward);
  if (keys.has("KeyD")) movement.add(right);
  if (keys.has("KeyA")) movement.sub(right);

  if (movement.lengthSq() > 0) {
    movement.normalize().multiplyScalar(speed * delta);
    const next = camera.position.clone().add(movement);
    next.x = THREE.MathUtils.clamp(next.x, -43, 43);
    next.z = THREE.MathUtils.clamp(next.z, -43, 43);

    playerBox.setFromCenterAndSize(next, new THREE.Vector3(PLAYER_RADIUS * 2, 3.4, PLAYER_RADIUS * 2));
    const blocked = arenaObjects.some((object) => playerBox.intersectsBox(object.box));
    if (!blocked) camera.position.copy(next);
  }

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  const weapon = camera.getObjectByName("weapon");
  if (weapon) {
    weapon.position.z = THREE.MathUtils.lerp(weapon.position.z, 0, 14 * delta);
    weapon.position.y = Math.sin(clock.elapsedTime * 7.5) * (movement.lengthSq() > 0 ? 0.014 : 0.006);
  }
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const toPlayer = camera.position.clone().sub(enemy.position);
    const distance = toPlayer.length();
    toPlayer.y = 0;

    if (distance > 1.7) {
      const step = toPlayer.normalize().multiplyScalar(enemy.userData.speed * delta);
      enemy.position.add(step);
    }

    enemy.lookAt(camera.position.x, enemy.position.y, camera.position.z);
    enemy.rotation.z += delta * (1.6 + enemy.userData.tier * 0.2);
    enemy.position.y = 1.4 + Math.sin(clock.elapsedTime * 3 + enemy.id) * 0.18;

    enemy.userData.damageCooldown -= delta;
    if (distance < 2.15 && enemy.userData.damageCooldown <= 0) {
      health = Math.max(0, health - 10 - enemy.userData.tier * 2);
      damagePulse = 0.24;
      enemy.userData.damageCooldown = 0.72;
      updateHud();
      if (health <= 0) endGame();
    }
  }
}

function updateEffects(delta) {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    shot.userData.life -= delta;
    if (shot.userData.life <= 0) {
      scene.remove(shot);
      shots.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const spark = particles[i];
    spark.userData.life -= delta;
    spark.position.addScaledVector(spark.userData.velocity, delta);
    spark.userData.velocity.y -= 10 * delta;
    spark.material.opacity = Math.max(0, spark.userData.life * 2.2);
    if (spark.userData.life <= 0) {
      scene.remove(spark);
      spark.material.dispose();
      particles.splice(i, 1);
    }
  }

  damagePulse = Math.max(0, damagePulse - delta);
  damageVignette.classList.toggle("hot", damagePulse > 0);

  if (reloadTimer > 0) {
    reloadTimer -= delta;
    if (reloadTimer <= 0) {
      ammo = MAX_AMMO;
      showMessage("Ready");
      updateHud();
    }
  }

  fireCooldown = Math.max(0, fireCooldown - delta);
}

function updateHud() {
  healthEl.textContent = Math.ceil(health);
  scoreEl.textContent = score;
  waveEl.textContent = wave;
  ammoEl.textContent = reloadTimer > 0 ? "..." : ammo;
}

function showMessage(text) {
  messageEl.textContent = text;
}

function endGame() {
  isGameOver = true;
  document.exitPointerLock();
  startScreen.classList.remove("hidden");
  startButton.textContent = "Restart Mission";
  showMessage(`Mission failed. Final score: ${score}`);
}

function resetGame() {
  for (const enemy of enemies.splice(0)) scene.remove(enemy);
  for (const shot of shots.splice(0)) scene.remove(shot);
  for (const spark of particles.splice(0)) scene.remove(spark);
  camera.position.set(0, 2.0, 12);
  yaw = 0;
  pitch = 0;
  health = 100;
  score = 0;
  wave = 1;
  ammo = MAX_AMMO;
  reloadTimer = 0;
  fireCooldown = 0;
  damagePulse = 0;
  isGameOver = false;
  nextSpawnTimer = 0;
  updateHud();
  spawnWave();
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);

  if (!isGameOver) {
    updatePlayer(delta);
    updateEnemies(delta);
    updateEffects(delta);

    if (nextSpawnTimer > 0) {
      nextSpawnTimer -= delta;
      if (nextSpawnTimer <= 0) spawnWave();
    }
  }

  composer.render();
  requestAnimationFrame(animate);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloom.setSize(width, height);
}

startButton.addEventListener("click", () => {
  startScreen.classList.add("hidden");
  resetGame();
  canvas.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    showMessage("Clear the wave. Click to fire, R reload, Shift sprint.");
  } else if (!isGameOver) {
    showMessage("Click the arena to capture mouse.");
  }
});

canvas.addEventListener("click", () => {
  if (!locked && startScreen.classList.contains("hidden")) {
    canvas.requestPointerLock();
  } else {
    shoot();
  }
});

document.addEventListener("mousemove", (event) => {
  if (!locked) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -1.34, 1.22);
});

document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyR") reload();
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("resize", resize);

buildArena();
buildWeapon();
updateHud();
animate();
