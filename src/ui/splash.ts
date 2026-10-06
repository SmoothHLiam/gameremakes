import { GAME_TITLE } from '../config.ts';
import { h } from './dom.ts';

/** "Click to start" gate: browsers only allow audio after a user gesture. */
export function showSplash(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const el = h(
      'div.splash',
      h('div.splash-title.outlined', GAME_TITLE),
      h('div.splash-cta.outlined', 'Click or tap to start'),
      h('div.splash-hint', 'Space · Up · W · Click · Tap to jump'),
    );
    el.dataset.testid = 'splash';
    const go = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', key);
      el.classList.add('leaving');
      window.setTimeout(() => el.remove(), 260);
      resolve();
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') go(e);
    };
    el.addEventListener('pointerdown', go);
    window.addEventListener('keydown', key);
    root.appendChild(el);
  });
}

export function showLoading(root: HTMLElement, text = 'Loading'): { done: () => void; set: (t: string) => void } {
  const label = h('div.loading-text.outlined', text);
  const el = h('div.loading', h('div.loading-spinner'), label);
  root.appendChild(el);
  return { done: () => el.remove(), set: (t) => (label.textContent = t) };
}
