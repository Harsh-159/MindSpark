export enum GameMode {
  LOBBY = 'LOBBY',
  VISUAL_TRIVIA = 'VISUAL_TRIVIA',
  VOICE_CHAT = 'VOICE_CHAT',
}

export enum HostPersonality {
  EXCITED = 'Excited',
  SARCASTIC = 'Sarcastic',
  GRUMPY = 'Grumpy',
  PROFESSIONAL = 'Professional',
}

export interface Question {
  question: string;
  options: string[];
  correctAnswer: string; // The index or string
  explanation: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GeneratedTriviaData {
  questions: Question[];
  sources: GroundingSource[];
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  topic: string;
  difficulty: string;
  date: string;
}

// Map personalities to Gemini TTS voices
export const VOICE_MAP: Record<HostPersonality, string> = {
  [HostPersonality.EXCITED]: 'Fenrir',
  [HostPersonality.SARCASTIC]: 'Puck',
  [HostPersonality.GRUMPY]: 'Kore', // Deep, potentially stern
  [HostPersonality.PROFESSIONAL]: 'Zephyr',
};

export interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  className?: string;
}