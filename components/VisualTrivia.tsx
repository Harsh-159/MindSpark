import React, { useEffect, useState, useRef } from 'react';
import { GeneratedTriviaData, HostPersonality, LeaderboardEntry } from '../types';
import { generateTriviaQuestions, playTextToSpeech, getTTSAudioBuffer } from '../services/geminiService';
import { CheckCircle, XCircle, ArrowRight, Loader2, Globe, Save, Trophy, Home } from 'lucide-react';

interface VisualTriviaProps {
  topic: string;
  difficulty: string;
  personality: HostPersonality;
  onExit: () => void;
}

const FEEDBACK_MAP: Record<HostPersonality, { correct: string[], incorrect: string[] }> = {
  [HostPersonality.EXCITED]: {
    correct: ["Amazing!", "Boom! That's it!", "You nailed it!", "Spectacular!"],
    incorrect: ["Oh no!", "So close!", "Not quite right!", "Bummer!"]
  },
  [HostPersonality.SARCASTIC]: {
    correct: ["Wow, you actually knew that.", "Miracles happen.", "Finally, a win.", "Not terrible."],
    incorrect: ["Really?", "Swing and a miss.", "Obvious choice... if you were wrong.", "Yikes."]
  },
  [HostPersonality.GRUMPY]: {
    correct: ["Correct.", "Adequate.", "Acceptable.", "Finally."],
    incorrect: ["Wrong.", "Disappointing.", "Pay attention.", "No."]
  },
  [HostPersonality.PROFESSIONAL]: {
    correct: ["That is correct.", "Excellent.", "Well done.", "Precisely."],
    incorrect: ["Incorrect.", "That is not right.", "I'm afraid not.", "The answer is incorrect."]
  }
};

const getRandomFeedback = (p: HostPersonality, isCorrect: boolean) => {
  const options = isCorrect ? FEEDBACK_MAP[p].correct : FEEDBACK_MAP[p].incorrect;
  return options[Math.floor(Math.random() * options.length)];
};

const VisualTrivia: React.FC<VisualTriviaProps> = ({ topic, difficulty, personality, onExit }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GeneratedTriviaData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [playerName, setPlayerName] = useState('');

  // Audio Control Refs
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioGenerationIdRef = useRef<number>(0); // To cancel stale async TTS calls
  
  // Cache for question audio to make it instant
  const questionAudioCache = useRef<Map<number, AudioBuffer>>(new Map());

  // Initialize Audio Context on mount
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    setAudioContext(ctx);
    return () => {
      stopCurrentAudio();
      ctx.close();
    };
  }, []);

  const stopCurrentAudio = () => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      currentAudioSourceRef.current = null;
    }
    setSpeaking(false);
  };

  const playBuffer = (buffer: AudioBuffer) => {
    if (!audioContext) return;
    stopCurrentAudio();
    
    setSpeaking(true);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
        setSpeaking(false);
        currentAudioSourceRef.current = null;
    };
    source.start();
    currentAudioSourceRef.current = source;
  };

  const playAudio = async (text: string) => {
    if (!audioContext) return;
    
    // Increment ID to invalidate previous pending calls
    const myId = ++audioGenerationIdRef.current;
    
    stopCurrentAudio();
    setSpeaking(true);

    try {
      const source = await playTextToSpeech(text, personality, audioContext);
      
      // If a new generation started while we were awaiting, don't play this one
      if (myId !== audioGenerationIdRef.current) {
        if (source) source.stop();
        return;
      }

      if (source) {
        currentAudioSourceRef.current = source;
        source.onended = () => {
          if (myId === audioGenerationIdRef.current) {
            setSpeaking(false);
            currentAudioSourceRef.current = null;
          }
        };
      } else {
        setSpeaking(false);
      }
    } catch (e) {
      console.error("Audio playback failed", e);
      setSpeaking(false);
    }
  };

  // Fetch Questions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await generateTriviaQuestions(topic, difficulty, 5);
        setData(result);
      } catch (err) {
        console.error(err);
        setError("Failed to generate trivia. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [topic, difficulty]); 
  
  // Pre-fetch Audio for Questions once data is loaded
  useEffect(() => {
    if (data && audioContext) {
        data.questions.forEach((q, i) => {
            const text = `Question ${i + 1}. ${q.question}`;
            getTTSAudioBuffer(text, personality, audioContext).then(buffer => {
                if (buffer) {
                    questionAudioCache.current.set(i, buffer);
                }
            });
        });
    }
  }, [data, audioContext, personality]);

  // Handle TTS for new question
  useEffect(() => {
    if (!loading && data && !isAnswered && !gameOver) {
      stopCurrentAudio();
      
      const q = data.questions[currentIndex];
      const text = `Question ${currentIndex + 1}. ${q.question}`;

      // Check cache first for instant playback
      if (questionAudioCache.current.has(currentIndex)) {
          playBuffer(questionAudioCache.current.get(currentIndex)!);
      } else {
          playAudio(text);
      }
    }
  }, [loading, data, currentIndex, isAnswered, gameOver]);

  const handleAnswer = (option: string) => {
    if (isAnswered || !data) return;
    
    stopCurrentAudio(); // Stop reading the question immediately
    setSelectedOption(option);
    setIsAnswered(true);
    
    const currentQ = data.questions[currentIndex];
    const isCorrect = option === currentQ.correctAnswer;
    const feedbackPhrase = getRandomFeedback(personality, isCorrect);
    
    if (isCorrect) {
      setScore(s => s + 100);
      playAudio(feedbackPhrase);
    } else {
      setScore(s => Math.max(0, s - 20));
      // Give the feedback and then the correction
      playAudio(`${feedbackPhrase} The correct answer was ${currentQ.correctAnswer}.`);
    }
  };

  const nextQuestion = () => {
    if (!data) return;
    stopCurrentAudio(); // Stop any explanation audio immediately
    
    if (currentIndex < data.questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setGameOver(true);
      playAudio(`Game over! You scored ${score} points.`);
    }
  };

  const handleSaveScore = () => {
    if (!playerName.trim()) return;
    
    const entry: LeaderboardEntry = {
        name: playerName,
        score,
        topic,
        difficulty,
        date: new Date().toISOString()
    };
    
    const existing = JSON.parse(localStorage.getItem('trivia_leaderboard') || '[]');
    const updated = [...existing, entry].sort((a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score).slice(0, 50);
    localStorage.setItem('trivia_leaderboard', JSON.stringify(updated));
    onExit();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white animate-fade-in relative">
        <button 
          onClick={onExit}
          className="absolute top-6 left-6 p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors text-slate-400 hover:text-white"
          title="Return to Home"
        >
           <Home className="w-5 h-5" />
        </button>
        <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-4" />
        <h2 className="text-2xl font-bold">Generating Questions...</h2>
        <p className="text-slate-400 mt-2">Scanning the web for facts about {topic}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white animate-fade-in">
        <XCircle className="w-16 h-16 text-red-500 mb-4" />
        <p className="text-xl">{error || "Something went wrong."}</p>
        <button onClick={onExit} className="mt-6 px-6 py-2 bg-slate-700 rounded hover:bg-slate-600">Back to Lobby</button>
      </div>
    );
  }

  if (gameOver) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 animate-fade-in relative">
             <button 
                onClick={onExit}
                className="absolute top-6 left-6 p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors text-slate-400 hover:text-white"
                title="Return to Home"
             >
                <Home className="w-5 h-5" />
             </button>
             <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center shadow-2xl">
                 <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
                 <h2 className="text-3xl font-bold mb-2">Game Over!</h2>
                 <p className="text-slate-400 mb-6">You completed the quiz on {topic}</p>
                 
                 <div className="text-6xl font-bold text-indigo-400 mb-8">{score}</div>
                 
                 <div className="space-y-4">
                    <label className="block text-left text-sm font-semibold text-slate-400">Enter your name</label>
                    <input 
                        type="text" 
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Player One"
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none text-white text-lg"
                        autoFocus
                    />
                    <button 
                        onClick={handleSaveScore}
                        disabled={!playerName.trim()}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold transition-all flex items-center justify-center space-x-2"
                    >
                        <Save className="w-5 h-5" />
                        <span>Save Score & Exit</span>
                    </button>
                    <button 
                        onClick={onExit}
                        className="w-full py-3 text-slate-400 hover:text-white text-sm"
                    >
                        Skip & Exit
                    </button>
                 </div>
             </div>
        </div>
      );
  }

  const currentQ = data.questions[currentIndex];
  const progress = ((currentIndex) / data.questions.length) * 100;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8 flex flex-col">
      {/* Header */}
      <div className="max-w-4xl mx-auto w-full flex justify-between items-center mb-8">
        <div className="flex items-center space-x-4">
            <button 
                onClick={onExit}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors text-slate-400 hover:text-white"
                title="Return to Home"
            >
                <Home className="w-5 h-5" />
            </button>
            <div>
               <h2 className="text-xl font-bold text-slate-300">Topic: {topic}</h2>
               <div className="flex items-center space-x-2 mt-1">
                 <span className={`text-xs px-2 py-0.5 rounded-full ${speaking ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                   {speaking ? 'Host Speaking...' : 'Host Idle'}
                 </span>
               </div>
            </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-indigo-400 transition-all">{score}</div>
          <div className="text-xs text-slate-500">POINTS</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto w-full h-2 bg-slate-800 rounded-full mb-8 overflow-hidden">
        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Question Card */}
      <div className="max-w-4xl mx-auto w-full bg-slate-800/50 backdrop-blur border border-white/5 rounded-3xl p-6 md:p-10 shadow-2xl flex-grow flex flex-col justify-center animate-fade-in">
        <h3 className="text-2xl md:text-4xl font-bold mb-8 leading-tight">
          {currentQ.question}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentQ.options.map((option, idx) => {
             const isSelected = selectedOption === option;
             const isCorrect = option === currentQ.correctAnswer;
             
             let btnClass = "bg-slate-700 hover:bg-slate-600 border-slate-600";
             
             if (isAnswered) {
                if (isCorrect) btnClass = "bg-green-500/20 border-green-500 text-green-400";
                else if (isSelected && !isCorrect) btnClass = "bg-red-500/20 border-red-500 text-red-400";
                else btnClass = "bg-slate-700/50 opacity-50";
             } else if (isSelected) {
                btnClass = "bg-indigo-600 border-indigo-500";
             }

             return (
               <button
                 key={idx}
                 onClick={() => handleAnswer(option)}
                 disabled={isAnswered}
                 className={`p-4 rounded-xl border-2 text-left text-lg font-medium transition-all ${btnClass}`}
               >
                 {option}
                 {isAnswered && isCorrect && <CheckCircle className="inline ml-2 w-5 h-5" />}
                 {isAnswered && isSelected && !isCorrect && <XCircle className="inline ml-2 w-5 h-5" />}
               </button>
             );
          })}
        </div>

        {/* Explanation & Next */}
        {isAnswered && (
          <div className="mt-8 animate-fade-in">
            <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-xl mb-6">
              <div className="flex items-start space-x-3">
                 <div>
                    <h4 className="font-bold text-indigo-300 mb-1">Host Explanation</h4>
                    <p className="text-slate-300">{currentQ.explanation}</p>
                 </div>
              </div>
            </div>
            
            <button 
              onClick={nextQuestion}
              className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center space-x-2"
            >
              <span>{currentIndex === data.questions.length - 1 ? 'Finish Game' : 'Next Question'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Sources Footer */}
      <div className="max-w-4xl mx-auto w-full mt-8 border-t border-slate-800 pt-6">
        <h4 className="text-sm font-semibold text-slate-500 mb-3 flex items-center">
            <Globe className="w-4 h-4 mr-2" />
            Sources & Grounding
        </h4>
        <div className="flex flex-wrap gap-2">
            {data.sources.map((source, i) => (
                <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-indigo-400 bg-indigo-900/20 hover:bg-indigo-900/40 border border-indigo-500/20 px-3 py-1 rounded-full transition-colors truncate max-w-xs"
                >
                    {source.title}
                </a>
            ))}
            {data.sources.length === 0 && <span className="text-xs text-slate-600">No specific web sources cited for this batch.</span>}
        </div>
      </div>
    </div>
  );
};

export default VisualTrivia;