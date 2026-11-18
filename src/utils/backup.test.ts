import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackupPayload,
  parseBackupJson,
  parseInlineFormatting,
  serializeBackupJson,
} from './backup';
import type { ChatThread } from '../types/chat';

test('backup round-trip preserves chats, messages, and shared memory', () => {
  const sampleChats: ChatThread[] = [
    {
      id: 'chat_1',
      title: 'Kotlin & Compose Q&A',
      createdAtMs: 1000,
      updatedAtMs: 2000,
      messages: [
        {
          id: 'msg_1',
          chatId: 'chat_1',
          role: 'user',
          content: 'My name is Maya. What is 20% of 150?',
          modelUsed: 'user',
          createdAtMs: 1001,
        },
        {
          id: 'msg_2',
          chatId: 'chat_1',
          role: 'assistant',
          content: '**20% of 150** = **30**',
          modelUsed: 'offline-local',
          createdAtMs: 1002,
        },
      ],
    },
  ];

  const payload = createBackupPayload({
    chats: sampleChats,
    sharedMemory: { userName: 'Maya', facts: ['Prefers Material 3'] },
    shareMemoryEnabled: true,
  });

  const json = serializeBackupJson(payload);
  const parsed = parseBackupJson(json);

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.chats.length, 1);
    assert.equal(parsed.data.chats[0].messages.length, 2);
    assert.equal(parsed.data.sharedMemory.userName, 'Maya');
    assert.deepEqual(parsed.data.sharedMemory.facts, ['Prefers Material 3']);
  }
});

test('parseBackupJson rejects invalid JSON and empty/malformed payloads', () => {
  const empty = parseBackupJson('   ');
  assert.equal(empty.ok, false);

  const syntaxErr = parseBackupJson('{bad json');
  assert.equal(syntaxErr.ok, false);

  const missingChats = parseBackupJson(JSON.stringify({ version: 1 }));
  assert.equal(missingChats.ok, false);

  const zeroChats = parseBackupJson(JSON.stringify({ chats: [] }));
  assert.equal(zeroChats.ok, false);
});

test('parseInlineFormatting splits bold and inline code segments cleanly', () => {
  const spans = parseInlineFormatting('Hello **Priya**, run `npm test` now.');
  assert.deepEqual(spans, [
    { type: 'text', value: 'Hello ' },
    { type: 'bold', value: 'Priya' },
    { type: 'text', value: ', run ' },
    { type: 'code', value: 'npm test' },
    { type: 'text', value: ' now.' },
  ]);
});
