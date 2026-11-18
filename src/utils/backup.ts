import type { BackupPayload, ChatMessage, ChatThread, SharedMemory } from '../types/chat';
import { sanitizeMemory } from './offlineAssistant';

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function toSafeId(raw: unknown, fallbackPrefix: string, index: number): string {
  if (typeof raw === 'string' && SAFE_ID_REGEX.test(raw)) {
    return raw;
  }
  return `${fallbackPrefix}_${Date.now()}_${index}`;
}

export function createBackupPayload(params: {
  chats: ChatThread[];
  sharedMemory: SharedMemory;
  shareMemoryEnabled: boolean;
}): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    shareMemoryEnabled: Boolean(params.shareMemoryEnabled),
    sharedMemory: sanitizeMemory(params.sharedMemory),
    chats: params.chats.map((chat) => ({
      id: chat.id,
      title: chat.title.slice(0, 120),
      createdAtMs: chat.createdAtMs,
      updatedAtMs: chat.updatedAtMs,
      messages: chat.messages.slice(-500).map((m) => ({
        id: m.id,
        chatId: chat.id,
        role: m.role,
        content: m.content.slice(0, 16000),
        modelUsed: m.modelUsed.slice(0, 80),
        createdAtMs: m.createdAtMs,
      })),
    })),
  };
}

export function serializeBackupJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

export type ParseBackupResult =
  | { ok: true; data: BackupPayload }
  | { ok: false; error: string };

export function parseBackupJson(rawText: string): ParseBackupResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Backup JSON input is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Invalid JSON syntax. Please check brackets and quotes.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Backup JSON must be an object containing a "chats" array.' };
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.chats)) {
    return { ok: false, error: 'Missing required "chats" array in backup JSON.' };
  }

  if (record.chats.length === 0) {
    return { ok: false, error: 'Backup contains zero chats to restore.' };
  }

  const chats: ChatThread[] = [];
  for (let i = 0; i < record.chats.length; i++) {
    const rawChat = record.chats[i];
    if (!rawChat || typeof rawChat !== 'object') continue;
    const c = rawChat as Record<string, unknown>;
    const chatId = toSafeId(c.id, 'chat', i);
    const title =
      typeof c.title === 'string' && c.title.trim()
        ? c.title.trim().slice(0, 120)
        : `Imported Chat ${i + 1}`;
    const createdAtMs =
      typeof c.createdAtMs === 'number' && Number.isFinite(c.createdAtMs)
        ? c.createdAtMs
        : Date.now();
    const updatedAtMs =
      typeof c.updatedAtMs === 'number' && Number.isFinite(c.updatedAtMs)
        ? c.updatedAtMs
        : createdAtMs;

    const rawMsgs = Array.isArray(c.messages) ? c.messages : [];
    const messages: ChatMessage[] = [];
    for (let j = 0; j < rawMsgs.length && j < 500; j++) {
      const rawMsg = rawMsgs[j];
      if (!rawMsg || typeof rawMsg !== 'object') continue;
      const m = rawMsg as Record<string, unknown>;
      const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
      const content = typeof m.content === 'string' ? m.content.trim().slice(0, 16000) : '';
      if (!role || !content) continue;
      messages.push({
        id: toSafeId(m.id, 'msg', j),
        chatId,
        role,
        content,
        modelUsed:
          typeof m.modelUsed === 'string'
            ? m.modelUsed.slice(0, 80)
            : role === 'user'
              ? 'user'
              : 'imported',
        createdAtMs:
          typeof m.createdAtMs === 'number' && Number.isFinite(m.createdAtMs)
            ? m.createdAtMs
            : createdAtMs + j,
      });
    }

    chats.push({
      id: chatId,
      title,
      createdAtMs,
      updatedAtMs,
      messages,
    });
  }

  if (chats.length === 0) {
    return { ok: false, error: 'No valid chat objects found inside "chats".' };
  }

  const rawMem =
    record.sharedMemory && typeof record.sharedMemory === 'object'
      ? (record.sharedMemory as Record<string, unknown>)
      : {};
  const sharedMemory = sanitizeMemory({
    userName: typeof rawMem.userName === 'string' ? rawMem.userName : '',
    facts: Array.isArray(rawMem.facts)
      ? rawMem.facts.filter((f): f is string => typeof f === 'string')
      : [],
  });

  return {
    ok: true,
    data: {
      version: 1,
      exportedAt:
        typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
      shareMemoryEnabled:
        typeof record.shareMemoryEnabled === 'boolean' ? record.shareMemoryEnabled : true,
    sharedMemory,
    chats,
  },
  };
}

export interface TextSpan {
  type: 'text' | 'bold' | 'code';
  value: string;
}

export function parseInlineFormatting(line: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ type: 'text', value: line.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      spans.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      spans.push({ type: 'code', value: token.slice(1, -1) });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < line.length) {
    spans.push({ type: 'text', value: line.slice(lastIndex) });
  }

  return spans.length > 0 ? spans : [{ type: 'text', value: line }];
}
