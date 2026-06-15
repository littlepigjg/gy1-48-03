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
      const depthFactor = this.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate);
      return 1 - config.speedReduction * depthFactor;
    }
    return 1;
  }

  getVisionModifier(depth = 0) {
    let reduction = 0;
    if (this.currentWeather === WEATHER_TYPES.SANDSTORM) {
      const config = WEATHER_CONFIG.sandstorm;
      const depthFactor = this.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate);
      reduction = config.visionReduction * depthFactor;
    } else if (this.currentWeather === WEATHER_TYPES.ACID_RAIN) {
      const config = WEATHER_CONFIG.acid_rain;
      const depthFactor = this.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate);
      reduction = config.visionReduction * depthFactor;
    }
    return 1 - reduction;
  }

  getDepthEffectFactor(depth, peakDepth, decayRate) {
    if (depth <= peakDepth) {
      const t = depth / peakDepth;
      return 0.3 + 0.7 * t;
    } else {
      const depthBelow = depth - peakDepth;
      return Math.exp(-depthBelow * decayRate);
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

    if (depth <= peakDepth) {
      const t = depth / peakDepth;
      return baseChance * (0.5 + 0.5 * t);
    } else {
      const depthBelow = depth - peakDepth;
      return baseChance * Math.exp(-depthBelow * decayRate);
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
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    this.particles = createWeatherParticles(weatherType, config.particleCount, canvasWidth, canvasHeight);
    this.particleCount = config.particleCount;
  }

  updateParticles(dt) {
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    updateWeatherParticles(this.particles, dt, canvasWidth, canvasHeight);
  }

  renderParticles(ctx, depth = 0) {
    const transitionAlpha = this.getTransitionAlpha();
    if (transitionAlpha <= 0) return;

    const config = WEATHER_CONFIG[this.currentWeather];
    if (!config) return;
    
    const depthFactor = this.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate);
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
    const depthFactor = config ? this.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate) : 1;
    const effectiveAlpha = transitionAlpha * depthFactor;

    if (this.currentWeather === WEATHER_TYPES.SANDSTORM && effectiveAlpha > 0) {
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

    if (this.currentWeather === WEATHER_TYPES.ACID_RAIN && effectiveAlpha > 0) {
      const overlayAlpha = 0.08 * effectiveAlpha;
      ctx.fillStyle = `rgba(127, 255, 0, ${overlayAlpha})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (this.warningTimer > 0 && depth < 60) {
      const warningConfig = WEATHER_CONFIG[this.warningWeather];
      const totalWarningTime = warningConfig ? warningConfig.warningTime : 5;
      const warningProgress = 1 - this.warningTimer / totalWarningTime;
      const pulse = 0.3 + Math.sin(Date.now() * 0.008) * 0.25;
      const intensity = (0.1 + warningProgress * 0.2) * pulse * Math.max(0, 1 - depth / 80);

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

    const config = WEATHER_CONFIG[this.currentWeather];
    const maxDepth = config.specialOreMaxDepth;
    const minSurfaceDist = config.specialOreMinSurfaceDist;
    const minY = SURFACE_Y + minSurfaceDist;
    const maxY = SURFACE_Y + maxDepth;

    const oresToSpawn = 2 + Math.floor(Math.random() * 3);
    const oreType = specialOre === 'sand_crystal' ? TILE_TYPES.ORE_SAND_CRYSTAL : TILE_TYPES.ORE_ACID_GEM;
    const searchRadius = 40;

    let spawned = 0;
    let attempts = 0;
    const maxAttempts = oresToSpawn * 20;

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

      if (!this.isNearExposedSurface(world, tileX, tileY, 8)) continue;

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

  isNearExposedSurface(world, x, y, maxDist) {
    for (let dy = -maxDist; dy <= 0; dy++) {
      const checkY = y + dy;
      if (checkY < SURFACE_Y) return true;
      
      const tile = world.getTile(x, checkY);
      if (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.CAVE) {
        return true;
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
