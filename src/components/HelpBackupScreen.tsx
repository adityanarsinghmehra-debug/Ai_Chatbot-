import React, { useRef, useState } from 'react';
import { Download, Upload, Copy, Check, AlertCircle, RotateCcw } from 'lucide-react';
import type { BackupPayload, ChatThread, SharedMemory } from '../types/chat';
import { createBackupPayload, parseBackupJson, serializeBackupJson } from '../utils/backup';

interface HelpBackupScreenProps {
  chats: ChatThread[];
  sharedMemory: SharedMemory;
  shareMemoryEnabled: boolean;
  onRestoreBackup: (payload: BackupPayload) => Promise<void>;
}

const GUIDE_CARDS = [
  {
    title: '01. How LLMs Work',
    body: 'Large Language Models predict the next token in a sequence using Transformer attention layers. Rather than looking up fixed scripts, they compute probabilities across your conversation context.',
  },
  {
    title: '02. System Instructions',
    body: 'A System Instruction acts as the assistant’s standing brief. Choosing Professional, Coding Tutor, or Fact-Checker sets tone, structure, and verification habits before your first prompt.',
  },
  {
    title: '03. Tokens & Context',
    body: 'Models split text into sub-word chunks called tokens (roughly 3–4 characters each). Both your chat history and the reply share the model’s context window budget.',
  },
  {
    title: '04. Cloud Memory',
    body: 'When Share Memory Across Chats is enabled, your remembered name and key facts are stored under your private user record and carried forward into every new conversation.',
  },
  {
    title: '05. Temperature & Hallucinations',
    body: 'Temperature adjusts token sampling randomness (default 1.0). Lower values stay deterministic and grounded; higher values boost variety but can increase confident-sounding hallucinations.',
  },
  {
    title: '06. Accounts & Guest Mode',
    body: 'Google or Email sign-in syncs chats and memory to Cloud Firestore per user (users/{uid}). Guest Mode keeps everything locally in your browser without requiring an account.',
  },
];

export const HelpBackupScreen: React.FC<HelpBackupScreenProps> = ({
  chats,
  sharedMemory,
  shareMemoryEnabled,
  onRestoreBackup,
}) => {
  const [jsonText, setJsonText] = useState(() =>
    serializeBackupJson(
      createBackupPayload({ chats, sharedMemory, shareMemoryEnabled })
    )
  );
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRefreshExport = () => {
    const json = serializeBackupJson(
      createBackupPayload({ chats, sharedMemory, shareMemoryEnabled })
    );
    setJsonText(json);
    setStatus({
      type: 'success',
      text: `Prepared JSON backup with ${chats.length} chat(s).`,
    });
  };

  const handleDownload = () => {
    const json = serializeBackupJson(
      createBackupPayload({ chats, sharedMemory, shareMemoryEnabled })
    );
    setJsonText(json);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `material-ai-chat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({
      type: 'success',
      text: `Downloaded JSON backup (${chats.length} chat(s)).`,
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus({ type: 'error', text: 'Clipboard copy failed. Select and copy the text box manually.' });
    }
  };

  const runRestore = async (raw: string) => {
    setStatus(null);
    const parsed = parseBackupJson(raw);
    if (!parsed.ok) {
      setStatus({ type: 'error', text: parsed.error });
      return;
    }

    setRestoring(true);
    try {
      await onRestoreBackup(parsed.data);
      const totalMessages = parsed.data.chats.reduce((acc, c) => acc + c.messages.length, 0);
      setStatus({
        type: 'success',
        text: `Restored ${parsed.data.chats.length} chat(s) and ${totalMessages} message(s) successfully.`,
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to restore backup.',
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setJsonText(text);
      await runRestore(text);
    } catch {
      setStatus({ type: 'error', text: 'Could not read selected file.' });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 space-y-8">
      {/* JSON Chat History Backup Tools */}
      <section className="rounded-3xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Chat History Backup & Restore
            </h1>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
              Export your chats and shared memory to JSON, import a saved file, or paste JSON below
              to restore.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#062E6F] text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D3E3FD] text-[#041E49] dark:bg-[#004A77] dark:text-[#C2E7FF] text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Import File</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Import JSON backup file"
            />
          </div>
        </div>

        {status && (
          <div
            role="status"
            className={`rounded-2xl border p-3.5 text-sm flex items-start gap-2.5 ${
              status.type === 'success'
                ? 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                : 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
            }`}
          >
            {status.type === 'success' ? (
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{status.text}</span>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="backup-json-textarea" className="text-sm font-semibold">
              JSON Backup Payload (Inspect or Paste to Restore)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshExport}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#262E3B] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Refresh Export</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E2E8F0] dark:border-[#262E3B] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#EEF2F7] dark:hover:bg-[#1E2530]"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
          </div>

          <textarea
            id="backup-json-textarea"
            rows={8}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{"version": 1, "chats": [...]}'
            className="w-full p-3.5 rounded-2xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0E1117] font-mono text-xs leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0] dark:focus-visible:ring-[#A8C7FA]"
          />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={restoring}
              onClick={() => void runRestore(jsonText)}
              className="min-h-[42px] px-5 py-2 rounded-xl border border-[#0B57D0] dark:border-[#A8C7FA] text-[#0B57D0] dark:text-[#A8C7FA] hover:bg-[#D3E3FD]/40 dark:hover:bg-[#004A77]/40 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {restoring ? 'Restoring...' : 'Restore from Pasted JSON'}
            </button>
          </div>
        </div>
      </section>

      {/* 6 Concise Educational Cards */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold tracking-tight">How This Chatbot Works</h2>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
            Six core concepts behind modern AI assistants, memory, and safety controls.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {GUIDE_CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] p-5 space-y-2"
            >
              <h3 className="font-display text-base font-semibold">{card.title}</h3>
              <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};
