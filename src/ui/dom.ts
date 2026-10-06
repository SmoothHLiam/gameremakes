type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Tiny element builder: h('div.cls#id', {attrs}, ...children). */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}` | `${K}#${string}`, attrs?: Attrs | Child, ...children: Child[]): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(sel);
  const tag = (m?.[1] ?? 'div') as K;
  const el = document.createElement(tag);
  const rest = m?.[2] ?? '';
  for (const part of rest.match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  let kids = children;
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node)) kids = [attrs as Child, ...children];
  else if (attrs) {
    for (const [k, v] of Object.entries(attrs as Attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'style' && typeof v === 'string') el.setAttribute('style', v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** A chunky button that squashes on press. Clicks never leak into the game's jump input. */
export function button(label: string | Node, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`.trim(), type: 'button' }, label);
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
