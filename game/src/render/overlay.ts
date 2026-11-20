import type { ViewportCamera } from './camera.ts';
import {
  DIR_ARROWS,
  DIR_VECTORS,
  FLOAT_TONE_COLORS,
  PALETTE,
} from './glyphs.ts';
import type { SequencerVisualState } from './sequencer.ts';
import type {
  IntentView,
  PreviewOverlay,
  RenderSnapshot,
  Vec2,
} from './viewModel.ts';

const MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export interface OverlayRenderOptions {
  snapshot: RenderSnapshot;
  camera: ViewportCamera;
  hoverTile: Vec2 | null;
  focusedEnemyId: string | null;
  preview: PreviewOverlay | null;
  fx: SequencerVisualState;
  nowMs: number;
  viewportW: number;
  viewportH: number;
}

export function renderOverlays(
  ctx: CanvasRenderingContext2D,
  opts: OverlayRenderOptions,
): void {
  const {
    snapshot,
    camera,
    hoverTile,
    focusedEnemyId,
    preview,
    fx,
    nowMs,
    viewportW,
    viewportH,
  } = opts;

  // 1. Optional dim veil when hovering a specific enemy (highlight its intent, dim background)
  const activeFocusId = focusedEnemyId ?? (preview?.hackedIntentId
    ? snapshot.intents.find((i) => i.id === preview.hackedIntentId)?.sourceUnitId ?? null
    : null);

  if (activeFocusId && !fx.isPlaying) {
    renderFocusDimMask(ctx, snapshot, camera, activeFocusId, preview, viewportW, viewportH);
  }

  // 2. Enemy Intent Layer
  for (const intent of snapshot.intents) {
    const isFocused = activeFocusId === intent.sourceUnitId;
    const isDimmed = activeFocusId !== null && !isFocused;
    const isHackedTarget = preview?.hackedIntentId === intent.id;
    const blockedSet =
      preview?.blockedIntentId === intent.id && preview.blockedTiles
        ? new Set(preview.blockedTiles.map(tileKey))
        : null;

    renderIntent(ctx, intent, snapshot, camera, nowMs, {
      focused: isFocused,
      dimmed: isDimmed,
      forceCrossedOut: isHackedTarget,
      blockedSet,
    });
  }

  // 3. Dry-Run Hover Preview Layer (strictly non-obstructive visual geometry on canvas;
  //    detailed multi-line text lives in the docked top preview bar above the board!)
  if (preview && !fx.isPlaying) {
    renderPreviewOverlay(ctx, preview, snapshot, camera, nowMs);
  }

  // 4. Hover tile crisp reticle
  if (hoverTile && !fx.isPlaying) {
    const rect = camera.tileToScreenRect(hoverTile.x, hoverTile.y);
    drawCornerBrackets(
      ctx,
      rect.x + 1,
      rect.y + 1,
      rect.size - 2,
      Math.max(5, rect.size * 0.22),
      PALETTE.cornerBracketHover,
      1.5,
    );
  }

  // 5. Sequencer Transient FX (rays, arcs, impacts, actor beacon, stacked floating text)
  renderSequencerFx(ctx, snapshot, camera, fx, nowMs);
}

function renderFocusDimMask(
  ctx: CanvasRenderingContext2D,
  snapshot: RenderSnapshot,
  camera: ViewportCamera,
  focusedUnitId: string,
  preview: PreviewOverlay | null,
  viewportW: number,
  viewportH: number,
): void {
  const exempt = new Set<string>();
  const unit = snapshot.units.find((u) => u.id === focusedUnitId);
  if (unit) exempt.add(tileKey(unit));

  for (const intent of snapshot.intents) {
    if (intent.sourceUnitId === focusedUnitId) {
      exempt.add(tileKey(intent.origin));
      for (const t of intent.affectedTiles) exempt.add(tileKey(t));
    }
  }
  if (preview?.rotatedIntent) {
    for (const t of preview.rotatedIntent.affectedTiles) exempt.add(tileKey(t));
  }

  ctx.save();
  ctx.fillStyle = PALETTE.dimMask;
  ctx.beginPath();
  ctx.rect(0, 0, viewportW, viewportH);

  // Punch clean holes for exempt tiles using evenodd winding
  for (const key of exempt) {
    const [xs, ys] = key.split(',');
    const rect = camera.tileToScreenRect(Number(xs), Number(ys));
    ctx.rect(rect.x, rect.y, rect.size, rect.size);
  }
  ctx.fill('evenodd');
  ctx.restore();
}

function renderIntent(
  ctx: CanvasRenderingContext2D,
  intent: IntentView,
  snapshot: RenderSnapshot,
  camera: ViewportCamera,
  nowMs: number,
  opts: {
    focused: boolean;
    dimmed: boolean;
    forceCrossedOut: boolean;
    blockedSet: Set<string> | null;
  },
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 240);
  const disabled = Boolean(intent.disabled || opts.forceCrossedOut);
  const alphaScale = opts.dimmed ? 0.34 : 1;

  const lootKeys = new Set(
    snapshot.props.filter((p) => p.kind === 'dropped_part').map((p) => tileKey(p)),
  );

  ctx.save();
  ctx.globalAlpha = alphaScale;

  for (let i = 0; i < intent.affectedTiles.length; i++) {
    const tile = intent.affectedTiles[i];
    const isBlockedCut = opts.blockedSet?.has(tileKey(tile)) ?? false;
    const isDisabledTile = disabled || isBlockedCut;
    const rect = camera.tileToScreenRect(tile.x, tile.y);
    const pad = Math.max(2, rect.size * 0.08);
    const inner = rect.size - pad * 2;
    const threatensLoot = !isDisabledTile && lootKeys.has(tileKey(tile));

    // Tile threat fill
    ctx.fillStyle = isDisabledTile
      ? PALETTE.intentDisabledFill
      : opts.focused
        ? `rgba(255, 68, 86, ${(0.22 + pulse * 0.1).toFixed(3)})`
        : PALETTE.intentFill;
    ctx.fillRect(rect.x + pad, rect.y + pad, inner, inner);

    // Corner red brackets or dashed disabled frame
    if (isDisabledTile) {
      ctx.save();
      ctx.strokeStyle = PALETTE.intentDisabledStroke;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(rect.x + pad + 0.5, rect.y + pad + 0.5, inner - 1, inner - 1);
      ctx.setLineDash([]);
      // Diagonal strike X
      ctx.beginPath();
      ctx.moveTo(rect.x + pad + 4, rect.y + pad + 4);
      ctx.lineTo(rect.x + rect.size - pad - 4, rect.y + rect.size - pad - 4);
      ctx.moveTo(rect.x + rect.size - pad - 4, rect.y + pad + 4);
      ctx.lineTo(rect.x + pad + 4, rect.y + rect.size - pad - 4);
      ctx.stroke();
      ctx.restore();
    } else {
      const strokeColor = threatensLoot ? PALETTE.intentLootWarn : PALETTE.intentStroke;
      const bracketLen = Math.max(5, rect.size * 0.26);
      drawCornerBrackets(
        ctx,
        rect.x + pad,
        rect.y + pad,
        inner,
        bracketLen,
        strokeColor,
        opts.focused ? 2.2 : 1.6,
      );

      if (threatensLoot) {
        ctx.save();
        ctx.strokeStyle = PALETTE.intentLootWarn;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(rect.x + pad + 2.5, rect.y + pad + 2.5, inner - 5, inner - 5);
        ctx.restore();
      }
    }

    // Direction chevron & compact damage pill
    if (!isDisabledTile) {
      ctx.fillStyle = opts.focused ? '#ff8b96' : 'rgba(255, 110, 124, 0.82)';
      ctx.font = `700 ${Math.max(9, Math.round(rect.size * 0.28))}px ${MONO_FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(DIR_ARROWS[intent.direction], rect.x + pad + 2, rect.y + pad + 1);

      if (i === intent.affectedTiles.length - 1 || intent.affectedTiles.length === 1) {
        drawTinyBadge(
          ctx,
          rect.x + rect.size - pad,
          rect.y + rect.size - pad,
          `-${intent.damage}`,
          '#ffffff',
          'rgba(217, 45, 66, 0.92)',
          'br',
          Math.max(8, Math.round(rect.size * 0.22)),
        );
      }
    } else if (i === 0 && (intent.disabledReason || isBlockedCut)) {
      // Keep disabled tag centered INSIDE its own tile so it never collides with neighbors
      drawTinyBadge(
        ctx,
        rect.x + rect.size / 2,
        rect.y + rect.size / 2,
        isBlockedCut ? '挡枪' : '失效',
        '#d7e2f0',
        'rgba(18, 24, 36, 0.92)',
        'cc',
        Math.max(8, Math.round(rect.size * 0.22)),
      );
    }
  }

  // Connecting center dashed line + subtle flowing danger pulse along multi-tile line intents
  if (intent.affectedTiles.length >= 2 && !disabled) {
    const first = camera.tileToScreenRect(intent.origin.x, intent.origin.y);
    const lastTile = intent.affectedTiles[intent.affectedTiles.length - 1];
    const last = camera.tileToScreenRect(lastTile.x, lastTile.y);
    const x1 = first.x + first.size / 2;
    const y1 = first.y + first.size / 2;
    const x2 = last.x + last.size / 2;
    const y2 = last.y + last.size / 2;

    ctx.save();
    ctx.strokeStyle = opts.focused ? 'rgba(255, 92, 108, 0.72)' : 'rgba(255, 75, 92, 0.34)';
    ctx.lineWidth = opts.focused ? 2 : 1.2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -(nowMs / 55) % 16;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Travelling tracer bead showing fire direction intuitively
    const flowT = (nowMs / 1150) % 1;
    const px = x1 + (x2 - x1) * flowT;
    const py = y1 + (y2 - y1) * flowT;
    ctx.fillStyle = opts.focused ? '#ff9da7' : 'rgba(255, 104, 118, 0.85)';
    ctx.shadowColor = '#ff4b5c';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(px, py, opts.focused ? 3.2 : 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function renderPreviewOverlay(
  ctx: CanvasRenderingContext2D,
  preview: PreviewOverlay,
  snapshot: RenderSnapshot,
  camera: ViewportCamera,
  nowMs: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 170);

  // 1. Move Path + tiny AP pill on destination corner
  if (preview.movePath && preview.movePath.length >= 2) {
    const color = preview.valid ? PALETTE.previewMove : PALETTE.previewMoveBlocked;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -(nowMs / 40) % 18;
    ctx.beginPath();
    preview.movePath.forEach((pt, idx) => {
      const r = camera.tileToScreenRect(pt.x, pt.y);
      const cx = r.x + r.size / 2;
      const cy = r.y + r.size / 2;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 1; i < preview.movePath.length; i++) {
      const pt = preview.movePath[i];
      const r = camera.tileToScreenRect(pt.x, pt.y);
      const cx = r.x + r.size / 2;
      const cy = r.y + r.size / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, i === preview.movePath.length - 1 ? 4.2 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const dest = preview.movePath[preview.movePath.length - 1];
    const destRect = camera.tileToScreenRect(dest.x, dest.y);
    drawTinyBadge(
      ctx,
      destRect.x + destRect.size / 2,
      destRect.y - 2,
      preview.valid ? `${preview.apCost ?? 0}AP` : 'AP不足',
      '#081018',
      color,
      'bc',
      9,
    );
    ctx.restore();
  }

  // 2. Throw Arc (cargo pod / dropped arm)
  if (preview.throwFrom && preview.throwTo) {
    const a = camera.tileToScreenRect(preview.throwFrom.x, preview.throwFrom.y);
    const b = camera.tileToScreenRect(preview.throwTo.x, preview.throwTo.y);
    const ax = a.x + a.size / 2;
    const ay = a.y + a.size / 2;
    const bx = b.x + b.size / 2;
    const by = b.y + b.size / 2;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 - Math.min(44, Math.hypot(bx - ax, by - ay) * 0.34);

    ctx.save();
    ctx.strokeStyle = preview.valid ? PALETTE.previewThrow : PALETTE.previewMoveBlocked;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    drawCornerBrackets(
      ctx,
      b.x + 2,
      b.y + 2,
      b.size - 4,
      Math.max(6, b.size * 0.25),
      preview.valid ? PALETTE.previewThrow : PALETTE.previewMoveBlocked,
      2,
    );
    ctx.restore();
  }

  // 3. Conductive Chain Network Preview
  if (preview.electroTiles && preview.electroTiles.length > 0) {
    ctx.save();
    for (const tile of preview.electroTiles) {
      const r = camera.tileToScreenRect(tile.x, tile.y);
      ctx.fillStyle = `rgba(0, 229, 255, ${(0.18 + pulse * 0.14).toFixed(3)})`;
      ctx.fillRect(r.x + 1, r.y + 1, r.size - 2, r.size - 2);
      ctx.strokeStyle = `rgba(94, 242, 255, ${(0.55 + pulse * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.size - 3, r.size - 3);
    }

    if (preview.electroEdges) {
      ctx.strokeStyle = '#7bf6ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 8;
      for (const edge of preview.electroEdges) {
        const ra = camera.tileToScreenRect(edge.from.x, edge.from.y);
        const rb = camera.tileToScreenRect(edge.to.x, edge.to.y);
        drawJaggedLine(
          ctx,
          ra.x + ra.size / 2,
          ra.y + ra.size / 2,
          rb.x + rb.size / 2,
          rb.y + rb.size / 2,
          4,
          Math.floor(nowMs / 80),
        );
      }
      ctx.shadowBlur = 0;
    }

    // Compact tags on electro-affected units (anchored cleanly below/above to avoid collisions)
    if (preview.electroAffectedUnitIds) {
      preview.electroAffectedUnitIds.forEach((uid, idx) => {
        const unit = snapshot.units.find((u) => u.id === uid);
        if (!unit) return;
        const r = camera.tileToScreenRect(unit.x, unit.y);
        const hasOptic = unit.tags.includes('OpticSensor') || unit.tags.includes('PrecisionCircuit');
        drawTinyBadge(
          ctx,
          r.x + r.size / 2,
          idx % 2 === 0 ? r.y - 3 : r.y + r.size + 3,
          hasOptic ? '⚡+1义眼' : '⚡眩晕',
          '#07131a',
          '#5ef2ff',
          idx % 2 === 0 ? 'bc' : 'tc',
          8.5,
        );
      });
    }
    ctx.restore();
  }

  // 4. Knockback & Ice Slide Trajectory
  if (preview.slidePath && preview.slidePath.length >= 2) {
    ctx.save();
    ctx.strokeStyle = PALETTE.previewKinetic;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    preview.slidePath.forEach((pt, idx) => {
      const r = camera.tileToScreenRect(pt.x, pt.y);
      const cx = r.x + r.size / 2;
      const cy = r.y + r.size / 2;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    for (let i = 1; i < preview.slidePath.length; i++) {
      const prev = camera.tileToScreenRect(preview.slidePath[i - 1].x, preview.slidePath[i - 1].y);
      const curr = camera.tileToScreenRect(preview.slidePath[i].x, preview.slidePath[i].y);
      drawArrowHead(
        ctx,
        prev.x + prev.size / 2,
        prev.y + prev.size / 2,
        curr.x + curr.size / 2,
        curr.y + curr.size / 2,
        PALETTE.previewKinetic,
      );
      ctx.fillStyle = 'rgba(255, 178, 56, 0.14)';
      ctx.fillRect(curr.x + 2, curr.y + 2, curr.size - 4, curr.size - 4);
    }

    if (preview.impactTile) {
      const r = camera.tileToScreenRect(preview.impactTile.x, preview.impactTile.y);
      drawCornerBrackets(ctx, r.x + 1, r.y + 1, r.size - 2, Math.max(6, r.size * 0.28), '#ff6b4a', 2.4);
      ctx.fillStyle = 'rgba(255, 107, 74, 0.22)';
      ctx.fillRect(r.x + 2, r.y + 2, r.size - 4, r.size - 4);
      if (preview.impactLabel) {
        drawTinyBadge(
          ctx,
          r.x + r.size / 2,
          r.y - 4,
          preview.impactLabel,
          '#ffffff',
          '#d94326',
          'bc',
          9,
        );
      }
    }
    ctx.restore();
  }

  // 5. Precision Sever Reticle + compact 90% chip
  if (preview.kind === 'sever') {
    const r = camera.tileToScreenRect(preview.targetTile.x, preview.targetTile.y);
    drawCornerBrackets(
      ctx,
      r.x - 1,
      r.y - 1,
      r.size + 2,
      Math.max(7, r.size * 0.3),
      preview.valid ? PALETTE.previewSever : PALETTE.previewMoveBlocked,
      2.4,
    );
    if (preview.valid && preview.dropIntegrityPct !== undefined) {
      drawTinyBadge(
        ctx,
        r.x + r.size / 2,
        r.y - 4,
        `斩落 ${preview.dropIntegrityPct}%`,
        '#14050d',
        PALETTE.previewSever,
        'bc',
        9,
      );
    }
  }

  // 6. Hack 90° Rotated Ghost Intent
  if (preview.rotatedIntent) {
    const rot = preview.rotatedIntent;
    ctx.save();
    for (let i = 0; i < rot.affectedTiles.length; i++) {
      const tile = rot.affectedTiles[i];
      const r = camera.tileToScreenRect(tile.x, tile.y);
      const pad = 2;
      ctx.fillStyle = `rgba(80, 250, 155, ${(0.16 + pulse * 0.1).toFixed(3)})`;
      ctx.fillRect(r.x + pad, r.y + pad, r.size - pad * 2, r.size - pad * 2);
      drawCornerBrackets(
        ctx,
        r.x + pad,
        r.y + pad,
        r.size - pad * 2,
        Math.max(5, r.size * 0.26),
        PALETTE.previewHack,
        2,
      );
      ctx.fillStyle = PALETTE.previewHack;
      ctx.font = `700 ${Math.max(10, Math.round(r.size * 0.32))}px ${MONO_FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(DIR_ARROWS[rot.direction], r.x + pad + 2, r.y + pad + 1);
    }

    const orig = camera.tileToScreenRect(rot.origin.x, rot.origin.y);
    drawTinyBadge(
      ctx,
      orig.x + orig.size / 2,
      orig.y - 4,
      `偏转 → ${DIR_ARROWS[rot.direction]}`,
      '#05190f',
      PALETTE.previewHack,
      'bc',
      9,
    );
    ctx.restore();
  }
}

function renderSequencerFx(
  ctx: CanvasRenderingContext2D,
  snapshot: RenderSnapshot,
  camera: ViewportCamera,
  fx: SequencerVisualState,
  nowMs: number,
): void {
  const occupiedBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];

  // Active Actor Beacon (label anchored BELOW actor so it never overlaps rising floating texts!)
  if (fx.highlightedUnitId) {
    const unit = snapshot.units.find((u) => u.id === fx.highlightedUnitId);
    if (unit) {
      const override = fx.unitPositionOverrides.get(unit.id);
      const ux = override ? override.x : unit.x;
      const uy = override ? override.y : unit.y;
      const r = camera.tileToScreenRect(ux, uy);
      const pulse = 0.5 + 0.5 * Math.sin(nowMs / 95);
      ctx.save();
      ctx.strokeStyle = unit.faction === 'player' ? '#ffe27a' : '#ff5e72';
      ctx.lineWidth = 2.4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10;
      const grow = 2 + pulse * 2.5;
      drawCornerBrackets(ctx, r.x - grow, r.y - grow, r.size + grow * 2, 8, ctx.strokeStyle, 2.4);
      ctx.shadowBlur = 0;

      if (fx.highlightedLabel) {
        const badgeBox = drawTinyBadge(
          ctx,
          r.x + r.size / 2,
          r.y + r.size + 6,
          fx.highlightedLabel,
          '#090d14',
          unit.faction === 'player' ? '#ffe27a' : '#ff5e72',
          'tc',
          9.5,
        );
        occupiedBoxes.push(badgeBox);
      }
      ctx.restore();
    }
  }

  // Ray flashes (bright peak + lingering afterglow)
  for (const ray of fx.rays) {
    const p = ray.elapsedMs / ray.durationMs;
    const t = Math.pow(Math.max(0, 1 - p), 1.35);
    const color = FLOAT_TONE_COLORS[ray.tone];
    ctx.save();
    for (const tile of ray.tiles) {
      const r = camera.tileToScreenRect(tile.x, tile.y);
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.max(0, t * 0.36);
      ctx.fillRect(r.x + 2, r.y + 2, r.size - 4, r.size - 4);
    }
    const a = camera.tileToScreenRect(ray.from.x, ray.from.y);
    const b = camera.tileToScreenRect(ray.to.x, ray.to.y);
    ctx.globalAlpha = Math.max(0, t);
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 4 * t + 1;
    ctx.beginPath();
    ctx.moveTo(a.x + a.size / 2, a.y + a.size / 2);
    ctx.lineTo(b.x + b.size / 2, b.y + b.size / 2);
    ctx.stroke();
    ctx.restore();
  }

  // Electro arcs (crackling lightning with lingering glow)
  for (const arc of fx.arcs) {
    const p = arc.elapsedMs / arc.durationMs;
    const t = Math.pow(Math.max(0, 1 - p), 1.15);
    const seed = Math.floor(nowMs / 55);
    ctx.save();
    for (const tile of arc.tiles) {
      const r = camera.tileToScreenRect(tile.x, tile.y);
      ctx.fillStyle = `rgba(0, 229, 255, ${(t * 0.38).toFixed(3)})`;
      ctx.fillRect(r.x, r.y, r.size, r.size);
    }
    ctx.strokeStyle = '#e5feff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = Math.max(0, t);
    for (const seg of arc.segments) {
      const a = camera.tileToScreenRect(seg.from.x, seg.from.y);
      const b = camera.tileToScreenRect(seg.to.x, seg.to.y);
      drawJaggedLine(
        ctx,
        a.x + a.size / 2,
        a.y + a.size / 2,
        b.x + b.size / 2,
        b.y + b.size / 2,
        6.5,
        seed,
      );
    }
    ctx.restore();
  }

  // Impact bursts (tone-matched expanding shockwave + crisp inner flash)
  for (const imp of fx.impacts) {
    const p = imp.elapsedMs / imp.durationMs;
    const r = camera.tileToScreenRect(imp.pos.x, imp.pos.y);
    const cx = r.x + r.size / 2;
    const cy = r.y + r.size / 2;
    const ringColor = FLOAT_TONE_COLORS[imp.tone];
    ctx.save();
    ctx.strokeStyle = ringColor;
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 10;
    ctx.lineWidth = Math.max(1.2, 3.6 * (1 - p));
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.beginPath();
    ctx.arc(cx, cy, r.size * (0.2 + p * 0.88), 0, Math.PI * 2);
    ctx.stroke();

    if (p < 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = (1 - p / 0.3) * 0.45;
      ctx.beginPath();
      ctx.arc(cx, cy, r.size * (0.28 + p * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // High-frequency blade diagonal slash arcs
  for (const sl of fx.slashes) {
    const p = sl.elapsedMs / sl.durationMs;
    const r = camera.tileToScreenRect(sl.pos.x, sl.pos.y);
    const cx = r.x + r.size / 2;
    const cy = r.y + r.size / 2;
    const color = FLOAT_TONE_COLORS[sl.tone];
    const sweep = Math.min(1, p / 0.35);
    const fade = p < 0.35 ? 1 : Math.max(0, 1 - (p - 0.35) / 0.65);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.globalAlpha = fade;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;

    // Outer neon slash trail
    const halfLen = r.size * 0.72 * sweep;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5.5 * fade + 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-halfLen, -r.size * 0.12);
    ctx.quadraticCurveTo(0, r.size * 0.16, halfLen, -r.size * 0.08);
    ctx.stroke();

    // Inner incandescent white core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2 * fade + 0.5;
    ctx.beginPath();
    ctx.moveTo(-halfLen * 0.85, -r.size * 0.1);
    ctx.quadraticCurveTo(0, r.size * 0.12, halfLen * 0.85, -r.size * 0.06);
    ctx.stroke();
    ctx.restore();
  }

  // Hack 90-degree glitch ring & scanline burst
  for (const hp of fx.hackPulses) {
    const p = hp.elapsedMs / hp.durationMs;
    const r = camera.tileToScreenRect(hp.pos.x, hp.pos.y);
    const cx = r.x + r.size / 2;
    const cy = r.y + r.size / 2;
    const alpha = Math.max(0, 1 - p);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#50fa9b';
    ctx.shadowColor = '#50fa9b';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r.size * (0.28 + p * 0.92), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rotating digital crosshair ticks
    const rot = p * Math.PI * 0.5;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const rad = r.size * (0.45 + p * 0.35);
    ctx.beginPath();
    ctx.moveTo(-rad, 0);
    ctx.lineTo(-rad + 6, 0);
    ctx.moveTo(rad, 0);
    ctx.lineTo(rad - 6, 0);
    ctx.moveTo(0, -rad);
    ctx.lineTo(0, -rad + 6);
    ctx.moveTo(0, rad);
    ctx.lineTo(0, rad - 6);
    ctx.stroke();
    ctx.restore();
  }

  // Stacked, pill-backed floating combat texts with strict 2D bounding-box de-collision
  const visibleFloats = fx.floatTexts.filter((ft) => ft.elapsedMs >= 0);
  const fontSize = Math.max(11, Math.round(camera.tilePixelSize * 0.3));

  for (const ft of visibleFloats) {
    const p = Math.min(1, ft.elapsedMs / ft.lifetimeMs);

    // Quick pop-in rise over first 12%, then gentle slow drift for effortless reading
    const popT = Math.min(1, p / 0.12);
    const easedPop = 1 - Math.pow(1 - popT, 3);
    const riseTiles = easedPop * 0.34 + p * 0.24;

    // Hold full opacity for 72% of lifetime (~1.9s), then smoothly fade out
    const alpha = p < 0.05 ? p / 0.05 : p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.28);

    const pt = camera.worldToScreen(ft.x, ft.y - riseTiles);
    const color = FLOAT_TONE_COLORS[ft.tone];

    ctx.save();
    ctx.font = `700 ${fontSize}px ${MONO_FONT}`;
    const tw = ctx.measureText(ft.text).width;
    const padX = 7;
    const boxW = tw + padX * 2;
    const boxH = fontSize + 7;
    const bx = pt.x - boxW / 2;
    let by = pt.y - boxH / 2;

    // Guarantee zero pixel overlap with previously placed pills & actor label
    const gap = 4;
    let guard = 0;
    while (guard < 12) {
      const hit = occupiedBoxes.find(
        (b) =>
          bx < b.x + b.w + gap &&
          bx + boxW + gap > b.x &&
          by < b.y + b.h + gap &&
          by + boxH + gap > b.y,
      );
      if (!hit) break;
      by = hit.y - boxH - gap;
      guard++;
    }
    occupiedBoxes.push({ x: bx, y: by, w: boxW, h: boxH });

    ctx.globalAlpha = alpha;
    // Sleek dark high-contrast pill backdrop
    ctx.fillStyle = 'rgba(8, 12, 20, 0.94)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    roundRect(ctx, bx, by, boxW, boxH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ft.text, bx + boxW / 2, by + boxH / 2 + 0.5);
    ctx.restore();
  }
}

export function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  len: number,
  color: string,
  lineWidth: number,
): void {
  const x2 = x + size;
  const y2 = y + size;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  // TL
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  // TR
  ctx.moveTo(x2 - len, y);
  ctx.lineTo(x2, y);
  ctx.lineTo(x2, y + len);
  // BR
  ctx.moveTo(x2, y2 - len);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - len, y2);
  // BL
  ctx.moveTo(x + len, y2);
  ctx.lineTo(x, y2);
  ctx.lineTo(x, y2 - len);
  ctx.stroke();
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 7;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawJaggedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  jitter: number,
  seed: number,
): void {
  const steps = 5;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const h = Math.sin(seed * 12.9898 + i * 78.233 + x1 * 0.17 + y1 * 0.31) * 43758.5453;
    const offset = ((h - Math.floor(h)) * 2 - 1) * jitter;
    ctx.lineTo(x1 + dx * t + nx * offset, y1 + dy * t + ny * offset);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawTinyBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fg: string,
  bg: string,
  anchor: 'br' | 'bc' | 'tc' | 'cc',
  fontSize: number,
): { x: number; y: number; w: number; h: number } {
  ctx.save();
  ctx.font = `700 ${fontSize}px ${MONO_FONT}`;
  const tw = ctx.measureText(text).width;
  const w = tw + 6;
  const h = fontSize + 4;
  const bx = anchor === 'br' ? x - w : x - w / 2;
  const by = anchor === 'tc' ? y : anchor === 'cc' ? y - h / 2 : y - h;

  ctx.fillStyle = bg;
  roundRect(ctx, bx, by, w, h, 3);
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2 + 0.5);
  ctx.restore();
  return { x: bx, y: by, w, h };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function tileKey(pos: Vec2): string {
  return `${pos.x},${pos.y}`;
}

export { DIR_VECTORS };
