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
import { WeatherParticle, createWeatherParticles, updateWeatherParticles, renderWeatherParticles } from './weather-particles.js';

function getCanvasSize() {
  if (typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return { width: 800, height: 600 };
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

  getSpeedModifier(depth = 0) {
    if (this.currentWeather === WEATHER_TYPES.SANDSTORM) {
      const config = WEATHER_CONFIG.sandstorm;
      if (depth > config.maxWeatherDepth) return 1;
      const depthFactor = this.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate);
      return 1 - config.speedReduction * depthFactor;
    }
    return 1;
  }

  getVisionModifier(depth = 0) {
    let reduction = 0;
    const config = WEATHER_CONFIG[this.currentWeather];
    if (!config) return 1;
    
    if (depth > config.maxWeatherDepth) return 1;
    
    const depthFactor = this.getVisualDepthFactor(depth, config);
    if (this.currentWeather === WEATHER_TYPES.SANDSTORM) {
      reduction = config.visionReduction * depthFactor;
    } else if (this.currentWeather === WEATHER_TYPES.ACID_RAIN) {
      reduction = config.visionReduction * depthFactor;
    }
    return 1 - reduction;
  }

  getDepthEffectFactor(depth, peakDepth, decayRate) {
    if (depth <= 0) return 0.3;
    if (depth <= peakDepth) {
      const t = depth / peakDepth;
      return 0.3 + 0.7 * t;
    } else {
      const depthBelow = depth - peakDepth;
      return Math.exp(-depthBelow * decayRate);
    }
  }

  getVisualDepthFactor(depth, config) {
    const peakDepth = config.surfacePeakDepth;
    const decayRate = config.visualDecayRate;
    const maxDepth = config.maxWeatherDepth;

    if (depth <= 0) return 0.4;
    if (depth >= maxDepth) return 0;

    if (depth <= peakDepth) {
      const t = depth / peakDepth;
      return 0.4 + 0.6 * t;
    } else {
      const depthBelow = depth - peakDepth;
      const decayFactor = Math.exp(-depthBelow * decayRate);
      const depthFactor = 1 - (depth - peakDepth) / (maxDepth - peakDepth);
      return decayFactor * Math.max(0, depthFactor);
    }
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
      if (depth > config.maxWeatherDepth) continue;
      
      const chance = this.calculateWeatherChance(depth, config);
      if (Math.random() < chance) {
        this.startWarning(weatherType);
        return;
      }
    }
  }

  calculateWeatherChance(depth, config) {
    const peakDepth = config.surfacePeakDepth;
    const decayRate = config.chanceDecayRate;
    const baseChance = config.baseChance;
    const maxDepth = config.maxWeatherDepth;

    if (depth <= 0) return baseChance * 0.3;
    if (depth >= maxDepth) return 0;

    if (depth <= peakDepth) {
      const t = depth / peakDepth;
      return baseChance * (0.3 + 0.7 * t);
    } else {
      const depthBelow = depth - peakDepth;
      const decayFactor = Math.exp(-depthBelow * decayRate);
      const depthFactor = 1 - (depth - peakDepth) / (maxDepth - peakDepth);
      return baseChance * decayFactor * Math.max(0, depthFactor);
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
    const config = WEATHER_CONFIG[weatherType];
    const { width: canvasWidth, height: canvasHeight } = getCanvasSize();
    this.particles = createWeatherParticles(weatherType, config.particleCount, canvasWidth, canvasHeight);
    this.particleCount = config.particleCount;
  }

  updateParticles(dt) {
    const { width: canvasWidth, height: canvasHeight } = getCanvasSize();
    updateWeatherParticles(this.particles, dt, canvasWidth, canvasHeight);
  }

  renderParticles(ctx, depth = 0) {
    const transitionAlpha = this.getTransitionAlpha();
    if (transitionAlpha <= 0) return;

    const config = WEATHER_CONFIG[this.currentWeather];
    if (!config) return;
    
    const depthFactor = this.getVisualDepthFactor(depth, config);
    const alpha = transitionAlpha * depthFactor;
    if (alpha <= 0.01) return;
    
    renderWeatherParticles(this.particles, ctx, alpha);
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

  renderOverlay(ctx, player, canvasWidth, canvasHeight, camera = null, depth = 0) {
    const transitionAlpha = this.getTransitionAlpha();

    const config = WEATHER_CONFIG[this.currentWeather];
    const isOverMaxDepth = config && depth > config.maxWeatherDepth;
    
    if (isOverMaxDepth || transitionAlpha <= 0) {
      if (this.warningTimer > 0 && depth < 80) {
        this.renderWarningOverlay(ctx, canvasWidth, canvasHeight, depth);
      }
      return;
    }

    const depthFactor = config ? this.getVisualDepthFactor(depth, config) : 1;
    const effectiveAlpha = transitionAlpha * depthFactor;

    if (effectiveAlpha <= 0.01) {
      if (this.warningTimer > 0 && depth < 80) {
        this.renderWarningOverlay(ctx, canvasWidth, canvasHeight, depth);
      }
      return;
    }

    if (this.currentWeather === WEATHER_TYPES.SANDSTORM) {
      const config = WEATHER_CONFIG.sandstorm;
      const baseAlpha = (0.15 + config.visionReduction * 0.25) * effectiveAlpha;
      ctx.fillStyle = `rgba(210, 180, 140, ${baseAlpha})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      let playerScreenX = canvasWidth / 2;
      let playerScreenY = canvasHeight / 2;
      if (player && camera) {
        playerScreenX = player.x - camera.x;
        playerScreenY = player.y - camera.y;
      }

      const visionReduction = config.visionReduction * depthFactor;
      const visionMod = 1 - visionReduction;
      const lightRadius = 220 * visionMod;

      const gradient = ctx.createRadialGradient(
        playerScreenX, playerScreenY, 0,
        playerScreenX, playerScreenY, lightRadius
      );
      const innerAlpha = 0 * effectiveAlpha;
      const midAlpha = 0.25 * effectiveAlpha;
      const outerAlpha = 0.65 * effectiveAlpha;
      gradient.addColorStop(0, `rgba(210, 180, 140, ${innerAlpha})`);
      gradient.addColorStop(0.5, `rgba(210, 180, 140, ${midAlpha})`);
      gradient.addColorStop(1, `rgba(210, 180, 140, ${outerAlpha})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (this.currentWeather === WEATHER_TYPES.ACID_RAIN) {
      const overlayAlpha = 0.08 * effectiveAlpha;
      ctx.fillStyle = `rgba(127, 255, 0, ${overlayAlpha})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (this.warningTimer > 0 && depth < 80) {
      this.renderWarningOverlay(ctx, canvasWidth, canvasHeight, depth);
    }
  }

  renderWarningOverlay(ctx, canvasWidth, canvasHeight, depth) {
    const warningConfig = WEATHER_CONFIG[this.warningWeather];
    if (!warningConfig) return;
    
    const totalWarningTime = warningConfig.warningTime;
    const warningProgress = 1 - this.warningTimer / totalWarningTime;
    const pulse = 0.3 + Math.sin(Date.now() * 0.008) * 0.25;
    const depthFade = Math.max(0, 1 - depth / 100);
    const intensity = (0.08 + warningProgress * 0.15) * pulse * depthFade;

    const color = this.warningWeather === WEATHER_TYPES.SANDSTORM
      ? '210, 180, 140'
      : '127, 255, 0';
    ctx.fillStyle = `rgba(${color}, ${intensity})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  spawnSpecialOres(world, player, particleSystem = null) {
    if (!this.isActive()) return;

    const specialOre = WEATHER_SPECIAL_ORES[this.currentWeather];
    if (!specialOre) return;

    const config = WEATHER_CONFIG[this.currentWeather];
    const maxDepth = config.specialOreMaxDepth;
    const minSurfaceDist = config.specialOreMinSurfaceDist;
    const exposureCheckDist = config.specialOreExposureCheckDist;
    const minY = SURFACE_Y + minSurfaceDist;
    const maxY = SURFACE_Y + maxDepth;

    const oresToSpawn = 2 + Math.floor(Math.random() * 3);
    const oreType = specialOre === 'sand_crystal' ? TILE_TYPES.ORE_SAND_CRYSTAL : TILE_TYPES.ORE_ACID_GEM;
    const searchRadius = 50;

    let spawned = 0;
    let attempts = 0;
    const maxAttempts = oresToSpawn * 30;

    while (spawned < oresToSpawn && attempts < maxAttempts) {
      attempts++;

      const tileX = Math.floor(player.tileX + (Math.random() - 0.5) * searchRadius * 2);
      const tileY = Math.floor(minY + Math.random() * (maxY - minY));

      const key = `${tileX},${tileY}`;
      if (this.specialOresSpawned.has(key)) continue;

      if (!world.inBounds(tileX, tileY)) continue;
      if (tileY < minY || tileY > maxY) continue;

      const tile = world.getTile(tileX, tileY);
      if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE || 
          tile === TILE_TYPES.LAVA || tile === TILE_TYPES.BEDROCK) continue;
      if (this.isOreTile(tile)) continue;

      if (!this.checkOreExposure(world, tileX, tileY, exposureCheckDist)) continue;

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

  checkOreExposure(world, x, y, maxDist) {
    if (y < SURFACE_Y) return true;

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    const airNeighbors = [];
    for (const dir of directions) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (!world.inBounds(nx, ny)) continue;
      const tile = world.getTile(nx, ny);
      if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE || tile === TILE_TYPES.LAVA) {
        airNeighbors.push({ x: nx, y: ny });
      }
    }

    if (airNeighbors.length === 0) {
      return false;
    }

    for (const airPos of airNeighbors) {
      if (this.isConnectedToSurface(world, airPos.x, airPos.y, maxDist - 1)) {
        return true;
      }
    }

    return false;
  }

  isConnectedToSurface(world, startX, startY, maxCheckDist) {
    if (startY < SURFACE_Y) return true;
    if (maxCheckDist <= 0) return false;

    const visited = new Set();
    const queue = [];
    const startKey = `${startX},${startY}`;
    visited.add(startKey);
    queue.push({ x: startX, y: startY, dist: 0 });

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      const { x: cx, y: cy, dist } = current;

      if (cy < SURFACE_Y) {
        return true;
      }

      if (dist >= maxCheckDist) continue;

      for (const dir of directions) {
        const nx = cx + dir.dx;
        const ny = cy + dir.dy;
        const nKey = `${nx},${ny}`;

        if (visited.has(nKey)) continue;
        if (!world.inBounds(nx, ny)) continue;

        if (ny < SURFACE_Y) {
          return true;
        }

        const tile = world.getTile(nx, ny);
        const isPassable = tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE || tile === TILE_TYPES.LAVA;

        if (isPassable) {
          visited.add(nKey);
          queue.push({ x: nx, y: ny, dist: dist + 1 });
        }
      }
    }

    return false;
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
