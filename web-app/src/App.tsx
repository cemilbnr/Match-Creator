import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { UpdateBanner } from './components/UpdateBanner';
import { BoardAnalyzer } from './features/boardAnalyzer/BoardAnalyzer';
import { BoardGenerator } from './features/boardGenerator/BoardGenerator';
import { BoardLibrary } from './features/boardLibrary/BoardLibrary';
import { GameplaySequencer } from './features/gameplaySequencer/GameplaySequencer';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { useBlenderSessionStore } from './store/sessionStore';
import { useUI } from './store/uiStore';
import { useUpdateStore } from './store/updateStore';

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
    // Silent update check on startup — surfaces a banner only if something
    // is available. Network errors collapse silently.
    void useUpdateStore.getState().silentStartupCheck();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <AppShell banner={<UpdateBanner />}>
      {activePanel === 'board-generator' && <BoardGenerator />}
      {activePanel === 'board-analyzer' && <BoardAnalyzer />}
      {activePanel === 'board-library' && <BoardLibrary />}
      {activePanel === 'gameplay-sequencer' && <GameplaySequencer />}
      {activePanel === 'settings' && <SettingsPanel />}
    </AppShell>
  );
}
