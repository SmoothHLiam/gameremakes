import './styles.css';
import { GAME_TITLE } from './config.ts';
import { App } from './app/app.ts';
import { audio } from './app/audio.ts';
import { store } from './app/settings.ts';
import { getProgress, recordAttempt, recordComplete, recordProgress } from './app/progress.ts';
import { LevelAudio } from './game/levelAudio.ts';
import { GameScreen } from './ui/gameScreen.ts';
import { EditorScreen } from './editor/editorScreen.ts';
import { EditorModel } from './editor/model.ts';
import { emptyLevel, type LevelJSON } from './core/level.ts';
import type { CameraState } from './render/camera.ts';
import { showLoading, showSplash } from './ui/splash.ts';
import { findLevel } from './levels/index.ts';
import { MenuScreen, type MenuPage, type PlayableLevel } from './ui/menu.ts';
import { openSettings } from './ui/settings.ts';
import { installRotateHint } from './ui/rotate.ts';
import { prewarm } from './app/prewarm.ts';

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
  installRotateHint(document.body);

  // ?level=<id> jumps straight into a level (used by tests and links); ?stress=N builds a dense test level.
  let direct = params.has('level') ? findLevel(params.get('level')!) : undefined;
  if (params.has('stress')) {
    const { stressLevel } = await import('./game/stressLevel.ts');
    const level = stressLevel(Number(params.get('stress')) || 24000);
    direct = { id: 'stress', path: '', level: { ...level, replay: { ticks: [] } }, test: true };
    params.set('replay', '');
  }
  const firstSong = direct?.level.meta.song ?? 'menu';
  // Start rendering the first song while the splash is up; the rest follow in the background.
  const songJob = audio.load(firstSong);
  void songJob.then(() => audio.load('menu')).then(() => audio.load('practice'));
  const splash = showSplash(app.ui);
  prewarm(app);
  await splash;
  await audio.unlock();
  const applyVolumes = () => audio.setVolumes(store.settings.musicVolume, store.settings.sfxVolume);
  applyVolumes();
  store.onChange(applyVolumes);
  const loading = showLoading(app.ui, 'Composing music');
  await songJob;
  loading.done();

  const settingsFrom = (onClose: () => void) => openSettings(app.ui, onClose);

  const menu = (page: MenuPage = 'main', focus?: string) =>
    app.setScreen(
      new MenuScreen(app, {
        page,
        focus,
        onPlay: (entry, from) => void play(entry, () => menu(from === 'create' ? 'create' : 'select', entry.id)),
        onEdit: (level) => edit(level, () => menu('create')),
      }),
    );

  /** Load the song (with a spinner if it is still rendering), then start the level. */
  async function play(entry: PlayableLevel, back: () => void, practice = false): Promise<void> {
    const song = entry.level.meta.song;
    if (!audio.get(song)?.buffer) {
      audio.stop(0.3);
      const wait = showLoading(app.ui, 'Composing music');
      await audio.load(song);
      wait.done();
    }
    const id = entry.id;
    app.setScreen(
      new GameScreen(app, {
        level: entry.level,
        practice,
        audio: new LevelAudio(audio, entry.level),
        onAttempt: () => recordAttempt(id),
        onDeath: (pct, isPractice) => recordProgress(id, pct, isPractice),
        onComplete: (info) => recordComplete(id, info.practice, info.coins),
        bestNormal: () => getProgress(id).normal,
        bestPractice: () => getProgress(id).practice,
        openSettings: settingsFrom,
        onExit: back,
      }),
    );
  }

  function edit(level: LevelJSON | null, back: () => void): void {
    const model = new EditorModel(level ?? emptyLevel());
    const open = (cam?: CameraState) =>
      app.setScreen(
        new EditorScreen(app, {
          model,
          cam,
          onExit: back,
          onPlaytest: (lvl, startX, camState) => {
            const go = () =>
              app.setScreen(
                new GameScreen(app, {
                  level: lvl,
                  startX: startX ?? undefined,
                  playtest: true,
                  audio: new LevelAudio(audio, lvl),
                  openSettings: settingsFrom,
                  onExit: () => open(camState),
                }),
              );
            if (audio.get(lvl.meta.song)?.buffer) go();
            else {
              const wait = showLoading(app.ui, 'Composing music');
              void audio.load(lvl.meta.song).then(() => {
                wait.done();
                go();
              });
            }
          },
        }),
      );
    open();
  }

  if (params.has('editor')) {
    edit(direct ? direct.level : null, () => menu('create'));
    return;
  }
  if (direct) {
    const entry: PlayableLevel = { id: direct.level.meta.id ?? direct.id, level: direct.level, custom: false };
    const replay = params.has('replay') ? direct.level.replay?.ticks : undefined;
    if (replay) {
      // scripted run: no progress tracking, restart from the menu on exit
      app.setScreen(
        new GameScreen(app, {
          level: direct.level,
          replay,
          audio: new LevelAudio(audio, direct.level),
          onExit: () => menu('select', entry.id),
        }),
      );
      return;
    }
    void play(entry, () => menu('select', entry.id), params.has('practice'));
    return;
  }
  menu();
}

void boot();
