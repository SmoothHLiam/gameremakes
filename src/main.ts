import './styles.css';
import { GAME_TITLE } from './config.ts';
import { App } from './app/app.ts';
import { audio } from './app/audio.ts';
import { store } from './app/settings.ts';
import { LevelAudio } from './game/levelAudio.ts';
import { GameScreen } from './ui/gameScreen.ts';
import { showLoading, showSplash } from './ui/splash.ts';
import { findLevel, LEVELS } from './levels/index.ts';

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const app = new App();
  await app.init();
  app.start();
  (window as unknown as { __app: App }).__app = app;
  const params = new URLSearchParams(location.search);
  // Start rendering the first song while the splash is up.
  const level = (findLevel(params.get('level') ?? 'test-cube') ?? LEVELS[0]!).level;
  const songJob = audio.load(level.meta.song);
  await showSplash(app.ui);
  await audio.unlock();
  audio.setVolumes(store.settings.musicVolume, store.settings.sfxVolume);
  const loading = showLoading(app.ui, 'Composing music');
  await songJob;
  loading.done();
  const replay = params.has('replay') ? level.replay?.ticks : undefined;
  const start = () =>
    app.setScreen(
      new GameScreen(app, {
        level,
        replay,
        audio: new LevelAudio(audio, level),
        onExit: () => start(),
      }),
    );
  start();
}

void boot();
