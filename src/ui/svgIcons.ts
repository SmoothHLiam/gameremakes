/** Original UI glyphs as inline SVG (white fill, used inside chunky buttons). */
const S = (body: string, vb = '0 0 32 32') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="#fff" stroke="none">${body}</svg>`;

export const ICONS = {
  pause: S('<rect x="7" y="5" width="6" height="22" rx="2"/><rect x="19" y="5" width="6" height="22" rx="2"/>'),
  play: S('<path d="M9 5 L27 16 L9 27 Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'),
  flag: S('<rect x="6" y="4" width="3.5" height="25" rx="1.5"/><path d="M9.5 5 H25 L21 11 L25 17 H9.5 Z"/>'),
  unflag: S('<rect x="6" y="4" width="3.5" height="25" rx="1.5"/><path d="M9.5 5 H25 L21 11 L25 17 H9.5 Z" opacity="0.45"/><path d="M5 27 L27 5" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'),
  coin: S('<path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" fill="#ffc93c" stroke="#120b2a" stroke-width="2"/><path d="M16 8 L18 14 L24 16 L18 18 L16 24 L14 18 L8 16 L14 14 Z" fill="#fff"/>'),
  gear: S('<path d="M14 2h4l1 4 3 1.3 3.6-2.2 2.9 2.9-2.2 3.6L27.6 15l4 1v4l-4 1-1.3 3 2.2 3.6-2.9 2.9-3.6-2.2-3 1.3-1 4h-4l-1-4-3-1.3-3.6 2.2-2.9-2.9 2.2-3.6L4.4 21l-4-1v-4l4-1 1.3-3-2.2-3.6 2.9-2.9 3.6 2.2L13 6z" transform="scale(0.94) translate(1 0)"/><circle cx="16" cy="18" r="5" fill="#8e8eb8"/>'),
  build: S('<rect x="4" y="18" width="10" height="10" rx="1.5"/><rect x="18" y="18" width="10" height="10" rx="1.5"/><rect x="11" y="5" width="10" height="10" rx="1.5"/>'),
  back: S('<path d="M20 5 L9 16 L20 27" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
  next: S('<path d="M12 5 L23 16 L12 27" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
  fullscreen: S('<path d="M4 12 V4 H12 M20 4 H28 V12 M28 20 V28 H20 M12 28 H4 V20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'),
  palette: S('<rect x="4" y="4" width="11" height="11" rx="2"/><rect x="17" y="4" width="11" height="11" rx="5.5"/><path d="M4 28 L9.5 17 L15 28 Z"/><path d="M22.5 17 L28 22.5 L22.5 28 L17 22.5 Z"/>'),
  trash: S('<rect x="6" y="8" width="20" height="3" rx="1"/><rect x="12" y="4" width="8" height="4" rx="1"/><path d="M8 12 H24 L22.5 28 H9.5 Z"/>'),
  undo: S('<path d="M12 6 L4 13 L12 20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 H19 A8 8 0 0 1 19 29 H13" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'),
  redo: S('<path d="M20 6 L28 13 L20 20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 13 H13 A8 8 0 0 0 13 29 H19" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'),
  music: S('<path d="M12 6 L27 3 V22" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="8.5" cy="24" rx="5" ry="4"/><ellipse cx="23.5" cy="22" rx="5" ry="4"/><rect x="10.3" y="6" width="3.4" height="18"/>'),
  save: S('<path d="M5 4 H23 L28 9 V28 H5 Z"/><rect x="10" y="4" width="11" height="8" fill="#8e8eb8"/><rect x="9" y="18" width="15" height="10" rx="1" fill="#8e8eb8"/>'),
  upload: S('<path d="M16 4 L25 14 H19 V22 H13 V14 H7 Z"/><rect x="5" y="25" width="22" height="4" rx="1.5"/>'),
  download: S('<path d="M16 24 L25 14 H19 V5 H13 V14 H7 Z"/><rect x="5" y="25" width="22" height="4" rx="1.5"/>'),
  rotate: S('<path d="M24 9 A10 10 0 1 0 26 18" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M27 3 V11 H19 Z"/>'),
  flipH: S('<path d="M14 6 L4 26 H14 Z"/><path d="M18 6 L28 26 H18 Z" opacity="0.5"/>'),
  flipV: S('<path d="M6 14 L26 4 V14 Z"/><path d="M6 18 L26 28 V18 Z" opacity="0.5"/>'),
  copy: S('<rect x="10" y="10" width="17" height="18" rx="2.5"/><rect x="5" y="4" width="17" height="18" rx="2.5" opacity="0.55"/>'),
  paste: S('<rect x="6" y="6" width="20" height="23" rx="2.5"/><rect x="11" y="3" width="10" height="6" rx="2" fill="#8e8eb8"/>'),
  grid: S('<path d="M4 4 H28 V28 H4 Z M11 4 V28 M18 4 V28 M25 4 V28 M4 11 H28 M4 18 H28 M4 25 H28" fill="none" stroke="#fff" stroke-width="2.4"/>'),
  stop: S('<rect x="7" y="7" width="18" height="18" rx="3"/>'),
  plus: S('<rect x="13" y="4" width="6" height="24" rx="2"/><rect x="4" y="13" width="24" height="6" rx="2"/>'),
  select: S('<path d="M6 4 L26 16 L17 18 L22 28 L18 30 L13 20 L6 26 Z"/>'),
  sound: S('<path d="M4 12 H10 L18 5 V27 L10 20 H4 Z"/><path d="M22 10 A8 8 0 0 1 22 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
};
