import { WEATHER_TYPES, WEATHER_CONFIG } from './constants.js';

export class WeatherParticle {
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

export function createWeatherParticles(type, count, canvasWidth, canvasHeight) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(new WeatherParticle(type, canvasWidth, canvasHeight));
  }
  return particles;
}

export function updateWeatherParticles(particles, dt, canvasWidth, canvasHeight) {
  for (const p of particles) {
    p.update(dt, canvasWidth, canvasHeight);
  }
}

export function renderWeatherParticles(particles, ctx, alphaScale = 1) {
  for (const p of particles) {
    p.render(ctx, alphaScale);
  }
}
