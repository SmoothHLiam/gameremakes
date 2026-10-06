import './styles.css';
import { GAME_TITLE } from './config.ts';
import { App } from './app/app.ts';
import { parseLevel } from './core/level.ts';
import { GameScreen } from './ui/gameScreen.ts';
import testCube from './levels/test/cube.json';

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const app = new App();
  await app.init();
  const params = new URLSearchParams(location.search);
  const level = parseLevel(testCube);
  const replay = params.has('replay') ? level.replay?.ticks : undefined;
  const start = () =>
    app.setScreen(
      new GameScreen(app, {
        level,
        replay,
        onExit: () => start(),
      }),
    );
  start();
  app.start();
  (window as unknown as { __app: App }).__app = app;
}

void boot();
