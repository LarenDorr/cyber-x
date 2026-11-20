import {
  DAMAGE_TYPE_META,
  DIR_ARROWS,
  PROP_GLYPHS,
  RARITY_COLORS,
  STATUS_BADGES,
  SURFACE_STYLES,
  TILE_GLYPHS,
  UNIT_GLYPHS,
} from '../render/glyphs.ts';
import { getTile } from '../render/mockScene.ts';
import type { PartView, RenderSnapshot, Vec2 } from '../render/viewModel.ts';
import { CombatLogView } from './log.ts';

export interface VitalsCallbacks {
  onSetHeatPreset: (heat: number) => void;
  onUseConsumable: (index: number) => void;
}

/**
 * Bottom horizontal instrument strip combining Core HP, AP pips, 3-zone Heat gauge,
 * independent 2-slot Consumables, and Scrap directly above the 1~6 Action Bar.
 */
export class BottomVitalsHud {
  private container: HTMLElement;
  private callbacks: VitalsCallbacks;

  constructor(container: HTMLElement, callbacks: VitalsCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  render(snapshot: RenderSnapshot): void {
    const p = snapshot.player;
    const hpPct = Math.round((p.hp / Math.max(1, p.maxHp)) * 100);
    const heatPct = Math.max(0, Math.min(100, Math.round((p.heat / p.maxHeat) * 100)));
    const heatZone =
      p.heat >= 80
        ? { label: '红温', cls: 'zone-redline', color: '#ff3850' }
        : p.heat >= 41
          ? { label: '过热', cls: 'zone-overheat', color: '#ff9436' }
          : { label: '冷却', cls: 'zone-cool', color: '#47d9ff' };

    const apPips: string[] = [];
    for (let i = 0; i < p.maxAp; i++) {
      const filled = i < p.ap;
      const isCarry = filled && i === p.ap - 1 && p.carryoverAp > 0;
      apPips.push(
        `<span class="ap-pip ${filled ? 'filled' : ''} ${isCarry ? 'carry' : ''}" title="${
          isCarry ? '含结转 AP (+1)' : '行动点'
        }"></span>`,
      );
    }

    const consumablesHtml = p.consumables
      .map((item, idx) => {
        if (!item) {
          return `<div class="cons-chip empty" title="独立消耗品空槽"><span>C${idx + 1} 空</span></div>`;
        }
        return `
          <button type="button" class="cons-chip filled" data-cons="${idx}" title="${item.summary}">
            <span class="cons-key">0AP</span>
            <span class="cons-name">${item.name}</span>
            <span class="cons-count">×${item.count}</span>
          </button>
        `;
      })
      .join('');

    this.container.innerHTML = `
      <div class="vital-module vital-hp">
        <div class="vital-top">
          <span class="vital-label">核心 HP</span>
          <strong class="val-hp">${p.hp}/${p.maxHp}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-hp" style="width:${hpPct}%"></div>
        </div>
      </div>

      <div class="vital-module vital-ap">
        <div class="vital-top">
          <span class="vital-label">行动点 AP</span>
          <strong class="val-ap">${p.ap}/${p.maxAp}</strong>
        </div>
        <div class="ap-pips">${apPips.join('')}</div>
      </div>

      <div class="vital-module vital-heat">
        <div class="vital-top">
          <span class="vital-label">
            热量 <em class="heat-zone-tag ${heatZone.cls}">${heatZone.label}</em>
            <span class="heat-cool-sub">-${p.heatCooldownPerTurn}/T</span>
          </span>
          <div class="vital-heat-right">
            <strong style="color:${heatZone.color}">${p.heat}/${p.maxHeat}</strong>
            <div class="heat-presets" title="快速切换三段温区验色">
              <button type="button" data-heat="25" class="${p.heat <= 40 ? 'active' : ''}">冷</button>
              <button type="button" data-heat="56" class="${p.heat > 40 && p.heat < 80 ? 'active' : ''}">热</button>
              <button type="button" data-heat="88" class="${p.heat >= 80 ? 'active' : ''}">红</button>
            </div>
          </div>
        </div>
        <div class="heat-track">
          <div class="heat-fill" style="width:${heatPct}%;background:${heatZone.color}"></div>
          <span class="heat-mark" style="left:40%" title="40: 过热阈值"><i>40</i></span>
          <span class="heat-mark mark-red" style="left:80%" title="80: 红温放电阈值"><i>80</i></span>
          <span class="heat-mark mark-melt" style="left:99.5%" title="100: 熔毁爆炸"><i>100</i></span>
        </div>
      </div>

      <div class="vital-module vital-cons">
        <div class="vital-top">
          <span class="vital-label">消耗品 (2格)</span>
          <span class="scrap-pill">废料 ${p.scrap}</span>
        </div>
        <div class="cons-strip">${consumablesHtml}</div>
      </div>
    `;

    this.container.querySelectorAll<HTMLButtonElement>('[data-heat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSetHeatPreset(Number(btn.dataset.heat));
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-cons]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onUseConsumable(Number(btn.dataset.cons));
      });
    });
  }
}

/**
 * Right tactical sidebar dedicated to:
 * 1) Humanoid Anatomy Chassis Schematic (Head / Left Arm / Torso / Right Arm / Legs + Back x4)
 * 2) Live Hovered Tile Inspector
 * 3) Scrolling Combat Event Log
 */
export class TacticalSidebar {
  private loadoutEl: HTMLElement;
  private inspectEl: HTMLElement;
  private logView: CombatLogView;

  constructor(container: HTMLElement) {
    container.innerHTML = `
      <div class="sidebar-section" data-sec="loadout"></div>
      <div class="sidebar-section sidebar-inspect" data-sec="inspect"></div>
      <div class="sidebar-section sidebar-log-wrap">
        <div class="section-head">
          <span>战斗事件流</span>
          <span class="section-sub">EVENT LOG</span>
        </div>
        <div class="log-list" data-sec="log"></div>
      </div>
    `;

    this.loadoutEl = container.querySelector('[data-sec="loadout"]')!;
    this.inspectEl = container.querySelector('[data-sec="inspect"]')!;
    this.logView = new CombatLogView(container.querySelector('[data-sec="log"]')!);
  }

  render(snapshot: RenderSnapshot, hoverTile: Vec2 | null): void {
    this.renderHumanoidLoadout(snapshot);
    this.renderInspector(snapshot, hoverTile);
    this.logView.render(snapshot.logs);
  }

  private renderHumanoidLoadout(snapshot: RenderSnapshot): void {
    const p = snapshot.player;
    const renderPartNode = (
      slotTitle: string,
      part: PartView,
      areaClass: string,
      isCore = false,
    ): string => {
      const rc = RARITY_COLORS[part.rarity];
      const durPct = Math.round((part.durability / Math.max(1, part.maxDurability)) * 100);
      const cargoHtml = part.cargoItem
        ? `<div class="cargo-sub" style="color:${RARITY_COLORS[part.cargoItem.rarity].fg}">
            └ ${part.cargoItem.name} (${part.cargoItem.integrityPct}%)${part.cargoItem.virus ? ' ☣' : ''}
           </div>`
        : '';
      return `
        <div class="part-card ${areaClass} ${isCore ? 'is-core' : ''}" style="border-left-color:${rc.border}" title="${part.summary}">
          <div class="part-top">
            <span class="part-slot">${slotTitle}</span>
            <span class="part-dur">${part.durability}/${part.maxDurability}</span>
          </div>
          <div class="part-name" style="color:${rc.fg}">
            ${part.name}${part.virus ? '<span class="virus-chip">☣</span>' : ''}
          </div>
          <div class="part-bar"><div style="width:${durPct}%;background:${rc.fg}"></div></div>
          ${cargoHtml}
        </div>
      `;
    };

    const headTags = p.chassisTags
      .map((t) => `<span class="head-tag">[${t}]</span>`)
      .join('');

    const backCards = p.back
      .map((part, idx) => renderPartNode(`背${idx + 1}`, part, 'area-back'))
      .join('');

    this.loadoutEl.innerHTML = `
      <div class="section-head">
        <span>人形机体结构</span>
        <span class="section-sub">${p.name}</span>
      </div>

      <div class="humanoid-diagram">
        <!-- Cybernetic humanoid frame conduits & silhouette linking Head -> Torso -> Arms & Legs -->
        <svg class="humanoid-wires" viewBox="0 0 320 214" preserveAspectRatio="none" aria-hidden="true">
          <!-- Subtle mech torso/limb silhouette backdrop -->
          <path class="mech-silhouette" d="M 142 18 L 178 18 L 182 44 L 138 44 Z M 116 70 L 204 70 L 194 140 L 126 140 Z M 136 144 L 154 144 L 150 202 L 130 202 Z M 166 144 L 184 144 L 190 202 L 170 202 Z" />
          <!-- Neck spine: Head -> Chest -->
          <line x1="160" y1="42" x2="160" y2="70" />
          <!-- Shoulder crossbar: Left Arm <-> Chest <-> Right Arm -->
          <path d="M 94 104 L 112 104 M 208 104 L 226 104" />
          <!-- Lower spine & dual leg conduits: Chest -> Legs -->
          <path d="M 160 138 L 160 151 M 136 151 L 184 151 M 136 151 L 136 164 M 184 151 L 184 164" />
          <!-- Joint nodes -->
          <circle cx="160" cy="56" r="2.3" />
          <circle cx="103" cy="104" r="2.3" />
          <circle cx="217" cy="104" r="2.3" />
          <circle cx="160" cy="151" r="2.3" />
        </svg>

        <!-- Head (chassis sensor/optic tag carrier) -->
        <div class="part-card area-head" title="头部底盘层：不占装备槽，承载义眼与传感标签">
          <div class="part-top">
            <span class="part-slot">头部</span>
            <span class="part-dur">义眼层</span>
          </div>
          <div class="head-tag-row">${headTags}</div>
        </div>

        <!-- Arms & Torso -->
        ${renderPartNode('左臂', p.armL, 'area-arm-l')}
        ${renderPartNode('躯干核心', p.chest, 'area-chest', true)}
        ${renderPartNode('右臂', p.armR, 'area-arm-r')}

        <!-- Legs -->
        ${renderPartNode('下肢', p.legs, 'area-legs')}
      </div>

      <div class="back-section-label">
        <span>背部挂载 (4 槽 · 货舱/散热共享)</span>
      </div>
      <div class="back-grid">
        ${backCards}
      </div>
    `;
  }

  private renderInspector(snapshot: RenderSnapshot, hoverTile: Vec2 | null): void {
    if (!hoverTile) {
      this.inspectEl.innerHTML = `
        <div class="section-head">
          <span>悬停格检视</span>
          <span class="section-sub">HOVER TILE</span>
        </div>
        <div class="inspect-empty">将鼠标移至棋盘任意格，查看地表互斥层、实体标签与威胁意图。</div>
      `;
      return;
    }

    const cell = getTile(snapshot, hoverTile.x, hoverTile.y);
    if (!cell || cell.kind === 'void') {
      this.inspectEl.innerHTML = `
        <div class="section-head"><span>悬停格检视</span><span class="section-sub">(${hoverTile.x}, ${hoverTile.y})</span></div>
        <div class="inspect-empty">房间边界外部区域</div>
      `;
      return;
    }

    if (!cell.revealed) {
      this.inspectEl.innerHTML = `
        <div class="section-head"><span>悬停格检视</span><span class="section-sub">(${cell.x}, ${cell.y}) · 未揭示</span></div>
        <div class="inspect-empty">房间级迷雾遮蔽：破门 (+) 后立即揭示内部布局并激活休眠敌人。</div>
      `;
      return;
    }

    const room = snapshot.rooms.find((r) => r.id === cell.roomId);
    const tileGlyph = TILE_GLYPHS[cell.kind];
    const surf = SURFACE_STYLES[cell.surface];
    const unit = snapshot.units.find((u) => u.x === cell.x && u.y === cell.y);
    const props = snapshot.props.filter((p) => p.x === cell.x && p.y === cell.y);
    const threats = snapshot.intents.filter(
      (i) => !i.disabled && i.affectedTiles.some((t) => t.x === cell.x && t.y === cell.y),
    );

    const blocks: string[] = [];

    const surfTags = surf.tags.map((t) => `<span class="tag-chip">[${t}]</span>`).join('');
    blocks.push(`
      <div class="inspect-line">
        <span class="inspect-badge" style="color:${tileGlyph.color}">${tileGlyph.char}</span>
        <span>${tileGlyph.label} · <strong style="color:${cell.surface === 'none' ? '#9cb0c9' : '#7ae8ff'}">${surf.label}</strong>${
          cell.surfaceTurns ? ` (${cell.surfaceTurns}回合)` : ''
        }</span>
      </div>
      ${surfTags ? `<div class="tag-row">${surfTags}</div>` : ''}
    `);

    if (unit) {
      const ug = UNIT_GLYPHS[unit.kind];
      const statusHtml = unit.statuses
        .map((st) => {
          const b = STATUS_BADGES[st];
          return `<span class="status-pill" style="background:${b.bg};color:${b.color}">${b.code} ${b.label}</span>`;
        })
        .join('');
      const unitTags = unit.tags.map((t) => `<span class="tag-chip">[${t}]</span>`).join('');
      const partsHtml = unit.parts?.length
        ? `<div class="inspect-parts">${unit.parts
            .map(
              (pt) =>
                `<div class="inspect-part-row">
                  <span>${pt.slotLabel}: <b style="color:${RARITY_COLORS[pt.rarity].fg}">${pt.name}</b></span>
                  <span class="muted">${pt.durability}/${pt.maxDurability}</span>
                </div>`,
            )
            .join('')}</div>`
        : '';

      blocks.push(`
        <div class="inspect-card">
          <div class="inspect-card-head">
            <span class="inspect-glyph" style="color:${ug.color}">${ug.char}</span>
            <strong>${unit.name}</strong>
            <span class="inspect-hp">HP ${unit.hp}/${unit.maxHp}</span>
          </div>
          ${statusHtml ? `<div class="tag-row">${statusHtml}</div>` : ''}
          <div class="tag-row">${unitTags}</div>
          <div class="inspect-desc">${unit.summary}</div>
          ${partsHtml}
        </div>
      `);
    }

    for (const prop of props) {
      const pg = PROP_GLYPHS[prop.kind];
      const color = prop.kind === 'dropped_part' && prop.rarity ? RARITY_COLORS[prop.rarity].fg : pg.color;
      const propTags = prop.tags.map((t) => `<span class="tag-chip">[${t}]</span>`).join('');
      blocks.push(`
        <div class="inspect-card">
          <div class="inspect-card-head">
            <span class="inspect-glyph" style="color:${color}">${pg.char}</span>
            <strong style="color:${color}">${prop.name}</strong>
            ${
              prop.integrityPct !== undefined
                ? `<span class="inspect-hp">${prop.integrityPct}%完好</span>`
                : prop.hp !== undefined
                  ? `<span class="inspect-hp">HP ${prop.hp}/${prop.maxHp}</span>`
                  : ''
            }
          </div>
          <div class="tag-row">${propTags}</div>
          <div class="inspect-desc">${prop.summary}</div>
        </div>
      `);
    }

    for (const intent of threats) {
      const src = snapshot.units.find((u) => u.id === intent.sourceUnitId);
      const dm = DAMAGE_TYPE_META[intent.damageType];
      blocks.push(`
        <div class="inspect-threat">
          <span>⚠ 敌方威胁: <b>${src?.name ?? '敌方'}</b> · ${intent.label} (${DIR_ARROWS[intent.direction]})</span>
          <span style="color:${dm.color}">-${intent.damage} ${dm.label}</span>
        </div>
      `);
    }

    this.inspectEl.innerHTML = `
      <div class="section-head">
        <span>悬停格 (${cell.x}, ${cell.y})</span>
        <span class="section-sub">${room ? `${room.code} ${room.name}` : ''}</span>
      </div>
      <div class="inspect-body">${blocks.join('')}</div>
    `;
  }
}
