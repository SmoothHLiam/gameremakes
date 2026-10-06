/// <reference lib="webworker" />
import { renderSong } from '../core/audio/song.ts';
import { SONGS } from '../core/audio/songs.ts';

/** Renders built-in songs off the main thread so menus and gameplay never hitch. */
self.onmessage = (e: MessageEvent<{ id: string }>) => {
  const spec = SONGS[e.data.id];
  if (!spec) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: 'unknown song' });
    return;
  }
  const { L, R, info } = renderSong(spec);
  (self as unknown as Worker).postMessage({ id: e.data.id, L, R, info, sampleRate: 44100 }, [L.buffer, R.buffer]);
};
