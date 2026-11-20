import {
  PROP_GLYPHS,
  STATUS_BADGES,
  SURFACE_STYLES,
  TILE_GLYPHS,
  UNIT_GLYPHS,
} from '../render/glyphs.ts';
import {
  drawVectorProp,
  drawVectorTileFeature,
  drawVectorUnit,
  drawVectorWall,
} from '../render/vectorSprites.ts';
import { drawVectorFloorBase, drawVectorSurface } from '../render/vectorSurfaces.ts';
import type {
  PropKind,
  StatusTag,
  SurfaceKind,
  TileKind,
  UnitKind,
} from '../render/viewModel.ts';

export class LegendModal {
  private backdrop: HTMLElement;
  private visible = false;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'legend-backdrop hidden';
    this.backdrop.innerHTML = this.buildMarkup();
    root.appendChild(this.backdrop);

    this.paintVectorThumbnails();

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.hide();
    });
    const closeBtn = this.backdrop.querySelector('[data-legend-close]');
    closeBtn?.addEventListener('click', () => this.hide());
  }

  get isOpen(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    this.backdrop.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.backdrop.classList.add('hidden');
  }

  private paintVectorThumbnails(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = 44;

    this.backdrop.querySelectorAll<HTMLCanvasElement>('canvas[data-icon-kind]').forEach((canvas) => {
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const category = canvas.dataset.iconCat;
      const kind = canvas.dataset.iconKind!;
      const rect = { x: 1, y: 1, size: cssSize - 2 };

      if (category === 'unit') {
        const uk = kind as UnitKind;
        drawVectorUnit(
          ctx,
          {
            id: 'icon',
            name: '',
            kind: uk,
            faction: uk === 'player' ? 'player' : 'enemy',
            x: 0,
            y: 0,
            hp: 10,
            maxHp: 0, // omit hp bar in legend icon
            facing: uk === 'sentry' ? 'N' : uk === 'enforcer' ? 'W' : 'E',
            statuses: [],
            tags: [],
            summary: '',
          },
          rect,
          0,
          false,
        );
      } else if (category === 'prop') {
        const pk = kind as PropKind;
        drawVectorProp(
          ctx,
          {
            id: 'icon',
            name: '',
            kind: pk,
            x: 0,
            y: 0,
            tags: [],
            rarity: pk === 'dropped_part' ? 'legendary' : undefined,
            summary: '',
          },
          rect,
          0,
        );
      } else if (category === 'surface') {
        const sk = kind as SurfaceKind;
        drawVectorFloorBase(
          ctx,
          {
            x: 1,
            y: 1,
            roomId: 'R',
            kind: 'floor',
            surface: sk,
            electrified: false,
            revealed: true,
            explored: true,
          },
          rect,
          true,
        );
        drawVectorSurface(
          ctx,
          sk,
          rect,
          { n: false, e: false, s: false, w: false },
          1,
          1,
          300,
        );
      } else if (category === 'tile') {
        const tk = kind as TileKind;
        if (tk === 'wall') {
          drawVectorWall(ctx, 2, 2, cssSize - 4, { n: false, e: false, s: false, w: false });
        } else {
          drawVectorTileFeature(
            ctx,
            {
              x: 0,
              y: 0,
              roomId: null,
              kind: tk,
              surface: 'none',
              electrified: false,
              revealed: true,
              explored: true,
            },
            rect,
            250,
          );
        }
      }
    });
  }

  private buildMarkup(): string {
    const unitKeys: UnitKind[] = ['player', 'grunt', 'enforcer', 'drone', 'hacker', 'sentry'];
    const propKeys: PropKind[] = [
      'cooling_pipe',
      'power_box',
      'explosive_barrel',
      'heavy_crate',
      'cargo_pod',
      'dropped_part',
    ];
    const tileKeys: TileKind[] = ['wall', 'door_closed', 'door_open', 'elevator'];
    const surfaceKeys: SurfaceKind[] = ['water', 'ice', 'oil', 'fire'];
    const statusKeys: StatusTag[] = ['stunned', 'overheated', 'redline', 'virus', 'dormant'];

    const unitRows = unitKeys
      .map((k) => {
        const g = UNIT_GLYPHS[k];
        return `
          <div class="legend-row">
            <canvas class="legend-canvas" width="44" height="44" data-icon-cat="unit" data-icon-kind="${k}"></canvas>
            <div class="legend-copy">
              <div class="legend-name">${g.label} <span class="legend-ascii-tag" style="color:${g.color}">${g.char}</span></div>
              <div class="legend-desc">${g.desc}</div>
            </div>
          </div>`;
      })
      .join('');

    const propRows = [
      ...tileKeys.map((k) => {
        const g = TILE_GLYPHS[k];
        return `
          <div class="legend-row">
            <canvas class="legend-canvas" width="44" height="44" data-icon-cat="tile" data-icon-kind="${k}"></canvas>
            <div class="legend-copy">
              <div class="legend-name">${g.label} <span class="legend-ascii-tag" style="color:${g.color}">${g.char}</span></div>
              <div class="legend-desc">${g.desc}</div>
            </div>
          </div>`;
      }),
      ...propKeys.map((k) => {
        const g = PROP_GLYPHS[k];
        return `
          <div class="legend-row">
            <canvas class="legend-canvas" width="44" height="44" data-icon-cat="prop" data-icon-kind="${k}"></canvas>
            <div class="legend-copy">
              <div class="legend-name">${g.label} <span class="legend-ascii-tag" style="color:${g.color}">${g.char}</span></div>
              <div class="legend-desc">${g.desc}</div>
            </div>
          </div>`;
      }),
    ].join('');

    const surfaceRows = surfaceKeys
      .map((k) => {
        const s = SURFACE_STYLES[k];
        return `
          <div class="legend-row">
            <canvas class="legend-canvas" width="44" height="44" data-icon-cat="surface" data-icon-kind="${k}"></canvas>
            <div class="legend-copy">
              <div class="legend-name">${s.label} <span class="legend-tags">${s.tags.map((t) => `[${t}]`).join(' ')}</span></div>
              <div class="legend-desc">${s.desc}</div>
            </div>
          </div>`;
      })
      .join('');

    const statusRows = [
      ...statusKeys.map((k) => {
        const b = STATUS_BADGES[k];
        return `
          <div class="legend-row">
            <span class="legend-badge" style="color:${b.color};background:${b.bg}">${b.code}</span>
            <div class="legend-copy">
              <div class="legend-name">${b.label}</div>
              <div class="legend-desc">${b.desc}</div>
            </div>
          </div>`;
      }),
      `<div class="legend-row">
        <span class="legend-badge" style="color:#100c05;background:#ffab36">★</span>
        <div class="legend-copy">
          <div class="legend-name">传奇橙装 / 高价值目标</div>
          <div class="legend-desc">精准斩落或护宝重点目标（斩击 90% / EMP 85% / 动能 50% / 爆炸 10%）</div>
        </div>
      </div>`,
    ].join('');

    return `
      <div class="legend-dialog" role="dialog" aria-label="战术图例与操作指南">
        <div class="legend-header">
          <div>
            <span class="legend-title">CYBER-X // 战术图例与操作协议</span>
            <span class="legend-sub">矢量科幻线稿 / 经典 ASCII 双模式参考</span>
          </div>
          <button type="button" class="btn-ghost" data-legend-close>[Esc] 关闭</button>
        </div>

        <div class="legend-grid">
          <section class="legend-col">
            <h4>单位与敌人 (Layer 2)</h4>
            ${unitRows}
          </section>

          <section class="legend-col">
            <h4>建筑与场景设施 (Layer 2)</h4>
            ${propRows}
          </section>

          <section class="legend-col">
            <h4>主地表互斥层 (Layer 1)</h4>
            ${surfaceRows}
            <div class="legend-note">
              地表互斥：冰+火→水 · 水+极寒→冰 · 油+火→燃烧3回合 · 火+水→熄灭
            </div>
            <h4 style="margin-top:14px">角标状态 (Layer 3 · 每格≤2)</h4>
            ${statusRows}
          </section>

          <section class="legend-col">
            <h4>键鼠协同与预览快捷键</h4>
            <div class="hotkey-list">
              <div><kbd>1</kbd>~<kbd>6</kbd><span>切换 Dry-Run 悬停预览动作</span></div>
              <div><kbd>Q</kbd> / <kbd>E</kbd><span>数据刺模式下切换顺/逆时针 90°</span></div>
              <div><kbd>V</kbd><span>一键切换「矢量科幻线稿 / 经典 ASCII」样式</span></div>
              <div><kbd>鼠标悬停</kbd><span>检视格子标签；悬停敌人聚焦意图并压暗背景</span></div>
              <div><kbd>右键拖拽</kbd><span>平移视口相机（中键亦可）</span></div>
              <div><kbd>鼠标滚轮</kbd><span>以光标为中心缩放棋盘 (0.65x~1.85x)</span></div>
              <div><kbd>Space</kbd><span>一键回中当前交战房间</span></div>
              <div><kbd>E</kbd><span>演示「红温放电 + 敌方阶段」步进回放</span></div>
              <div><kbd>左键点击</kbd><span>回放动效期间点击可立即跳过</span></div>
              <div><kbd>?</kbd><span>打开 / 关闭本图例</span></div>
            </div>
          </section>
        </div>
      </div>
    `;
  }
}
