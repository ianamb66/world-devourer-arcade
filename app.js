const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  mass: document.querySelector("#massStat"),
  hunger: document.querySelector("#hungerMeter"),
  c1: document.querySelector("#classOneStat"),
  c2: document.querySelector("#classTwoStat"),
  c3: document.querySelector("#classThreeStat"),
  moons: document.querySelector("#moonStat"),
  pulse: document.querySelector("#pulseStatus"),
  wave: document.querySelector("#waveStatus"),
  threat: document.querySelector("#threatStatus"),
  startOverlay: document.querySelector("#startOverlay"),
  gameOverOverlay: document.querySelector("#gameOverOverlay"),
  gameOverTitle: document.querySelector("#gameOverTitle"),
  gameOverCopy: document.querySelector("#gameOverCopy"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  joystick: document.querySelector("#joystick"),
  joystickKnob: document.querySelector("#joystickKnob"),
  pulseTouchButton: document.querySelector("#pulseTouchButton"),
  moonTouchButton: document.querySelector("#moonTouchButton"),
};

const keys = new Set();
const pointer = { x: 0, y: 0, down: false, active: false };
const touchMove = { x: 0, y: 0, active: false, id: null };
let width = 0;
let height = 0;
let dpr = 1;
let lastTime = 0;
let rafId = 0;
let world = { width: 0, height: 0 };
let camera = { x: 0, y: 0 };

const game = {
  running: false,
  time: 0,
  wave: 1,
  score: 0,
  eaten: { 1: 0, 2: 0, 3: 0 },
  planets: [],
  bullets: [],
  particles: [],
  playerMoons: [],
  stars: [],
  dust: [],
  messages: [],
  player: null,
};

const TAU = Math.PI * 2;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function setWorldSize() {
  world = {
    width: Math.max(2200, width * 2.75),
    height: Math.max(1700, height * 2.35),
  };
}

function makeStars() {
  game.stars = Array.from({ length: 360 }, () => ({
    x: Math.random() * world.width,
    y: Math.random() * world.height,
    r: Math.random() > 0.9 ? 1.35 : 0.65,
    a: rand(0.1, 0.62),
  }));
  game.dust = Array.from({ length: 210 }, () => ({
    x: Math.random() * world.width,
    y: Math.random() * world.height,
    w: rand(18, 90),
    a: rand(0.025, 0.08),
    tilt: rand(-0.6, 0.6),
  }));
}

function updateCamera() {
  if (!game.player) return;
  camera.x = clamp(game.player.x - width / 2, 0, Math.max(0, world.width - width));
  camera.y = clamp(game.player.y - height / 2, 0, Math.max(0, world.height - height));
}

function screenToWorld(point) {
  return {
    x: point.x + camera.x,
    y: point.y + camera.y,
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  const oldWorld = { ...world };
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  setWorldSize();

  if (!game.stars.length || Math.abs(oldWorld.width - world.width) > 140 || Math.abs(oldWorld.height - world.height) > 140) {
    makeStars();
  }
  updateCamera();
}

function makePlayer() {
  return {
    x: world.width / 2,
    y: world.height / 2,
    vx: 0,
    vy: 0,
    r: 22,
    mass: 100,
    maxMass: 100,
    pulseCooldown: 0,
    invuln: 0,
  };
}

function createPlanet(civClass, x, y) {
  const radius = 22 + civClass * 8 + rand(-4, 6);
  const shieldMax = civClass * 32;
  const moonCount = civClass + (Math.random() > 0.68 ? 1 : 0);
  return {
    x,
    y,
    vx: rand(-8, 8),
    vy: rand(-8, 8),
    r: radius,
    class: civClass,
    hp: radius * (1.15 + civClass * 0.45),
    hpMax: radius * (1.15 + civClass * 0.45),
    shield: shieldMax,
    shieldMax,
    regen: 0,
    age: rand(0, 12),
    weaponTimer: rand(0.4, 2.2),
    evolveTimer: rand(10, 22),
    turrets: Array.from({ length: civClass }, (_, index) => ({
      angle: (index / civClass) * TAU + rand(-0.3, 0.3),
      hp: 18 + civClass * 8,
      cooldown: rand(0.6, 2),
    })),
    moons: Array.from({ length: moonCount }, (_, index) => ({
      angle: (index / moonCount) * TAU + rand(-0.4, 0.4),
      orbit: radius + 20 + index * 8,
      r: 5 + civClass,
      captured: false,
    })),
  };
}

function spawnPlanet(forceClass = null, preferred = null) {
  const margin = 180;
  let x = preferred?.x ?? rand(margin, world.width - margin);
  let y = preferred?.y ?? rand(margin, world.height - margin);
  const player = game.player ?? { x: world.width / 2, y: world.height / 2 };

  for (let i = 0; !preferred && i < 60; i += 1) {
    const playerGap = Math.hypot(x - player.x, y - player.y);
    const planetGap = game.planets.every((planet) => Math.hypot(x - planet.x, y - planet.y) > 260);
    if (playerGap > 360 && planetGap) break;
    x = rand(margin, world.width - margin);
    y = rand(margin, world.height - margin);
  }

  const roll = Math.random();
  const civClass = forceClass ?? (roll > 0.82 ? 3 : roll > 0.46 ? 2 : 1);
  game.planets.push(createPlanet(civClass, x, y));
}

function seedArena() {
  game.planets = [];
  const count = width < 760 ? 6 : 8;
  const player = game.player ?? { x: world.width / 2, y: world.height / 2 };
  const ring = width < 760 ? Math.min(height * 0.48, 430) : Math.min(width * 0.38, 560);
  for (let i = 0; i < 3; i += 1) {
    const a = -Math.PI / 2 + i * 2.15 + rand(-0.28, 0.28);
    spawnPlanet(1, {
      x: clamp(player.x + Math.cos(a) * ring, 220, world.width - 220),
      y: clamp(player.y + Math.sin(a) * ring, 220, world.height - 220),
    });
  }
  for (let i = 3; i < count; i += 1) {
    spawnPlanet();
  }
}

function startGame() {
  game.running = true;
  game.time = 0;
  game.wave = 1;
  game.score = 0;
  game.eaten = { 1: 0, 2: 0, 3: 0 };
  game.bullets = [];
  game.particles = [];
  game.playerMoons = [];
  game.messages = [];
  game.player = makePlayer();
  seedArena();
  updateCamera();
  ui.startOverlay.classList.remove("is-visible");
  ui.gameOverOverlay.classList.remove("is-visible");
  lastTime = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function endGame(title, copy) {
  game.running = false;
  cancelAnimationFrame(rafId);
  ui.gameOverTitle.textContent = title;
  ui.gameOverCopy.textContent = copy;
  ui.gameOverOverlay.classList.add("is-visible");
}

function addMessage(text) {
  game.messages.push({ text, life: 2.2 });
  if (game.messages.length > 3) game.messages.shift();
}

function addParticles(x, y, count, speed = 90, size = 2) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, TAU);
    const v = rand(speed * 0.2, speed);
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: rand(0.8, size),
      life: rand(0.25, 0.8),
      maxLife: 0.8,
    });
  }
}

function addSiphonParticles(planet, count, strength = 1) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, TAU);
    const radius = rand(planet.r * 0.15, planet.r * 1.08);
    game.particles.push({
      x: planet.x + Math.cos(a) * radius,
      y: planet.y + Math.sin(a) * radius,
      vx: Math.cos(a) * rand(10, 70),
      vy: Math.sin(a) * rand(10, 70),
      r: rand(0.9, 2.6),
      life: rand(0.55, 1.2),
      maxLife: 1.2,
      pull: true,
      pullStrength: strength,
    });
  }
}

function updatePlayer(dt) {
  const p = game.player;
  let ax = 0;
  let ay = 0;
  if (keys.has("w") || keys.has("arrowup")) ay -= 1;
  if (keys.has("s") || keys.has("arrowdown")) ay += 1;
  if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
  if (keys.has("d") || keys.has("arrowright")) ax += 1;

  if (pointer.down && pointer.active) {
    const pointerWorld = screenToWorld(pointer);
    const a = angleTo(p, pointerWorld);
    const distance = dist(p, pointerWorld);
    ax += Math.cos(a) * clamp(distance / 160, 0, 1);
    ay += Math.sin(a) * clamp(distance / 160, 0, 1);
  }

  if (touchMove.active) {
    ax += touchMove.x;
    ay += touchMove.y;
  }

  const len = Math.hypot(ax, ay) || 1;
  const speed = 185 / Math.sqrt(Math.max(1, p.mass / 90));
  p.vx += (ax / len) * speed * dt * 5.2;
  p.vy += (ay / len) * speed * dt * 5.2;
  p.vx *= Math.pow(0.08, dt);
  p.vy *= Math.pow(0.08, dt);
  p.x = clamp(p.x + p.vx * dt, p.r, world.width - p.r);
  p.y = clamp(p.y + p.vy * dt, p.r, world.height - p.r);
  p.r = 17 + Math.sqrt(p.mass) * 1.2;
  p.mass -= dt * (1.5 + game.wave * 0.08);
  p.pulseCooldown = Math.max(0, p.pulseCooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  if (p.mass <= 0) {
    endGame("Tu hambre colapso", `Devoraste ${game.score} puntos de civilizacion antes de apagarte.`);
  }
}

function updatePlanets(dt) {
  const p = game.player;
  for (const planet of game.planets) {
    planet.age += dt;
    planet.regen += dt;
    planet.weaponTimer -= dt;
    planet.evolveTimer -= dt;
    planet.x += planet.vx * dt;
    planet.y += planet.vy * dt;
    if (planet.x < planet.r || planet.x > world.width - planet.r) planet.vx *= -1;
    if (planet.y < planet.r || planet.y > world.height - planet.r) planet.vy *= -1;
    planet.x = clamp(planet.x, planet.r, world.width - planet.r);
    planet.y = clamp(planet.y, planet.r, world.height - planet.r);

    if (planet.regen > 0.7) {
      planet.regen = 0;
      planet.shield = clamp(planet.shield + 1.8 * planet.class, 0, planet.shieldMax);
      planet.hp = clamp(planet.hp + 0.5 * planet.class, 0, planet.hpMax);
      planet.turrets.forEach((turret) => {
        turret.hp = clamp(turret.hp + 0.65 * planet.class, 0, 18 + planet.class * 8);
      });
    }

    if (planet.evolveTimer <= 0 && planet.class < 3) {
      planet.class += 1;
      planet.shieldMax += 32;
      planet.shield = planet.shieldMax;
      planet.hpMax += 24;
      planet.hp = planet.hpMax;
      planet.turrets.push({ angle: rand(0, TAU), hp: 18 + planet.class * 8, cooldown: 1.2 });
      planet.moons.push({ angle: rand(0, TAU), orbit: planet.r + 32, r: 5 + planet.class, captured: false });
      planet.evolveTimer = rand(18, 32);
      addMessage(`Una civilizacion ascendio a clase ${planet.class}.`);
    }

    planet.moons.forEach((moon) => {
      moon.angle += dt * (0.55 + planet.class * 0.16);
      const mx = planet.x + Math.cos(moon.angle) * moon.orbit;
      const my = planet.y + Math.sin(moon.angle) * moon.orbit;
      if (Math.hypot(mx - p.x, my - p.y) < p.r + moon.r + 8) {
        moon.captured = true;
        game.playerMoons.push({
          angle: rand(0, TAU),
          orbit: p.r + 18 + game.playerMoons.length * 6,
          r: moon.r,
          cooldown: 0.2,
        });
        addParticles(mx, my, 8, 80, 2.2);
        addMessage("Luna capturada.");
      }
    });
    planet.moons = planet.moons.filter((moon) => !moon.captured);

    if (planet.weaponTimer <= 0) {
      firePlanetWeapon(planet);
      planet.weaponTimer = rand(1.1, 2.6) / planet.class;
    }

    const d = dist(p, planet);
    if (d < p.r + planet.r) {
      if (planet.shield > 1) {
        planet.shield -= 18 * dt;
        damagePlayer(10 * dt * planet.class, planet.x, planet.y);
      } else {
        planet.hp -= (34 + p.r) * dt;
        p.mass += (1.2 + planet.class * 0.7) * dt;
        addSiphonParticles(planet, 2, 1.3);
      }
    }
  }

  const eaten = [];
  game.planets.forEach((planet, index) => {
    if (planet.hp <= 0) {
      eaten.push(index);
      const reward = planet.class * 48 + Math.round(planet.r);
      p.mass += reward;
      p.maxMass = Math.max(p.maxMass, p.mass);
      game.score += reward;
      game.eaten[planet.class] += 1;
      addSiphonParticles(planet, 58, 1.8);
      addParticles(planet.x, planet.y, 24, 180, 3.4);
      addMessage(`Planeta clase ${planet.class} devorado. +${reward}`);
    }
  });

  for (let i = eaten.length - 1; i >= 0; i -= 1) {
    game.planets.splice(eaten[i], 1);
  }

  while (game.planets.length < 6 + Math.min(game.wave, 5)) {
    spawnPlanet();
  }
}

function firePlanetWeapon(planet) {
  const p = game.player;
  const liveTurrets = planet.turrets.filter((turret) => turret.hp > 0);
  if (!liveTurrets.length) return;
  const a = angleTo(planet, p);
  const speed = 160 + planet.class * 38;
  const spread = rand(-0.18, 0.18);
  game.bullets.push({
    x: planet.x + Math.cos(a) * (planet.r + 10),
    y: planet.y + Math.sin(a) * (planet.r + 10),
    vx: Math.cos(a + spread) * speed,
    vy: Math.sin(a + spread) * speed,
    r: 3 + planet.class,
    life: 3.2,
    enemy: true,
    damage: 5 + planet.class * 4,
  });

  if (planet.class >= 2 && planet.moons.length && Math.random() > 0.68) {
    const moon = planet.moons.pop();
    game.bullets.push({
      x: planet.x + Math.cos(moon.angle) * moon.orbit,
      y: planet.y + Math.sin(moon.angle) * moon.orbit,
      vx: Math.cos(a) * (speed * 0.85),
      vy: Math.sin(a) * (speed * 0.85),
      r: moon.r + 2,
      life: 4,
      enemy: true,
      damage: 10 + planet.class * 6,
      moon: true,
    });
    addMessage("Usaron una luna como arma.");
  }
}

function updateBullets(dt) {
  const p = game.player;
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.enemy && dist(bullet, p) < bullet.r + p.r) {
      damagePlayer(bullet.damage, bullet.x, bullet.y);
      bullet.life = 0;
    }

    if (!bullet.enemy) {
      for (const planet of game.planets) {
        if (dist(bullet, planet) < bullet.r + planet.r + 8) {
          const impact = bullet.moon ? 46 : 22;
          planet.shield -= impact;
          if (planet.shield <= 0) planet.hp -= impact * 0.62;
          planet.turrets.forEach((turret) => {
            if (Math.random() > 0.35) turret.hp -= impact * 0.8;
          });
          addParticles(bullet.x, bullet.y, 18, 150, 3);
          bullet.life = 0;
          break;
        }
      }
    }
  }
  game.bullets = game.bullets.filter((bullet) => (
    bullet.life > 0
    && bullet.x > -140
    && bullet.x < world.width + 140
    && bullet.y > -140
    && bullet.y < world.height + 140
  ));
}

function damagePlayer(amount, x, y) {
  const p = game.player;
  if (p.invuln > 0) return;
  p.mass -= amount;
  p.invuln = 0.08;
  addParticles(x, y, 5, 120, 2.4);
}

function updateMoons(dt) {
  const p = game.player;
  game.playerMoons.forEach((moon, index) => {
    moon.angle += dt * (1.5 + index * 0.08);
    moon.orbit = p.r + 18 + index * 6;
    moon.cooldown = Math.max(0, moon.cooldown - dt);
  });
}

function getLaunchAngle() {
  const p = game.player;
  if (touchMove.active && Math.hypot(touchMove.x, touchMove.y) > 0.12) {
    return Math.atan2(touchMove.y, touchMove.x);
  }
  if (pointer.active) {
    return angleTo(p, screenToWorld(pointer));
  }
  if (Math.hypot(p.vx, p.vy) > 6) {
    return Math.atan2(p.vy, p.vx);
  }
  const nearest = game.planets
    .map((planet) => ({ planet, d: dist(p, planet) }))
    .sort((a, b) => a.d - b.d)[0]?.planet;
  return nearest ? angleTo(p, nearest) : -Math.PI / 2;
}

function launchMoon() {
  if (!game.running || !game.playerMoons.length) return;
  const p = game.player;
  const moon = game.playerMoons.shift();
  const a = getLaunchAngle();
  game.bullets.push({
    x: p.x + Math.cos(moon.angle) * moon.orbit,
    y: p.y + Math.sin(moon.angle) * moon.orbit,
    vx: Math.cos(a) * 430 + p.vx * 0.35,
    vy: Math.sin(a) * 430 + p.vy * 0.35,
    r: moon.r + 2,
    life: 2.8,
    enemy: false,
    moon: true,
  });
}

function gravityPulse() {
  const p = game.player;
  if (!game.running || p.pulseCooldown > 0) return;
  p.pulseCooldown = 7.5;
  const radius = 165 + p.r * 2;
  addParticles(p.x, p.y, 42, 250, 3);
  game.bullets.forEach((bullet) => {
    if (bullet.enemy && dist(p, bullet) < radius) bullet.life = 0;
  });
  game.planets.forEach((planet) => {
    const d = dist(p, planet);
    if (d < radius) {
      const force = 1 - d / radius;
      planet.shield -= 35 * force;
      planet.turrets.forEach((turret) => {
        turret.hp -= 22 * force;
      });
      planet.moons.forEach((moon) => {
        if (Math.random() < force) moon.captured = true;
      });
    }
  });
  addMessage("Pulso gravitacional.");
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    if (particle.pull && game.player) {
      const a = angleTo(particle, game.player);
      const pull = 520 * (particle.pullStrength || 1);
      particle.vx += Math.cos(a) * pull * dt;
      particle.vy += Math.sin(a) * pull * dt;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.05, dt);
    particle.vy *= Math.pow(0.05, dt);
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
  game.messages.forEach((message) => {
    message.life -= dt;
  });
  game.messages = game.messages.filter((message) => message.life > 0);
}

function updateWave(dt) {
  game.time += dt;
  const nextWave = Math.floor(game.time / 38) + 1;
  if (nextWave > game.wave) {
    game.wave = nextWave;
    spawnPlanet(3);
    addMessage(`Oleada ${game.wave}: nace una civilizacion clase III.`);
  }
}

function update(dt) {
  updateWave(dt);
  updatePlayer(dt);
  updatePlanets(dt);
  updateBullets(dt);
  updateMoons(dt);
  updateParticles(dt);
  updateCamera();
  updateHud();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawBackground();
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawWorldFrame();
  game.planets.forEach(drawPlanet);
  drawBullets();
  drawPlayerMoons();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawMessages();
}

function drawWorldFrame() {
  ctx.save();
  ctx.strokeStyle = "rgba(244,241,232,0.16)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 18]);
  ctx.strokeRect(24, 24, world.width - 48, world.height - 48);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.7;
  for (const star of game.stars) {
    const sx = star.x - camera.x * 0.82;
    const sy = star.y - camera.y * 0.82;
    if (sx < -6 || sy < -6 || sx > width + 6 || sy > height + 6) continue;
    ctx.fillStyle = `rgba(244,241,232,${star.a})`;
    ctx.fillRect(sx, sy, star.r, star.r);
  }
  for (const dust of game.dust) {
    const sx = dust.x - camera.x * 0.55;
    const sy = dust.y - camera.y * 0.55;
    if (sx < -120 || sy < -120 || sx > width + 120 || sy > height + 120) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(dust.tilt);
    ctx.fillStyle = `rgba(244,241,232,${dust.a})`;
    ctx.fillRect(-dust.w / 2, 0, dust.w, 1);
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(244,241,232,0.045)";
  ctx.lineWidth = 1;
  const grid = 96;
  const offsetX = -((camera.x - game.time * 5) % grid);
  const offsetY = -(camera.y % grid);
  for (let x = offsetX; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = offsetY; y < height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawPlanet(planet) {
  ctx.save();
  ctx.translate(planet.x, planet.y);
  ctx.strokeStyle = "rgba(244,241,232,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, planet.r + 13 + planet.class * 4, 0, TAU);
  ctx.stroke();

  const hpRatio = clamp(planet.hp / planet.hpMax, 0, 1);
  ctx.fillStyle = `rgba(244,241,232,${0.09 + planet.class * 0.07})`;
  ctx.beginPath();
  ctx.arc(0, 0, planet.r, 0, TAU);
  ctx.fill();

  ctx.fillStyle = `rgba(244,241,232,${0.24 + planet.class * 0.08})`;
  const grainCount = 34 + planet.class * 22;
  for (let i = 0; i < grainCount; i += 1) {
    const angle = i * 2.399 + planet.age * 0.08;
    const wave = Math.sin(i * 1.7 + game.time * 1.8) * 0.18;
    const radius = planet.r * Math.sqrt(((i * 37) % 100) / 100) * (0.9 + wave);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const size = i % 7 === 0 ? 2 : 1.1;
    ctx.fillRect(x, y, size, size);
  }

  ctx.strokeStyle = "rgba(244,241,232,0.2)";
  for (let i = 0; i < planet.class + 1; i += 1) {
    ctx.beginPath();
    ctx.ellipse(0, 0, planet.r + 5 + i * 7, planet.r * (0.28 + i * 0.04), planet.age * 0.04 + i * 0.7, 0, TAU);
    ctx.stroke();
  }

  ctx.strokeStyle = "#f4f1e8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, planet.r, -Math.PI / 2, -Math.PI / 2 + TAU * hpRatio);
  ctx.stroke();

  if (planet.shield > 0) {
    ctx.strokeStyle = `rgba(244,241,232,${0.24 + planet.shield / planet.shieldMax * 0.48})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, planet.r + 8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#050505";
  ctx.font = "900 12px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`C${planet.class}`, 0, 0);

  planet.turrets.forEach((turret) => {
    if (turret.hp <= 0) return;
    const x = Math.cos(turret.angle + game.time * 0.25) * (planet.r + 4);
    const y = Math.sin(turret.angle + game.time * 0.25) * (planet.r + 4);
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(x - 3, y - 3, 6, 6);
  });

  planet.moons.forEach((moon) => {
    const x = Math.cos(moon.angle) * moon.orbit;
    const y = Math.sin(moon.angle) * moon.orbit;
    ctx.strokeStyle = "#f4f1e8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, moon.r, 0, TAU);
    ctx.stroke();
  });
  ctx.restore();
}

function drawBullets() {
  game.bullets.forEach((bullet) => {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.strokeStyle = bullet.enemy ? "#f4f1e8" : "#050505";
    ctx.fillStyle = bullet.enemy ? "#050505" : "#f4f1e8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawPlayerMoons() {
  const p = game.player;
  game.playerMoons.forEach((moon) => {
    const x = p.x + Math.cos(moon.angle) * moon.orbit;
    const y = p.y + Math.sin(moon.angle) * moon.orbit;
    ctx.strokeStyle = "#f4f1e8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, moon.r, 0, TAU);
    ctx.stroke();
  });
}

function drawPlayer() {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  const velocityAngle = Math.atan2(p.vy || 0.01, p.vx || 0.01);
  const velocity = clamp(Math.hypot(p.vx, p.vy) / 260, 0, 1);

  ctx.fillStyle = "#050505";
  ctx.strokeStyle = "rgba(244,241,232,0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 90; i += 1) {
    const a = (i / 90) * TAU;
    const magneticPull = Math.cos(a - velocityAngle) * velocity * 0.22;
    const spike = Math.sin(a * 9 + game.time * 5.2) * 0.12 + Math.sin(a * 17 - game.time * 3) * 0.06;
    const radius = p.r * (0.84 + magneticPull + spike);
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 0.92;
  for (let i = 0; i < 120; i += 1) {
    const a = i * 2.399 + game.time * (0.45 + (i % 9) * 0.035);
    const ring = (i % 5) / 5;
    const turbulence = Math.sin(i * 4.1 + game.time * 6) * 5;
    const radius = p.r * (0.35 + ring * 0.92) + turbulence;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    const size = i % 11 === 0 ? 2.8 : 1.4;
    ctx.fillStyle = i % 4 === 0 ? "rgba(244,241,232,0.35)" : "#f4f1e8";
    ctx.fillRect(x, y, size, size);
  }

  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#f4f1e8";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      p.r + 14 + i * 8 + Math.sin(game.time * 5 + i) * 2,
      p.r * (0.45 + i * 0.08),
      velocityAngle + i * 0.68 + game.time * 0.25,
      0,
      TAU,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f4f1e8";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(3.5, p.r * 0.14), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  game.particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(particle.x, particle.y, particle.r, particle.r);
    ctx.globalAlpha = 1;
  });
}

function drawMessages() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "900 18px ui-sans-serif, system-ui";
  const startY = width < 760 ? 122 : 86;
  game.messages.forEach((message, index) => {
    ctx.globalAlpha = clamp(message.life, 0, 1);
    ctx.fillStyle = "#f4f1e8";
    ctx.fillText(message.text.toUpperCase(), width / 2, startY + index * 24);
  });
  ctx.restore();
}

function updateHud() {
  const p = game.player;
  ui.mass.textContent = Math.max(0, Math.round(p.mass));
  ui.hunger.style.transform = `scaleX(${clamp(p.mass / Math.max(100, p.maxMass), 0, 1)})`;
  ui.c1.textContent = game.eaten[1];
  ui.c2.textContent = game.eaten[2];
  ui.c3.textContent = game.eaten[3];
  ui.moons.textContent = game.playerMoons.length;
  ui.pulse.textContent = p.pulseCooldown <= 0 ? "listo" : `${p.pulseCooldown.toFixed(1)}s`;
  ui.wave.textContent = `Oleada ${game.wave} · ${Math.round(game.time)}s`;
  const threat = game.planets.reduce((sum, planet) => sum + planet.class + planet.turrets.filter((t) => t.hp > 0).length, 0);
  ui.threat.textContent = threat > 34 ? "Amenaza extrema" : threat > 22 ? "Amenaza alta" : threat > 12 ? "Amenaza media" : "Amenaza baja";
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  if (game.running) update(dt);
  draw();
  rafId = requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === "e") gravityPulse();
  if (event.code === "Space") {
    event.preventDefault();
    launchMoon();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

canvas.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
});
canvas.addEventListener("pointerdown", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.down = true;
  pointer.active = true;
  if (event.button === 0) launchMoon();
});
canvas.addEventListener("pointerup", () => {
  pointer.down = false;
});

function setJoystickFromEvent(event) {
  const rect = ui.joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const max = rect.width * 0.36;
  const distance = Math.min(max, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const knobX = Math.cos(angle) * distance;
  const knobY = Math.sin(angle) * distance;
  touchMove.x = knobX / max;
  touchMove.y = knobY / max;
  ui.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function resetJoystick() {
  touchMove.x = 0;
  touchMove.y = 0;
  touchMove.active = false;
  touchMove.id = null;
  ui.joystickKnob.style.transform = "translate(-50%, -50%)";
}

ui.joystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  ui.joystick.setPointerCapture(event.pointerId);
  touchMove.active = true;
  touchMove.id = event.pointerId;
  setJoystickFromEvent(event);
});

ui.joystick.addEventListener("pointermove", (event) => {
  if (touchMove.id !== event.pointerId) return;
  event.preventDefault();
  setJoystickFromEvent(event);
});

ui.joystick.addEventListener("pointerup", (event) => {
  if (touchMove.id !== event.pointerId) return;
  event.preventDefault();
  resetJoystick();
});

ui.joystick.addEventListener("pointercancel", resetJoystick);

ui.moonTouchButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  launchMoon();
});

ui.pulseTouchButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  gravityPulse();
});

ui.startButton.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", startGame);

resize();
game.player = makePlayer();
seedArena();
updateCamera();
draw();
