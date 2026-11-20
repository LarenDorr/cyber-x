import { LOG_TONE_COLORS } from '../render/glyphs.ts';
import type { CombatLogEntry } from '../render/viewModel.ts';

export class CombatLogView {
  private container: HTMLElement;
  private lastSignature = '';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(entries: CombatLogEntry[]): void {
    const sig = `${entries.length}:${entries[entries.length - 1]?.id ?? ''}`;
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    this.container.innerHTML = '';
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'log-entry';

      const meta = document.createElement('span');
      meta.className = 'log-meta';
      meta.textContent = `T${entry.turn}·${entry.phase}`;

      const msg = document.createElement('span');
      msg.className = 'log-text';
      msg.style.color = LOG_TONE_COLORS[entry.tone];
      msg.textContent = entry.text;

      row.append(meta, msg);
      this.container.appendChild(row);
    }

    this.container.scrollTop = this.container.scrollHeight;
  }
}
