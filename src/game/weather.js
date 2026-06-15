import {
  WEATHER_TYPES,
  WEATHER_CONFIG,
  WEATHER_NAMES,
  WEATHER_ICONS,
  WEATHER_SPECIAL_ORES,
  TILE_SIZE,
  SURFACE_Y,
  WORLD_WIDTH,
  TILE_TYPES
} from './constants.js';

class WeatherParticle {
  constructor(type, canvasWidth, canvasHeight) {
    this.type = type;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.reset(true);
  }

  reset(initial = false) {
    const config = WEATHER_CONFIG[this.type];
    if (this.type === WEATHER_TYPES.SANDSTORM) {
      this.x = initial ? Math.random() * this.canvasWidth : -50 - Math.random() * 100;
      this.y = Math.random() * this.canvasHeight;
      this.vx = 4 + Math.random() * 6;
      this.vy = (Math.random() - 0.2) * 3;
      this.size = 1 + Math.random() * 5;
      this.alpha = 0.2 + Math.random() * 0.6;
      this.rotation = Math.random() * Math.PI;
      this.rotSpeed = (Math.random() - 0.5) * 0.1;
      this.shape = Math.random() < 0.3 ? 'circle' : 'rect';
    } else if (this.type === WEATHER_TYPES.ACID_RAIN) {
      this.x = Math.random() * this.canvasWidth;
      this.y = initial ? Math.random() * this.canvasHeight : -20 - Math.random() * 50;
      this.vx = -2 + Math.random() * 4;
      this.vy = 8 + Math.random() * 6;
      this.size = 1.5 + Math.random() * 2;
      this.length = 12 + Math.random() * 18;
      this.alpha = 0.5 + Math.random() * 0.4;
      this.glowIntensity = 0.3 + Math.random() * 0.4;
    }
  }

  update(dt, canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;

    if (this.type === WEATHER_TYPES.SANDSTORM) {
      this.rotation += this.rotSpeed * dt * 60;
      if (this.x > this.canvasWidth + 50 || this.y < -50 || this.y > this.canvasHeight + 50) {
        this.reset(false);
      }
    } else if (this.type === WEATHER_TYPES.ACID_RAIN) {
      if (this.y > this.canvasHeight + 20) {
        this.reset(false);
      }
    }
  }

  render(ctx, alphaScale = 1) {
    const config = WEATHER_CONFIG[this.type];
    ctx.save();
    ctx.globalAlpha = this.alpha * alphaScale;

    if (this.type === WEATHER_TYPES.SANDSTORM) {
      ctx.fillStyle = config.particleColor;
      if (this.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
        ctx.restore();
      }
    } else if (this.type === WEATHER_TYPES.ACID_RAIN) {
      ctx.shadowColor = config.particleColor;
      ctx.shadowBlur = 5 * this.glowIntensity;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.vx * 0.3, this.y + this.length);
      ctx.strokeStyle = config.particleColor;
      ctx.lineWidth = this.size;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}

export class WeatherSystem {
  constructor() {
    this.currentWeather = WEATHER_TYPES.CLEAR;
    this.weatherTimer = 0;
    this.weatherDuration = 0;
    this.warningTimer = 0;
    this.warningWeather = null;
    this.particles = [];
    this.particleCount = 0;
    this.active = false;
    this.cooldown = 0;
    this.specialOresSpawned = new Set();
    this.specialOreSpawnTimer = 0;
    this.weatherStartCallback = null;
    this.weatherEndCallback = null;
    this.warningCallback = null;
  }

  setCallbacks({ onWeatherStart, onWeatherEnd, onWarning }) {
    this.weatherStartCallback = onWeatherStart;
    this.weatherEndCallback = onWeatherEnd;
    this.warningCallback = onWarning;
  }

  getCurrentWeather() {
    return this.currentWeather;
  }

  getWeatherName() {
    return WEATHER_NAMES[this.currentWeather];
  }

  getWeatherIcon() {
    return WEATHER_ICONS[this.currentWeather];
  }

  getRemainingTime() {
    if (this.currentWeather === WEATHER_TYPES.CLEAR) {
      return 0;
    }
    return Math.max(0, this.weatherDuration - this.weatherTimer);
  }

  isWarning() {
    return this.warningTimer > 0;
  }

  getWarningWeather() {
    return this.warningWeather;
  }

  getWarningTime() {
    return this.warningTimer;
  }

  isActive() {
    return this.currentWeather !== WEATHER_TYPES.CLEAR;
  }

  getSpeedModifier() {
    if (this.currentWeather === WEATHER_TYPES.SANDSTORM) {
      const config = WEATHER_CONFIG.sandstorm;
      return 1 - config.speedReduction;
    }
    return 1;
  }

  getVisionModifier() {
    if (this.currentWeather === WEATHER_TYPES.SANDSTORM) {
      const config = WEATHER_CONFIG.sandstorm;
      return 1 - config.visionReduction;
    }
    if (this.currentWeather === WEATHER_TYPES.ACID_RAIN) {
      const config = WEATHER_CONFIG.acid_rain;
      return 1 - config.visionReduction;
    }
    return 1;
  }

  update(dt, depth, player, world, particles) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    }

    if (this.warningTimer > 0) {
      this.warningTimer -= dt;
      if (this.warningTimer <= 0) {
        this.startWeather(this.warningWeather);
        this.warningWeather = null;
      }
    }

    if (this.currentWeather !== WEATHER_TYPES.CLEAR) {
      this.weatherTimer += dt;
      if (this.weatherTimer >= this.weatherDuration) {
        this.endWeather();
      }
    }

    if (this.currentWeather === WEATHER_TYPES.CLEAR && this.warningTimer <= 0 && this.cooldown <= 0) {
      this.tryTriggerWeather(depth);
    }

    if (this.currentWeather === WEATHER_TYPES.ACID_RAIN && player) {
      const isExposed = this.isPlayerExposed(player, world);
      if (isExposed) {
        const config = WEATHER_CONFIG.acid_rain;
        player.takeDamage(config.damagePerSecond * dt);
        if (Math.random() < 0.1) {
          particles.spawnTrail(player.x, player.y, '#7FFF00');
        }
      }
    }

    if (this.isActive() && world && player) {
      this.specialOreSpawnTimer += dt;
      if (this.specialOreSpawnTimer >= 8) {
        this.specialOreSpawnTimer = 0;
        this.spawnSpecialOres(world, player, particles);
      }
    }

    this.updateParticles(dt);
  }

  isPlayerExposed(player, world) {
    if (player.tileY < SURFACE_Y) {
      return true;
    }
    for (let dy = -1; dy >= -5; dy--) {
      const checkY = player.tileY + dy;
      if (checkY < 0) return true;
      if (world.isSolid(player.tileX, checkY)) {
        return false;
      }
    }
    return false;
  }

  tryTriggerWeather(depth) {
    const weatherTypes = [WEATHER_TYPES.SANDSTORM, WEATHER_TYPES.ACID_RAIN];

    for (const weatherType of weatherTypes) {
      const config = WEATHER_CONFIG[weatherType];
      const chance = config.baseChance + depth * config.chanceIncreasePerDepth;

      if (Math.random() < chance) {
        this.startWarning(weatherType);
        return;
      }
    }
  }

  startWarning(weatherType) {
    const config = WEATHER_CONFIG[weatherType];
    this.warningTimer = config.warningTime;
    this.warningWeather = weatherType;
    
    if (this.warningCallback) {
      this.warningCallback(weatherType, config.warningTime);
    }
  }

  startWeather(weatherType) {
    this.currentWeather = weatherType;
    this.weatherTimer = 0;
    const config = WEATHER_CONFIG[weatherType];
    this.weatherDuration = config.minDuration + Math.random() * (config.maxDuration - config.minDuration);
    this.active = true;
    this.specialOreSpawnTimer = 5;
    this.initParticles(weatherType);

    if (this.weatherStartCallback) {
      this.weatherStartCallback(weatherType);
    }
  }

  endWeather() {
    const endedWeather = this.currentWeather;
    this.currentWeather = WEATHER_TYPES.CLEAR;
    this.weatherTimer = 0;
    this.weatherDuration = 0;
    this.active = false;
    this.particles = [];
    this.cooldown = 10 + Math.random() * 10;
    this.specialOreSpawnTimer = 0;

    if (this.weatherEndCallback) {
      this.weatherEndCallback(endedWeather);
    }
  }

  initParticles(weatherType) {
    this.particles = [];
    const config = WEATHER_CONFIG[weatherType];
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;

    for (let i = 0; i < config.particleCount; i++) {
      this.particles.push(new WeatherParticle(weatherType, canvasWidth, canvasHeight));
    }
    this.particleCount = config.particleCount;
  }

  updateParticles(dt) {
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    for (const p of this.particles) {
      p.update(dt, canvasWidth, canvasHeight);
    }
  }

  renderParticles(ctx) {
    const alpha = this.getTransitionAlpha();
    if (alpha <= 0) return;
    
    for (const p of this.particles) {
      p.render(ctx, alpha);
    }
  }

  getTransitionAlpha() {
    const config = WEATHER_CONFIG[this.currentWeather];
    if (!config) return 1;
    const fadeTime = 2;
    if (this.weatherTimer < fadeTime) {
      return this.weatherTimer / fadeTime;
    }
    const remaining = this.weatherDuration - this.weatherTimer;
    if (remaining < fadeTime) {
      return remaining / fadeTime;
    }
    return 1;
  }

  renderOverlay(ctx, player, canvasWidth, canvasHeight, camera = null) {
    const transitionAlpha = this.getTransitionAlpha();

    if (this.currentWeather === WEATHER_TYPES.SANDSTORM && transitionAlpha > 0) {
      const config = WEATHER_CONFIG.sandstorm;
      const baseAlpha = (0.15 + config.visionReduction * 0.25) * transitionAlpha;
      ctx.fillStyle = `rgba(210, 180, 140, ${baseAlpha})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      let playerScreenX = canvasWidth / 2;
      let playerScreenY = canvasHeight / 2;
      if (player && camera) {
        playerScreenX = player.x - camera.x;
        playerScreenY = player.y - camera.y;
      }

      const visionMod = 1 - config.visionReduction;
      const lightRadius = 220 * visionMod;

      const gradient = ctx.createRadialGradient(
        playerScreenX, playerScreenY, 0,
        playerScreenX, playerScreenY, lightRadius
      );
      const innerAlpha = 0 * transitionAlpha;
      const midAlpha = 0.25 * transitionAlpha;
      const outerAlpha = 0.65 * transitionAlpha;
      gradient.addColorStop(0, `rgba(210, 180, 140, ${innerAlpha})`);
      gradient.addColorStop(0.5, `rgba(210, 180, 140, ${midAlpha})`);
      gradient.addColorStop(1, `rgba(210, 180, 140, ${outerAlpha})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (this.currentWeather === WEATHER_TYPES.ACID_RAIN && transitionAlpha > 0) {
      const overlayAlpha = 0.08 * transitionAlpha;
      ctx.fillStyle = `rgba(127, 255, 0, ${overlayAlpha})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (this.warningTimer > 0) {
      const warningConfig = WEATHER_CONFIG[this.warningWeather];
      const totalWarningTime = warningConfig ? warningConfig.warningTime : 5;
      const warningProgress = 1 - this.warningTimer / totalWarningTime;
      const pulse = 0.3 + Math.sin(Date.now() * 0.008) * 0.25;
      const intensity = (0.1 + warningProgress * 0.2) * pulse;

      const color = this.warningWeather === WEATHER_TYPES.SANDSTORM
        ? '210, 180, 140'
        : '127, 255, 0';
      ctx.fillStyle = `rgba(${color}, ${intensity})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
  }

  spawnSpecialOres(world, player, particleSystem = null) {
    if (!this.isActive()) return;

    const specialOre = WEATHER_SPECIAL_ORES[this.currentWeather];
    if (!specialOre) return;

    const spawnRadius = 25;
    const oresToSpawn = 2 + Math.floor(Math.random() * 3);
    const oreType = specialOre === 'sand_crystal' ? TILE_TYPES.ORE_SAND_CRYSTAL : TILE_TYPES.ORE_ACID_GEM;

    let spawned = 0;
    let attempts = 0;
    const maxAttempts = oresToSpawn * 5;

    while (spawned < oresToSpawn && attempts < maxAttempts) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * spawnRadius;
      const tileX = Math.floor(player.tileX + Math.cos(angle) * dist);
      const tileY = Math.floor(player.tileY + Math.sin(angle) * dist);

      const key = `${tileX},${tileY}`;
      if (this.specialOresSpawned.has(key)) continue;

      if (!world.inBounds(tileX, tileY)) continue;
      if (tileY < SURFACE_Y + 3) continue;

      const tile = world.getTile(tileX, tileY);
      if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE || 
          tile === TILE_TYPES.LAVA || tile === TILE_TYPES.BEDROCK) continue;
      if (this.isOreTile(tile)) continue;

      world.setTile(tileX, tileY, oreType);
      this.specialOresSpawned.add(key);
      spawned++;

      if (particleSystem) {
        const oreColor = specialOre === 'sand_crystal' ? '#F4A460' : '#32CD32';
        particleSystem.spawnCircle(
          tileX * TILE_SIZE + TILE_SIZE / 2,
          tileY * TILE_SIZE + TILE_SIZE / 2,
          oreColor,
          8,
          2
        );
      }
    }

    return spawned;
  }

  isOreTile(tile) {
    return tile === TILE_TYPES.ORE_COAL ||
           tile === TILE_TYPES.ORE_IRON ||
           tile === TILE_TYPES.ORE_GOLD ||
           tile === TILE_TYPES.ORE_EMERALD ||
           tile === TILE_TYPES.ORE_RUBY ||
           tile === TILE_TYPES.ORE_DIAMOND ||
           tile === TILE_TYPES.ORE_SAND_CRYSTAL ||
           tile === TILE_TYPES.ORE_ACID_GEM;
  }

  clear() {
    this.currentWeather = WEATHER_TYPES.CLEAR;
    this.weatherTimer = 0;
    this.weatherDuration = 0;
    this.warningTimer = 0;
    this.warningWeather = null;
    this.particles = [];
    this.particleCount = 0;
    this.active = false;
    this.cooldown = 0;
    this.specialOresSpawned.clear();
    this.specialOreSpawnTimer = 0;
  }
}
