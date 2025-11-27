import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { HostPersonality, VOICE_MAP } from '../types';
import { base64ToUint8Array, createPcmBlob, decodeAudioData } from '../services/audioUtils';
import AudioVisualizer from './AudioVisualizer';
import { Mic, MicOff, PhoneOff, AlertCircle } from 'lucide-react';

interface LiveTriviaProps {
  topic: string;
  difficulty: string;
  personality: HostPersonality;
  onExit: () => void;
}

const LiveTrivia: React.FC<LiveTriviaProps> = ({ topic, difficulty, personality, onExit }) => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(true);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  
  // Connection Refs
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  useEffect(() => {
    let cleanup = () => {};

    const initSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        
        // Setup Audio Contexts
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass({ sampleRate: 24000 }); // Output rate
        const inputCtx = new AudioContextClass({ sampleRate: 16000 }); // Input rate
        audioContextRef.current = ctx;

        // Analysers for visualization
        const inputAnalyser = inputCtx.createAnalyser();
        inputAnalyser.fftSize = 256;
        inputAnalyserRef.current = inputAnalyser;

        const outputAnalyser = ctx.createAnalyser();
        outputAnalyser.fftSize = 256;
        outputAnalyserRef.current = outputAnalyser;
        
        // Connect output analyser to destination
        const outputNode = ctx.createGain();
        outputNode.connect(outputAnalyser);
        outputAnalyser.connect(ctx.destination);

        // Get User Media
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        
        source.connect(inputAnalyser);
        inputAnalyser.connect(processor);
        processor.connect(inputCtx.destination);

        // System Instruction
        const sysInstruction = `You are a trivia host with a ${personality} personality. 
        We are playing a trivia game about "${topic}" at ${difficulty} difficulty.
        
        Rules:
        1. YOU MUST SPEAK FIRST. Start immediately by welcoming me and asking the first question.
        2. Ask ONE short question at a time.
        3. Wait for my voice answer.
        4. Tell me if I'm right or wrong, then explain briefly.
        5. Keep the pace moving.
        6. Be expressive in your voice.
        
        Remember: Do not wait for the user to say hello. Start the show immediately.`;

        // Connect to Live API
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_MAP[personality] } },
            },
            systemInstruction: sysInstruction,
          },
          callbacks: {
            onopen: () => {
              setConnected(true);
              console.log("Live API Connected");
              
              // Force the model to start speaking by sending a text signal.
              // Sending a message like "Start" triggers the model to respond based on system instructions.
              sessionPromise.then(session => {
                session.send({
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{ text: "The show is starting. Introduce yourself and ask the first question now." }]
                        }],
                        turnComplete: true
                    }
                });
              });

              // Audio Processing Loop
              processor.onaudioprocess = (e) => {
                if (!micActive) return; // Mute logic
                
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
            },
            onmessage: async (msg: LiveServerMessage) => {
               // Handle Audio Output
               const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
               if (base64Audio) {
                 const ctx = audioContextRef.current;
                 if (ctx) {
                   // Sync timing
                   nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                   
                   const audioBytes = base64ToUint8Array(base64Audio);
                   const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                   
                   const source = ctx.createBufferSource();
                   source.buffer = audioBuffer;
                   source.connect(outputNode);
                   
                   source.onended = () => {
                     sourcesRef.current.delete(source);
                   };
                   
                   source.start(nextStartTimeRef.current);
                   nextStartTimeRef.current += audioBuffer.duration;
                   sourcesRef.current.add(source);
                 }
               }

               // Handle Interruptions
               if (msg.serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
               }
            },
            onclose: () => {
              setConnected(false);
              console.log("Live API Closed");
            },
            onerror: (err) => {
              console.error("Live API Error", err);
              setError("Connection error. Please try again.");
            }
          }
        });
        
        cleanup = () => {
          sessionPromise.then(session => session.close());
          stream.getTracks().forEach(t => t.stop());
          processor.disconnect();
          source.disconnect();
          ctx.close();
          inputCtx.close();
        };

      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to initialize audio session");
      }
    };

    initSession();

    return () => cleanup();
  }, [topic, difficulty, personality]); // Re-run if config changes? Usually strictly once per mount.

  // Toggle Mic wrapper to update ref if needed, but we use state inside callback?
  // Actually, `processor.onaudioprocess` closes over the initial scope.
  // We need a ref for micActive to be read correctly inside the callback.
  const micActiveRef = useRef(micActive);
  useEffect(() => { micActiveRef.current = micActive; }, [micActive]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 relative overflow-hidden">
      {/* Ambient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-black z-0"></div>

      {/* Content */}
      <div className="z-10 w-full max-w-2xl flex flex-col items-center space-y-12">
        
        {/* Status Header */}
        <div className="text-center space-y-2">
           <div className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full border ${connected ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
              <span className="text-sm font-medium uppercase tracking-wide">{connected ? 'Live Session Active' : 'Connecting...'}</span>
           </div>
           <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
             {personality} Host
           </h2>
        </div>

        {/* Visualizers */}
        <div className="w-full space-y-8">
           <div className="relative">
              <div className="absolute -top-6 left-0 text-xs text-indigo-400 font-mono">HOST VOICE</div>
              <AudioVisualizer 
                analyser={outputAnalyserRef.current} 
                isActive={true} 
                className="w-full h-32 border border-indigo-500/30 bg-indigo-950/20"
                color="#818cf8"
              />
           </div>

           <div className="relative">
              <div className="absolute -top-6 left-0 text-xs text-rose-400 font-mono">YOUR MIC</div>
              <AudioVisualizer 
                analyser={inputAnalyserRef.current} 
                isActive={micActive} 
                className="w-full h-32 border border-rose-500/30 bg-rose-950/20"
                color="#fb7185"
              />
           </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center space-x-6">
           <button 
             onClick={() => setMicActive(!micActive)}
             className={`p-6 rounded-full transition-all duration-300 ${micActive ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/50' : 'bg-slate-700 hover:bg-slate-600'}`}
           >
             {micActive ? <Mic className="w-8 h-8 text-white" /> : <MicOff className="w-8 h-8 text-slate-400" />}
           </button>
           
           <button 
             onClick={onExit}
             className="p-6 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-red-500/50 transition-all group"
           >
             <PhoneOff className="w-8 h-8 text-slate-400 group-hover:text-red-400" />
           </button>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-red-400 bg-red-950/50 px-4 py-2 rounded-lg border border-red-900">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

      </div>
    </div>
  );
};

export default LiveTrivia;