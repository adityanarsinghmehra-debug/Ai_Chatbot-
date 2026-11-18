import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  SlidersHorizontal,
  Send,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Brain,
} from 'lucide-react';
import {
  MODEL_OPTIONS,
  PRESET_INSTRUCTIONS,
  type ChatSettings,
  type ChatThread,
  type EngineMode,
  type SharedMemory,
} from '../types/chat';
import { FormattedMessage } from './FormattedMessage';

interface ChatScreenProps {
  chats: ChatThread[];
  activeChat: ChatThread;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onClearChat: () => void;
  shareMemoryEnabled: boolean;
  onToggleShareMemory: () => void;
  sharedMemory: SharedMemory;
  onResetSharedMemory: () => void;
  settings: ChatSettings;
  onUpdateSettings: (next: Partial<ChatSettings>) => void;
  cloudAvailable: boolean;
  isSending: boolean;
  sendError: string | null;
  onDismissError: () => void;
  onSendMessage: (content: string) => Promise<void>;
}

const STARTER_PROMPTS = [
  'My name is Priya and I love Kotlin.',
  'What is 25% of 400?',
  'How do LLMs and tokens work?',
];

export const ChatScreen: React.FC<ChatScreenProps> = ({
  chats,
  activeChat,
  onSelectChat,
  onNewChat,
  onClearChat,
  shareMemoryEnabled,
  onToggleShareMemory,
  sharedMemory,
  onResetSharedMemory,
  settings,
  onUpdateSettings,
  cloudAvailable,
  isSending,
  sendError,
  onDismissError,
  onSendMessage,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeChat.messages.length, isSending]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const submitMessage = async (textOverride?: string) => {
    const content = (textOverride ?? draft).trim();
    if (!content || isSending) return;
    if (!textOverride) {
      setDraft('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    await onSendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  };

  const factLabel = sharedMemory.facts.length === 1 ? '1 fact' : `${sharedMemory.facts.length} facts`;
  const memorySummary = sharedMemory.userName
    ? `Remembering ${sharedMemory.userName}${sharedMemory.facts.length > 0 ? ` · ${factLabel}` : ''}`
    : sharedMemory.facts.length > 0
      ? `Remembering ${factLabel}`
      : 'No saved facts yet';

  return (
    <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3 pb-4 gap-3 min-h-0 overflow-hidden">
      {/* Workspace Control Toolbar */}
      <section
        aria-label="Chat controls"
        className="rounded-2xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
          <label htmlFor="chat-selector" className="sr-only">
            Active chat conversation
          </label>
          <select
            id="chat-selector"
            aria-label="Active chat conversation"
            value={activeChat.id}
            onChange={(e) => onSelectChat(e.target.value)}
            className="min-h-[40px] max-w-[210px] sm:max-w-[260px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] text-sm font-medium truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
          >
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.messages.length})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onNewChat}
            aria-label="New Chat"
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#D3E3FD] text-[#041E49] dark:bg-[#004A77] dark:text-[#C2E7FF] text-sm font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>

          <button
            type="button"
            onClick={onClearChat}
            disabled={activeChat.messages.length === 0}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-[#262E3B] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] disabled:opacity-40 text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Chat</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              id="share-memory-switch"
              aria-checked={shareMemoryEnabled}
              onClick={onToggleShareMemory}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] ${
                shareMemoryEnabled
                  ? 'bg-[#0B57D0] dark:bg-[#A8C7FA]'
                  : 'bg-[#CBD5E1] dark:bg-[#334155]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-[#0E1117] transition-transform ${
                  shareMemoryEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <label
              htmlFor="share-memory-switch"
              className="text-xs sm:text-sm font-medium cursor-pointer select-none whitespace-nowrap"
            >
              Share Memory Across Chats
            </label>
          </div>

          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((prev) => !prev)}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              settingsOpen
                ? 'border-[#0B57D0] dark:border-[#A8C7FA] bg-[#D3E3FD]/50 dark:bg-[#004A77]/50 text-[#041E49] dark:text-[#C2E7FF]'
                : 'border-[#E2E8F0] dark:border-[#262E3B] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Settings</span>
            {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </section>

      {/* Collapsible Settings Bar */}
      {settingsOpen && (
        <section
          aria-label="Model and system settings"
          className="shrink-0 max-h-[44dvh] overflow-y-auto rounded-2xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] p-4 sm:p-5 space-y-4"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* System Instruction + 3 Preset Chips */}
            <div className="lg:col-span-6 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="system-instruction-input" className="text-sm font-semibold">
                  System Instruction
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_INSTRUCTIONS.map((preset) => {
                    const isActive = settings.systemInstruction.trim() === preset.instruction.trim();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onUpdateSettings({ systemInstruction: preset.instruction })}
                        className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-[#0B57D0] text-white border-[#0B57D0] dark:bg-[#A8C7FA] dark:text-[#062E6F] dark:border-[#A8C7FA]'
                            : 'border-[#CBD5E1] dark:border-[#334155] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea
                id="system-instruction-input"
                rows={3}
                maxLength={2000}
                value={settings.systemInstruction}
                onChange={(e) => onUpdateSettings({ systemInstruction: e.target.value })}
                placeholder="Guide how the assistant responds..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
              />
            </div>

            {/* Engine Mode, Model Dropdown & Temperature Slider */}
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="block text-sm font-semibold">Assistant Engine</span>
                <div
                  role="radiogroup"
                  aria-label="Assistant Engine"
                  className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#EEF2F7] dark:bg-[#1E2530]"
                >
                  {(['offline', 'cloud'] as EngineMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={settings.engineMode === mode}
                      onClick={() => onUpdateSettings({ engineMode: mode })}
                      className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        settings.engineMode === mode
                          ? 'bg-white dark:bg-[#2A3342] text-[#0B57D0] dark:text-[#A8C7FA]'
                          : 'text-[#475569] dark:text-[#94A3B8]'
                      }`}
                    >
                      {mode === 'offline' ? 'Offline Local' : 'Cloud Gemini'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  {settings.engineMode === 'offline'
                    ? 'Runs locally in-browser (AI basics, math, date/time, memory).'
                    : cloudAvailable
                      ? 'Uses server Gemini proxy with automatic 503/429 model fallback.'
                      : 'Server GEMINI_API_KEY not set in Secrets — use Offline Local or add key in Secrets.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="model-select" className="block text-sm font-semibold">
                  Gemini Model
                </label>
                <select
                  id="model-select"
                  value={settings.model}
                  onChange={(e) => onUpdateSettings({ model: e.target.value })}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Auto-fallback enabled on 503 / 429 rate-limit errors.
                </p>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="temperature-slider" className="text-sm font-semibold">
                    Temperature
                  </label>
                  <span className="text-sm font-mono tabular-nums font-medium text-[#0B57D0] dark:text-[#A8C7FA]">
                    {settings.temperature.toFixed(1)}
                  </span>
                </div>
                <input
                  id="temperature-slider"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) => onUpdateSettings({ temperature: parseFloat(e.target.value) })}
                  className="w-full accent-[#0B57D0] dark:accent-[#A8C7FA] cursor-pointer"
                />
                <div className="flex justify-between text-xs text-[#64748B] dark:text-[#94A3B8]">
                  <span>0.0 · Focused</span>
                  <span>1.0 · Balanced (Default)</span>
                  <span>2.0 · Creative</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#E2E8F0] dark:border-[#262E3B] pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA]" />
              <span>
                Memory Status: <strong className="font-medium text-[#111827] dark:text-[#F1F5F9]">{memorySummary}</strong>
              </span>
            </div>
            {(sharedMemory.userName || sharedMemory.facts.length > 0) && (
              <button
                type="button"
                onClick={onResetSharedMemory}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                Clear Remembered Memory
              </button>
            )}
          </div>
        </section>
      )}

      {/* Large Conversation Area */}
      <section
        aria-label="Conversation"
        className="flex-1 min-h-0 rounded-3xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] flex flex-col overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-2.5 shrink-0 border-b border-[#E2E8F0] dark:border-[#262E3B] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
          <span className="font-medium text-[#111827] dark:text-[#F1F5F9] truncate max-w-[260px] sm:max-w-md">
            {activeChat.title}
          </span>
          <div className="flex items-center gap-2 tabular-nums">
            <span>{settings.engineMode === 'offline' ? 'Offline Local Assistant' : settings.model}</span>
            <span aria-hidden="true">·</span>
            <span>Temp {settings.temperature.toFixed(1)}</span>
            <span aria-hidden="true">·</span>
            <span>{shareMemoryEnabled ? 'Shared Memory On' : 'Isolated Chat'}</span>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6"
        >
          <div className="max-w-4xl mx-auto space-y-5">
            {activeChat.messages.length === 0 ? (
              <div className="py-10 sm:py-16 text-center space-y-6">
                <div className="space-y-2 max-w-xl mx-auto">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                    {sharedMemory.userName && shareMemoryEnabled
                      ? `Welcome back, ${sharedMemory.userName}`
                      : 'Start a conversation'}
                  </h2>
                  <p className="text-sm sm:text-base text-[#475569] dark:text-[#94A3B8]">
                    Ask anything using {settings.engineMode === 'offline' ? 'the smart Offline Local Assistant' : settings.model}. Your chats and shared memory stay organized across sessions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void submitMessage(prompt)}
                      className="min-h-[42px] px-4 py-2 rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530] text-sm font-medium transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeChat.messages.map((msg) => {
                const isUser = msg.role === 'user';
                const timeStr = new Date(msg.createdAtMs).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`px-5 py-3.5 rounded-3xl ${
                        isUser
                          ? 'max-w-[88%] sm:max-w-[75%] rounded-br-lg bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#062E6F]'
                          : 'max-w-[94%] sm:max-w-[84%] rounded-bl-lg bg-[#F1F5F9] dark:bg-[#1E2530] text-[#111827] dark:text-[#F1F5F9]'
                      }`}
                    >
                      <FormattedMessage content={msg.content} isUser={isUser} />
                    </div>
                    <div className="mt-1 px-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums flex items-center gap-1.5">
                      <span>{isUser ? 'You' : 'Assistant'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{timeStr}</span>
                      {!isUser && msg.modelUsed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{msg.modelUsed}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex flex-col items-start">
                <div className="px-5 py-3.5 rounded-3xl rounded-bl-lg bg-[#F1F5F9] dark:bg-[#1E2530] text-sm text-[#475569] dark:text-[#94A3B8]">
                  Thinking...
                </div>
              </div>
            )}

            {sendError && (
              <div
                role="alert"
                className="rounded-2xl border border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-200 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{sendError}</span>
                </div>
                <div className="flex items-center gap-2">
                  {settings.engineMode === 'cloud' && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateSettings({ engineMode: 'offline' });
                        onDismissError();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#171C24] border border-red-300 dark:border-red-700 text-xs font-medium"
                    >
                      Switch to Offline Local
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="px-2.5 py-1.5 text-xs font-medium underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="h-1" />
          </div>
        </div>

        {/* Multi-line Message Input Box */}
        <div className="border-t border-[#E2E8F0] dark:border-[#262E3B] p-3 sm:p-4 bg-[#F8FAFC] dark:bg-[#12161E]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitMessage();
            }}
            className="max-w-4xl mx-auto flex items-end gap-2.5"
          >
            <label htmlFor="chat-message-input" className="sr-only">
              Type a message
            </label>
            <textarea
              id="chat-message-input"
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything... (Shift+Enter for a new line)"
              className="flex-1 min-h-[52px] max-h-[180px] resize-none px-4 py-3 rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#171C24] text-[15px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || isSending}
              aria-label="Send message"
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#062E6F] font-medium text-sm inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
            >
              <span>Send</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
