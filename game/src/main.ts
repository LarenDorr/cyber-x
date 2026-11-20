import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles.css';

import { ViewportCamera } from './render/camera.ts';
import { AsciiBoardRenderer, type RenderStyleMode } from './render/canvas.ts';
import { DAMAGE_TYPE_META, FLOAT_TONE_COLORS, UNIT_GLYPHS } from './render/glyphs.ts';
import {
  applyEventToSnapshot,
  buildDemoEvents,
  computeMockPreview,
  createMockSnapshot,
  type DemoId,
} from './render/mockScene.ts';
import { ParticleSystem } from './render/particles.ts';
import { RenderSequencer } from './render/sequencer.ts';
import type { PreviewOverlay, RenderSnapshot, Vec2 } from './render/viewModel.ts';
import { BoardInputController } from './ui/input.ts';
import { LegendModal } from './ui/legend.ts';
import { MinimapHud } from './ui/minimap.ts';
import { BottomVitalsHud, TacticalSidebar } from './ui/panel.ts';

class VisualPrototypeApp {
  private snapshot: RenderSnapshot = createMockSnapshot();
  private camera = new ViewportCamera();
  private particles = new ParticleSystem();
  private renderer: AsciiBoardRenderer;
  private sequencer: RenderSequencer;
  private vitalsHud: BottomVitalsHud;
  private sidebar: TacticalSidebar;
  private minimap: MinimapHud;
  private legend: LegendModal;

  private activeActionId = 'move';
  private renderStyle: RenderStyleMode = 'vector';
  private hackRotateCW = false; // Default CCW so Sentry (18,6) swings West straight into Hacker!
  private hoverTile: Vec2 | null = null;
  private preview: PreviewOverlay | null = null;
  private focusedEnemyId: string | null = null;

  private actionSlotsEl: HTMLElement;
  private hackDirBtn: HTMLButtonElement;
  private styleToggleBtn: HTMLButtonElement;
  private statusPillEl: HTMLElement;
  private previewDockEl: HTMLElement;
  private canvasHostEl: HTMLElement;

  private lastFrameMs = performance.now();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="topbar-left">
            <span class="brand">CYBER-X</span>
            <span class="pill" data-floor>${this.snapshot.floorLabel}</span>
            <span class="pill pill-combat" data-status-pill>战斗态 · T${this.snapshot.turn}</span>
          </div>

          <div class="demo-strip">
            <span class="demo-label">回放演示</span>
            <button type="button" class="btn-demo tone-cryo" data-demo="ice_slide">▶ 冰滑撞管</button>
            <button type="button" class="btn-demo tone-electro" data-demo="electro_bridge">▶ 导电桥</button>
            <button type="button" class="btn-demo tone-loot" data-demo="sever_disarm">▶ 精准斩落</button>
            <button type="button" class="btn-demo tone-danger" data-demo="redline_enemy_turn">▶ 红温+敌回合</button>
          </div>

          <div class="topbar-right">
            <button type="button" class="btn-ghost btn-style" data-style-toggle title="快捷键 [V] 切换矢量科幻线稿 / 经典 ASCII 样式">样式: 矢量科幻</button>
            <button type="button" class="btn-ghost" data-reset>重置</button>
            <button type="button" class="btn-ghost" data-recenter>回中</button>
            <button type="button" class="btn-ghost btn-legend" data-legend>? 图例</button>
          </div>
        </header>

        <main class="workspace">
          <section class="stage-wrap">
            <div class="preview-dock" data-preview-dock></div>

            <div class="canvas-host" data-canvas-host>
              <canvas id="board-canvas"></canvas>
            </div>

            <!-- Unified Bottom Command Deck: Vitals (HP / AP / Heat / Consumables) + Actions (1~6 / End Turn) -->
            <footer class="command-deck">
              <div class="vitals-strip" data-vitals></div>
              <div class="action-bar">
                <div class="action-slots" data-action-slots></div>
                <div class="action-right">
                  <button type="button" class="btn-hack-dir" data-hack-dir style="display:none"></button>
                  <button type="button" class="btn-end-turn" data-end-turn>[E] 结束回合</button>
                </div>
              </div>
            </footer>
          </section>

          <aside class="sidebar" data-sidebar></aside>
        </main>
      </div>
    `;

    this.canvasHostEl = root.querySelector('[data-canvas-host]')!;
    this.actionSlotsEl = root.querySelector('[data-action-slots]')!;
    this.hackDirBtn = root.querySelector('[data-hack-dir]')!;
    this.styleToggleBtn = root.querySelector('[data-style-toggle]')!;
    this.statusPillEl = root.querySelector('[data-status-pill]')!;
    this.previewDockEl = root.querySelector('[data-preview-dock]')!;

    const canvas = root.querySelector<HTMLCanvasElement>('#board-canvas')!;
    this.renderer = new AsciiBoardRenderer(canvas);

    this.sequencer = new RenderSequencer(
      (event) => {
        applyEventToSnapshot(this.snapshot, event);
        this.syncUi();
      },
      () => {
        this.recomputePreview();
        this.syncUi();
      },
      {
        getUnitPos: (unitId) => {
          const u = this.snapshot.units.find((unit) => unit.id === unitId);
          return u ? { x: u.x, y: u.y } : null;
        },
        onBurst: (pos, tone, count = 14) => {
          const primary = FLOAT_TONE_COLORS[tone];
          this.particles.emitBurst(pos, {
            count,
            colors: [primary, '#ffffff', primary],
          });
        },
        onSlideStep: (unitId, x, y) => {
          const u = this.snapshot.units.find((unit) => unit.id === unitId);
          if (u) {
            const g = UNIT_GLYPHS[u.kind];
            this.particles.emitAfterimage(x, y, g.char, g.color);
          }
          this.particles.emitTrailDot(x, y, '#8bf0ff', 2.4);
        },
      },
    );

    this.vitalsHud = new BottomVitalsHud(root.querySelector('[data-vitals]')!, {
      onSetHeatPreset: (heat) => this.setHeatPreset(heat),
      onUseConsumable: (index) => this.useConsumable(index),
    });

    this.sidebar = new TacticalSidebar(root.querySelector('[data-sidebar]')!);

    this.minimap = new MinimapHud(this.canvasHostEl, (room) => {
      this.camera.focusArea(room.x, room.y, room.w, room.h, false, 1.15);
    });

    this.legend = new LegendModal(root);

    new BoardInputController(canvas, this.camera, {
      onHoverTile: (tile) => this.handleHoverTile(tile),
      onLeftClickTile: (tile) => this.handleLeftClick(tile),
      onRightCancel: () => this.selectAction('move'),
      onSelectActionHotkey: (hotkey) => {
        const slot = this.snapshot.actions.find((a) => a.hotkey === hotkey);
        if (slot) this.selectAction(slot.id);
      },
      onToggleHackDirection: (cw) => {
        this.hackRotateCW = cw;
        this.recomputePreview();
        this.syncActionBar();
      },
      onEndTurnKey: () => this.playDemo('redline_enemy_turn'),
      onRecenterCamera: () => this.focusCurrentRoom(false),
      onToggleLegend: () => this.legend.toggle(),
      onToggleStyle: () => this.toggleRenderStyle(),
      onEscape: () => {
        if (this.legend.isOpen) this.legend.hide();
        else this.selectAction('move');
      },
      isHackModeActive: () => this.activeActionId === 'data_spike',
    });

    // Topbar buttons
    root.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach((btn) => {
      btn.addEventListener('click', () => this.playDemo(btn.dataset.demo as DemoId));
    });
    this.styleToggleBtn.addEventListener('click', () => this.toggleRenderStyle());
    root.querySelector('[data-reset]')?.addEventListener('click', () => this.resetScene());
    root.querySelector('[data-recenter]')?.addEventListener('click', () => this.focusCurrentRoom(false));
    root.querySelector('[data-legend]')?.addEventListener('click', () => this.legend.toggle());
    root.querySelector('[data-end-turn]')?.addEventListener('click', () =>
      this.playDemo('redline_enemy_turn'),
    );
    this.hackDirBtn.addEventListener('click', () => {
      this.hackRotateCW = !this.hackRotateCW;
      this.recomputePreview();
      this.syncActionBar();
    });

    // Initial layout & ResizeObserver
    this.handleResize();
    this.focusCurrentRoom(true);
    const resizeObserver = new ResizeObserver(() => this.handleResize());
    resizeObserver.observe(this.canvasHostEl);

    this.syncActionBar();
    this.syncUi();

    document.fonts?.ready.then(() => {
      this.syncUi();
    });

    requestAnimationFrame((t) => this.tick(t));
  }

  private handleResize(): void {
    const rect = this.canvasHostEl.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    this.camera.setViewport(rect.width, rect.height);
  }

  private toggleRenderStyle(): void {
    this.renderStyle = this.renderStyle === 'vector' ? 'ascii' : 'vector';
    this.styleToggleBtn.textContent =
      this.renderStyle === 'vector' ? '样式: 矢量科幻' : '样式: 经典ASCII';
  }

  private focusCurrentRoom(instant: boolean): void {
    const room = this.snapshot.rooms.find((r) => r.id === this.snapshot.currentRoomId);
    if (room) {
      this.camera.focusArea(room.x, room.y, room.w, room.h, instant, 1.15);
    }
  }

  private handleHoverTile(tile: Vec2 | null): void {
    this.hoverTile = tile;
    if (tile) {
      const enemy = this.snapshot.units.find(
        (u) => u.faction === 'enemy' && u.x === tile.x && u.y === tile.y,
      );
      this.focusedEnemyId = enemy ? enemy.id : null;
    } else {
      this.focusedEnemyId = null;
    }
    this.recomputePreview();
    this.updatePreviewDock();
    this.sidebar.render(this.snapshot, this.hoverTile);
  }

  private handleLeftClick(tile: Vec2): void {
    if (this.sequencer.isPlaying) {
      this.sequencer.skipAll();
      return;
    }

    if (
      this.activeActionId === 'data_spike' &&
      this.preview?.valid &&
      this.preview.hackedIntentId &&
      this.preview.rotatedIntent
    ) {
      this.sequencer.enqueue([
        { type: 'highlight_actor', unitId: 'player', label: '数据刺 · 90° 偏转', durationMs: 240 },
        { type: 'hack_pulse', pos: tile, durationMs: 240 },
        {
          type: 'intent_update',
          intentId: this.preview.hackedIntentId,
          direction: this.preview.rotatedIntent.direction,
          affectedTiles: this.preview.rotatedIntent.affectedTiles,
          durationMs: 200,
        },
        {
          type: 'float_text',
          pos: tile,
          text: 'HACKED 90° 偏转',
          tone: 'hack',
          durationMs: 220,
        },
        {
          type: 'log',
          entry: {
            id: `hack-live-${Date.now()}`,
            turn: this.snapshot.turn,
            phase: 'PLAYER',
            text: `数据刺改写目标意图方向！新落点已实时重算（${this.preview.rotatedIntent.affectedTiles.length} 格）。`,
            tone: 'hack',
          },
          durationMs: 0,
        },
      ]);
      return;
    }

    if (this.activeActionId === 'power_fist' && tile.x === 14 && tile.y === 3) {
      this.playDemo('ice_slide');
      return;
    }

    if (this.activeActionId === 'hf_blade' && tile.x === 16 && tile.y === 1) {
      this.playDemo('sever_disarm');
      return;
    }

    if (this.activeActionId === 'throw_pod' && tile.x === 14 && tile.y === 5) {
      this.playDemo('electro_bridge');
      return;
    }
  }

  private selectAction(actionId: string): void {
    this.activeActionId = actionId;
    this.recomputePreview();
    this.syncActionBar();
  }

  private recomputePreview(): void {
    this.preview = computeMockPreview(
      this.snapshot,
      this.activeActionId,
      this.hoverTile,
      this.hackRotateCW,
    );
  }

  private playDemo(demoId: DemoId): void {
    this.sequencer.clear();
    this.particles.clear();
    this.snapshot = createMockSnapshot();
    this.focusCurrentRoom(false);
    const events = buildDemoEvents(demoId, this.snapshot);
    this.sequencer.enqueue(events);
    this.syncUi();
  }

  private resetScene(): void {
    this.sequencer.clear();
    this.particles.clear();
    this.snapshot = createMockSnapshot();
    this.activeActionId = 'move';
    this.recomputePreview();
    this.focusCurrentRoom(false);
    this.syncActionBar();
    this.syncUi();
  }

  private setHeatPreset(heat: number): void {
    this.snapshot.player.heat = heat;
    const playerUnit = this.snapshot.units.find((u) => u.id === 'player');
    if (playerUnit) {
      playerUnit.heat = heat;
      playerUnit.statuses = playerUnit.statuses.filter(
        (s) => s !== 'overheated' && s !== 'redline',
      );
      if (heat >= 80) playerUnit.statuses.push('redline');
      else if (heat >= 41) playerUnit.statuses.push('overheated');
    }
    this.syncUi();
  }

  private useConsumable(index: number): void {
    const item = this.snapshot.player.consumables[index];
    if (!item || item.count <= 0) return;
    item.count -= 1;
    this.snapshot.player.ap = Math.min(this.snapshot.player.maxAp + 2, this.snapshot.player.ap + 2);
    const playerUnit = this.snapshot.units.find((u) => u.id === 'player');
    if (playerUnit) {
      this.sequencer.enqueue([
        { type: 'float_text', pos: { x: playerUnit.x, y: playerUnit.y }, text: '+2 AP 注入', tone: 'hack', durationMs: 220 },
        {
          type: 'log',
          entry: {
            id: `cons-${Date.now()}`,
            turn: this.snapshot.turn,
            phase: 'PLAYER',
            text: `使用消耗品 [${item.name}] (0 AP)：立即恢复 +2 AP！`,
            tone: 'hack',
          },
          durationMs: 0,
        },
      ]);
    }
    if (item.count === 0) {
      this.snapshot.player.consumables[index] = null;
    }
    this.syncUi();
  }

  private syncActionBar(): void {
    this.actionSlotsEl.innerHTML = '';
    for (const action of this.snapshot.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `action-btn ${this.activeActionId === action.id ? 'active' : ''}`;
      btn.title = action.summary;
      const costText = `${action.apCost}AP${action.heatCost ? ` +${action.heatCost}热` : ''}`;
      btn.innerHTML = `
        <span class="action-key">${action.hotkey}</span>
        <span class="action-meta">
          <span class="action-name">${action.name}</span>
          <span class="action-cost">${costText}</span>
        </span>
      `;
      btn.addEventListener('click', () => this.selectAction(action.id));
      this.actionSlotsEl.appendChild(btn);
    }

    if (this.activeActionId === 'data_spike') {
      this.hackDirBtn.style.display = 'inline-flex';
      this.hackDirBtn.textContent = `[Q/E] ${this.hackRotateCW ? '顺时针 ↻' : '逆时针 ↺'}`;
    } else {
      this.hackDirBtn.style.display = 'none';
    }

    this.updatePreviewDock();
  }

  private updatePreviewDock(): void {
    if (this.sequencer.isPlaying) {
      this.previewDockEl.className = 'preview-dock is-playing';
      this.previewDockEl.innerHTML = `
        <span class="dock-badge dock-live">回放中</span>
        <span class="dock-title">正在步进演示涌现连锁与敌方意图</span>
        <span class="dock-detail">左键点击棋盘任意处可立即跳过</span>
      `;
      return;
    }

    const action = this.snapshot.actions.find((a) => a.id === this.activeActionId);
    const modeTag = action ? `[${action.hotkey}] ${action.name}` : '预览';

    if (this.preview && this.preview.badgeTitle) {
      const p = this.preview;
      const pills: string[] = [];
      if (p.dropIntegrityPct !== undefined && p.damageType) {
        const dm = DAMAGE_TYPE_META[p.damageType];
        pills.push(
          `<span class="dock-pill" style="color:${dm.color};border-color:${dm.color}66">掉率 ${dm.label} ${p.dropIntegrityPct}%</span>`,
        );
      }
      if (p.warningText) {
        pills.push(`<span class="dock-pill dock-warn">${p.warningText}</span>`);
      }

      this.previewDockEl.className = `preview-dock ${p.valid ? 'is-valid' : 'is-invalid'}`;
      this.previewDockEl.innerHTML = `
        <span class="dock-badge">${modeTag}</span>
        <span class="dock-title">${p.badgeTitle}</span>
        ${p.badgeDetail ? `<span class="dock-detail">${p.badgeDetail}</span>` : ''}
        ${pills.length ? `<span class="dock-pills">${pills.join('')}</span>` : ''}
      `;
      return;
    }

    const hints: Record<string, string> = {
      move: '悬停空地预览路径与 AP · 悬停敌人聚焦射界并压暗背景 · 右键拖拽平移 / 滚轮缩放',
      power_fist: '悬停安保步兵 (14,3) 查看冰滑撞冷却管轨迹（左键点击可直接演播）',
      hf_blade: '悬停履带执法者 (16,1) 预览定向斩臂与 90% 掉落完好率（左键点击可演播）',
      shock_baton: '悬停右侧积水 (15,5) 或左侧配电箱 (11,6) 查看导电全网与义眼增伤',
      data_spike: '悬停哨戒炮 (18,6) 按 Q/E 切换顺逆 90°，左键点击可实时改写意图',
      throw_pod: '悬停干地 (14,5) 预览桥接两滩积水，或悬停 (14,1) 预览帮橙装挡枪',
    };

    this.previewDockEl.className = 'preview-dock';
    this.previewDockEl.innerHTML = `
      <span class="dock-badge">${modeTag}</span>
      <span class="dock-detail">${hints[this.activeActionId] ?? ''}</span>
    `;
  }

  private syncUi(): void {
    this.vitalsHud.render(this.snapshot);
    this.sidebar.render(this.snapshot, this.hoverTile);
    this.minimap.render(this.snapshot.rooms);
    this.updatePreviewDock();

    if (this.sequencer.isPlaying) {
      this.statusPillEl.className = 'pill pill-playing';
      this.statusPillEl.textContent = '回放中 · 左键跳过';
    } else {
      this.statusPillEl.className = 'pill pill-combat';
      this.statusPillEl.textContent = `战斗态 · T${this.snapshot.turn}`;
    }
  }

  private tick(nowMs: number): void {
    const dtMs = Math.max(0, Math.min(50, nowMs - this.lastFrameMs));
    this.lastFrameMs = nowMs;

    this.camera.update(dtMs / 1000);
    this.sequencer.update(dtMs);
    this.particles.updateAmbient(this.snapshot, dtMs);
    this.particles.update(dtMs);

    this.renderer.render({
      snapshot: this.snapshot,
      camera: this.camera,
      hoverTile: this.hoverTile,
      focusedEnemyId: this.focusedEnemyId,
      preview: this.preview,
      fx: this.sequencer.getVisualState(),
      particles: this.particles,
      renderStyle: this.renderStyle,
      nowMs,
    });

    requestAnimationFrame((t) => this.tick(t));
  }
}

const appRoot = document.getElementById('app');
if (appRoot) {
  new VisualPrototypeApp(appRoot);
}
