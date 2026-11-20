import { describe, expect, it } from 'vitest';
import { ViewportCamera } from '../src/render/camera.ts';
import {
  applyEventToSnapshot,
  buildDemoEvents,
  computeMockPreview,
  createMockSnapshot,
  getTile,
} from '../src/render/mockScene.ts';
import { RenderSequencer } from '../src/render/sequencer.ts';

describe('RenderSnapshot & Mock Scene invariants', () => {
  it('contains all 5 enemy archetypes, 4 exclusive surfaces, elevator, fog rooms, and non-overlapping units', () => {
    const snap = createMockSnapshot();

    expect(snap.width).toBe(31);
    expect(snap.height).toBe(17);
    expect(snap.tiles.length).toBe(snap.width * snap.height);

    // All 5 enemy types present
    const unitKinds = new Set(snap.units.map((u) => u.kind));
    expect(unitKinds.has('player')).toBe(true);
    expect(unitKinds.has('grunt')).toBe(true);
    expect(unitKinds.has('enforcer')).toBe(true);
    expect(unitKinds.has('drone')).toBe(true);
    expect(unitKinds.has('hacker')).toBe(true);
    expect(unitKinds.has('sentry')).toBe(true);

    // All 4 primary surfaces present
    const surfaces = new Set(snap.tiles.map((t) => t.surface));
    expect(surfaces.has('water')).toBe(true);
    expect(surfaces.has('ice')).toBe(true);
    expect(surfaces.has('oil')).toBe(true);
    expect(surfaces.has('fire')).toBe(true);

    // Closed doors, elevator, and unexplored fog tiles exist
    expect(snap.tiles.some((t) => t.kind === 'elevator' && t.revealed)).toBe(true);
    expect(snap.tiles.some((t) => t.kind === 'door_closed' && t.revealed)).toBe(true);
    expect(snap.tiles.some((t) => t.kind === 'floor' && !t.revealed)).toBe(true);

    // Zero overlapping units
    const posKeys = snap.units.map((u) => `${u.x},${u.y}`);
    expect(new Set(posKeys).size).toBe(posKeys.length);
  });

  it('produces accurate Dry-Run previews for ice slide, conductive bridge, ray block, sever, and hack 90deg', () => {
    const snap = createMockSnapshot();

    // Ice slide into cooling pipe
    const slidePreview = computeMockPreview(snap, 'power_fist', { x: 14, y: 3 }, false);
    expect(slidePreview?.valid).toBe(true);
    expect(slidePreview?.slidePath?.length).toBe(4);
    expect(slidePreview?.impactTile).toEqual({ x: 18, y: 3 });
    expect(slidePreview?.dropIntegrityPct).toBe(50);

    // Precision sever on legendary enforcer
    const severPreview = computeMockPreview(snap, 'hf_blade', { x: 16, y: 1 }, false);
    expect(severPreview?.valid).toBe(true);
    expect(severPreview?.dropIntegrityPct).toBe(90);

    // Electro network on right water pool hits both drone & hacker
    const electroPreview = computeMockPreview(snap, 'shock_baton', { x: 15, y: 5 }, false);
    expect(electroPreview?.valid).toBe(true);
    expect(electroPreview?.electroAffectedUnitIds).toContain('enemy-drone');
    expect(electroPreview?.electroAffectedUnitIds).toContain('enemy-hacker');

    // Throw cargo pod on dry gap (14,5) bridges both water pools into a 10-tile conductive network
    const bridgePreview = computeMockPreview(snap, 'throw_pod', { x: 14, y: 5 }, false);
    expect(bridgePreview?.valid).toBe(true);
    expect((bridgePreview?.electroTiles?.length ?? 0) >= 9).toBe(true);

    // Throw cargo pod at (14,1) intercepts Enforcer's West line intent protecting legendary loot at (13,1)
    const blockPreview = computeMockPreview(snap, 'throw_pod', { x: 14, y: 1 }, false);
    expect(blockPreview?.valid).toBe(true);
    expect(blockPreview?.blockedIntentId).toBe('intent-enforcer');
    expect(blockPreview?.blockedTiles).toEqual([{ x: 13, y: 1 }]);

    // Hack CCW 90deg swings Sentry (18,6) from North to West toward Hacker
    const hackPreview = computeMockPreview(snap, 'data_spike', { x: 18, y: 6 }, false);
    expect(hackPreview?.valid).toBe(true);
    expect(hackPreview?.rotatedIntent?.direction).toBe('W');
    expect(hackPreview?.rotatedIntent?.affectedTiles.some((t) => t.x === 16 && t.y === 6)).toBe(true);
  });
});

describe('ViewportCamera & RenderSequencer', () => {
  it('round-trips screen and world coordinates accurately', () => {
    const cam = new ViewportCamera();
    cam.setViewport(1000, 700);
    cam.centerOnTile(15, 4, true);

    const screen = cam.worldToScreen(15.5, 4.5);
    expect(screen.x).toBeCloseTo(500, 3);
    expect(screen.y).toBeCloseTo(350, 3);

    const tile = cam.screenToTile(screen.x, screen.y);
    expect(tile).toEqual({ x: 15, y: 4 });
  });

  it('plays and cleanly skips emergence demos while mutating snapshot state', () => {
    const snap = createMockSnapshot();
    let completed = false;
    const seq = new RenderSequencer(
      (ev) => applyEventToSnapshot(snap, ev),
      () => {
        completed = true;
      },
    );

    seq.enqueue(buildDemoEvents('ice_slide', snap));
    expect(seq.isPlaying).toBe(true);

    // Skip immediately should finish all events and freeze tiles around cooling pipe
    seq.skipAll();
    expect(seq.isPlaying).toBe(false);
    expect(completed).toBe(true);

    const grunt = snap.units.find((u) => u.id === 'enemy-grunt')!;
    expect(grunt.x).toBe(17);
    expect(grunt.y).toBe(3);
    expect(getTile(snap, 18, 4)?.surface).toBe('ice');
  });

  it('stacks simultaneous floating damage/status texts without overlap and preserves readable lifetime', () => {
    const snap = createMockSnapshot();
    const seq = new RenderSequencer((ev) => applyEventToSnapshot(snap, ev));

    seq.enqueue([
      { type: 'float_text', pos: { x: 15, y: 5 }, text: '-3 义眼增伤', tone: 'electro', durationMs: 0 },
      { type: 'float_text', pos: { x: 15, y: 5 }, text: '⚡ STUN 眩晕', tone: 'stun', durationMs: 120 },
    ]);

    const fx = seq.getVisualState();
    expect(fx.floatTexts.length).toBe(2);
    // Vertical positions must be clearly separated so texts never overlap
    expect(Math.abs(fx.floatTexts[0].y - fx.floatTexts[1].y)).toBeGreaterThanOrEqual(0.5);
    // Lifetime must be generously readable (>= 2000ms)
    expect(fx.floatTexts[0].lifetimeMs).toBeGreaterThanOrEqual(2000);
    expect(fx.floatTexts[1].lifetimeMs).toBeGreaterThanOrEqual(2000);
  });
});
