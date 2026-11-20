import type { FloatTextTone, RenderEvent, Vec2 } from './viewModel.ts';

export interface ActiveFloatText {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: FloatTextTone;
  /** Negative elapsedMs represents staggered pop-in delay */
  elapsedMs: number;
  lifetimeMs: number;
}

export interface ActiveArcFx {
  segments: Array<{ from: Vec2; to: Vec2 }>;
  tiles: Vec2[];
  elapsedMs: number;
  durationMs: number;
}

export interface ActiveImpactFx {
  pos: Vec2;
  label?: string;
  tone: FloatTextTone;
  elapsedMs: number;
  durationMs: number;
}

export interface ActiveRayFx {
  from: Vec2;
  to: Vec2;
  tiles: Vec2[];
  tone: FloatTextTone;
  elapsedMs: number;
  durationMs: number;
}

export interface ActiveSlashFx {
  pos: Vec2;
  tone: FloatTextTone;
  elapsedMs: number;
  durationMs: number;
}

export interface ActiveHackPulseFx {
  pos: Vec2;
  elapsedMs: number;
  durationMs: number;
}

export interface UnitHitFlash {
  elapsedMs: number;
  durationMs: number;
}

export interface SequencerVisualState {
  isPlaying: boolean;
  highlightedUnitId: string | null;
  highlightedLabel: string | null;
  unitPositionOverrides: Map<string, { x: number; y: number }>;
  unitHitFlashes: Map<string, UnitHitFlash>;
  propBounceTimers: Map<string, { elapsedMs: number; durationMs: number }>;
  floatTexts: ActiveFloatText[];
  arcs: ActiveArcFx[];
  impacts: ActiveImpactFx[];
  rays: ActiveRayFx[];
  slashes: ActiveSlashFx[];
  hackPulses: ActiveHackPulseFx[];
  shakeX: number;
  shakeY: number;
}

export type ApplyEventCallback = (event: RenderEvent) => void;

export interface SequencerFxHooks {
  getUnitPos: (unitId: string) => Vec2 | null;
  onBurst: (pos: Vec2, tone: FloatTextTone, count?: number) => void;
  onSlideStep: (unitId: string, x: number, y: number) => void;
}

export class RenderSequencer {
  private queue: RenderEvent[] = [];
  private activeEvent: RenderEvent | null = null;
  private activeElapsedMs = 0;
  private slideEmitAccumMs = 0;

  private floatTexts: ActiveFloatText[] = [];
  private arcs: ActiveArcFx[] = [];
  private impacts: ActiveImpactFx[] = [];
  private rays: ActiveRayFx[] = [];
  private slashes: ActiveSlashFx[] = [];
  private hackPulses: ActiveHackPulseFx[] = [];
  private unitOverrides = new Map<string, { x: number; y: number }>();
  private unitHitFlashes = new Map<string, UnitHitFlash>();
  private propBounceTimers = new Map<string, { elapsedMs: number; durationMs: number }>();
  private lungeOrigin: Vec2 | null = null;

  private highlightedUnitId: string | null = null;
  private highlightedLabel: string | null = null;

  private shakeTimerMs = 0;
  private shakeIntensity = 0;
  private nextFloatId = 1;

  private onApply: ApplyEventCallback;
  private onComplete?: () => void;
  private fxHooks?: SequencerFxHooks;

  constructor(
    onApply: ApplyEventCallback,
    onComplete?: () => void,
    fxHooks?: SequencerFxHooks,
  ) {
    this.onApply = onApply;
    this.onComplete = onComplete;
    this.fxHooks = fxHooks;
  }

  get isPlaying(): boolean {
    return this.activeEvent !== null || this.queue.length > 0;
  }

  enqueue(events: RenderEvent[]): void {
    this.queue.push(...events);
    if (!this.activeEvent) {
      this.advance();
    }
  }

  clear(): void {
    this.queue = [];
    this.activeEvent = null;
    this.activeElapsedMs = 0;
    this.slideEmitAccumMs = 0;
    this.lungeOrigin = null;
    this.unitOverrides.clear();
    this.unitHitFlashes.clear();
    this.propBounceTimers.clear();
    this.highlightedUnitId = null;
    this.highlightedLabel = null;
    this.arcs = [];
    this.impacts = [];
    this.rays = [];
    this.slashes = [];
    this.hackPulses = [];
    this.floatTexts = [];
    this.shakeTimerMs = 0;
    this.shakeIntensity = 0;
  }

  skipAll(): void {
    if (this.activeEvent) {
      this.finishActiveEvent();
    }
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.startEvent(next, true);
      this.finishActiveEvent();
    }
    this.highlightedUnitId = null;
    this.highlightedLabel = null;
    this.unitOverrides.clear();
    this.onComplete?.();
  }

  update(dtMs: number): void {
    const clamped = Math.min(dtMs, 50);

    // Update lingering transient FX
    this.floatTexts = this.floatTexts.filter((ft) => {
      ft.elapsedMs += clamped;
      return ft.elapsedMs < ft.lifetimeMs;
    });
    this.arcs = this.arcs.filter((fx) => {
      fx.elapsedMs += clamped;
      return fx.elapsedMs < fx.durationMs;
    });
    this.impacts = this.impacts.filter((fx) => {
      fx.elapsedMs += clamped;
      return fx.elapsedMs < fx.durationMs;
    });
    this.rays = this.rays.filter((fx) => {
      fx.elapsedMs += clamped;
      return fx.elapsedMs < fx.durationMs;
    });
    this.slashes = this.slashes.filter((fx) => {
      fx.elapsedMs += clamped;
      return fx.elapsedMs < fx.durationMs;
    });
    this.hackPulses = this.hackPulses.filter((fx) => {
      fx.elapsedMs += clamped;
      return fx.elapsedMs < fx.durationMs;
    });

    for (const [uid, flash] of this.unitHitFlashes) {
      flash.elapsedMs += clamped;
      if (flash.elapsedMs >= flash.durationMs) {
        this.unitHitFlashes.delete(uid);
      }
    }

    for (const [pid, bounce] of this.propBounceTimers) {
      bounce.elapsedMs += clamped;
      if (bounce.elapsedMs >= bounce.durationMs) {
        this.propBounceTimers.delete(pid);
      }
    }

    if (this.shakeTimerMs > 0) {
      this.shakeTimerMs = Math.max(0, this.shakeTimerMs - clamped);
    }

    if (!this.activeEvent) return;

    this.activeElapsedMs += clamped;

    // Continuous interpolation for slide events + afterimage emission
    if (this.activeEvent.type === 'slide') {
      const { unitId, path, durationMs } = this.activeEvent;
      if (path.length >= 2) {
        const t = Math.min(1, this.activeElapsedMs / Math.max(1, durationMs));
        const eased = 1 - Math.pow(1 - t, 2.2);
        const segTotal = path.length - 1;
        const scaled = eased * segTotal;
        const segIdx = Math.min(segTotal - 1, Math.floor(scaled));
        const localT = scaled - segIdx;
        const a = path[segIdx];
        const b = path[segIdx + 1];
        const cx = a.x + (b.x - a.x) * localT;
        const cy = a.y + (b.y - a.y) * localT;
        this.unitOverrides.set(unitId, { x: cx, y: cy });

        this.slideEmitAccumMs += clamped;
        if (this.slideEmitAccumMs >= 55) {
          this.slideEmitAccumMs = 0;
          this.fxHooks?.onSlideStep(unitId, cx, cy);
        }
      }
    } else if (this.activeEvent.type === 'lunge' && this.lungeOrigin) {
      const { unitId, toward, durationMs } = this.activeEvent;
      const t = Math.min(1, this.activeElapsedMs / Math.max(1, durationMs));
      // Fast snap forward (0..0.38), smooth spring-back (0.38..1)
      const amt = t < 0.38 ? Math.sin((t / 0.38) * (Math.PI / 2)) : Math.cos(((t - 0.38) / 0.62) * (Math.PI / 2));
      const dx = toward.x - this.lungeOrigin.x;
      const dy = toward.y - this.lungeOrigin.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const dist = 0.34 * Math.max(0, amt);
      this.unitOverrides.set(unitId, {
        x: this.lungeOrigin.x + (dx / len) * dist,
        y: this.lungeOrigin.y + (dy / len) * dist,
      });
    }

    if (this.activeElapsedMs >= this.activeEvent.durationMs) {
      this.finishActiveEvent();
      this.advance();
    }
  }

  getVisualState(): SequencerVisualState {
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimerMs > 0) {
      const mag = this.shakeIntensity * (this.shakeTimerMs / 210);
      shakeX = (Math.random() - 0.5) * 2 * mag;
      shakeY = (Math.random() - 0.5) * 2 * mag;
    }

    return {
      isPlaying: this.isPlaying,
      highlightedUnitId: this.highlightedUnitId,
      highlightedLabel: this.highlightedLabel,
      unitPositionOverrides: this.unitOverrides,
      unitHitFlashes: this.unitHitFlashes,
      propBounceTimers: this.propBounceTimers,
      floatTexts: this.floatTexts,
      arcs: this.arcs,
      impacts: this.impacts,
      rays: this.rays,
      slashes: this.slashes,
      hackPulses: this.hackPulses,
      shakeX,
      shakeY,
    };
  }

  private advance(): void {
    const next = this.queue.shift();
    if (!next) {
      this.activeEvent = null;
      this.highlightedUnitId = null;
      this.highlightedLabel = null;
      this.onComplete?.();
      return;
    }
    this.startEvent(next, false);
    if (next.durationMs <= 0) {
      this.finishActiveEvent();
      this.advance();
    }
  }

  private startEvent(event: RenderEvent, fastForward: boolean): void {
    this.activeEvent = event;
    this.activeElapsedMs = 0;

    switch (event.type) {
      case 'highlight_actor': {
        this.highlightedUnitId = event.unitId;
        this.highlightedLabel = event.label;
        break;
      }
      case 'lunge': {
        if (!fastForward) {
          this.lungeOrigin = this.fxHooks?.getUnitPos(event.unitId) ?? null;
        }
        break;
      }
      case 'slide': {
        this.slideEmitAccumMs = 0;
        if (!fastForward && event.path.length > 0) {
          this.unitOverrides.set(event.unitId, { ...event.path[0] });
        }
        break;
      }
      case 'slash_arc': {
        if (!fastForward) {
          this.slashes.push({
            pos: event.pos,
            tone: event.tone,
            elapsedMs: 0,
            durationMs: Math.max(460, event.durationMs + 220),
          });
          this.fxHooks?.onBurst(event.pos, event.tone, 14);
          this.shakeTimerMs = 170;
          this.shakeIntensity = 4.2;
        }
        break;
      }
      case 'hack_pulse': {
        if (!fastForward) {
          this.hackPulses.push({
            pos: event.pos,
            elapsedMs: 0,
            durationMs: Math.max(680, event.durationMs + 380),
          });
          this.fxHooks?.onBurst(event.pos, 'hack', 12);
        }
        break;
      }
      case 'impact': {
        if (!fastForward) {
          const tone = event.burstTone ?? 'overheat';
          this.impacts.push({
            pos: event.pos,
            label: event.label,
            tone,
            elapsedMs: 0,
            durationMs: Math.max(560, event.durationMs + 300),
          });
          if (event.hitUnitId) {
            this.unitHitFlashes.set(event.hitUnitId, { elapsedMs: 0, durationMs: 220 });
          }
          this.fxHooks?.onBurst(event.pos, tone, event.intensity && event.intensity >= 5 ? 20 : 12);
          this.shakeTimerMs = 210;
          this.shakeIntensity = event.intensity ?? 4.5;
        }
        break;
      }
      case 'electro_arc': {
        if (!fastForward) {
          this.arcs.push({
            segments: event.segments,
            tiles: event.tiles,
            elapsedMs: 0,
            durationMs: Math.max(820, event.durationMs + 440),
          });
          for (const seg of event.segments.slice(0, 4)) {
            this.fxHooks?.onBurst(seg.to, 'electro', 6);
          }
          this.shakeTimerMs = 170;
          this.shakeIntensity = 3.2;
        }
        break;
      }
      case 'ray_flash': {
        if (!fastForward) {
          this.rays.push({
            from: event.from,
            to: event.to,
            tiles: event.tiles,
            tone: event.tone,
            elapsedMs: 0,
            durationMs: Math.max(620, event.durationMs + 340),
          });
          this.fxHooks?.onBurst(event.to, event.tone, 10);
          this.shakeTimerMs = 160;
          this.shakeIntensity = 3;
        }
        break;
      }
      case 'float_text': {
        this.spawnFloatText(event.pos, event.text, event.tone, fastForward);
        break;
      }
      case 'spawn_prop': {
        this.onApply(event);
        if (!fastForward) {
          this.propBounceTimers.set(event.prop.id, { elapsedMs: 0, durationMs: 420 });
          this.fxHooks?.onBurst(
            { x: event.prop.x, y: event.prop.y },
            event.prop.rarity === 'legendary' ? 'loot' : 'electro',
            12,
          );
        }
        break;
      }
      case 'unit_status': {
        this.onApply(event);
        if (!fastForward && event.hpDelta && event.hpDelta < 0) {
          this.unitHitFlashes.set(event.unitId, { elapsedMs: 0, durationMs: 240 });
        }
        break;
      }
      case 'surface_change':
      case 'intent_update':
      case 'log': {
        this.onApply(event);
        break;
      }
    }
  }

  private spawnFloatText(
    pos: Vec2,
    text: string,
    tone: FloatTextTone,
    fastForward: boolean,
  ): void {
    const baseX = pos.x + 0.5;
    const baseY = pos.y - 0.1;

    let stackSlot = 0;
    const nearby = this.floatTexts.filter(
      (ft) => Math.abs(ft.x - baseX) < 1.9 && ft.elapsedMs < ft.lifetimeMs * 0.72,
    );

    const usedYs = nearby.map((ft) => ft.y);
    while (usedYs.some((uy) => Math.abs(uy - (baseY - stackSlot * 0.65)) < 0.48)) {
      stackSlot++;
    }

    const hasFreshSameSpot = nearby.some((ft) => ft.elapsedMs < 110);
    const delayMs = !fastForward && hasFreshSameSpot ? 120 * Math.min(stackSlot, 2) : 0;

    this.floatTexts.push({
      id: this.nextFloatId++,
      x: baseX,
      y: baseY - stackSlot * 0.65,
      text,
      tone,
      elapsedMs: -delayMs,
      lifetimeMs: fastForward ? 1200 : 2600,
    });
  }

  private finishActiveEvent(): void {
    const event = this.activeEvent;
    if (!event) return;
    if (event.type === 'slide') {
      this.unitOverrides.delete(event.unitId);
      this.onApply(event);
    } else if (event.type === 'lunge') {
      this.unitOverrides.delete(event.unitId);
      this.lungeOrigin = null;
    }
    this.activeEvent = null;
  }
}
