import { h } from './dom.ts';

/** Touch devices held upright get a nudge to turn sideways (shown purely by CSS media query). */
export function installRotateHint(root: HTMLElement): void {
  const phone = h('div.rotate-phone');
  root.appendChild(h('div.rotate-hint', phone, h('div.rotate-text.outlined', 'Turn your device sideways')));
}
