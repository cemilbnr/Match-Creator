import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { BoardGenerator } from './features/boardGenerator/BoardGenerator';
import { BoardLibrary } from './features/boardLibrary/BoardLibrary';
import { GameplaySequencer } from './features/gameplaySequencer/GameplaySequencer';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { useBlenderSessionStore } from './store/sessionStore';
import { useUI } from './store/uiStore';

export default function App() {
  const activePanel = useUI((s) => s.activePanel);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void useBlenderSessionStore
      .getState()
      .init()
      .then((fn) => {
        cleanup = fn;
      });
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <AppShell>
      {activePanel === 'board-generator' && <BoardGenerator />}
      {activePanel === 'board-library' && <BoardLibrary />}
      {activePanel === 'gameplay-sequencer' && <GameplaySequencer />}
      {activePanel === 'settings' && <SettingsPanel />}
    </AppShell>
  );
}
