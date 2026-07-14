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
};

const keys = new Set();
const pointer = { x: 0, y: 0, down: false, active: false };
let width = 0;
let height = 0;
let dpr = 1;
let lastTime = 0;
let rafId = 0;

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

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!game.stars.length) {
    game.stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() > 0.88 ? 1.4 : 0.7,
      a: rand(0.15, 0.72),
    }));
  }
}

function makePlayer() {
  return {
    x: width / 2,
    y: height / 2,
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

function spawnPlanet(forceClass = null) {
  const margin = 90;
  let x = rand(margin, width - margin);
  let y = rand(margin, height - margin);
  const player = game.player ?? { x: width / 2, y: height / 2 };

  for (let i = 0; i < 24 && Math.hypot(x - player.x, y - player.y) < 210; i += 1) {
    x = rand(margin, width - margin);
    y = rand(margin, height - margin);
  }

  const roll = Math.random();
  const civClass = forceClass ?? (roll > 0.82 ? 3 : roll > 0.46 ? 2 : 1);
  game.planets.push(createPlanet(civClass, x, y));
}

function seedArena() {
  game.planets = [];
  const count = width < 760 ? 7 : 10;
  for (let i = 0; i < count; i += 1) {
    spawnPlanet(i < 3 ? 1 : null);
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

function updatePlayer(dt) {
  const p = game.player;
  let ax = 0;
  let ay = 0;
  if (keys.has("w") || keys.has("arrowup")) ay -= 1;
  if (keys.has("s") || keys.has("arrowdown")) ay += 1;
  if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
  if (keys.has("d") || keys.has("arrowright")) ax += 1;

  if (pointer.down && pointer.active) {
    const a = angleTo(p, pointer);
    const distance = dist(p, pointer);
    ax += Math.cos(a) * clamp(distance / 160, 0, 1);
    ay += Math.sin(a) * clamp(distance / 160, 0, 1);
  }

  const len = Math.hypot(ax, ay) || 1;
  const speed = 185 / Math.sqrt(Math.max(1, p.mass / 90));
  p.vx += (ax / len) * speed * dt * 5.2;
  p.vy += (ay / len) * speed * dt * 5.2;
  p.vx *= Math.pow(0.08, dt);
  p.vy *= Math.pow(0.08, dt);
  p.x = clamp(p.x + p.vx * dt, p.r, width - p.r);
  p.y = clamp(p.y + p.vy * dt, p.r, height - p.r);
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
    if (planet.x < planet.r || planet.x > width - planet.r) planet.vx *= -1;
    if (planet.y < planet.r || planet.y > height - planet.r) planet.vy *= -1;
    planet.x = clamp(planet.x, planet.r, width - planet.r);
    planet.y = clamp(planet.y, planet.r, height - planet.r);

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
        addParticles(planet.x, planet.y, 1, 40, 2);
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
      addParticles(planet.x, planet.y, 32, 180, 3.5);
      addMessage(`Planeta clase ${planet.class} devorado. +${reward}`);
    }
  });

  for (let i = eaten.length - 1; i >= 0; i -= 1) {
    game.planets.splice(eaten[i], 1);
  }

  while (game.planets.length < 7 + game.wave) {
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
  game.bullets = game.bullets.filter((bullet) => bullet.life > 0 && bullet.x > -80 && bullet.x < width + 80 && bullet.y > -80 && bullet.y < height + 80);
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

function launchMoon() {
  if (!game.running || !game.playerMoons.length) return;
  const p = game.player;
  const moon = game.playerMoons.shift();
  const a = pointer.active ? angleTo(p, pointer) : Math.atan2(p.vy, p.vx) || -Math.PI / 2;
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
  updateHud();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawBackground();
  game.planets.forEach(drawPlanet);
  drawBullets();
  drawPlayerMoons();
  drawPlayer();
  drawParticles();
  drawMessages();
}

function drawBackground() {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.7;
  for (const star of game.stars) {
    ctx.fillStyle = `rgba(244,241,232,${star.a})`;
    ctx.fillRect(star.x, star.y, star.r, star.r);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(244,241,232,0.06)";
  ctx.lineWidth = 1;
  for (let x = (game.time * 8) % 64; x < width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function drawPlanet(planet) {
  ctx.save();
  ctx.translate(planet.x, planet.y);
  ctx.strokeStyle = "rgba(244,241,232,0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, planet.r + 13 + planet.class * 4, 0, TAU);
  ctx.stroke();

  const hpRatio = clamp(planet.hp / planet.hpMax, 0, 1);
  ctx.fillStyle = `rgba(244,241,232,${0.18 + planet.class * 0.1})`;
  ctx.beginPath();
  ctx.arc(0, 0, planet.r, 0, TAU);
  ctx.fill();

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
  ctx.fillStyle = "#050505";
  ctx.strokeStyle = "#f4f1e8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(0, 0, p.r + 10 + Math.sin(game.time * 7) * 2, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f4f1e8";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(4, p.r * 0.18), 0, TAU);
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
  game.messages.forEach((message, index) => {
    ctx.globalAlpha = clamp(message.life, 0, 1);
    ctx.fillStyle = "#f4f1e8";
    ctx.fillText(message.text.toUpperCase(), width / 2, 86 + index * 24);
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

ui.startButton.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", startGame);

resize();
game.player = makePlayer();
seedArena();
draw();
