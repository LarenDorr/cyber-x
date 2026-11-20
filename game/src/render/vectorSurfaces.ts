import { drawCornerBrackets } from './overlay.ts';
import type { SurfaceKind, TileCell } from './viewModel.ts';

export interface SurfaceNeighbors {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/**
 * Natural, Organic-Edged, Seamlessly-Merged Sci-Fi Surface & Deck Renderer
 * - Uses shared-vertex deterministic edge waves so adjacent connected tiles merge with ZERO seams,
 *   while every exposed dry edge undulates organically (smooth multi-lobe curves for water/oil,
 *   jagged crystalline frost teeth for ice) — zero straight rectangular outlines!
 */

export function drawVectorFloorBase(
  ctx: CanvasRenderingContext2D,
  cell: TileCell,
  rect: { x: number; y: number; size: number },
  isCurrentRoom: boolean,
): void {
  const { x, y, size } = rect;
  const checker = (cell.x + cell.y) % 2 === 0;
  const h = tileHash(cell.x, cell.y);

  ctx.save();
  const shadeDelta = ((h % 5) - 2) * 1.2;
  if (isCurrentRoom) {
    const r = Math.round((checker ? 17 : 19) + shadeDelta * 0.4);
    const g = Math.round((checker ? 23 : 26) + shadeDelta * 0.5);
    const b = Math.round((checker ? 34 : 39) + shadeDelta * 0.7);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  } else {
    ctx.fillStyle = '#0d121a';
  }
  ctx.fillRect(x, y, size, size);

  // Subtle varied industrial deck micro-details
  if (isCurrentRoom) {
    const variant = h % 12;
    ctx.strokeStyle = 'rgba(130, 178, 230, 0.055)';
    ctx.fillStyle = 'rgba(130, 178, 230, 0.07)';
    ctx.lineWidth = 1;

    if (variant === 0 || variant === 1) {
      const gx = x + size * (variant === 0 ? 0.2 : 0.34);
      const gy = y + size * 0.36;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(gx, gy + i * (size * 0.08));
        ctx.lineTo(gx + size * 0.44, gy + i * (size * 0.08));
      }
      ctx.stroke();
    } else if (variant === 2) {
      const p = size * 0.18;
      ctx.strokeRect(x + p, y + p, size - p * 2, size - p * 2);
      ctx.fillRect(x + p + 3, y + p + 3, 2, 2);
      ctx.fillRect(x + size - p - 5, y + size - p - 5, 2, 2);
    } else if (variant === 3) {
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.52);
      ctx.lineTo(x + size * 0.38, y + size * 0.52);
      ctx.lineTo(x + size * 0.54, y + size * 0.68);
      ctx.lineTo(x + size, y + size * 0.68);
      ctx.stroke();
    } else if (variant === 4) {
      const b = size * 0.16;
      ctx.fillRect(x + b, y + b, 1.8, 1.8);
      ctx.fillRect(x + size - b - 1.8, y + size - b - 1.8, 1.8, 1.8);
    } else if (variant === 5) {
      ctx.beginPath();
      ctx.moveTo(x + size * 0.15, y + size * 0.85);
      ctx.lineTo(x + size * 0.85, y + size * 0.15);
      ctx.stroke();
    }
  }

  // Caves-style subtle 4-corner L-brackets
  const bracketLen = Math.max(2.5, size * 0.09);
  drawCornerBrackets(
    ctx,
    x + 0.5,
    y + 0.5,
    size - 1,
    bracketLen,
    isCurrentRoom ? 'rgba(142, 198, 245, 0.13)' : 'rgba(115, 145, 185, 0.06)',
    1,
  );

  ctx.restore();
}

export function drawVectorSurface(
  ctx: CanvasRenderingContext2D,
  surface: SurfaceKind,
  rect: { x: number; y: number; size: number },
  neighbors: SurfaceNeighbors,
  tx: number,
  ty: number,
  nowMs: number,
): void {
  if (surface === 'none') return;
  const { x, y, size } = rect;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const h = tileHash(tx, ty);
  const r1 = hashFloat(h, 1);
  const r2 = hashFloat(h, 2);
  const r3 = hashFloat(h, 3);
  const r4 = hashFloat(h, 4);

  ctx.save();

  switch (surface) {
    case 'water': {
      // === ORGANIC SCALLOPED CONDUCTIVE WATER POOL ===
      drawOrganicBlobTile(ctx, x, y, size, tx, ty, neighbors, 'smooth', {
        outerHalo: 'rgba(12, 74, 128, 0.34)',
        bodyFill: 'rgba(10, 44, 78, 0.86)',
        innerDepth: 'rgba(5, 24, 46, 0.56)',
      });

      // Scattered organic satellite water droplets near exposed edges
      drawEdgeSatellites(ctx, x, y, size, tx, ty, neighbors, 'rgba(34, 148, 212, 0.45)', 3);

      // Varied water textures per tile
      const phase = nowMs / 780 + tx * 1.1 + ty * 0.7;
      const drift = Math.sin(phase) * (size * 0.032);
      const variant = h % 4;

      if (variant === 0 || variant === 2) {
        ctx.strokeStyle = 'rgba(56, 212, 255, 0.13)';
        ctx.lineWidth = Math.max(2, size * 0.055);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + size * (0.16 + r1 * 0.16), y + size * (0.76 - r2 * 0.12));
        ctx.lineTo(x + size * (0.48 + r3 * 0.22), y + size * (0.24 + r4 * 0.16));
        ctx.stroke();
      }

      if (variant === 1) {
        const rp = (nowMs / 2400 + r1) % 1;
        const rx = cx + (r2 - 0.5) * size * 0.28;
        const ry = cy + (r3 - 0.5) * size * 0.28;
        ctx.strokeStyle = `rgba(92, 224, 255, ${(Math.sin(rp * Math.PI) * 0.44).toFixed(2)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(rx, ry, size * (0.06 + rp * 0.22), size * (0.035 + rp * 0.13), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(84, 216, 255, 0.34)';
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';
        const wy1 = y + size * (0.28 + r1 * 0.16) + drift;
        const wx1 = x + size * (0.14 + r2 * 0.16);
        const wlen1 = size * (0.32 + r3 * 0.22);
        ctx.beginPath();
        ctx.moveTo(wx1, wy1);
        ctx.quadraticCurveTo(wx1 + wlen1 * 0.5, wy1 - 2.5, wx1 + wlen1, wy1);
        ctx.stroke();

        const wy2 = y + size * (0.62 + r4 * 0.14) - drift * 0.8;
        const wx2 = x + size * (0.28 + r3 * 0.18);
        const wlen2 = size * (0.28 + r1 * 0.2);
        ctx.beginPath();
        ctx.moveTo(wx2, wy2);
        ctx.quadraticCurveTo(wx2 + wlen2 * 0.5, wy2 + 2.2, wx2 + wlen2, wy2);
        ctx.stroke();
      }
      break;
    }

    case 'ice': {
      // === JAGGED CRYSTALLINE CRYO-FROST SHEET (Organic jagged edges, zero boxy frame!) ===
      // Soft frost mist halo
      const halo = ctx.createRadialGradient(cx, cy, size * 0.14, cx, cy, size * 0.64);
      halo.addColorStop(0, 'rgba(72, 205, 240, 0.22)');
      halo.addColorStop(1, 'rgba(72, 205, 240, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 4, y - 4, size + 8, size + 8);

      drawOrganicBlobTile(ctx, x, y, size, tx, ty, neighbors, 'jagged', {
        outerHalo: 'rgba(110, 228, 255, 0.16)',
        bodyFill: 'rgba(20, 66, 94, 0.80)',
        innerDepth: 'rgba(128, 240, 255, 0.11)',
      });

      // Tiny frost crystal splinters scattered outside exposed edges
      drawEdgeSatellites(ctx, x, y, size, tx, ty, neighbors, 'rgba(155, 246, 255, 0.42)', 2);

      // 4 distinct deterministic fracture/crystal patterns
      const variant = h % 4;
      ctx.strokeStyle = 'rgba(168, 248, 255, 0.38)';
      ctx.lineWidth = 1.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (variant === 0) {
        ctx.moveTo(x + size * 0.16, y + size * 0.78);
        ctx.lineTo(x + size * 0.48, y + size * 0.46);
        ctx.lineTo(x + size * 0.82, y + size * 0.22);
        ctx.moveTo(x + size * 0.48, y + size * 0.46);
        ctx.lineTo(x + size * 0.76, y + size * 0.68);
      } else if (variant === 1) {
        const px = x + size * (0.4 + r1 * 0.2);
        const py = y + size * (0.4 + r2 * 0.2);
        ctx.moveTo(px, py);
        ctx.lineTo(px - size * 0.28, py - size * 0.2);
        ctx.moveTo(px, py);
        ctx.lineTo(px + size * 0.3, py - size * 0.14);
        ctx.moveTo(px, py);
        ctx.lineTo(px + size * 0.14, py + size * 0.32);
      } else if (variant === 2) {
        ctx.moveTo(x + size * 0.18, y + size * 0.34);
        ctx.lineTo(x + size * 0.56, y + size * 0.16);
        ctx.moveTo(x + size * 0.38, y + size * 0.82);
        ctx.lineTo(x + size * 0.84, y + size * 0.54);
        ctx.moveTo(x + size * 0.26, y + size * 0.6);
        ctx.lineTo(x + size * 0.62, y + size * 0.42);
      } else {
        const fx = cx + (r3 - 0.5) * size * 0.24;
        const fy = cy + (r4 - 0.5) * size * 0.24;
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * i) / 3 + r1;
          ctx.moveTo(fx - Math.cos(a) * size * 0.18, fy - Math.sin(a) * size * 0.18);
          ctx.lineTo(fx + Math.cos(a) * size * 0.18, fy + Math.sin(a) * size * 0.18);
        }
      }
      ctx.stroke();

      // Glint sparkle
      const spark = 0.5 + 0.5 * Math.sin(nowMs / 560 + h * 1.3);
      if (spark > 0.45) {
        const sx = x + size * (0.24 + r2 * 0.52);
        const sy = y + size * (0.24 + r4 * 0.52);
        ctx.strokeStyle = `rgba(232, 254, 255, ${((spark - 0.45) * 1.4).toFixed(2)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy);
        ctx.lineTo(sx + 3, sy);
        ctx.moveTo(sx, sy - 3);
        ctx.lineTo(sx, sy + 3);
        ctx.stroke();
      }

      // Sweeping icy sheen across merged frost sheet
      const sweep = (nowMs / 2800 + tx * 0.11 + ty * 0.07) % 1;
      if (sweep < 0.22) {
        const p = sweep / 0.22;
        ctx.strokeStyle = `rgba(220, 254, 255, ${(Math.sin(p * Math.PI) * 0.34).toFixed(2)})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x + size * (0.05 + p * 0.58), y + size * 0.88);
        ctx.lineTo(x + size * (0.34 + p * 0.58), y + size * 0.12);
        ctx.stroke();
      }
      break;
    }

    case 'oil': {
      // === ORGANIC IRIDESCENT PETRO-SLICK ===
      drawOrganicBlobTile(ctx, x, y, size, tx, ty, neighbors, 'smooth', {
        outerHalo: 'rgba(138, 86, 34, 0.22)',
        bodyFill: 'rgba(19, 14, 12, 0.90)',
        innerDepth: 'rgba(8, 6, 8, 0.62)',
      });

      drawEdgeSatellites(ctx, x, y, size, tx, ty, neighbors, 'rgba(38, 26, 18, 0.85)', 3);

      const drift = Math.sin(nowMs / 1050 + tx * 1.3 + ty * 0.9) * 0.12;
      const ox = cx + (r1 - 0.5) * size * 0.22;
      const oy = cy + (r2 - 0.5) * size * 0.22;

      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(218, 146, 58, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ox, oy, size * (0.2 + r3 * 0.1), r4 * Math.PI + drift, r4 * Math.PI + 1.85 + drift);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(174, 84, 224, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ox + 2, oy - 1, size * (0.12 + r4 * 0.08), r1 * 4 - drift, r1 * 4 + 2.1 - drift);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(66, 186, 196, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox - 2, oy + 2, size * 0.16, r2 * 5, r2 * 5 + 1.3);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 220, 148, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ox - size * 0.18, oy - size * 0.16);
      ctx.lineTo(ox - size * 0.04, oy - size * 0.21);
      ctx.stroke();
      break;
    }

    case 'fire': {
      // === BORDERLESS NATURAL SCORCH + ASYNC CYBER-FLAMES ===
      const f1 = Math.sin(nowMs / 110 + tx * 2.1 + ty * 1.3);
      const f2 = Math.cos(nowMs / 88 + tx * 1.4 - ty * 2.2);
      const f3 = Math.sin(nowMs / 140 + h);

      const scorch = ctx.createRadialGradient(cx, cy + size * 0.08, 2, cx, cy, size * 0.6);
      scorch.addColorStop(0, 'rgba(255, 76, 32, 0.48)');
      scorch.addColorStop(0.5, 'rgba(130, 26, 22, 0.40)');
      scorch.addColorStop(0.85, 'rgba(42, 12, 16, 0.20)');
      scorch.addColorStop(1, 'rgba(42, 12, 16, 0)');
      ctx.fillStyle = scorch;
      ctx.fillRect(x - 4, y - 4, size + 8, size + 8);

      ctx.strokeStyle = `rgba(255, 118, 42, ${(0.35 + f1 * 0.15).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.28, cy + size * 0.24);
      ctx.lineTo(cx, cy + size * 0.12);
      ctx.lineTo(cx + size * 0.26, cy + size * 0.26);
      ctx.stroke();

      const baseY = y + size * 0.78;
      const u = size * 0.35;

      ctx.fillStyle = 'rgba(255, 34, 62, 0.76)';
      ctx.shadowColor = '#ff2a44';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.8, baseY);
      ctx.lineTo(cx - u * 0.64, baseY - u * (0.85 + f2 * 0.2));
      ctx.lineTo(cx - u * 0.32, baseY - u * 0.48);
      ctx.lineTo(cx + (r1 - 0.5) * u * 0.25 + f1 * 2.2, baseY - u * (1.38 + f1 * 0.22));
      ctx.lineTo(cx + u * 0.28, baseY - u * 0.54);
      ctx.lineTo(cx + u * 0.66, baseY - u * (0.94 - f3 * 0.18));
      ctx.lineTo(cx + u * 0.8, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ff8c24';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.52, baseY);
      ctx.lineTo(cx - u * 0.34, baseY - u * (0.62 - f1 * 0.16));
      ctx.lineTo(cx - u * 0.1, baseY - u * 0.36);
      ctx.lineTo(cx + f2 * 1.8, baseY - u * (1.02 + f1 * 0.16));
      ctx.lineTo(cx + u * 0.34, baseY - u * (0.58 + f2 * 0.14));
      ctx.lineTo(cx + u * 0.5, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fcee0a';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.22, baseY);
      ctx.lineTo(cx + f3 * 1.2, baseY - u * (0.54 + f2 * 0.14));
      ctx.lineTo(cx + u * 0.22, baseY);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

export function drawVectorElectrifiedOverlay(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; size: number },
  tx: number,
  ty: number,
  nowMs: number,
): void {
  const { x, y, size } = rect;
  const spark = 0.5 + 0.5 * Math.sin(nowMs / 65 + tx * 2 + ty * 3);
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.58);
  glow.addColorStop(0, `rgba(0, 240, 255, ${(0.28 + spark * 0.18).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(0, 240, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = '#7bf6ff';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 7;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.18, y + size * 0.24);
  ctx.lineTo(x + size * 0.48, y + size * 0.44 + spark * 4);
  ctx.lineTo(x + size * 0.38, y + size * 0.58);
  ctx.lineTo(x + size * 0.8, y + size * 0.76);
  ctx.stroke();
  ctx.restore();
}

/**
 * Generates an organically undulating (or crystalline jagged) polygon per tile whose
 * connected edges extend seamlessly (-1px overlap) into neighbors, while exposed edges
 * ripple randomly with multi-segment Bezier waves / crystal teeth so there are ZERO straight box edges!
 */
function drawOrganicBlobTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tx: number,
  ty: number,
  n: SurfaceNeighbors,
  mode: 'smooth' | 'jagged',
  colors: { outerHalo: string; bodyFill: string; innerDepth: string },
): void {
  const buildPath = (expand: number) => {
    const pad = size * 0.11 - expand;
    const xL = n.w ? x - 1 : x + pad;
    const xR = n.e ? x + size + 1 : x + size - pad;
    const yT = n.n ? y - 1 : y + pad;
    const yB = n.s ? y + size + 1 : y + size - pad;

    // Corner pull-in on exposed outer corners for soft irregular silhouette
    const cornerIn = size * (mode === 'jagged' ? 0.1 : 0.14);
    const tl = { x: xL + (!n.n && !n.w ? cornerIn : 0), y: yT + (!n.n && !n.w ? cornerIn * 0.5 : 0) };
    const tr = { x: xR - (!n.n && !n.e ? cornerIn : 0), y: yT + (!n.n && !n.e ? cornerIn * 0.5 : 0) };
    const br = { x: xR - (!n.s && !n.e ? cornerIn : 0), y: yB - (!n.s && !n.e ? cornerIn * 0.5 : 0) };
    const bl = { x: xL + (!n.s && !n.w ? cornerIn : 0), y: yB - (!n.s && !n.w ? cornerIn * 0.5 : 0) };

    const amp = size * (mode === 'jagged' ? 0.13 : 0.11);

    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);

    // Top edge
    if (n.n) {
      ctx.lineTo(tr.x, tr.y);
    } else {
      traceOrganicEdge(ctx, tl, tr, 0, -1, amp, tileHash(tx, ty * 17 + 1), mode);
    }

    // Right edge
    if (n.e) {
      ctx.lineTo(br.x, br.y);
    } else {
      traceOrganicEdge(ctx, tr, br, 1, 0, amp, tileHash(tx * 19 + 3, ty), mode);
    }

    // Bottom edge
    if (n.s) {
      ctx.lineTo(bl.x, bl.y);
    } else {
      traceOrganicEdge(ctx, br, bl, 0, 1, amp, tileHash(tx, ty * 23 + 7), mode);
    }

    // Left edge
    if (n.w) {
      ctx.lineTo(tl.x, tl.y);
    } else {
      traceOrganicEdge(ctx, bl, tl, -1, 0, amp, tileHash(tx * 29 + 11, ty), mode);
    }

    ctx.closePath();
  };

  // 1. Soft outer dampness / frost feather halo
  ctx.fillStyle = colors.outerHalo;
  buildPath(3.5);
  ctx.fill();

  // 2. Main seamlessly merged organic body
  ctx.fillStyle = colors.bodyFill;
  buildPath(0);
  ctx.fill();

  // 3. Soft off-center depth patch breaking up flatness
  const h = tileHash(tx, ty);
  const r1 = hashFloat(h, 9);
  const r2 = hashFloat(h, 10);
  ctx.fillStyle = colors.innerDepth;
  ctx.beginPath();
  ctx.ellipse(
    x + size * (0.36 + r1 * 0.28),
    y + size * (0.36 + r2 * 0.28),
    size * (0.24 + r1 * 0.12),
    size * (0.18 + r2 * 0.1),
    (r1 - 0.5) * 1.4,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function traceOrganicEdge(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  nx: number,
  ny: number,
  amp: number,
  seed: number,
  mode: 'smooth' | 'jagged',
): void {
  const segs = 3;
  const pts: Array<{ x: number; y: number }> = [a];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const jitter = (hashFloat(seed, i * 5) - 0.42) * 2 * amp;
    pts.push({
      x: a.x + (b.x - a.x) * t + nx * jitter,
      y: a.y + (b.y - a.y) * t + ny * jitter,
    });
  }
  pts.push(b);

  if (mode === 'jagged') {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }
}

/** Tiny irregular droplets / frost splinters scattered just outside exposed dry edges */
function drawEdgeSatellites(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tx: number,
  ty: number,
  n: SurfaceNeighbors,
  color: string,
  count: number,
): void {
  const h = tileHash(tx + 31, ty + 17);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const side = (h + i * 7) % 4;
    if (side === 0 && n.n) continue;
    if (side === 1 && n.e) continue;
    if (side === 2 && n.s) continue;
    if (side === 3 && n.w) continue;

    const along = 0.16 + hashFloat(h, i * 3 + 1) * 0.68;
    const out = 0.04 + hashFloat(h, i * 3 + 2) * 0.07;
    const rad = 1.4 + hashFloat(h, i * 3 + 3) * 2.1;

    let px = x + size * along;
    let py = y + size * along;
    if (side === 0) py = y + size * out;
    else if (side === 1) px = x + size * (1 - out);
    else if (side === 2) py = y + size * (1 - out);
    else px = x + size * out;

    ctx.beginPath();
    ctx.ellipse(px, py, rad, rad * 0.72, hashFloat(h, i) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tileHash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  n = (n ^ (n >> 13)) * 1274126177;
  return Math.abs(n ^ (n >> 16));
}

function hashFloat(h: number, salt: number): number {
  const v = Math.sin(h * 0.00017 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
