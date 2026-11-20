import { DIR_VECTORS, RARITY_COLORS } from './glyphs.ts';
import type { PropView, TileCell, UnitView } from './viewModel.ts';

/**
 * High-Detail Neo-Cyberpunk Vector Craft Renderer (60-66px tile / ~128px Retina artboard!)
 * Follows CraftPixel's verified grammar:
 *  - Matte obsidian opaque interior (#090F17) for razor-sharp figure-ground separation
 *  - Clean 1.8~2px primary neon outer contours + 1px internal CNC armor & mechanical joint lines
 *  - Strict 3-accent palette discipline (#00F0FF cyan, #FCEE0A cyber yellow, #FF1744 crimson)
 *  - Concrete, detailed full-body/armored cyberpunk silhouettes with distinct helmets, visors,
 *    hydraulic arms, cyber-blades, shields, tank treads, hover legs, and holo-decks!
 */

const OBSIDIAN = '#090f17';
const OBSIDIAN_MID = '#101a28';
const CYAN = '#00f0ff';
const YELLOW = '#fcee0a';
const CRIMSON = '#ff1744';
const AMBER = '#ffab2e';
const MAGENTA = '#ea4cff';

export function drawVectorWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  neighbors: { n: boolean; e: boolean; s: boolean; w: boolean },
): void {
  ctx.save();
  ctx.fillStyle = '#0d131e';
  ctx.fillRect(x, y, size, size);

  const pad = Math.max(3, size * 0.14);
  ctx.fillStyle = '#131c2c';
  ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);

  // Exposed bulkhead edges
  ctx.strokeStyle = '#304969';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (!neighbors.n) {
    ctx.moveTo(x + 0.5, y + 1);
    ctx.lineTo(x + size - 0.5, y + 1);
  }
  if (!neighbors.s) {
    ctx.moveTo(x + 0.5, y + size - 1);
    ctx.lineTo(x + size - 0.5, y + size - 1);
  }
  if (!neighbors.w) {
    ctx.moveTo(x + 1, y + 0.5);
    ctx.lineTo(x + 1, y + size - 0.5);
  }
  if (!neighbors.e) {
    ctx.moveTo(x + size - 1, y + 0.5);
    ctx.lineTo(x + size - 1, y + size - 0.5);
  }
  ctx.stroke();

  // Internal subtle CNC architectural panel lines
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.09)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
  ctx.beginPath();
  ctx.moveTo(x + pad + 3, y + pad + 3);
  ctx.lineTo(x + size - pad - 3, y + size - pad - 3);
  ctx.stroke();
  ctx.restore();
}

export function drawVectorTileFeature(
  ctx: CanvasRenderingContext2D,
  cell: TileCell,
  rect: { x: number; y: number; size: number },
  nowMs: number,
): void {
  const { x, y, size } = rect;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.42;

  ctx.save();

  if (cell.kind === 'door_closed') {
    const pad = size * 0.1;
    ctx.fillStyle = OBSIDIAN;
    ctx.strokeStyle = YELLOW;
    ctx.shadowColor = 'rgba(252, 238, 10, 0.45)';
    ctx.shadowBlur = 7;
    ctx.lineWidth = 1.9;
    drawChamferBox(ctx, x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Double blast door leaf seam & hazard ticks
    ctx.strokeStyle = 'rgba(252, 238, 10, 0.4)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx, y + pad + 2);
    ctx.lineTo(cx, y + size - pad - 2);
    ctx.moveTo(x + pad + 4, cy - r * 0.42);
    ctx.lineTo(x + size - pad - 4, cy - r * 0.42);
    ctx.moveTo(x + pad + 4, cy + r * 0.42);
    ctx.lineTo(x + size - pad - 4, cy + r * 0.42);
    ctx.stroke();

    // Central crimson mag-lock module
    const pulse = 0.72 + 0.28 * Math.sin(nowMs / 320);
    ctx.fillStyle = `rgba(255, 23, 68, ${pulse.toFixed(2)})`;
    ctx.fillRect(cx - r * 0.32, cy - r * 0.18, r * 0.64, r * 0.36);
  } else if (cell.kind === 'door_open') {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.34)';
    ctx.lineWidth = 1.6;
    const t = size * 0.22;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + 4, y + t);
    ctx.moveTo(x + size - 4, y + 4);
    ctx.lineTo(x + size - 4, y + t);
    ctx.moveTo(x + 4, y + size - 4);
    ctx.lineTo(x + 4, y + size - t);
    ctx.moveTo(x + size - 4, y + size - 4);
    ctx.lineTo(x + size - 4, y + size - t);
    ctx.stroke();
  } else if (cell.kind === 'elevator') {
    const pad = size * 0.1;
    ctx.fillStyle = OBSIDIAN;
    ctx.strokeStyle = '#3ef59b';
    ctx.shadowColor = 'rgba(62, 245, 155, 0.55)';
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    drawChamferBox(ctx, x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.15);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    const p2 = pad + 4;
    ctx.strokeStyle = 'rgba(62, 245, 155, 0.32)';
    ctx.lineWidth = 1;
    drawChamferBox(ctx, x + p2, y + p2, size - p2 * 2, size - p2 * 2, size * 0.1);
    ctx.stroke();

    const phase = (nowMs / 900) % 1;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const p = (phase + i * 0.5) % 1;
      const alpha = Math.sin(p * Math.PI);
      const oy = (0.34 - p * 0.68) * r;
      ctx.strokeStyle = `rgba(110, 255, 185, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy + oy + r * 0.18);
      ctx.lineTo(cx, cy + oy - r * 0.16);
      ctx.lineTo(cx + r * 0.4, cy + oy + r * 0.18);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawVectorProp(
  ctx: CanvasRenderingContext2D,
  prop: PropView,
  rect: { x: number; y: number; size: number },
  nowMs: number,
  bounce?: { elapsedMs: number; durationMs: number },
): void {
  let bounceOffsetY = 0;
  let scale = 1;
  if (bounce) {
    const t = Math.min(1, bounce.elapsedMs / bounce.durationMs);
    bounceOffsetY = -Math.abs(Math.sin(t * Math.PI * 1.5)) * rect.size * 0.34 * (1 - t);
    scale = 1 + Math.sin(t * Math.PI) * 0.14;
  }

  const cx = rect.x + rect.size / 2;
  const cy = rect.y + rect.size / 2 + bounceOffsetY;
  const u = rect.size * 0.42;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'miter';

  switch (prop.kind) {
    case 'cooling_pipe': {
      // Detailed twin liquid-nitrogen canisters with pressure gauges & valve collar
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.9;
      drawChamferBox(ctx, -u * 0.72, -u * 0.86, u * 0.56, u * 1.72, u * 0.16);
      ctx.fill();
      ctx.stroke();
      drawChamferBox(ctx, u * 0.16, -u * 0.86, u * 0.56, u * 1.72, u * 0.16);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Internal cryo sight-glasses + frost level bars
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.48)';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(-u * 0.54, -u * 0.58, u * 0.2, u * 1.16);
      ctx.strokeRect(u * 0.34, -u * 0.58, u * 0.2, u * 1.16);
      ctx.fillStyle = 'rgba(130, 248, 255, 0.45)';
      ctx.fillRect(-u * 0.52, -u * 0.18, u * 0.16, u * 0.72);
      ctx.fillRect(u * 0.36, -u * 0.3, u * 0.16, u * 0.84);

      // Central solid yellow manifold bracket + crimson valve wheel
      ctx.fillStyle = YELLOW;
      ctx.fillRect(-u * 0.78, -u * 0.12, u * 1.56, u * 0.22);
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(-u * 0.12, -u * 0.2, u * 0.24, u * 0.38);
      break;
    }

    case 'power_box': {
      // High-voltage transformer cabinet with twin coil insulators, hazard stripes, yellow lightning bolt
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.45)';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.9;
      drawChamferBox(ctx, -u * 0.76, -u * 0.62, u * 1.52, u * 1.38, u * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Twin ceramic coil insulators on top
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.8;
      for (const ix of [-u * 0.38, u * 0.38]) {
        ctx.beginPath();
        ctx.moveTo(ix, -u * 0.62);
        ctx.lineTo(ix, -u * 0.94);
        ctx.stroke();
        ctx.fillStyle = YELLOW;
        ctx.fillRect(ix - u * 0.1, -u * 0.84, u * 0.2, u * 0.08);
      }

      // 1px inset cabinet door panel
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.32)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-u * 0.58, -u * 0.44, u * 1.16, u * 0.82);

      // Crimson bottom caution bar
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(-u * 0.56, u * 0.46, u * 1.12, u * 0.16);

      // Solid yellow lightning emblem
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.moveTo(u * 0.1, -u * 0.36);
      ctx.lineTo(-u * 0.24, u * 0.02);
      ctx.lineTo(0, u * 0.02);
      ctx.lineTo(-u * 0.12, u * 0.34);
      ctx.lineTo(u * 0.24, -u * 0.06);
      ctx.lineTo(0, -u * 0.06);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'explosive_barrel': {
      // Pressurized fuel canister with ribbed rings, warning triangle & crimson pulse
      const pulse = 0.7 + 0.3 * Math.sin(nowMs / 240);
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = CRIMSON;
      ctx.shadowColor = 'rgba(255, 23, 68, 0.55)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      drawChamferBox(ctx, -u * 0.62, -u * 0.82, u * 1.24, u * 1.64, u * 0.28);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top & bottom barrel containment ribs
      ctx.strokeStyle = 'rgba(255, 23, 68, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-u * 0.6, -u * 0.44);
      ctx.lineTo(u * 0.6, -u * 0.44);
      ctx.moveTo(-u * 0.6, u * 0.44);
      ctx.lineTo(u * 0.6, u * 0.44);
      ctx.stroke();

      // Solid yellow hazard triangle
      ctx.fillStyle = `rgba(252, 238, 10, ${pulse.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, -u * 0.3);
      ctx.lineTo(u * 0.3, u * 0.24);
      ctx.lineTo(-u * 0.3, u * 0.24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = OBSIDIAN;
      ctx.fillRect(-u * 0.05, -u * 0.1, u * 0.1, u * 0.22);
      break;
    }

    case 'heavy_crate': {
      // Reinforced industrial cargo container with X-bracing & yellow corner locks
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = '#7ea8cc';
      ctx.lineWidth = 2;
      drawChamferBox(ctx, -u * 0.82, -u * 0.82, u * 1.64, u * 1.64, u * 0.2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(126, 168, 204, 0.38)';
      ctx.lineWidth = 1.1;
      drawChamferBox(ctx, -u * 0.58, -u * 0.58, u * 1.16, u * 1.16, u * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-u * 0.5, -u * 0.5);
      ctx.lineTo(u * 0.5, u * 0.5);
      ctx.moveTo(u * 0.5, -u * 0.5);
      ctx.lineTo(-u * 0.5, u * 0.5);
      ctx.stroke();

      ctx.fillStyle = YELLOW;
      ctx.fillRect(-u * 0.16, -u * 0.16, u * 0.32, u * 0.32);
      break;
    }

    case 'cargo_pod': {
      // Deployable tactical drop-pod with padlock, anchor clamps & crimson lock strip
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.45)';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.9;
      drawChamferBox(ctx, -u * 0.78, -u * 0.68, u * 1.56, u * 1.36, u * 0.22);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.74, -u * 0.16);
      ctx.lineTo(u * 0.74, -u * 0.16);
      ctx.stroke();

      ctx.fillStyle = CRIMSON;
      ctx.fillRect(-u * 0.5, u * 0.4, u * 1.0, u * 0.14);

      ctx.strokeStyle = YELLOW;
      ctx.lineWidth = 1.7;
      ctx.strokeRect(-u * 0.2, -u * 0.14, u * 0.4, u * 0.38);
      break;
    }

    case 'dropped_part': {
      // Detailed CraftPixel Cyber-Katana / Severed Implant Blade lying on floor
      const isLeg = prop.rarity === 'legendary';
      const contour = isLeg ? YELLOW : prop.rarity === 'rare' ? CYAN : '#b8d0e8';
      const accent = isLeg ? CRIMSON : YELLOW;

      if (isLeg) {
        const pulse = 0.5 + 0.5 * Math.sin(nowMs / 250);
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, u * 1.45);
        grad.addColorStop(0, `rgba(252, 238, 10, ${(0.28 + pulse * 0.16).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(252, 238, 10, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-u * 1.4, -u * 1.4, u * 2.8, u * 2.8);
      }

      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = contour;
      ctx.shadowColor = contour;
      ctx.shadowBlur = isLeg ? 9 : 6;
      ctx.lineWidth = 1.9;

      // Detailed cyber-blade silhouette (pommel, wrapped grip, guard, fuller blade, angled tip)
      ctx.beginPath();
      ctx.moveTo(-u * 0.9, -u * 0.12);
      ctx.lineTo(-u * 0.34, -u * 0.12);
      ctx.lineTo(-u * 0.34, -u * 0.36);
      ctx.lineTo(-u * 0.16, -u * 0.36);
      ctx.lineTo(-u * 0.16, -u * 0.2);
      ctx.lineTo(u * 0.72, -u * 0.2);
      ctx.lineTo(u * 1.0, 0);
      ctx.lineTo(u * 0.72, u * 0.2);
      ctx.lineTo(-u * 0.16, u * 0.2);
      ctx.lineTo(-u * 0.16, u * 0.36);
      ctx.lineTo(-u * 0.34, u * 0.36);
      ctx.lineTo(-u * 0.34, u * 0.12);
      ctx.lineTo(-u * 0.9, u * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Grip wrapping ticks
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      for (const gx of [-u * 0.74, -u * 0.58, -u * 0.44]) {
        ctx.beginPath();
        ctx.moveTo(gx, -u * 0.12);
        ctx.lineTo(gx, u * 0.12);
        ctx.stroke();
      }

      // Crimson core cell + bright thermal edge highlight
      ctx.fillStyle = accent;
      ctx.fillRect(-u * 0.14, -u * 0.15, u * 0.22, u * 0.3);
      ctx.strokeStyle = isLeg ? '#ffffff' : YELLOW;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(u * 0.14, -u * 0.11);
      ctx.lineTo(u * 0.8, -u * 0.11);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

/**
 * High-Detail 64px (~128px Retina) Concrete Cyberpunk Character Renderer
 * Every character has unmistakable anatomy, mechanical joints, facial visors, and equipped weapons,
 * rendered with CraftPixel's matte obsidian interior + 2px neon contour + 1px CNC detail grammar!
 */
export function drawVectorUnit(
  ctx: CanvasRenderingContext2D,
  unit: UnitView,
  rect: { x: number; y: number; size: number },
  nowMs: number,
  hasLootUnder: boolean,
  hitFlash?: { elapsedMs: number; durationMs: number },
): void {
  const s = rect.size;
  const u = s * 0.46; // full generous tile height for crisp concrete details
  const isStunned = unit.statuses.includes('stunned');
  const isRedline = unit.statuses.includes('redline');
  const face = DIR_VECTORS[unit.facing];
  const faceAngle = Math.atan2(face.y, face.x);
  const flipX = unit.facing === 'W' ? -1 : 1;

  let bobY = 0;
  let wobbleX = 0;
  if (unit.kind === 'drone') {
    bobY = Math.sin(nowMs / 300 + unit.x) * (s * 0.045);
  } else if (unit.kind === 'player') {
    bobY = Math.sin(nowMs / 520) * (s * 0.02);
  } else if (unit.kind === 'hacker') {
    bobY = Math.sin(nowMs / 460 + unit.y) * (s * 0.015);
  }
  if (isStunned) {
    wobbleX = Math.sin(nowMs / 68 + unit.x) * 1.4;
  }
  if (hitFlash) {
    const f = 1 - hitFlash.elapsedMs / hitFlash.durationMs;
    wobbleX += Math.sin(hitFlash.elapsedMs * 0.48) * 3.8 * f;
  }

  const cx = rect.x + s / 2 + wobbleX;
  const cy = rect.y + s / 2 + bobY;
  const flashRatio = hitFlash ? Math.max(0, 1 - hitFlash.elapsedMs / hitFlash.durationMs) : 0;
  const isFlash = flashRatio > 0.4;

  ctx.save();
  if (unit.dormant) ctx.globalAlpha = 0.45;

  // Ground contact focal aura / hover shadow
  if (unit.faction === 'player') {
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / (isRedline ? 135 : 440));
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 0.72);
    if (isRedline) {
      grad.addColorStop(0, `rgba(255, 23, 68, ${(0.36 + pulse * 0.2).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255, 23, 68, 0)');
    } else {
      grad.addColorStop(0, `rgba(0, 240, 255, ${(0.22 + pulse * 0.1).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x - 8, rect.y - 8, s + 16, s + 16);
  } else {
    // Ground grounding ellipse under standing / hovering enemies
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(rect.x + s / 2, rect.y + s * 0.86, s * 0.28, s * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (unit.kind) {
    case 'player': {
      // === PLAYER: Concrete Detailed Full-Body Cyberpunk Solo Mercenary (3/4 Combat Stance) ===
      // Clearly shows: Cyber Samurai Helmet + Kiroshi Yellow Visor, High-Collar Armored Torso + Crimson Reactor,
      // Left Articulated Hydraulic Power Fist, Right Articulated Arm + Thermal Cyber-Katana,
      // Articulated Knee-Jointed Hover Legs + Anti-Grav Foot Thrusters!
      ctx.save();
      ctx.scale(flipX, 1);

      const primary = isFlash ? '#ffffff' : isRedline ? CRIMSON : CYAN;
      const seam = isRedline ? 'rgba(255, 23, 68, 0.45)' : 'rgba(0, 240, 255, 0.42)';

      // 1. Hover Thruster Plumes under Cyber-Boots
      const hPulse = 0.55 + 0.45 * Math.sin(nowMs / 170);
      ctx.strokeStyle = `rgba(0, 240, 255, ${hPulse.toFixed(2)})`;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-u * 0.52, u * 0.84);
      ctx.lineTo(-u * 0.16, u * 0.84);
      ctx.moveTo(u * 0.12, u * 0.84);
      ctx.lineTo(u * 0.48, u * 0.84);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 2. Articulated Armored Cyber-Legs (Thigh Armor -> Mechanical Knee Drum -> Angled Shin -> Boot)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.65;

      // Rear Left Leg (braced back)
      ctx.beginPath();
      ctx.moveTo(-u * 0.22, u * 0.12);
      ctx.lineTo(-u * 0.4, u * 0.44); // knee outer
      ctx.lineTo(-u * 0.46, u * 0.78); // boot heel
      ctx.lineTo(-u * 0.18, u * 0.78); // boot toe
      ctx.lineTo(-u * 0.22, u * 0.46); // knee inner
      ctx.lineTo(-u * 0.02, u * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Front Right Leg (stepping forward)
      ctx.beginPath();
      ctx.moveTo(0, u * 0.12);
      ctx.lineTo(u * 0.24, u * 0.12);
      ctx.lineTo(u * 0.4, u * 0.44); // knee outer
      ctx.lineTo(u * 0.44, u * 0.78); // boot toe
      ctx.lineTo(u * 0.16, u * 0.78); // boot heel
      ctx.lineTo(u * 0.18, u * 0.46);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Knee servo joint caps + shin armor seams
      ctx.fillStyle = OBSIDIAN_MID;
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      for (const [kx, ky] of [
        [-u * 0.31, u * 0.45],
        [u * 0.29, u * 0.45],
      ]) {
        ctx.beginPath();
        ctx.arc(kx, ky, u * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 3. Left Cyber-Arm: Articulated Hydraulic Gorilla / Power Fist!
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.7;
      // Upper arm + shoulder pauldron
      ctx.beginPath();
      ctx.moveTo(-u * 0.34, -u * 0.48);
      ctx.lineTo(-u * 0.66, -u * 0.34);
      ctx.lineTo(-u * 0.72, -u * 0.08);
      ctx.lineTo(-u * 0.42, -u * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Oversized Heavy Hydraulic Fist Gauntlet
      ctx.fillStyle = OBSIDIAN_MID;
      drawChamferBox(ctx, -u * 0.94, -u * 0.1, u * 0.42, u * 0.46, u * 0.1);
      ctx.fill();
      ctx.stroke();
      // Fist knuckle energy strip (Yellow) + hydraulic piston line
      ctx.fillStyle = YELLOW;
      ctx.fillRect(-u * 0.88, u * 0.2, u * 0.28, u * 0.1);
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.86, u * 0.04);
      ctx.lineTo(-u * 0.58, u * 0.04);
      ctx.stroke();

      // 4. High-Collar Cyber-Jacket & Segmented Chest Armor Torso
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.85;
      ctx.beginPath();
      ctx.moveTo(-u * 0.32, -u * 0.56); // upturned samurai collar back
      ctx.lineTo(u * 0.28, -u * 0.56); // collar front
      ctx.lineTo(u * 0.46, -u * 0.4); // right shoulder armor
      ctx.lineTo(u * 0.3, u * 0.14); // armored waist right
      ctx.lineTo(-u * 0.26, u * 0.14); // armored waist left
      ctx.lineTo(-u * 0.44, -u * 0.4); // left shoulder armor
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 1px Internal Chest Armor Plate Seams & Belt
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.36, -u * 0.34);
      ctx.lineTo(0, -u * 0.18);
      ctx.lineTo(u * 0.36, -u * 0.34);
      ctx.moveTo(-u * 0.26, u * 0.02);
      ctx.lineTo(u * 0.28, u * 0.02);
      ctx.stroke();

      // Solid Crimson Reactor Core Cell on Chest
      ctx.fillStyle = CRIMSON;
      ctx.shadowColor = CRIMSON;
      ctx.shadowBlur = 6;
      ctx.fillRect(-u * 0.11, -u * 0.24, u * 0.22, u * 0.18);
      ctx.shadowBlur = 0;

      // 5. Right Cyber-Arm + Iconic CraftPixel Thermal High-Frequency Katana!
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.65;
      // Right forearm reaching forward-right
      ctx.beginPath();
      ctx.moveTo(u * 0.36, -u * 0.38);
      ctx.lineTo(u * 0.64, -u * 0.16);
      ctx.lineTo(u * 0.56, u * 0.04);
      ctx.lineTo(u * 0.28, -u * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cyber-Katana Blade sweeping cleanly up-forward (matte black + cyan edge + yellow thermal spine + red guard!)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(u * 0.56, -u * 0.06);
      ctx.lineTo(u * 1.06, -u * 0.78); // long razor tip
      ctx.lineTo(u * 1.04, -u * 0.42);
      ctx.lineTo(u * 0.64, u * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Yellow thermal edge along blade + crimson hilt emitter
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(u * 0.64, -u * 0.14);
      ctx.lineTo(u * 1.02, -u * 0.68);
      ctx.stroke();
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(u * 0.5, -u * 0.08, u * 0.14, u * 0.14);

      // 6. Detailed Angular Cyber-Helmet (Crown, Jaw Guard, Ear Comms, Kiroshi Yellow Visor Slash)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-u * 0.22, -u * 0.92); // back crown
      ctx.lineTo(u * 0.16, -u * 0.92); // front crown
      ctx.lineTo(u * 0.28, -u * 0.72); // visor brow
      ctx.lineTo(u * 0.2, -u * 0.56); // armored jaw
      ctx.lineTo(-u * 0.18, -u * 0.58); // neck guard
      ctx.lineTo(-u * 0.26, -u * 0.74); // ear sensor
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Jaw respirator seam
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.1, -u * 0.62);
      ctx.lineTo(u * 0.18, -u * 0.62);
      ctx.stroke();

      // Solid Electric-Yellow Kiroshi Optical Visor Slash
      ctx.fillStyle = YELLOW;
      ctx.shadowColor = YELLOW;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(-u * 0.04, -u * 0.78);
      ctx.lineTo(u * 0.26, -u * 0.75);
      ctx.lineTo(u * 0.23, -u * 0.67);
      ctx.lineTo(-u * 0.06, -u * 0.7);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      break;
    }

    case 'grunt': {
      // === SECURITY GRUNT: Detailed Arasaka Tactical Trooper (Armored Legs, Riot Shield, Raised Shock Baton, Full Helmet) ===
      ctx.save();
      ctx.scale(flipX, 1);

      const primary = isFlash ? '#ffffff' : CRIMSON;
      const seam = 'rgba(255, 23, 68, 0.45)';

      // 1. Armored Tactical Combat Legs with knee plates & boots
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.6;
      // Rear leg
      ctx.beginPath();
      ctx.moveTo(-u * 0.22, u * 0.14);
      ctx.lineTo(-u * 0.44, u * 0.78);
      ctx.lineTo(-u * 0.18, u * 0.78);
      ctx.lineTo(-u * 0.04, u * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Front leg
      ctx.beginPath();
      ctx.moveTo(0, u * 0.14);
      ctx.lineTo(u * 0.22, u * 0.14);
      ctx.lineTo(u * 0.4, u * 0.78);
      ctx.lineTo(u * 0.14, u * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 2. Rear Arm Raising High-Voltage Shock Baton (with glowing cyan electric coil tip!)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-u * 0.34, -u * 0.42);
      ctx.lineTo(-u * 0.66, -u * 0.22);
      ctx.lineTo(-u * 0.56, -u * 0.06);
      ctx.lineTo(-u * 0.28, -u * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Shock Baton shaft + electric cyan stun prong
      ctx.strokeStyle = '#9db6d1';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-u * 0.62, -u * 0.14);
      ctx.lineTo(-u * 0.88, -u * 0.68);
      ctx.stroke();
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-u * 0.76, -u * 0.42);
      ctx.lineTo(-u * 0.9, -u * 0.72);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. Tactical Armor Chest Rig
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = 'rgba(255, 23, 68, 0.5)';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-u * 0.34, -u * 0.5);
      ctx.lineTo(u * 0.28, -u * 0.5);
      ctx.lineTo(u * 0.36, -u * 0.28);
      ctx.lineTo(u * 0.24, u * 0.16);
      ctx.lineTo(-u * 0.24, u * 0.16);
      ctx.lineTo(-u * 0.38, -u * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Chest tactical harness seams
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.24, -u * 0.38);
      ctx.lineTo(0, -u * 0.12);
      ctx.lineTo(u * 0.22, -u * 0.38);
      ctx.moveTo(-u * 0.22, u * 0.02);
      ctx.lineTo(u * 0.22, u * 0.02);
      ctx.stroke();

      // 4. Detailed Forward Hexagonal Riot Energy-Shield (Cyan 2px rim + matte dark body + crimson visor slit)
      ctx.fillStyle = OBSIDIAN_MID;
      ctx.strokeStyle = isFlash ? '#ffffff' : CYAN;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.48)';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.85;
      drawChamferBox(ctx, u * 0.32, -u * 0.52, u * 0.56, u * 1.06, u * 0.14);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Shield internal structural line & crimson viewport
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.38)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(u * 0.46, -u * 0.4);
      ctx.lineTo(u * 0.46, u * 0.42);
      ctx.moveTo(u * 0.74, -u * 0.4);
      ctx.lineTo(u * 0.74, u * 0.42);
      ctx.stroke();
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(u * 0.44, -u * 0.32, u * 0.32, u * 0.12);

      // 5. Full Enclosed Arasaka Security Helmet + Yellow Optical Scanner Slit + Comms Antenna
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-u * 0.22, -u * 0.78);
      ctx.lineTo(-u * 0.32, -u * 0.96);
      ctx.stroke();

      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.65;
      ctx.beginPath();
      ctx.moveTo(-u * 0.22, -u * 0.88);
      ctx.lineTo(u * 0.16, -u * 0.88);
      ctx.lineTo(u * 0.26, -u * 0.68);
      ctx.lineTo(u * 0.16, -u * 0.54);
      ctx.lineTo(-u * 0.2, -u * 0.56);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = YELLOW;
      ctx.shadowColor = YELLOW;
      ctx.shadowBlur = 5;
      ctx.fillRect(-u * 0.04, -u * 0.75, u * 0.28, u * 0.11);

      ctx.restore();
      break;
    }

    case 'enforcer': {
      // === TREADED ENFORCER: Detailed Heavy Borg Juggernaut on Armored Tank Treads + Legendary Dual-Rail EMP Cannon ===
      ctx.save();
      ctx.scale(flipX, 1);

      const primary = isFlash ? '#ffffff' : AMBER;
      const seam = 'rgba(255, 171, 46, 0.45)';

      // 1. Detailed Armored Tank Tread Chassis (outer track belt + 3 road wheels + top armor skirt)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.9;
      drawChamferBox(ctx, -u * 0.92, u * 0.26, u * 1.84, u * 0.52, u * 0.2);
      ctx.fill();
      ctx.stroke();

      // Road wheels & track tension bar
      ctx.strokeStyle = 'rgba(255, 171, 46, 0.58)';
      ctx.lineWidth = 1.25;
      for (const wx of [-u * 0.56, 0, u * 0.56]) {
        ctx.beginPath();
        ctx.arc(wx, u * 0.52, u * 0.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = CYAN;
        ctx.fillRect(wx - 1.2, u * 0.52 - 1.2, 2.4, 2.4);
      }
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.72, u * 0.36);
      ctx.lineTo(u * 0.72, u * 0.36);
      ctx.stroke();

      // 2. Massive Broad-Shouldered Borg Upper Hull (Tiered Pauldrons + Reactor Chest Grille)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = 'rgba(255, 171, 46, 0.52)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.95;
      ctx.beginPath();
      ctx.moveTo(-u * 0.68, u * 0.26);
      ctx.lineTo(-u * 0.84, -u * 0.36); // heavy rear shoulder armor
      ctx.lineTo(-u * 0.52, -u * 0.72); // towering pauldron peak
      ctx.lineTo(-u * 0.22, -u * 0.62);
      ctx.lineTo(u * 0.22, -u * 0.62);
      ctx.lineTo(u * 0.56, -u * 0.72); // front pauldron peak
      ctx.lineTo(u * 0.74, -u * 0.3);
      ctx.lineTo(u * 0.62, u * 0.26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Chest reactor grille ribs & caution lines
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.54, -u * 0.28);
      ctx.lineTo(0, -u * 0.12);
      ctx.lineTo(u * 0.46, -u * 0.28);
      ctx.moveTo(-u * 0.4, u * 0.04);
      ctx.lineTo(u * 0.36, u * 0.04);
      ctx.moveTo(-u * 0.34, u * 0.14);
      ctx.lineTo(u * 0.3, u * 0.14);
      ctx.stroke();

      // Glowing crimson furnace core behind chest grille
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(-u * 0.2, -u * 0.1, u * 0.24, u * 0.12);

      // 3. Recessed Armored Borg Skull-Helmet + Sinister Crimson Tri-Optic
      ctx.fillStyle = OBSIDIAN_MID;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.65;
      ctx.beginPath();
      ctx.moveTo(-u * 0.22, -u * 0.9);
      ctx.lineTo(u * 0.2, -u * 0.9);
      ctx.lineTo(u * 0.28, -u * 0.64);
      ctx.lineTo(u * 0.18, -u * 0.52);
      ctx.lineTo(-u * 0.22, -u * 0.54);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = CRIMSON;
      ctx.shadowColor = CRIMSON;
      ctx.shadowBlur = 7;
      ctx.fillRect(-u * 0.08, -u * 0.76, u * 0.32, u * 0.12);
      ctx.shadowBlur = 0;

      // 4. Oversized Severable Legendary Dual-Rail EMP Cannon Arm (CraftPixel heavy firearm!)
      ctx.fillStyle = OBSIDIAN_MID;
      ctx.strokeStyle = isFlash ? '#ffffff' : YELLOW;
      ctx.shadowColor = 'rgba(252, 238, 10, 0.55)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.9;
      // Heavy receiver housing + twin parallel rails
      drawChamferBox(ctx, u * 0.06, -u * 0.38, u * 0.62, u * 0.44, u * 0.09);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(u * 0.66, -u * 0.32, u * 0.46, u * 0.11);
      ctx.strokeRect(u * 0.66, -u * 0.32, u * 0.46, u * 0.11);
      ctx.fillRect(u * 0.66, -u * 0.11, u * 0.46, u * 0.11);
      ctx.strokeRect(u * 0.66, -u * 0.11, u * 0.46, u * 0.11);
      ctx.shadowBlur = 0;

      // Cyan railgun energy channel + crimson cooling vent
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(u * 0.52, -u * 0.16);
      ctx.lineTo(u * 1.14, -u * 0.16);
      ctx.stroke();
      ctx.fillStyle = CRIMSON;
      ctx.fillRect(u * 0.2, -u * 0.26, u * 0.18, u * 0.2);

      ctx.restore();
      break;
    }

    case 'hacker': {
      // === CORP HACKER: Detailed Cyberpunk Netrunner (Longcoat + Legs + Neural Cables + Holo Terminal + Data Spike) ===
      ctx.save();
      ctx.scale(flipX, 1);

      const primary = isFlash ? '#ffffff' : MAGENTA;
      const seam = 'rgba(234, 76, 255, 0.42)';

      // 1. Dual Curved Neural Interface Cables streaming from skull jack
      ctx.strokeStyle = 'rgba(234, 76, 255, 0.72)';
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.moveTo(-u * 0.18, -u * 0.74);
      ctx.quadraticCurveTo(-u * 0.66, -u * 0.96, -u * 0.82, -u * 0.38);
      ctx.moveTo(-u * 0.18, -u * 0.62);
      ctx.quadraticCurveTo(-u * 0.6, -u * 0.68, -u * 0.78, -u * 0.08);
      ctx.stroke();

      // 2. Slender Cyber-Legs beneath open longcoat hem
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = '#9c68c9';
      ctx.lineWidth = 1.4;
      ctx.fillRect(-u * 0.26, u * 0.44, u * 0.16, u * 0.34);
      ctx.strokeRect(-u * 0.26, u * 0.44, u * 0.16, u * 0.34);
      ctx.fillRect(u * 0.08, u * 0.44, u * 0.16, u * 0.34);
      ctx.strokeRect(u * 0.08, u * 0.44, u * 0.16, u * 0.34);

      // 3. High-Collar Cyber Longcoat Silhouette
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = 'rgba(234, 76, 255, 0.55)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.85;
      ctx.beginPath();
      ctx.moveTo(-u * 0.32, -u * 0.58); // upturned collar back
      ctx.lineTo(u * 0.26, -u * 0.56); // collar front
      ctx.lineTo(u * 0.4, -u * 0.34);
      ctx.lineTo(u * 0.3, u * 0.08);
      ctx.lineTo(u * 0.52, u * 0.62); // flaring coat hem right
      ctx.lineTo(u * 0.14, u * 0.5);
      ctx.lineTo(0, u * 0.34); // coat split
      ctx.lineTo(-u * 0.16, u * 0.5);
      ctx.lineTo(-u * 0.54, u * 0.62); // flaring coat hem left
      ctx.lineTo(-u * 0.32, u * 0.08);
      ctx.lineTo(-u * 0.42, -u * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Internal circuit lapel & cyberdeck belt chip
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-u * 0.2, -u * 0.48);
      ctx.lineTo(0, u * 0.16);
      ctx.lineTo(u * 0.2, -u * 0.48);
      ctx.stroke();
      ctx.fillStyle = YELLOW;
      ctx.fillRect(-u * 0.12, u * 0.06, u * 0.24, u * 0.12);

      // 4. Extended Cyber-Arm + Floating Cyan Holo-Terminal & Pronged Data-Spike!
      ctx.fillStyle = OBSIDIAN_MID;
      ctx.strokeStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.75;
      // Floating holographic keyboard/interface screen
      ctx.beginPath();
      ctx.moveTo(u * 0.52, -u * 0.44);
      ctx.lineTo(u * 0.86, -u * 0.34);
      ctx.lineTo(u * 0.78, u * 0.04);
      ctx.lineTo(u * 0.44, -u * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Data spike prong piercing forward + pulsing signal arc
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(u * 0.54, -u * 0.24);
      ctx.lineTo(u * 0.76, -u * 0.18);
      ctx.moveTo(u * 0.52, -u * 0.12);
      ctx.lineTo(u * 0.7, -u * 0.08);
      ctx.stroke();

      const waveT = (nowMs / 1000) % 1;
      ctx.strokeStyle = `rgba(0, 240, 255, ${(Math.sin(waveT * Math.PI) * 0.75).toFixed(2)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(u * 0.82, -u * 0.18, u * (0.14 + waveT * 0.32), -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();

      // 5. Netrunner Hooded Head + Wrapping Neon-Cyan Braindance Goggles
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.65;
      ctx.beginPath();
      ctx.moveTo(-u * 0.2, -u * 0.92);
      ctx.lineTo(u * 0.16, -u * 0.9);
      ctx.lineTo(u * 0.26, -u * 0.68);
      ctx.lineTo(u * 0.14, -u * 0.55);
      ctx.lineTo(-u * 0.2, -u * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 7;
      ctx.fillRect(-u * 0.14, -u * 0.77, u * 0.4, u * 0.13);

      ctx.restore();
      break;
    }

    case 'drone': {
      // === RECON DRONE: Detailed Quad-Rotor Frame + CraftPixel Kiroshi Hex Optic Pod + Underslung Laser ===
      const primary = isFlash ? '#ffffff' : CYAN;

      // 4 diagonal armored rotor booms + shrouded rotor rings
      const arms = [
        [-u * 0.76, -u * 0.7],
        [u * 0.76, -u * 0.7],
        [u * 0.76, u * 0.7],
        [-u * 0.76, u * 0.7],
      ];
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const [ax, ay] of arms) {
        ctx.moveTo(0, 0);
        ctx.lineTo(ax, ay);
      }
      ctx.stroke();

      const spin = (nowMs / 65) % (Math.PI * 2);
      for (const [ax, ay] of arms) {
        // Outer dark shroud ring
        ctx.fillStyle = OBSIDIAN;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(ax, ay, u * 0.27, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // High-speed spinning rotor arcs
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ax, ay, u * 0.22, spin, spin + Math.PI * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax, ay, u * 0.22, spin + Math.PI, spin + Math.PI * 1.7);
        ctx.stroke();
      }

      // Matte Obsidian Hexagonal Kiroshi Optic Hull (double-bevel CraftPixel signature!)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
      ctx.shadowBlur = 9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-u * 0.64, 0);
      ctx.lineTo(-u * 0.34, -u * 0.48);
      ctx.lineTo(u * 0.34, -u * 0.48);
      ctx.lineTo(u * 0.64, 0);
      ctx.lineTo(u * 0.34, u * 0.48);
      ctx.lineTo(-u * 0.34, u * 0.48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top & bottom sensor clamp bars (CraftPixel Tech #08 signature detail!)
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.3;
      ctx.fillRect(-u * 0.28, -u * 0.62, u * 0.56, u * 0.12);
      ctx.strokeRect(-u * 0.28, -u * 0.62, u * 0.56, u * 0.12);
      ctx.fillRect(-u * 0.28, u * 0.5, u * 0.56, u * 0.12);
      ctx.strokeRect(-u * 0.28, u * 0.5, u * 0.56, u * 0.12);

      // Concentric optic iris + solid yellow scanner ring + crimson floating status bar
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.34, 0, Math.PI * 2);
      ctx.stroke();

      const eyePulse = 0.8 + 0.2 * Math.sin(nowMs / 210);
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.arc(face.x * u * 0.08, face.y * u * 0.08, u * 0.16 * eyePulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = CRIMSON;
      ctx.fillRect(u * 0.44, -u * 0.44, u * 0.2, u * 0.1);
      break;
    }

    case 'sentry': {
      // === FIXED SENTRY: Bolted Tri-Leg Hydraulic Base + Detailed 360° Rotating Dual-Rail Turret ===
      const primary = isFlash ? '#ffffff' : YELLOW;

      // 3 hydraulic anchor tripod legs with bolted foot pads
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3 + Math.PI / 6;
        ctx.strokeStyle = isFlash ? '#ffffff' : '#6c84a3';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * u * 0.3, Math.sin(a) * u * 0.3);
        ctx.lineTo(Math.cos(a) * u * 0.88, Math.sin(a) * u * 0.88);
        ctx.stroke();

        ctx.fillStyle = OBSIDIAN;
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * u * 0.88, Math.sin(a) * u * 0.88, u * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Turret slew ring
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.56, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Rotating turret assembly aligned with unit.facing
      ctx.save();
      ctx.rotate(faceAngle);

      // Dual long railgun barrels with muzzle brakes
      ctx.fillStyle = OBSIDIAN;
      ctx.strokeStyle = primary;
      ctx.shadowColor = 'rgba(252, 238, 10, 0.5)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.85;
      ctx.fillRect(u * 0.22, -u * 0.26, u * 0.86, u * 0.17);
      ctx.strokeRect(u * 0.22, -u * 0.26, u * 0.86, u * 0.17);
      ctx.fillRect(u * 0.22, u * 0.09, u * 0.86, u * 0.17);
      ctx.strokeRect(u * 0.22, u * 0.09, u * 0.86, u * 0.17);

      // Heavy armored octagonal turret body + rear ammo drum
      drawChamferBox(ctx, -u * 0.58, -u * 0.48, u * 1.0, u * 0.96, u * 0.22);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Internal optical sensor ring & cooling vents
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.48)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(-u * 0.06, 0, u * 0.28, 0, Math.PI * 2);
      ctx.stroke();

      // Solid Crimson targeting radar eye & muzzle laser diode
      ctx.fillStyle = CRIMSON;
      ctx.shadowColor = CRIMSON;
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(-u * 0.06, 0, u * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(u * 0.96, -u * 0.05, u * 0.14, u * 0.1);

      ctx.restore();
      break;
    }
  }

  ctx.restore(); // undo translate

  // Sleek micro HP bar along bottom edge
  if (unit.maxHp > 0) {
    const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    const barW = s - 12;
    const barH = Math.min(3.5, Math.max(2.5, Math.round(s * 0.055)));
    const bx = rect.x + 6;
    const by = rect.y + s - barH - 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle =
      unit.faction === 'player'
        ? ratio > 0.35
          ? '#00f0ff'
          : CRIMSON
        : ratio > 0.45
          ? '#ff4d63'
          : '#ffab2e';
    ctx.fillRect(bx, by, barW * ratio, barH);
  }

  if (hasLootUnder) {
    ctx.fillStyle = YELLOW;
    ctx.beginPath();
    ctx.arc(rect.x + s - 6, rect.y + s - 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawChamferBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

export { RARITY_COLORS };
