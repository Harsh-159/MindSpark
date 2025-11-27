import React, { useState, useEffect } from 'react';
import { GameMode, HostPersonality } from './types';
import Lobby from './components/Lobby';
import VisualTrivia from './components/VisualTrivia';
import LiveTrivia from './components/LiveTrivia';

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(GameMode.LOBBY);
  
  // Initialize from localStorage or defaults
  const [gameConfig, setGameConfig] = useState<{
    topic: string;
    difficulty: string;
    personality: HostPersonality;
  }>(() => {
    const saved = localStorage.getItem('mindspark_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
    return {
      topic: 'Space Exploration',
      difficulty: 'Medium',
      personality: HostPersonality.EXCITED,
    };
  });

  const handleStartGame = (
    selectedMode: GameMode,
    config: { topic: string; difficulty: string; personality: HostPersonality }
  ) => {
    setGameConfig(config);
    // Persist configuration
    localStorage.setItem('mindspark_config', JSON.stringify(config));
    setMode(selectedMode);
  };

  const handleExit = () => {
    setMode(GameMode.LOBBY);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {mode === GameMode.LOBBY && (
        <Lobby 
          onStartGame={handleStartGame} 
          initialConfig={gameConfig}
        />
      )}
      
      {mode === GameMode.VISUAL_TRIVIA && (
        <VisualTrivia
          topic={gameConfig.topic}
          difficulty={gameConfig.difficulty}
          personality={gameConfig.personality}
          onExit={handleExit}
        />
      )}
      
      {mode === GameMode.VOICE_CHAT && (
        <LiveTrivia
          topic={gameConfig.topic}
          difficulty={gameConfig.difficulty}
          personality={gameConfig.personality}
          onExit={handleExit}
        />
      )}
    </div>
  );
};

export default App;