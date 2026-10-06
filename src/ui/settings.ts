import { store, type Settings } from '../app/settings.ts';
import { button, h } from './dom.ts';

export function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* fullscreen not available */
  }
}

/** Settings panel. Changes apply immediately and persist. */
export function openSettings(root: HTMLElement, onClose: () => void): HTMLElement {
  const s = store.settings;
  const slider = (key: 'musicVolume' | 'sfxVolume', label: string) => {
    const value = h('span.set-value', `${Math.round(s[key] * 100)}%`);
    const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100), 'aria-label': label });
    input.addEventListener('input', () => {
      store.update({ [key]: Number(input.value) / 100 } as Partial<Settings>);
      value.textContent = `${input.value}%`;
    });
    return h('label.set-row', h('span.set-label', label), input, value);
  };
  const toggle = (key: keyof Settings, label: string) => {
    const input = h('input', { type: 'checkbox', checked: !!s[key], 'aria-label': label });
    input.addEventListener('change', () => store.update({ [key]: input.checked } as Partial<Settings>));
    return h('label.set-row.set-toggle', h('span.set-label', label), h('span.switch', input, h('i')));
  };
  const close = () => {
    overlay.remove();
    onClose();
  };
  const panel = h(
    'div.panel.settings.pop',
    h('h2.outlined', 'Settings'),
    slider('musicVolume', 'Music'),
    slider('sfxVolume', 'Sound effects'),
    h(
      'div.set-grid',
      toggle('showPercent', 'Show percent'),
      toggle('showAttempts', 'Show attempts'),
      toggle('showFps', 'Show FPS'),
      toggle('hitboxes', 'Show hitboxes'),
      toggle('reducedParticles', 'Reduced particles'),
      toggle('glow', 'Glow effects'),
    ),
    h('div.row', button('Fullscreen', toggleFullscreen, 'blue small'), button('Done', close, 'green')),
  );
  const overlay = h('div.overlay', panel);
  overlay.dataset.testid = 'settings';
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  root.appendChild(overlay);
  return overlay;
}
