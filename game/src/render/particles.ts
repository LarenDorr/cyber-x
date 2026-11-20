import type { ViewportCamera } from './camera.ts';
import type { RenderSnapshot, Vec2 } from './viewModel.ts';

export interface Particle {
  /** World tile coordinates */
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  ageMs: number;
  lifeMs: number;
  gravity: number;
  glow?: boolean;
}

export interface Afterimage {
  x: number;
  y: number;
  char: string;
  color: string;
  ageMs: number;
  lifeMs: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private afterimages: Afterimage[] = [];
  private ambientAccumMs = 0;

  clear(): void {
    this.particles = [];
    this.afterimages = [];
  }

  emitBurst(
    pos: Vec2,
    opts: {
      count: number;
      colors: string[];
      speedMin?: number;
      speedMax?: number;
      sizeMin?: number;
      sizeMax?: number;
      lifeMs?: number;
      gravity?: number;
      glow?: boolean;
    },
  ): void {
    const speedMin = opts.speedMin ?? 0.9;
    const speedMax = opts.speedMax ?? 3.4;
    const sizeMin = opts.sizeMin ?? 1.8;
    const sizeMax = opts.sizeMax ?? 3.4;
    const lifeMs = opts.lifeMs ?? 520;
    const gravity = opts.gravity ?? 0;

    for (let i = 0; i < opts.count; i++) {
      const angle = (Math.PI * 2 * i) / opts.count + (Math.random() - 0.5) * 0.65;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const color = opts.colors[Math.floor(Math.random() * opts.colors.length)];
      this.particles.push({
        x: pos.x + 0.5 + (Math.random() - 0.5) * 0.25,
        y: pos.y + 0.5 + (Math.random() - 0.5) * 0.25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color,
        alpha: 1,
        ageMs: 0,
        lifeMs: lifeMs * (0.75 + Math.random() * 0.5),
        gravity,
        glow: opts.glow ?? true,
      });
    }
    if (this.particles.length > 260) {
      this.particles.splice(0, this.particles.length - 260);
    }
  }

  emitTrailDot(x: number, y: number, color: string, size = 2.4): void {
    this.particles.push({
      x: x + 0.5 + (Math.random() - 0.5) * 0.3,
      y: y + 0.65 + (Math.random() - 0.5) * 0.15,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.35 - Math.random() * 0.5,
      size,
      color,
      alpha: 0.9,
      ageMs: 0,
      lifeMs: 420 + Math.random() * 200,
      gravity: 0,
      glow: true,
    });
  }

  emitAfterimage(x: number, y: number, char: string, color: string): void {
    this.afterimages.push({
      x,
      y,
      char,
      color,
      ageMs: 0,
      lifeMs: 320,
    });
  }

  /** Subtle ambient motes for fire embers, cryo pipe mist, legendary loot sparkles, and redline sparks */
  updateAmbient(snapshot: RenderSnapshot, dtMs: number): void {
    this.ambientAccumMs += dtMs;
    if (this.ambientAccumMs < 130) return;
    this.ambientAccumMs = 0;

    // Fire embers
    for (const tile of snapshot.tiles) {
      if (!tile.revealed) continue;
      if (tile.surface === 'fire' && Math.random() < 0.45) {
        this.particles.push({
          x: tile.x + 0.2 + Math.random() * 0.6,
          y: tile.y + 0.72,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -0.75 - Math.random() * 0.65,
          size: 1.5 + Math.random() * 1.4,
          color: Math.random() < 0.5 ? '#ff9d42' : '#ff5538',
          alpha: 0.85,
          ageMs: 0,
          lifeMs: 750 + Math.random() * 450,
          gravity: 0,
          glow: true,
        });
      }
    }

    // Props: cooling pipe mist, power box sparks, legendary loot motes
    for (const prop of snapshot.props) {
      if (prop.kind === 'cooling_pipe' && Math.random() < 0.32) {
        this.particles.push({
          x: prop.x + 0.25 + Math.random() * 0.5,
          y: prop.y + 0.55,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.35 - Math.random() * 0.3,
          size: 1.8 + Math.random() * 1.2,
          color: '#9cf4ff',
          alpha: 0.52,
          ageMs: 0,
          lifeMs: 900,
          gravity: 0,
          glow: false,
        });
      } else if (prop.kind === 'power_box' && Math.random() < 0.24) {
        this.particles.push({
          x: prop.x + 0.3 + Math.random() * 0.4,
          y: prop.y + 0.4,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          size: 1.5,
          color: '#6bf6ff',
          alpha: 0.9,
          ageMs: 0,
          lifeMs: 260,
          gravity: 0,
          glow: true,
        });
      } else if (prop.kind === 'dropped_part' && prop.rarity === 'legendary' && Math.random() < 0.4) {
        this.particles.push({
          x: prop.x + 0.22 + Math.random() * 0.56,
          y: prop.y + 0.65,
          vx: (Math.random() - 0.5) * 0.22,
          vy: -0.48 - Math.random() * 0.35,
          size: 1.5 + Math.random() * 1.1,
          color: Math.random() < 0.6 ? '#ffbe55' : '#fff0b3',
          alpha: 0.82,
          ageMs: 0,
          lifeMs: 880,
          gravity: 0,
          glow: true,
        });
      }
    }

    // Diegetic unit status particles (stunned sparks, overheated steam, redline arcs, virus glitch dust, legendary motes!)
    for (const unit of snapshot.units) {
      if (unit.dormant) continue;

      if (unit.statuses.includes('stunned') && Math.random() < 0.55) {
        this.particles.push({
          x: unit.x + 0.25 + Math.random() * 0.5,
          y: unit.y + 0.15 + Math.random() * 0.45,
          vx: (Math.random() - 0.5) * 1.9,
          vy: -0.4 - Math.random() * 1.1,
          size: 1.6 + Math.random() * 1.2,
          color: Math.random() < 0.65 ? '#fcee0a' : '#00f0ff',
          alpha: 0.95,
          ageMs: 0,
          lifeMs: 360 + Math.random() * 160,
          gravity: 1.4,
          glow: true,
        });
      }

      if (unit.statuses.includes('overheated') && Math.random() < 0.48) {
        this.particles.push({
          x: unit.x + 0.26 + Math.random() * 0.48,
          y: unit.y + 0.28 + Math.random() * 0.25,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -0.58 - Math.random() * 0.45,
          size: 2.0 + Math.random() * 1.5,
          color: Math.random() < 0.55 ? '#ff9436' : 'rgba(255, 196, 130, 0.7)',
          alpha: 0.65,
          ageMs: 0,
          lifeMs: 680 + Math.random() * 280,
          gravity: 0,
          glow: true,
        });
      }

      if (unit.statuses.includes('redline') && Math.random() < 0.78) {
        this.particles.push({
          x: unit.x + 0.2 + Math.random() * 0.6,
          y: unit.y + 0.25 + Math.random() * 0.45,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -0.7 - Math.random() * 1.2,
          size: 1.7 + Math.random() * 1.3,
          color: Math.random() < 0.5 ? '#00f0ff' : '#ff1744',
          alpha: 0.98,
          ageMs: 0,
          lifeMs: 420 + Math.random() * 180,
          gravity: 0.7,
          glow: true,
        });
      }

      if (unit.statuses.includes('virus') && Math.random() < 0.52) {
        // Rising digital malware glitch pixels
        this.particles.push({
          x: unit.x + 0.2 + Math.random() * 0.6,
          y: unit.y + 0.22 + Math.random() * 0.5,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.65 - Math.random() * 0.45,
          size: 2.2 + Math.random() * 1.2,
          color: Math.random() < 0.7 ? '#7dff6b' : '#00f0ff',
          alpha: 0.9,
          ageMs: 0,
          lifeMs: 520 + Math.random() * 220,
          gravity: 0,
          glow: true,
        });
      }

      if (unit.rarity === 'legendary' && Math.random() < 0.36) {
        this.particles.push({
          x: unit.x + 0.18 + Math.random() * 0.64,
          y: unit.y + 0.58,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.52 - Math.random() * 0.35,
          size: 1.5 + Math.random() * 1.1,
          color: Math.random() < 0.6 ? '#fcee0a' : '#ffab2e',
          alpha: 0.85,
          ageMs: 0,
          lifeMs: 780,
          gravity: 0,
          glow: true,
        });
      }
    }
  }

  update(dtMs: number): void {
    const dtSec = Math.min(dtMs, 50) / 1000;
    const clampedMs = Math.min(dtMs, 50);

    this.particles = this.particles.filter((p) => {
      p.ageMs += clampedMs;
      if (p.ageMs >= p.lifeMs) return false;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += p.gravity * dtSec;
      p.vx *= 0.95;
      p.vy *= 0.95;
      return true;
    });

    this.afterimages = this.afterimages.filter((a) => {
      a.ageMs += clampedMs;
      return a.ageMs < a.lifeMs;
    });
  }

  render(ctx: CanvasRenderingContext2D, camera: ViewportCamera): void {
    const tilePx = camera.tilePixelSize;
    const monoFont = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

    // Afterimages first
    if (this.afterimages.length > 0) {
      ctx.save();
      ctx.font = `700 ${Math.round(tilePx * 0.64)}px ${monoFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const a of this.afterimages) {
        const t = 1 - a.ageMs / a.lifeMs;
        const r = camera.tileToScreenRect(a.x, a.y);
        ctx.globalAlpha = t * 0.45;
        ctx.fillStyle = a.color;
        ctx.fillText(a.char, r.x + r.size / 2, r.y + r.size / 2);
      }
      ctx.restore();
    }

    // Crisp micro-particles
    if (this.particles.length > 0) {
      ctx.save();
      for (const p of this.particles) {
        const t = 1 - p.ageMs / p.lifeMs;
        const pt = camera.worldToScreen(p.x, p.y);
        ctx.globalAlpha = Math.max(0, t * p.alpha);
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = p.color;
        const s = Math.max(1.2, p.size * (0.5 + 0.5 * t));
        ctx.fillRect(pt.x - s / 2, pt.y - s / 2, s, s);
      }
      ctx.restore();
    }
  }
}
