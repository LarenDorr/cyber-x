import type { RoomMiniView } from '../render/viewModel.ts';

export class MinimapHud {
  private root: HTMLElement;
  private onSelectRoom: (room: RoomMiniView) => void;
  private lastSignature = '';

  constructor(parent: HTMLElement, onSelectRoom: (room: RoomMiniView) => void) {
    this.onSelectRoom = onSelectRoom;
    this.root = document.createElement('div');
    this.root.className = 'minimap-hud';
    parent.appendChild(this.root);
  }

  render(rooms: RoomMiniView[]): void {
    const sig = rooms.map((r) => `${r.id}:${r.state}:${r.hasEnemies}`).join('|');
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    const cols = Math.max(...rooms.map((r) => r.gridX)) + 1;
    const rows = Math.max(...rooms.map((r) => r.gridY)) + 1;
    const nodeW = 46;
    const nodeH = 26;
    const gapX = 16;
    const gapY = 14;
    const pad = 8;
    const svgW = pad * 2 + cols * nodeW + (cols - 1) * gapX;
    const svgH = pad * 2 + rows * nodeH + (rows - 1) * gapY;

    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const centerOf = (r: RoomMiniView) => ({
      x: pad + r.gridX * (nodeW + gapX) + nodeW / 2,
      y: pad + r.gridY * (nodeH + gapY) + nodeH / 2,
    });

    // Render unique connecting lines
    const drawnLinks = new Set<string>();
    let linkSvg = '';
    for (const r of rooms) {
      const ca = centerOf(r);
      for (const targetId of r.connectedTo) {
        const key = [r.id, targetId].sort().join('--');
        if (drawnLinks.has(key)) continue;
        drawnLinks.add(key);
        const other = roomMap.get(targetId);
        if (!other) continue;
        const cb = centerOf(other);
        const bothRevealed = r.state !== 'unexplored' && other.state !== 'unexplored';
        linkSvg += `<line x1="${ca.x}" y1="${ca.y}" x2="${cb.x}" y2="${cb.y}" stroke="${
          bothRevealed ? '#4b6384' : '#2a3344'
        }" stroke-width="2" ${bothRevealed ? '' : 'stroke-dasharray="3 2"'} />`;
      }
    }

    this.root.innerHTML = `
      <div class="minimap-header">
        <span>楼层拓扑</span>
        <span class="minimap-hint">点击切视角</span>
      </div>
      <div class="minimap-body" style="width:${svgW}px;height:${svgH}px">
        <svg class="minimap-links" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
          ${linkSvg}
        </svg>
      </div>
      <div class="minimap-legend">
        <span><i class="dot dot-current"></i>当前</span>
        <span><i class="dot dot-explored"></i>已探</span>
        <span><i class="dot dot-fog"></i>未破门</span>
        <span><i class="dot dot-elev"></i>电梯</span>
      </div>
    `;

    const body = this.root.querySelector('.minimap-body')!;
    for (const room of rooms) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `minimap-node state-${room.state}`;
      btn.style.left = `${pad + room.gridX * (nodeW + gapX)}px`;
      btn.style.top = `${pad + room.gridY * (nodeH + gapY)}px`;
      btn.style.width = `${nodeW}px`;
      btn.style.height = `${nodeH}px`;
      btn.title = `${room.code} ${room.name} (${room.state === 'unexplored' ? '未破门' : '点击居中'})`;

      const icon = room.hasElevator ? '>' : room.state === 'unexplored' ? '?' : room.hasEnemies ? '!' : '';
      btn.innerHTML = `<span class="mm-code">${room.code}</span>${
        icon ? `<span class="mm-icon">${icon}</span>` : ''
      }`;
      btn.addEventListener('click', () => this.onSelectRoom(room));
      body.appendChild(btn);
    }
  }
}
