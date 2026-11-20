import type { ViewportCamera } from './camera.ts';
import {
  DIR_VECTORS,
  PALETTE,
  PROP_GLYPHS,
  RARITY_COLORS,
  STATUS_BADGES,
  SURFACE_STYLES,
  TILE_GLYPHS,
  UNIT_GLYPHS,
} from './glyphs.ts';
import { drawCornerBrackets, renderOverlays, tileKey } from './overlay.ts';
import type { ParticleSystem } from './particles.ts';
import type { SequencerVisualState } from './sequencer.ts';
import {
  drawVectorProp,
  drawVectorTileFeature,
  drawVectorUnit,
  drawVectorWall,
} from './vectorSprites.ts';
import {
  drawVectorElectrifiedOverlay,
  drawVectorFloorBase,
  drawVectorSurface,
} from './vectorSurfaces.ts';
import type {
  PreviewOverlay,
  PropView,
  RenderSnapshot,
  TileCell,
  UnitView,
  Vec2,
} from './viewModel.ts';

const MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export type RenderStyleMode = 'vector' | 'ascii';

export interface CanvasRenderParams {
  snapshot: RenderSnapshot;
  camera: ViewportCamera;
  hoverTile: Vec2 | null;
  focusedEnemyId: string | null;
  preview: PreviewOverlay | null;
  fx: SequencerVisualState;
  particles: ParticleSystem;
  renderStyle: RenderStyleMode;
  nowMs: number;
}

export class AsciiBoardRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 800;
  private height = 600;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.width = Math.max(1, Math.floor(cssWidth));
    this.height = Math.max(1, Math.floor(cssHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  get viewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  render(params: CanvasRenderParams): void {
    const { ctx } = this;
    const { snapshot, camera, hoverTile, focusedEnemyId, preview, fx, particles, renderStyle, nowMs } = params;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Clear void background
    ctx.fillStyle = PALETTE.bgVoid;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY);

    const propsByTile = new Map<string, PropView[]>();
    for (const p of snapshot.props) {
      const k = tileKey(p);
      const list = propsByTile.get(k);
      if (list) list.push(p);
      else propsByTile.set(k, [p]);
    }

    const tileMap = new Map<string, TileCell>();
    for (const cell of snapshot.tiles) {
      tileMap.set(tileKey(cell), cell);
    }

    // === LAYER 1: FLOOR, PRIMARY SURFACE & CAVES 4-CORNER L-BRACKETS ===
    for (const cell of snapshot.tiles) {
      if (cell.kind === 'void') continue;
      const rect = camera.tileToScreenRect(cell.x, cell.y);
      if (
        rect.x + rect.size < -20 ||
        rect.y + rect.size < -20 ||
        rect.x > this.width + 20 ||
        rect.y > this.height + 20
      ) {
        continue;
      }
      this.drawTileBaseLayer(ctx, cell, rect, snapshot.currentRoomId, tileMap, renderStyle, nowMs);
    }

    // === AMBIENT DYNAMIC POINT-LIGHT SPILL (Caves-style soft radial lighting) ===
    this.drawAmbientPointLights(ctx, snapshot, camera, nowMs);

    // === LAYER 2A: STATIC TILE GLYPHS & ENRICHED PROPS ===
    for (const cell of snapshot.tiles) {
      if (cell.kind === 'void' || !cell.revealed) continue;
      const rect = camera.tileToScreenRect(cell.x, cell.y);
      if (
        rect.x + rect.size < -20 ||
        rect.y + rect.size < -20 ||
        rect.x > this.width + 20 ||
        rect.y > this.height + 20
      ) {
        continue;
      }

      if (cell.kind !== 'floor') {
        if (renderStyle === 'vector') {
          if (cell.kind !== 'wall') {
            drawVectorTileFeature(ctx, cell, rect, nowMs);
          }
        } else {
          this.drawTileFeatureGlyph(ctx, cell, rect, nowMs);
        }
      }

      const props = propsByTile.get(tileKey(cell));
      if (props && props.length > 0) {
        const primaryProp = props[props.length - 1];
        const bounce = fx.propBounceTimers.get(primaryProp.id);
        if (renderStyle === 'vector') {
          drawVectorProp(ctx, primaryProp, rect, nowMs, bounce);
        } else {
          this.drawPropGlyph(ctx, primaryProp, rect, nowMs, bounce);
        }
      }
    }

    // === AFTERIMAGES & AMBIENT/BURST PARTICLES (behind/around units) ===
    particles.render(ctx, camera);

    // === LAYER 2B & 3: UNITS + CORNER STATUS BADGES ===
    for (const unit of snapshot.units) {
      const cell = tileMap.get(tileKey(unit));
      if (cell && !cell.revealed) continue;

      const override = fx.unitPositionOverrides.get(unit.id);
      const ux = override ? override.x : unit.x;
      const uy = override ? override.y : unit.y;
      const rect = camera.tileToScreenRect(ux, uy);

      const hasLootUnder = (propsByTile.get(tileKey(unit)) ?? []).some(
        (p) => p.kind === 'dropped_part',
      );
      const hitFlash = fx.unitHitFlashes.get(unit.id);
      if (renderStyle === 'vector') {
        drawVectorUnit(ctx, unit, rect, nowMs, hasLootUnder, hitFlash);
      } else {
        this.drawCompositeUnit(ctx, unit, rect, nowMs, hasLootUnder, hitFlash);
      }
      this.drawUnitStatusAuraFx(ctx, unit, rect, nowMs);
      this.drawUnitBadges(ctx, unit, rect, nowMs);
    }

    // Corner badges for special props when uncovered
    const unitTiles = new Set(snapshot.units.map((u) => tileKey(u)));
    for (const prop of snapshot.props) {
      const cell = tileMap.get(tileKey(prop));
      if (cell && !cell.revealed) continue;
      if (unitTiles.has(tileKey(prop))) continue;
      const rect = camera.tileToScreenRect(prop.x, prop.y);
      this.drawPropBadges(ctx, prop, rect);
    }

    // === OVERLAY LAYER: INTENTS, HOVER PREVIEW, SEQUENCER FX ===
    renderOverlays(ctx, {
      snapshot,
      camera,
      hoverTile,
      focusedEnemyId,
      preview,
      fx,
      nowMs,
      viewportW: this.width,
      viewportH: this.height,
    });

    // Room header pills
    this.drawRoomLabels(ctx, snapshot, camera);

    ctx.restore();
    ctx.restore();
  }

  private drawAmbientPointLights(
    ctx: CanvasRenderingContext2D,
    snapshot: RenderSnapshot,
    camera: ViewportCamera,
    nowMs: number,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const cell of snapshot.tiles) {
      if (!cell.revealed) continue;
      if (cell.surface === 'fire') {
        const r = camera.tileToScreenRect(cell.x, cell.y);
        const flicker = 0.85 + 0.15 * Math.sin(nowMs / 130 + cell.x * 2);
        const cx = r.x + r.size / 2;
        const cy = r.y + r.size / 2;
        const radius = r.size * 1.9 * flicker;
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
        grad.addColorStop(0, 'rgba(255, 110, 42, 0.22)');
        grad.addColorStop(0.55, 'rgba(255, 68, 28, 0.08)');
        grad.addColorStop(1, 'rgba(255, 68, 28, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      } else if (cell.kind === 'elevator') {
        const r = camera.tileToScreenRect(cell.x, cell.y);
        const pulse = 0.88 + 0.12 * Math.sin(nowMs / 360);
        const cx = r.x + r.size / 2;
        const cy = r.y + r.size / 2;
        const radius = r.size * 1.75 * pulse;
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
        grad.addColorStop(0, 'rgba(71, 245, 157, 0.20)');
        grad.addColorStop(1, 'rgba(71, 245, 157, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }

    for (const prop of snapshot.props) {
      if (prop.kind === 'cooling_pipe') {
        const r = camera.tileToScreenRect(prop.x, prop.y);
        const cx = r.x + r.size / 2;
        const cy = r.y + r.size / 2;
        const radius = r.size * 1.35;
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
        grad.addColorStop(0, 'rgba(110, 235, 255, 0.14)');
        grad.addColorStop(1, 'rgba(110, 235, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }

    ctx.restore();
  }

  private drawTileBaseLayer(
    ctx: CanvasRenderingContext2D,
    cell: TileCell,
    rect: { x: number; y: number; size: number },
    currentRoomId: string,
    tileMap: Map<string, TileCell>,
    renderStyle: RenderStyleMode,
    nowMs: number,
  ): void {
    const { x, y, size } = rect;

    if (!cell.revealed) {
      ctx.fillStyle = PALETTE.bgUnexplored;
      ctx.fillRect(x, y, size, size);
      if (cell.kind === 'wall' || cell.kind === 'door_closed') {
        ctx.fillStyle = '#141a24';
        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      } else {
        ctx.strokeStyle = PALETTE.bgUnexploredStripe;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + size - 3);
        ctx.lineTo(x + size - 3, y + 3);
        ctx.stroke();
      }
      return;
    }

    if (cell.kind === 'wall') {
      if (renderStyle === 'vector') {
        const isWallLike = (tx: number, ty: number) => {
          const n = tileMap.get(`${tx},${ty}`);
          return Boolean(n && (n.kind === 'wall' || n.kind === 'door_closed'));
        };
        drawVectorWall(ctx, x, y, size, {
          n: isWallLike(cell.x, cell.y - 1),
          e: isWallLike(cell.x + 1, cell.y),
          s: isWallLike(cell.x, cell.y + 1),
          w: isWallLike(cell.x - 1, cell.y),
        });
      } else {
        ctx.fillStyle = PALETTE.wallBg;
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(x, y, size, Math.max(2, size * 0.12));
      }
      return;
    }

    const isCurrentRoom = cell.roomId === currentRoomId;

    if (renderStyle === 'vector') {
      drawVectorFloorBase(ctx, cell, rect, isCurrentRoom);
      if (cell.surface !== 'none') {
        const sameSurf = (tx: number, ty: number) => {
          const n = tileMap.get(`${tx},${ty}`);
          return Boolean(n && n.revealed && n.surface === cell.surface);
        };
        drawVectorSurface(
          ctx,
          cell.surface,
          rect,
          {
            n: sameSurf(cell.x, cell.y - 1),
            e: sameSurf(cell.x + 1, cell.y),
            s: sameSurf(cell.x, cell.y + 1),
            w: sameSurf(cell.x - 1, cell.y),
          },
          cell.x,
          cell.y,
          nowMs,
        );
      }
      if (cell.electrified) {
        drawVectorElectrifiedOverlay(ctx, rect, cell.x, cell.y, nowMs);
      }
      return;
    }

    const checker = (cell.x + cell.y) % 2 === 0;
    ctx.fillStyle = isCurrentRoom
      ? checker
        ? PALETTE.floorEven
        : PALETTE.floorOdd
      : PALETTE.floorExploredDim;
    ctx.fillRect(x, y, size, size);

    if (cell.surface !== 'none') {
      const style = SURFACE_STYLES[cell.surface];
      ctx.fillStyle = style.bg;
      ctx.fillRect(x + 0.5, y + 0.5, size - 1, size - 1);

      if (cell.surface === 'water') {
        const wave = Math.sin(nowMs / 620 + cell.x * 0.8 + cell.y * 0.6) * 1.5;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.18, y + size * 0.72 + wave * 0.45);
        ctx.quadraticCurveTo(
          x + size * 0.5,
          y + size * 0.63 - wave * 0.45,
          x + size * 0.82,
          y + size * 0.72 + wave * 0.45,
        );
        ctx.stroke();

        // Subtle shimmering specular highlight dot on water
        const glint = 0.5 + 0.5 * Math.sin(nowMs / 480 + cell.x * 1.9 + cell.y * 2.3);
        if (glint > 0.72) {
          ctx.fillStyle = `rgba(140, 224, 255, ${((glint - 0.72) * 1.3).toFixed(2)})`;
          ctx.fillRect(x + size * 0.28, y + size * 0.28, 2, 2);
        }
      } else if (cell.surface === 'ice') {
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.18, y + size * 0.34);
        ctx.lineTo(x + size * 0.42, y + size * 0.16);
        ctx.moveTo(x + size * 0.58, y + size * 0.84);
        ctx.lineTo(x + size * 0.84, y + size * 0.62);
        ctx.stroke();

        // Periodic icy sheen glint sweep
        const sweep = ((nowMs / 2400 + cell.x * 0.12 + cell.y * 0.08) % 1);
        if (sweep < 0.24) {
          const p = sweep / 0.24;
          ctx.strokeStyle = `rgba(215, 252, 255, ${(Math.sin(p * Math.PI) * 0.38).toFixed(2)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x + size * (0.1 + p * 0.55), y + size * 0.85);
          ctx.lineTo(x + size * (0.35 + p * 0.55), y + size * 0.15);
          ctx.stroke();
        }
      } else if (cell.surface === 'oil') {
        ctx.fillStyle = style.accent;
        ctx.beginPath();
        ctx.ellipse(x + size * 0.45, y + size * 0.6, size * 0.25, size * 0.14, -0.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell.surface === 'fire') {
        const flicker = 0.5 + 0.5 * Math.sin(nowMs / 130 + cell.x * 2.1 + cell.y * 1.7);
        ctx.fillStyle = `rgba(255, 102, 42, ${(0.14 + flicker * 0.2).toFixed(3)})`;
        ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
        ctx.fillStyle = `rgba(255, 182, 82, ${(0.5 + flicker * 0.38).toFixed(3)})`;
        ctx.font = `700 ${Math.max(10, Math.round(size * 0.34))}px ${MONO_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('^', x + size * 0.5, y + size * 0.72 - flicker * 1.8);
      }
    }

    if (cell.electrified) {
      const spark = 0.5 + 0.5 * Math.sin(nowMs / 75 + cell.x + cell.y);
      ctx.fillStyle = `rgba(0, 229, 255, ${(0.18 + spark * 0.18).toFixed(3)})`;
      ctx.fillRect(x, y, size, size);
    }

    const bracketLen = Math.max(2.5, size * 0.11);
    drawCornerBrackets(
      ctx,
      x + 0.5,
      y + 0.5,
      size - 1,
      bracketLen,
      isCurrentRoom ? PALETTE.cornerBracket : 'rgba(150, 175, 205, 0.08)',
      1,
    );
  }

  private drawTileFeatureGlyph(
    ctx: CanvasRenderingContext2D,
    cell: TileCell,
    rect: { x: number; y: number; size: number },
    nowMs: number,
  ): void {
    const spec = TILE_GLYPHS[cell.kind];
    const cx = rect.x + rect.size / 2;
    const cy = rect.y + rect.size / 2 + 0.5;

    ctx.save();
    if (cell.kind === 'elevator') {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs / 320);
      ctx.fillStyle = `rgba(71, 245, 157, ${(0.1 + pulse * 0.1).toFixed(3)})`;
      ctx.fillRect(rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4);
      ctx.strokeStyle = 'rgba(71, 245, 157, 0.62)';
      ctx.lineWidth = 1.25;
      ctx.strokeRect(rect.x + 2.5, rect.y + 2.5, rect.size - 5, rect.size - 5);

      // Rising emerald holographic scanline
      const scanT = (nowMs / 1300) % 1;
      const scanY = rect.y + rect.size - 3 - scanT * (rect.size - 6);
      ctx.fillStyle = `rgba(145, 255, 200, ${(Math.sin(scanT * Math.PI) * 0.55).toFixed(2)})`;
      ctx.fillRect(rect.x + 3, scanY, rect.size - 6, 1.5);
    } else if (cell.kind === 'door_closed') {
      ctx.fillStyle = 'rgba(242, 184, 75, 0.12)';
      ctx.fillRect(rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4);
      ctx.strokeStyle = 'rgba(242, 184, 75, 0.38)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 2.5, rect.y + 2.5, rect.size - 5, rect.size - 5);
    }

    if (spec.glow) {
      ctx.shadowColor = spec.glow;
      ctx.shadowBlur = 9;
    }
    ctx.fillStyle = spec.color;
    ctx.font = `${spec.bold ? 700 : 500} ${Math.round(rect.size * 0.62)}px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.char, cx, cy);
    ctx.restore();
  }

  private drawPropGlyph(
    ctx: CanvasRenderingContext2D,
    prop: PropView,
    rect: { x: number; y: number; size: number },
    nowMs: number,
    bounce?: { elapsedMs: number; durationMs: number },
  ): void {
    const spec = PROP_GLYPHS[prop.kind];
    let bounceOffsetY = 0;
    let scale = 1;
    if (bounce) {
      const t = Math.min(1, bounce.elapsedMs / bounce.durationMs);
      bounceOffsetY = -Math.abs(Math.sin(t * Math.PI * 1.5)) * rect.size * 0.36 * (1 - t);
      scale = 1 + Math.sin(t * Math.PI) * 0.16;
    }

    const cx = rect.x + rect.size / 2;
    const cy = rect.y + rect.size / 2 + 0.5 + bounceOffsetY;
    let color = spec.color;
    let glow = spec.glow;

    if (prop.kind === 'dropped_part' && prop.rarity) {
      const rc = RARITY_COLORS[prop.rarity];
      color = rc.fg;
      glow = rc.glow;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const s = rect.size;
    // Enriched geometric prop silhouettes behind crisp ASCII core
    if (prop.kind === 'heavy_crate' || prop.kind === 'cargo_pod') {
      const hw = s * 0.34;
      ctx.fillStyle = prop.kind === 'cargo_pod' ? 'rgba(62, 138, 168, 0.22)' : 'rgba(120, 140, 168, 0.18)';
      ctx.strokeStyle = prop.kind === 'cargo_pod' ? 'rgba(110, 196, 219, 0.65)' : 'rgba(142, 160, 184, 0.52)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-hw, -hw, hw * 2, hw * 2, 3);
      ctx.fill();
      ctx.stroke();
    } else if (prop.kind === 'explosive_barrel') {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs / 280);
      ctx.fillStyle = `rgba(255, 84, 56, ${(0.16 + pulse * 0.12).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.kind === 'dropped_part') {
      // Subtle tilted mechanical arm silhouette hint under %
      ctx.strokeStyle = prop.rarity === 'legendary' ? 'rgba(255, 171, 54, 0.42)' : 'rgba(160, 188, 220, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.16);
      ctx.lineTo(s * 0.28, -s * 0.16);
      ctx.stroke();

      if (prop.rarity === 'legendary') {
        const pulse = 0.5 + 0.5 * Math.sin(nowMs / 260);
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, s * 0.54);
        grad.addColorStop(0, `rgba(255, 171, 54, ${(0.32 + pulse * 0.18).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 171, 54, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-s / 2, -s / 2, s, s);
      }
    }

    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
    }

    ctx.fillStyle = color;
    ctx.font = `${spec.bold ? 700 : 500} ${Math.round(s * 0.6)}px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.char, 0, 0);
    ctx.restore();
  }

  /**
   * Enriched Cyber-ASCII Composite Unit Renderer:
   * Preserves instant ASCII symbol readability while adding bespoke mech silhouettes,
   * visors, tank treads, drone rotors, hacker antennae, and rotating turret barrels!
   */
  private drawCompositeUnit(
    ctx: CanvasRenderingContext2D,
    unit: UnitView,
    rect: { x: number; y: number; size: number },
    nowMs: number,
    hasLootUnder: boolean,
    hitFlash?: { elapsedMs: number; durationMs: number },
  ): void {
    const spec = UNIT_GLYPHS[unit.kind];
    const s = rect.size;
    const isStunned = unit.statuses.includes('stunned');
    const isRedline = unit.statuses.includes('redline');

    // Subtle per-archetype idle motion
    let bobY = 0;
    let wobbleX = 0;
    if (unit.kind === 'drone') {
      bobY = Math.sin(nowMs / 310 + unit.x) * (s * 0.06);
    } else if (unit.kind === 'player') {
      bobY = Math.sin(nowMs / 520) * (s * 0.025);
    }
    if (isStunned) {
      wobbleX = Math.sin(nowMs / 70 + unit.x) * 1.25;
    }
    if (hitFlash) {
      const f = 1 - hitFlash.elapsedMs / hitFlash.durationMs;
      wobbleX += Math.sin(hitFlash.elapsedMs * 0.45) * 3.5 * f;
    }

    const cx = rect.x + s / 2 + wobbleX;
    const cy = rect.y + s / 2 + bobY;

    ctx.save();

    if (unit.dormant) {
      ctx.globalAlpha = 0.5;
    }

    // 1. Focal floor glow / drop shadow
    if (unit.faction === 'player') {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs / (isRedline ? 140 : 420));
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 0.62);
      if (isRedline) {
        grad.addColorStop(0, `rgba(255, 56, 80, ${(0.38 + pulse * 0.22).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 56, 80, 0)');
      } else {
        grad.addColorStop(0, `rgba(255, 226, 122, ${(0.25 + pulse * 0.12).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 226, 122, 0)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(rect.x - 4, rect.y - 4, s + 8, s + 8);
    } else if (unit.kind === 'drone') {
      // Airborne shadow ellipse beneath hovering drone
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(rect.x + s / 2, rect.y + s * 0.82, s * 0.24, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Archetype Cyber-ASCII Chassis Emblem Layer
    this.drawUnitArchetypeFrame(ctx, unit, cx, cy, s, nowMs);

    // 3. Crisp Bold ASCII Core Symbol
    const flashRatio = hitFlash ? Math.max(0, 1 - hitFlash.elapsedMs / hitFlash.durationMs) : 0;
    if (spec.glow) {
      ctx.shadowColor = flashRatio > 0.35 ? '#ffffff' : spec.glow;
      ctx.shadowBlur = unit.faction === 'player' ? 11 : 7;
    }
    ctx.fillStyle = flashRatio > 0.42 ? '#ffffff' : spec.color;
    ctx.font = `700 ${Math.round(s * 0.58)}px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.char, cx, cy + 0.5);
    ctx.shadowBlur = 0;

    // 4. Micro HP bar along bottom inner edge
    if (unit.maxHp > 0) {
      const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
      const barW = s - 8;
      const barH = Math.max(2, Math.round(s * 0.075));
      const bx = rect.x + 4;
      const by = rect.y + s - barH - 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle =
        unit.faction === 'player'
          ? ratio > 0.35
            ? '#4ef59f'
            : '#ff5266'
          : ratio > 0.45
            ? '#ff6b78'
            : '#ff9d47';
      ctx.fillRect(bx, by, barW * ratio, barH);
    }

    if (hasLootUnder) {
      ctx.fillStyle = '#ffab36';
      ctx.font = `700 ${Math.max(8, Math.round(s * 0.24))}px ${MONO_FONT}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('%', rect.x + s - 2, rect.y + s - 4);
    }

    ctx.restore();
  }

  private drawUnitArchetypeFrame(
    ctx: CanvasRenderingContext2D,
    unit: UnitView,
    cx: number,
    cy: number,
    s: number,
    nowMs: number,
  ): void {
    const r = s * 0.36;
    const face = DIR_VECTORS[unit.facing];

    ctx.save();
    ctx.translate(cx, cy);

    switch (unit.kind) {
      case 'player': {
        // Chamfered cyber-mech chassis octagon
        const c = r * 0.55;
        ctx.fillStyle = 'rgba(255, 215, 90, 0.12)';
        ctx.strokeStyle = 'rgba(255, 226, 122, 0.68)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-c, -r);
        ctx.lineTo(c, -r);
        ctx.lineTo(r, -c);
        ctx.lineTo(r, c);
        ctx.lineTo(c, r);
        ctx.lineTo(-c, r);
        ctx.lineTo(-r, c);
        ctx.lineTo(-r, -c);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Twin cyan optic visor eyes along top rim
        ctx.fillStyle = '#5ef2ff';
        ctx.fillRect(-3.5, -r + 2.2, 2.2, 1.8);
        ctx.fillRect(1.3, -r + 2.2, 2.2, 1.8);

        // Left hydraulic fist bar & right orange HF-blade accent
        ctx.strokeStyle = '#9bb6d6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r - 2.2, -r * 0.35);
        ctx.lineTo(-r - 2.2, r * 0.35);
        ctx.stroke();

        ctx.strokeStyle = '#ff9d3b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r + 2.2, -r * 0.45);
        ctx.lineTo(r + 3.4, r * 0.4);
        ctx.stroke();
        break;
      }

      case 'grunt': {
        // Tactical shoulder frame + bright crimson visor slit
        ctx.fillStyle = 'rgba(255, 92, 108, 0.12)';
        ctx.strokeStyle = 'rgba(255, 110, 118, 0.52)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.roundRect(-r * 0.85, -r * 0.9, r * 1.7, r * 1.75, 4);
        ctx.fill();
        ctx.stroke();

        // Red visor slit
        ctx.fillStyle = '#ff4b5c';
        ctx.fillRect(-r * 0.42, -r * 0.78, r * 0.84, 2);
        break;
      }

      case 'enforcer': {
        // Heavy armored tank hull + twin armored treads + glowing orange railgun barrel
        ctx.fillStyle = 'rgba(255, 135, 68, 0.16)';
        ctx.strokeStyle = 'rgba(255, 148, 76, 0.72)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(-r * 1.02, -r * 0.92, r * 2.04, r * 1.72, 3);
        ctx.fill();
        ctx.stroke();

        // Twin heavy treads along base
        ctx.fillStyle = '#536278';
        ctx.fillRect(-r * 1.05, r * 0.65, r * 0.78, 3.2);
        ctx.fillRect(r * 0.27, r * 0.65, r * 0.78, 3.2);

        // Legendary orange cannon barrel jutting in facing direction
        ctx.strokeStyle = '#ffab36';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(face.x * r * 0.55, face.y * r * 0.55);
        ctx.lineTo(face.x * (r + 5), face.y * (r + 5));
        ctx.stroke();
        break;
      }

      case 'drone': {
        // Sleek diamond hull + 4 rotating corner rotor arcs
        ctx.fillStyle = 'rgba(110, 212, 255, 0.14)';
        ctx.strokeStyle = 'rgba(136, 212, 255, 0.68)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95);
        ctx.lineTo(r * 0.95, 0);
        ctx.lineTo(0, r * 0.95);
        ctx.lineTo(-r * 0.95, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Spinning micro-rotor ticks at the 4 diagonal corners
        const spin = (nowMs / 85) % (Math.PI * 2);
        const corners = [
          [-r * 0.8, -r * 0.8],
          [r * 0.8, -r * 0.8],
          [r * 0.8, r * 0.8],
          [-r * 0.8, r * 0.8],
        ];
        ctx.strokeStyle = 'rgba(148, 236, 255, 0.75)';
        ctx.lineWidth = 1.3;
        for (const [rx, ry] of corners) {
          const dx = Math.cos(spin) * 3;
          const dy = Math.sin(spin) * 3;
          ctx.beginPath();
          ctx.moveTo(rx - dx, ry - dy);
          ctx.lineTo(rx + dx, ry + dy);
          ctx.stroke();
        }
        break;
      }

      case 'hacker': {
        // Sleek hooded cyber frame + twin blinking magenta signal antennae
        ctx.fillStyle = 'rgba(229, 122, 255, 0.13)';
        ctx.strokeStyle = 'rgba(229, 122, 255, 0.62)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.9, -r * 0.25);
        ctx.lineTo(r * 0.75, r * 0.85);
        ctx.lineTo(-r * 0.75, r * 0.85);
        ctx.lineTo(-r * 0.9, -r * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Twin antennae
        ctx.strokeStyle = '#f19cff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.42, -r * 0.7);
        ctx.lineTo(-r * 0.78, -r * 1.18);
        ctx.moveTo(r * 0.42, -r * 0.7);
        ctx.lineTo(r * 0.78, -r * 1.18);
        ctx.stroke();

        // Blinking signal tip
        if (Math.sin(nowMs / 210) > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-r * 0.78 - 1, -r * 1.18 - 1, 2, 2);
          ctx.fillRect(r * 0.78 - 1, -r * 1.18 - 1, 2, 2);
        }
        break;
      }

      case 'sentry': {
        // Heavy bolted tripod turret base + rotating directional gun barrel + laser emitter dot!
        ctx.fillStyle = 'rgba(255, 209, 71, 0.13)';
        ctx.strokeStyle = 'rgba(255, 209, 71, 0.68)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tripod stabilizer legs
        ctx.strokeStyle = '#738299';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, r * 0.55);
        ctx.lineTo(-r * 1.0, r * 0.95);
        ctx.moveTo(r * 0.55, r * 0.55);
        ctx.lineTo(r * 1.0, r * 0.95);
        ctx.stroke();

        // Rotating barrel pointing along unit.facing!
        const bx = face.x * (r + 5.5);
        const by = face.y * (r + 5.5);
        ctx.strokeStyle = '#ffd147';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(face.x * r * 0.45, face.y * r * 0.45);
        ctx.lineTo(bx, by);
        ctx.stroke();

        // Laser-sight red dot at muzzle tip
        ctx.fillStyle = '#ff4b5c';
        ctx.beginPath();
        ctx.arc(bx, by, 1.9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Diegetic animated status effects rendered directly onto units:
   * - Stunned: orbiting electric yellow/cyan halo + twin stars + intermittent short-circuit spark
   * - Overheated: rising translucent amber heat-shimmer waves
   * - Redline: pulsing crimson danger ring + crackling live discharge mini-arcs
   * - Virus: periodic toxic-green cyberpunk glitch scanlines tearing across unit
   */
  private drawUnitStatusAuraFx(
    ctx: CanvasRenderingContext2D,
    unit: UnitView,
    rect: { x: number; y: number; size: number },
    nowMs: number,
  ): void {
    const { x, y, size } = rect;
    const cx = x + size / 2;
    const cy = y + size / 2;

    ctx.save();

    // 1. Stunned: orbiting stun halo above head + crackling chassis micro-arc
    if (unit.statuses.includes('stunned')) {
      const hy = y + size * 0.16;
      const rx = size * 0.26;
      const ry = size * 0.085;
      const rot = nowMs / 240;

      ctx.strokeStyle = 'rgba(252, 238, 10, 0.58)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(cx, hy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Two orbiting bright stun sparks
      for (let i = 0; i < 2; i++) {
        const a = rot + i * Math.PI;
        const sx = cx + Math.cos(a) * rx;
        const sy = hy + Math.sin(a) * ry;
        ctx.fillStyle = i === 0 ? '#fcee0a' : '#00f0ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Occasional short-circuit zap across body
      if (Math.sin(nowMs / 160 + unit.x * 3) > 0.62) {
        ctx.strokeStyle = '#6cf6ff';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.2, cy - size * 0.08);
        ctx.lineTo(cx, cy + size * 0.04);
        ctx.lineTo(cx + size * 0.18, cy - size * 0.04);
        ctx.stroke();
      }
    }

    // 2. Overheated (41~79): gentle rising warm-amber heat shimmer ripples
    if (unit.statuses.includes('overheated')) {
      ctx.strokeStyle = 'rgba(255, 148, 54, 0.45)';
      ctx.lineWidth = 1.15;
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const p = (nowMs / 1200 + i * 0.5 + unit.x * 0.13) % 1;
        const alpha = Math.sin(p * Math.PI) * 0.52;
        const wx = cx + (i === 0 ? -size * 0.18 : size * 0.18);
        const wy = y + size * (0.48 - p * 0.42);
        const sway = Math.sin(p * Math.PI * 3) * 2.4;
        ctx.strokeStyle = `rgba(255, 152, 58, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(wx, wy + 5);
        ctx.quadraticCurveTo(wx + sway, wy, wx - sway * 0.5, wy - 5);
        ctx.stroke();
      }
    }

    // 3. Redline (80~99): pulsing crimson danger ring + snapping cyan discharge arcs!
    if (unit.statuses.includes('redline')) {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs / 130);
      ctx.strokeStyle = `rgba(255, 23, 68, ${(0.45 + pulse * 0.45).toFixed(2)})`;
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, size * (0.42 + pulse * 0.05), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Snapping live cyan discharge arc around rim
      const arcAngle = ((nowMs / 190) % 6.28);
      const ax1 = cx + Math.cos(arcAngle) * size * 0.25;
      const ay1 = cy + Math.sin(arcAngle) * size * 0.25;
      const ax2 = cx + Math.cos(arcAngle + 0.4) * size * 0.5;
      const ay2 = cy + Math.sin(arcAngle + 0.4) * size * 0.5;
      ctx.strokeStyle = '#5ef2ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax1, ay1);
      ctx.lineTo((ax1 + ax2) / 2 + Math.sin(nowMs / 35) * 4, (ay1 + ay2) / 2 - 3);
      ctx.lineTo(ax2, ay2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Virus: periodic toxic-green cyberpunk glitch scanlines across unit
    if (unit.statuses.includes('virus')) {
      const cycle = (nowMs / 900 + unit.x * 0.3) % 1;
      if (cycle < 0.35) {
        const gY1 = y + size * (0.24 + cycle * 1.1);
        const gY2 = y + size * (0.68 - cycle * 0.8);
        ctx.fillStyle = 'rgba(125, 255, 107, 0.55)';
        ctx.fillRect(x + size * 0.14, gY1, size * 0.56, 1.8);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.45)';
        ctx.fillRect(x + size * 0.3, gY2, size * 0.48, 1.4);
      }
    }

    ctx.restore();
  }

  private drawUnitBadges(
    ctx: CanvasRenderingContext2D,
    unit: UnitView,
    rect: { x: number; y: number; size: number },
    nowMs: number,
  ): void {
    const badges: Array<{ code: string; fg: string; bg: string; pulse?: boolean }> = [];

    for (const status of unit.statuses) {
      const spec = STATUS_BADGES[status];
      badges.push({
        code: spec.code,
        fg: spec.color,
        bg: spec.bg,
        pulse: status === 'redline',
      });
      if (badges.length >= 2) break;
    }

    if (badges.length < 2 && unit.rarity === 'legendary') {
      badges.push({
        code: '★',
        fg: '#100c05',
        bg: '#ffab36',
      });
    }

    if (badges[0]) {
      this.drawCornerBadge(ctx, rect.x + rect.size - 1, rect.y + 1, 'tr', badges[0], rect.size, nowMs);
    }
    if (badges[1]) {
      this.drawCornerBadge(ctx, rect.x + 1, rect.y + rect.size - 5, 'bl', badges[1], rect.size, nowMs);
    }
  }

  private drawPropBadges(
    ctx: CanvasRenderingContext2D,
    prop: PropView,
    rect: { x: number; y: number; size: number },
  ): void {
    const badges: Array<{ code: string; fg: string; bg: string }> = [];
    if (prop.rarity === 'legendary') {
      badges.push({ code: '★', fg: '#100c05', bg: '#ffab36' });
    }
    if (prop.virus) {
      const spec = STATUS_BADGES.virus;
      badges.push({ code: spec.code, fg: spec.color, bg: spec.bg });
    }
    if (badges[0]) {
      this.drawCornerBadge(ctx, rect.x + rect.size - 1, rect.y + 1, 'tr', badges[0], rect.size, 0);
    }
    if (badges[1]) {
      this.drawCornerBadge(ctx, rect.x + 1, rect.y + rect.size - 2, 'bl', badges[1], rect.size, 0);
    }
  }

  private drawCornerBadge(
    ctx: CanvasRenderingContext2D,
    anchorX: number,
    anchorY: number,
    pos: 'tr' | 'bl',
    badge: { code: string; fg: string; bg: string; pulse?: boolean },
    tileSize: number,
    nowMs: number,
  ): void {
    const size = Math.min(16, Math.max(11, Math.round(tileSize * 0.25)));
    const bx = pos === 'tr' ? anchorX - size : anchorX;
    const by = pos === 'tr' ? anchorY : anchorY - size;

    ctx.save();
    if (badge.pulse) {
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(nowMs / 130);
    }
    ctx.fillStyle = badge.bg;
    ctx.beginPath();
    ctx.roundRect(bx, by, size, size, 2.5);
    ctx.fill();

    ctx.fillStyle = badge.fg;
    ctx.font = `700 ${Math.max(8, Math.round(size * 0.78))}px ${MONO_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge.code, bx + size / 2, by + size / 2 + 0.5);
    ctx.restore();
  }

  private drawRoomLabels(
    ctx: CanvasRenderingContext2D,
    snapshot: RenderSnapshot,
    camera: ViewportCamera,
  ): void {
    ctx.save();
    const fontSize = Math.min(12.5, Math.max(9.5, Math.round(camera.tilePixelSize * 0.22)));
    ctx.font = `600 ${fontSize}px ${MONO_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const room of snapshot.rooms) {
      const topLeft = camera.tileToScreenRect(room.x, room.y);
      const label =
        room.state === 'unexplored'
          ? `${room.code} · 未破门`
          : `${room.code} · ${room.name}`;
      const tw = ctx.measureText(label).width;
      const pillX = topLeft.x + 6;
      const pillH = fontSize + 6;
      const pillY = topLeft.y + (topLeft.size - pillH) / 2;
      const pillW = tw + 10;

      ctx.fillStyle = 'rgba(10, 14, 21, 0.92)';
      ctx.strokeStyle =
        room.state === 'current'
          ? 'rgba(91, 228, 255, 0.5)'
          : room.state === 'elevator'
            ? 'rgba(71, 245, 157, 0.5)'
            : 'rgba(60, 76, 102, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle =
        room.state === 'current'
          ? '#8ce8ff'
          : room.state === 'elevator'
            ? '#64f8ad'
            : room.state === 'unexplored'
              ? '#7889a3'
              : '#9fb4d1';
      ctx.fillText(label, pillX + 5, pillY + pillH / 2 + 0.5);
    }
    ctx.restore();
  }
}
