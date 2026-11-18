export type ThemeMode = 'light' | 'dark';
export type ActiveTab = 'chat' | 'help';
export type EngineMode = 'offline' | 'cloud';

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed: string;
  createdAtMs: number;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
  messages: ChatMessage[];
}

export interface SharedMemory {
  userName: string;
  facts: string[];
}

export interface ChatSettings {
  systemInstruction: string;
  temperature: number;
  model: string;
  theme: ThemeMode;
  engineMode: EngineMode;
}

export interface UserState {
  uid: string;
  isGuest: boolean;
  displayName: string;
  email: string;
  photoURL: string;
  shareMemoryEnabled: boolean;
  sharedMemory: SharedMemory;
  settings: ChatSettings;
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  shareMemoryEnabled: boolean;
  sharedMemory: SharedMemory;
  settings?: Partial<ChatSettings>;
  chats: ChatThread[];
}

export interface PresetInstruction {
  id: string;
  label: string;
  instruction: string;
}

export const PRESET_INSTRUCTIONS: PresetInstruction[] = [
  {
    id: 'professional',
    label: 'Professional',
    instruction:
      'You are a clear, concise, and professional AI assistant. Structure answers cleanly with bold key points and actionable next steps.',
  },
  {
    id: 'coding-tutor',
    label: 'Coding Tutor',
    instruction:
      'You are a patient Coding Tutor. Explain concepts step by step, point out edge cases, and illustrate solutions with clean, idiomatic examples.',
  },
  {
    id: 'fact-checker',
    label: 'Fact-Checker',
    instruction:
      'You are a rigorous Fact-Checker. Separate verified facts from assumptions, note uncertainty explicitly, and avoid speculation.',
  },
];

export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'gemini-3.5-flash-lite',
    note: 'Default · Fast & lightweight',
  },
  {
    id: 'gemini-3.6-flash',
    label: 'gemini-3.6-flash',
    note: 'Balanced everyday reasoning',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'gemini-3.8-flash',
    note: 'Enhanced multi-step reasoning',
  },
];

export const DEFAULT_SETTINGS: ChatSettings = {
  systemInstruction: PRESET_INSTRUCTIONS[0].instruction,
  temperature: 1.0,
  model: 'gemini-3.5-flash-lite',
  theme: 'light',
  engineMode: 'offline',
};
