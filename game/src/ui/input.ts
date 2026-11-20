import type { ViewportCamera } from '../render/camera.ts';
import type { Vec2 } from '../render/viewModel.ts';

export interface InputHandlers {
  onHoverTile: (tile: Vec2 | null) => void;
  onLeftClickTile: (tile: Vec2) => void;
  onRightCancel: () => void;
  onSelectActionHotkey: (hotkey: string) => void;
  onToggleHackDirection: (cw: boolean) => void;
  onEndTurnKey: () => void;
  onRecenterCamera: () => void;
  onToggleLegend: () => void;
  onToggleStyle: () => void;
  onEscape: () => void;
  isHackModeActive: () => boolean;
}

export class BoardInputController {
  private canvas: HTMLCanvasElement;
  private camera: ViewportCamera;
  private handlers: InputHandlers;

  private isPanning = false;
  private didDrag = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private lastHoverKey = '';

  constructor(canvas: HTMLCanvasElement, camera: ViewportCamera, handlers: InputHandlers) {
    this.canvas = canvas;
    this.camera = camera;
    this.handlers = handlers;

    this.bindMouse();
    this.bindKeyboard();
  }

  private bindMouse(): void {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.button === 1) {
        this.isPanning = true;
        this.didDrag = false;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
        e.preventDefault();
      } else if (e.button === 0) {
        const tile = this.eventToTile(e);
        this.handlers.onLeftClickTile(tile);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        if (Math.hypot(dx, dy) > 2) this.didDrag = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.camera.panByScreenDelta(dx, dy);
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        if (this.lastHoverKey !== '') {
          this.lastHoverKey = '';
          this.handlers.onHoverTile(null);
        }
        return;
      }

      const tile = this.eventToTile(e);
      const key = `${tile.x},${tile.y}`;
      if (key !== this.lastHoverKey) {
        this.lastHoverKey = key;
        this.handlers.onHoverTile(tile);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isPanning) return;
      const wasRight = e.button === 2;
      const wasDrag = this.didDrag;
      this.isPanning = false;
      this.didDrag = false;
      this.canvas.style.cursor = 'crosshair';
      if (wasRight && !wasDrag) {
        this.handlers.onRightCancel();
      }
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.91;
        this.camera.zoomAtScreenPoint(factor, sx, sy);
      },
      { passive: false },
    );
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        this.handlers.onToggleLegend();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.handlers.onEscape();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.handlers.onRecenterCamera();
        return;
      }

      if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        this.handlers.onSelectActionHotkey(e.key);
        return;
      }

      const lower = e.key.toLowerCase();
      if (lower === 'v') {
        e.preventDefault();
        this.handlers.onToggleStyle();
        return;
      }
      if (lower === 'q' && this.handlers.isHackModeActive()) {
        e.preventDefault();
        this.handlers.onToggleHackDirection(false);
        return;
      }
      if (lower === 'e') {
        e.preventDefault();
        if (this.handlers.isHackModeActive()) {
          this.handlers.onToggleHackDirection(true);
        } else {
          this.handlers.onEndTurnKey();
        }
        return;
      }
    });
  }

  private eventToTile(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
  }
}
