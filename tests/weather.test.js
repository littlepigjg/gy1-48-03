import { describe, it, expect, beforeEach } from 'vitest';
import { WeatherSystem } from '../src/game/weather.js';
import { WEATHER_TYPES, WEATHER_CONFIG, TILE_TYPES, SURFACE_Y, WORLD_WIDTH, WORLD_HEIGHT } from '../src/game/constants.js';
import { World } from '../src/game/world.js';

describe('WeatherSystem', () => {
  let weather;

  beforeEach(() => {
    weather = new WeatherSystem();
  });

  describe('初始状态', () => {
    it('初始应该是晴朗天气', () => {
      expect(weather.getCurrentWeather()).toBe(WEATHER_TYPES.CLEAR);
    });

    it('初始不应该是激活状态', () => {
      expect(weather.isActive()).toBe(false);
    });

    it('初始不应该有预警', () => {
      expect(weather.isWarning()).toBe(false);
    });

    it('速度修正应该是1', () => {
      expect(weather.getSpeedModifier()).toBe(1);
    });

    it('视野修正应该是1', () => {
      expect(weather.getVisionModifier()).toBe(1);
    });
  });

  describe('天气概率计算', () => {
    it('地表附近应该有天气概率', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const chance = weather.calculateWeatherChance(10, config);
      expect(chance).toBeGreaterThan(0);
      expect(chance).toBeLessThan(config.baseChance * 2);
    });

    it('峰值深度应该有最高概率', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const peakChance = weather.calculateWeatherChance(config.surfacePeakDepth, config);
      const shallowChance = weather.calculateWeatherChance(5, config);
      const deepChance = weather.calculateWeatherChance(50, config);

      expect(peakChance).toBeGreaterThan(shallowChance);
      expect(peakChance).toBeGreaterThan(deepChance);
    });

    it('深度增加概率应该降低', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const chance50 = weather.calculateWeatherChance(50, config);
      const chance100 = weather.calculateWeatherChance(100, config);

      expect(chance100).toBeLessThan(chance50);
    });

    it('超过最大深度概率应该为0', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const chance = weather.calculateWeatherChance(config.maxWeatherDepth + 10, config);
      expect(chance).toBe(0);
    });

    it('酸雨也应该有同样的深度衰减特性', () => {
      const config = WEATHER_CONFIG.acid_rain;
      const peakChance = weather.calculateWeatherChance(config.surfacePeakDepth, config);
      const veryDeepChance = weather.calculateWeatherChance(200, config);

      expect(peakChance).toBeGreaterThan(veryDeepChance);
      expect(veryDeepChance).toBeCloseTo(0, 5);
    });
  });

  describe('深度效果因子', () => {
    it('getDepthEffectFactor在地表附近应该较低', () => {
      const factor = weather.getDepthEffectFactor(0, 20, 0.03);
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(1);
    });

    it('getDepthEffectFactor在峰值深度应该接近1', () => {
      const factor = weather.getDepthEffectFactor(20, 20, 0.03);
      expect(factor).toBeCloseTo(1, 1);
    });

    it('getDepthEffectFactor深度增加应该衰减', () => {
      const factor50 = weather.getDepthEffectFactor(50, 20, 0.03);
      const factor100 = weather.getDepthEffectFactor(100, 20, 0.03);
      expect(factor100).toBeLessThan(factor50);
    });

    it('getVisualDepthFactor应该比概率衰减更快', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const depth = 50;
      const effectFactor = weather.getDepthEffectFactor(depth, config.surfacePeakDepth, config.chanceDecayRate);
      const visualFactor = weather.getVisualDepthFactor(depth, config);

      expect(visualFactor).toBeLessThanOrEqual(effectFactor);
    });
  });

  describe('速度和视野修正', () => {
    beforeEach(() => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
    });

    it('沙尘暴应该降低移动速度', () => {
      const speedMod = weather.getSpeedModifier(10);
      expect(speedMod).toBeLessThan(1);
      expect(speedMod).toBeGreaterThan(0);
    });

    it('沙尘暴应该降低视野', () => {
      const visionMod = weather.getVisionModifier(10);
      expect(visionMod).toBeLessThan(1);
      expect(visionMod).toBeGreaterThan(0);
    });

    it('深处速度影响应该较小', () => {
      const shallowSpeed = weather.getSpeedModifier(10);
      const deepSpeed = weather.getSpeedModifier(100);
      expect(deepSpeed).toBeGreaterThan(shallowSpeed);
    });

    it('超过最大深度速度修正应该为1', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const speedMod = weather.getSpeedModifier(config.maxWeatherDepth + 10);
      expect(speedMod).toBe(1);
    });

    it('超过最大深度视野修正应该为1', () => {
      const config = WEATHER_CONFIG.sandstorm;
      const visionMod = weather.getVisionModifier(config.maxWeatherDepth + 10);
      expect(visionMod).toBe(1);
    });
  });

  describe('天气状态管理', () => {
    it('startWeather应该改变当前天气', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      expect(weather.getCurrentWeather()).toBe(WEATHER_TYPES.SANDSTORM);
      expect(weather.isActive()).toBe(true);
    });

    it('endWeather应该重置为晴朗', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      weather.endWeather();
      expect(weather.getCurrentWeather()).toBe(WEATHER_TYPES.CLEAR);
      expect(weather.isActive()).toBe(false);
    });

    it('天气应该有持续时间', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      expect(weather.weatherDuration).toBeGreaterThan(0);
      expect(weather.weatherTimer).toBe(0);
    });

    it('update应该增加天气计时器', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      const startTimer = weather.weatherTimer;
      weather.update(1, 10, null, null, null);
      expect(weather.weatherTimer).toBeGreaterThan(startTimer);
    });

    it('天气结束后应该有冷却时间', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      weather.weatherTimer = weather.weatherDuration;
      weather.update(0.1, 10, null, null, null);
      expect(weather.cooldown).toBeGreaterThan(0);
    });
  });

  describe('预警系统', () => {
    it('startWarning应该设置预警状态', () => {
      weather.startWarning(WEATHER_TYPES.SANDSTORM);
      expect(weather.isWarning()).toBe(true);
      expect(weather.getWarningWeather()).toBe(WEATHER_TYPES.SANDSTORM);
      expect(weather.getWarningTime()).toBeGreaterThan(0);
    });

    it('预警时间结束后应该开始天气', () => {
      weather.startWarning(WEATHER_TYPES.SANDSTORM);
      const warningTime = weather.getWarningTime();
      weather.update(warningTime + 0.1, 10, null, null, null);
      expect(weather.isWarning()).toBe(false);
      expect(weather.getCurrentWeather()).toBe(WEATHER_TYPES.SANDSTORM);
    });
  });

  describe('特殊矿石生成', () => {
    let world;
    let mockPlayer;
    let mockParticles;

    beforeEach(() => {
      world = createTestWorld();
      const playerX = Math.floor(WORLD_WIDTH / 2);
      digVerticalShaft(world, playerX, SURFACE_Y, 30);
      for (let dy = 0; dy < 20; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (dx !== 0) {
            const x = playerX + dx;
            const y = SURFACE_Y + 10 + dy;
            if (world.inBounds(x, y) && Math.abs(dx) <= 3 + Math.floor(dy / 5)) {
              world.setTile(x, y, TILE_TYPES.EMPTY);
            }
          }
        }
      }
      mockPlayer = { tileX: playerX, tileY: SURFACE_Y + 15, x: 0, y: 0 };
      mockParticles = { spawnCircle: () => {} };
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
    });

    it('应该只在特定天气下生成特殊矿石', () => {
      const clearWeather = new WeatherSystem();
      const count = clearWeather.spawnSpecialOres(world, mockPlayer, mockParticles);
      expect(count).toBeUndefined();
    });

    it('不应该在超过最大深度的地方生成矿石', () => {
      const deepPlayer = { ...mockPlayer, tileY: SURFACE_Y + 200 };
      const count = weather.spawnSpecialOres(world, deepPlayer, mockParticles);
      expect(count).toBe(0);
    });

    it('生成的矿石应该是特殊矿石类型', () => {
      const oresBefore = countSpecialOres(world);
      const spawned = weather.spawnSpecialOres(world, mockPlayer, mockParticles);
      const oresAfter = countSpecialOres(world);
      expect(oresAfter).toBeGreaterThanOrEqual(oresBefore);
      expect(spawned).toBeGreaterThanOrEqual(0);
      expect(oresAfter - oresBefore).toBe(spawned);
    });

    it('不应该在已生成过的位置重复生成', () => {
      const spawned1 = weather.spawnSpecialOres(world, mockPlayer, mockParticles);
      const spawned2 = weather.spawnSpecialOres(world, mockPlayer, mockParticles);
      expect(spawned1 + spawned2).toBeGreaterThanOrEqual(spawned1);
    });

    it('生成的矿石应该在地表附近', () => {
      weather.spawnSpecialOres(world, mockPlayer, mockParticles);
      const config = WEATHER_CONFIG.sandstorm;
      const maxDepth = config.specialOreMaxDepth;
      
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
          const tile = world.getTile(x, y);
          if (tile === TILE_TYPES.ORE_SAND_CRYSTAL || tile === TILE_TYPES.ORE_ACID_GEM) {
            const depth = y - SURFACE_Y;
            expect(depth).toBeLessThanOrEqual(maxDepth + 1);
            expect(depth).toBeGreaterThanOrEqual(config.specialOreMinSurfaceDist - 1);
          }
        }
      }
    });
  });

  describe('矿石暴露检测', () => {
    let world;

    beforeEach(() => {
      world = createTestWorld();
    });

    it('地表的方块应该被认为是暴露的', () => {
      const x = Math.floor(WORLD_WIDTH / 2);
      const y = SURFACE_Y;
      const isExposed = weather.checkOreExposure(world, x, y, 10);
      expect(isExposed).toBe(true);
    });

    it('竖坑壁上的方块应该被认为是暴露的', () => {
      const x = Math.floor(WORLD_WIDTH / 2);
      digVerticalShaft(world, x, SURFACE_Y, 10);
      
      const isExposed = weather.checkOreExposure(world, x + 1, SURFACE_Y + 5, 15);
      expect(isExposed).toBe(true);
    });

    it('深处封闭的方块不应该被认为是暴露的', () => {
      const x = Math.floor(WORLD_WIDTH / 2);
      const y = SURFACE_Y + 80;
      const isExposed = weather.checkOreExposure(world, x, y, 10);
      expect(isExposed).toBe(false);
    });

    it('与地表连通的大洞穴边缘方块应该被认为是暴露的', () => {
      const caveX = Math.floor(WORLD_WIDTH / 2);
      const caveY = SURFACE_Y + 20;
      digCave(world, caveX, caveY, 8);
      digVerticalShaft(world, caveX, SURFACE_Y, caveY - SURFACE_Y);
      
      const isExposed = weather.checkOreExposure(world, caveX + 9, caveY, 40);
      expect(isExposed).toBe(true);
    });

    it('封闭的大洞穴边缘方块不应该被认为是暴露的', () => {
      const caveX = Math.floor(WORLD_WIDTH / 2);
      const caveY = SURFACE_Y + 60;
      digCave(world, caveX, caveY, 8);
      
      const isExposed = weather.checkOreExposure(world, caveX + 9, caveY, 25);
      expect(isExposed).toBe(false);
    });

    it('小的封闭空洞不应该被认为是暴露的', () => {
      const x = Math.floor(WORLD_WIDTH / 2);
      const y = SURFACE_Y + 60;
      digSmallPocket(world, x, y, 2);
      
      const isExposed = weather.checkOreExposure(world, x + 3, y, 10);
      expect(isExposed).toBe(false);
    });

    it('超过检测距离的地表方块不应该被认为是暴露的', () => {
      const x = Math.floor(WORLD_WIDTH / 2);
      const y = SURFACE_Y + 20;
      const isExposed = weather.checkOreExposure(world, x, y, 5);
      expect(isExposed).toBe(false);
    });
  });

  describe('clear方法', () => {
    it('clear应该重置所有状态', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      weather.specialOresSpawned.add('10,20');
      
      weather.clear();
      
      expect(weather.getCurrentWeather()).toBe(WEATHER_TYPES.CLEAR);
      expect(weather.isActive()).toBe(false);
      expect(weather.isWarning()).toBe(false);
      expect(weather.weatherTimer).toBe(0);
      expect(weather.weatherDuration).toBe(0);
      expect(weather.cooldown).toBe(0);
      expect(weather.specialOresSpawned.size).toBe(0);
    });
  });

  describe('回调函数', () => {
    let events;

    beforeEach(() => {
      events = [];
      weather.setCallbacks({
        onWeatherStart: (type) => events.push({ type: 'start', weather: type }),
        onWeatherEnd: (type) => events.push({ type: 'end', weather: type }),
        onWarning: (type, time) => events.push({ type: 'warning', weather: type, time })
      });
    });

    it('开始天气时应该调用onWeatherStart', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('start');
      expect(events[0].weather).toBe(WEATHER_TYPES.SANDSTORM);
    });

    it('结束天气时应该调用onWeatherEnd', () => {
      weather.startWeather(WEATHER_TYPES.SANDSTORM);
      weather.endWeather();
      const endEvent = events.find(e => e.type === 'end');
      expect(endEvent).toBeDefined();
      expect(endEvent.weather).toBe(WEATHER_TYPES.SANDSTORM);
    });

    it('开始预警时应该调用onWarning', () => {
      weather.startWarning(WEATHER_TYPES.ACID_RAIN);
      expect(events.some(e => e.type === 'warning')).toBe(true);
    });
  });
});

function countSpecialOres(world) {
  let count = 0;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const tile = world.getTile(x, y);
      if (tile === TILE_TYPES.ORE_SAND_CRYSTAL || tile === TILE_TYPES.ORE_ACID_GEM) {
        count++;
      }
    }
  }
  return count;
}

function createTestWorld() {
  const world = new World(99999);
  
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (y < SURFACE_Y) {
        world.setTile(x, y, TILE_TYPES.EMPTY);
      } else if (y < SURFACE_Y + 5) {
        world.setTile(x, y, TILE_TYPES.DIRT);
      } else {
        world.setTile(x, y, TILE_TYPES.STONE);
      }
    }
  }
  
  return world;
}

function digCave(world, centerX, centerY, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (world.inBounds(x, y)) {
          world.setTile(x, y, TILE_TYPES.CAVE);
        }
      }
    }
  }
}

function digSmallPocket(world, centerX, centerY, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (world.inBounds(x, y)) {
          world.setTile(x, y, TILE_TYPES.EMPTY);
        }
      }
    }
  }
}

function digVerticalShaft(world, x, startY, depth) {
  for (let dy = 0; dy < depth; dy++) {
    const y = startY + dy;
    if (world.inBounds(x, y)) {
      world.setTile(x, y, TILE_TYPES.EMPTY);
    }
  }
}
