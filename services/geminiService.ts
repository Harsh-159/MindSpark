import { GoogleGenAI, Type, Modality } from "@google/genai";
import { GeneratedTriviaData, HostPersonality, Question, VOICE_MAP, GroundingSource } from "../types";
import { base64ToUint8Array, decodeAudioData } from "./audioUtils";

const API_KEY = process.env.API_KEY || '';

// Singleton AI instance usually, but for React usually better to init when needed or in a Context.
// We'll create new instances to ensure we pick up the key if it changes (though prompt says assume pre-configured).
const getAI = () => new GoogleGenAI({ apiKey: API_KEY });

export const generateTriviaQuestions = async (
  topic: string,
  difficulty: string,
  count: number = 5
): Promise<GeneratedTriviaData> => {
  const ai = getAI();
  
  // NOTE: When using googleSearch tool, we cannot use responseMimeType: "application/json" or responseSchema.
  // We must ask for JSON in the prompt and parse the text manually.
  const prompt = `Generate ${count} trivia questions about "${topic}" with difficulty level "${difficulty}".
  
  You MUST return the output as a valid JSON object. Do not wrap it in markdown code blocks.
  The JSON object must have this structure:
  {
    "questions": [
      {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "correctAnswer": "string",
        "explanation": "string"
      }
    ]
  }
  
  Use Google Search to ensure the facts are accurate and up-to-date.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType and responseSchema REMOVED to be compatible with googleSearch tool
      },
    });

    let jsonText = response.text || "{}";
    // Sanitize: Remove markdown code blocks if the model adds them despite instructions
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON", jsonText);
        throw new Error("Failed to parse generated trivia data.");
    }
    
    // Extract grounding sources
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
            sources.push({
                title: chunk.web.title,
                uri: chunk.web.uri
            });
        }
    });

    return {
        questions: parsed.questions || [],
        sources: sources
    };
  } catch (error) {
    console.error("Error generating trivia:", error);
    throw error;
  }
};

/**
 * Generates audio buffer for TTS without playing it.
 * Useful for pre-fetching.
 */
export const getTTSAudioBuffer = async (
  text: string,
  personality: HostPersonality,
  audioContext: AudioContext
): Promise<AudioBuffer | null> => {
  const ai = getAI();
  const voiceName = VOICE_MAP[personality];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned");
    }

    const audioBytes = base64ToUint8Array(base64Audio);
    return await decodeAudioData(audioBytes, audioContext, 24000, 1);

  } catch (error) {
    console.error("TTS Generation Error:", error);
    return null;
  }
};

/**
 * Generates and plays TTS audio.
 * Returns the AudioBufferSourceNode so the caller can stop it if needed.
 */
export const playTextToSpeech = async (
  text: string,
  personality: HostPersonality,
  audioContext: AudioContext
): Promise<AudioBufferSourceNode | null> => {
  const buffer = await getTTSAudioBuffer(text, personality, audioContext);
  if (!buffer) return null;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();

  return source;
};