import React, { useState, useEffect } from 'react';
import { GameMode, HostPersonality, LeaderboardEntry } from '../types';
import { Bot, Mic, MonitorPlay, Sparkles, Trophy, History } from 'lucide-react';

interface LobbyProps {
  onStartGame: (mode: GameMode, config: { topic: string; difficulty: string; personality: HostPersonality }) => void;
  initialConfig: { topic: string; difficulty: string; personality: HostPersonality };
}

const Lobby: React.FC<LobbyProps> = ({ onStartGame, initialConfig }) => {
  const [topic, setTopic] = useState(initialConfig.topic);
  const [difficulty, setDifficulty] = useState(initialConfig.difficulty);
  const [personality, setPersonality] = useState<HostPersonality>(initialConfig.personality);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const loaded = JSON.parse(localStorage.getItem('trivia_leaderboard') || '[]');
    setLeaderboard(loaded);
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white animate-fade-in">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        
        {/* Main Game Config Panel */}
        <div className="lg:col-span-2 bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
          <div className="flex items-center mb-8">
            <div className="p-3 bg-indigo-500 rounded-2xl shadow-lg shadow-indigo-500/20 mr-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-300">
                MindSpark Trivia
              </h1>
              <p className="text-slate-400 text-sm mt-1">Configure your AI host</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Topic Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="e.g. 80s Music, Quantum Physics, Cat Breeds..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Difficulty */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                  <option>Expert</option>
                </select>
              </div>

              {/* Personality */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Host Personality</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(HostPersonality).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPersonality(p)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        personality === p
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => onStartGame(GameMode.VISUAL_TRIVIA, { topic, difficulty, personality })}
                className="group flex items-center justify-center space-x-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 p-4 rounded-xl transition-all"
              >
                <div className="p-2 bg-slate-700 group-hover:bg-indigo-500 rounded-lg transition-colors">
                  <MonitorPlay className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-white">Visual Quiz</div>
                  <div className="text-xs text-slate-400">Ranked Mode with Points</div>
                </div>
              </button>

              <button
                onClick={() => onStartGame(GameMode.VOICE_CHAT, { topic, difficulty, personality })}
                className="group flex items-center justify-center space-x-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 p-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all"
              >
                <div className="p-2 bg-white/20 rounded-lg">
                  <Mic className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-white">Live Voice Chat</div>
                  <div className="text-xs text-indigo-200">Real-time Conversation</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Leaderboard Panel */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-xl flex flex-col">
           <div className="flex items-center space-x-2 mb-6 pb-4 border-b border-white/5">
              <Trophy className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-slate-200">Leaderboard</h2>
           </div>
           
           <div className="flex-grow overflow-y-auto space-y-3 custom-scrollbar">
              {leaderboard.length === 0 ? (
                 <div className="text-center text-slate-500 py-10 flex flex-col items-center">
                    <History className="w-10 h-10 mb-2 opacity-50" />
                    <p>No games played yet.</p>
                 </div>
              ) : (
                leaderboard.map((entry, idx) => (
                  <div key={idx} className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white">{entry.name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[150px]">{entry.topic} ({entry.difficulty})</div>
                    </div>
                    <div className="text-right">
                       <div className="text-indigo-400 font-mono font-bold">{entry.score}</div>
                       <div className="text-[10px] text-slate-600">{new Date(entry.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
      
      <div className="mt-8 text-center text-slate-500 text-sm max-w-md">
        <p>Powered by Gemini 2.5 Flash, Grounding with Google Search, and Live API.</p>
      </div>
    </div>
  );
};

export default Lobby;