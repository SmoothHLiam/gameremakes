import './styles.css';
import { GAME_TITLE } from './config.ts';
import { App } from './app/app.ts';
import { audio } from './app/audio.ts';
import { store } from './app/settings.ts';
import { LevelAudio } from './game/levelAudio.ts';
import { GameScreen } from './ui/gameScreen.ts';
import { EditorScreen } from './editor/editorScreen.ts';
import { EditorModel } from './editor/model.ts';
import { emptyLevel } from './core/level.ts';
import type { CameraState } from './render/camera.ts';
import { showLoading, showSplash } from './ui/splash.ts';
import { findLevel, LEVELS } from './levels/index.ts';

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const app = new App();
  await app.init();
  app.start();
  // debug handles for automated tests
  (window as unknown as { __app: App; __audio: typeof audio }).__app = app;
  (window as unknown as { __audio: typeof audio }).__audio = audio;
  const params = new URLSearchParams(location.search);
  if (params.has('gallery')) {
    const { showGallery } = await import('./ui/gallery.ts');
    showGallery(app.ui);
    return;
  }
  // Start rendering the first song while the splash is up.
  const level = (findLevel(params.get('level') ?? 'test-cube') ?? LEVELS[0]!).level;
  const songJob = audio.load(level.meta.song);
  // the practice and menu loops render in the background
  void songJob.then(() => audio.load('practice')).then(() => audio.load('menu'));
  await showSplash(app.ui);
  await audio.unlock();
  audio.setVolumes(store.settings.musicVolume, store.settings.sfxVolume);
  const loading = showLoading(app.ui, 'Composing music');
  await songJob;
  loading.done();
  if (params.has('editor')) {
    const model = new EditorModel(params.has('level') ? level : emptyLevel());
    const openEditor = (cam?: CameraState) =>
      app.setScreen(
        new EditorScreen(app, {
          model,
          cam,
          onExit: () => openEditor(),
          onPlaytest: (lvl, startX, camState) => {
            void audio.load(lvl.meta.song).then(() =>
              app.setScreen(
                new GameScreen(app, {
                  level: lvl,
                  startX: startX ?? undefined,
                  playtest: true,
                  audio: new LevelAudio(audio, lvl),
                  onExit: () => openEditor(camState),
                }),
              ),
            );
          },
        }),
      );
    openEditor();
    return;
  }
  const replay = params.has('replay') ? level.replay?.ticks : undefined;
  const start = () =>
    app.setScreen(
      new GameScreen(app, {
        level,
        replay,
        practice: params.has('practice'),
        audio: new LevelAudio(audio, level),
        onExit: () => start(),
      }),
    );
  start();
}

void boot();
