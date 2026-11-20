import type { Vec2 } from './viewModel.ts';

/**
 * 54px base tile size (~60-66px focused in combat room = ~120-132px on Retina 2x)
 * gives characters ~3x more pixel area so concrete cybernetic details read crisply!
 */
export const BASE_TILE_SIZE = 54;
export const MIN_ZOOM = 0.42;
export const MAX_ZOOM = 1.8;

export class ViewportCamera {
  /** Center of camera in world tile coordinates (fractional) */
  x = 0;
  y = 0;
  zoom = 1.12;

  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1.12;

  private viewportW = 800;
  private viewportH = 600;

  setViewport(width: number, height: number): void {
    this.viewportW = Math.max(1, width);
    this.viewportH = Math.max(1, height);
  }

  get tilePixelSize(): number {
    return BASE_TILE_SIZE * this.zoom;
  }

  centerOnTile(tx: number, ty: number, instant = false): void {
    this.targetX = tx + 0.5;
    this.targetY = ty + 0.5;
    if (instant) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  focusArea(
    x: number,
    y: number,
    w: number,
    h: number,
    instant = false,
    paddingTiles = 1.1,
  ): void {
    this.targetX = x + w / 2;
    this.targetY = y + h / 2;
    const fitZoomX = this.viewportW / ((w + paddingTiles) * BASE_TILE_SIZE);
    const fitZoomY = this.viewportH / ((h + paddingTiles) * BASE_TILE_SIZE);
    const best = Math.min(fitZoomX, fitZoomY, 1.32);
    this.targetZoom = clamp(best, 0.72, 1.32);
    if (instant) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.zoom = this.targetZoom;
    }
  }

  panByScreenDelta(dx: number, dy: number): void {
    const scale = this.tilePixelSize;
    this.x -= dx / scale;
    this.y -= dy / scale;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  zoomAtScreenPoint(deltaScale: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    const nextZoom = clamp(this.targetZoom * deltaScale, MIN_ZOOM, MAX_ZOOM);
    this.zoom = nextZoom;
    this.targetZoom = nextZoom;

    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  update(dtSec: number): void {
    const ease = 1 - Math.exp(-11 * Math.min(dtSec, 0.05));
    this.x += (this.targetX - this.x) * ease;
    this.y += (this.targetY - this.y) * ease;
    this.zoom += (this.targetZoom - this.zoom) * ease;

    if (Math.abs(this.targetX - this.x) < 0.001) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 0.001) this.y = this.targetY;
    if (Math.abs(this.targetZoom - this.zoom) < 0.0005) this.zoom = this.targetZoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const tilePx = this.tilePixelSize;
    return {
      x: this.viewportW / 2 + (wx - this.x) * tilePx,
      y: this.viewportH / 2 + (wy - this.y) * tilePx,
    };
  }

  tileToScreenRect(tx: number, ty: number): { x: number; y: number; size: number } {
    const topLeft = this.worldToScreen(tx, ty);
    return {
      x: topLeft.x,
      y: topLeft.y,
      size: this.tilePixelSize,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const tilePx = this.tilePixelSize;
    return {
      x: this.x + (sx - this.viewportW / 2) / tilePx,
      y: this.y + (sy - this.viewportH / 2) / tilePx,
    };
  }

  screenToTile(sx: number, sy: number): Vec2 {
    const w = this.screenToWorld(sx, sy);
    return {
      x: Math.floor(w.x),
      y: Math.floor(w.y),
    };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
