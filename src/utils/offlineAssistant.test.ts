import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMathQuery,
  extractMemoryFromMessage,
  generateOfflineReply,
} from './offlineAssistant';
import type { ChatMessage, SharedMemory } from '../types/chat';

test('evaluateMathQuery computes percentages and arithmetic accurately', () => {
  const pct = evaluateMathQuery('What is 25% of 400?');
  assert.ok(pct);
  assert.equal(pct.value, 100);

  const discount = evaluateMathQuery('15% off 80');
  assert.ok(discount);
  assert.equal(discount.value, 68);

  const ratio = evaluateMathQuery('45 is what percent of 180?');
  assert.ok(ratio);
  assert.equal(ratio.value, 25);

  const expr = evaluateMathQuery('Calculate (12 + 8) * 3');
  assert.ok(expr);
  assert.equal(expr.value, 60);
});

test('extractMemoryFromMessage captures name and facts without false positives', () => {
  const initial: SharedMemory = { userName: '', facts: [] };
  const falsePositive = extractMemoryFromMessage('I am wondering how tokens work.', initial);
  assert.equal(falsePositive.updated.userName, '');

  const intro = extractMemoryFromMessage(
    'My name is Priya and I live in Bengaluru.',
    initial
  );
  assert.equal(intro.changed, true);
  assert.equal(intro.updated.userName, 'Priya');
  assert.ok(intro.updated.facts.some((f) => f.includes('Bengaluru')));

  const fillerTest = extractMemoryFromMessage('My name is Priya. Remember that!', initial);
  assert.equal(fillerTest.updated.userName, 'Priya');
  assert.equal(fillerTest.updated.facts.length, 0);
});

test('generateOfflineReply recalls name across turns and handles AI basics and date/time', () => {
  const fixedNow = new Date('2026-11-18T14:30:00Z');
  const turn1 = generateOfflineReply({
    message: 'My name is Jordan',
    history: [],
    systemInstruction: 'Professional',
    shareMemoryEnabled: true,
    sharedMemory: { userName: '', facts: [] },
    now: fixedNow,
  });
  assert.match(turn1.reply, /\*\*Jordan\*\*/);
  assert.equal(turn1.updatedMemory.userName, 'Jordan');

  const turn2 = generateOfflineReply({
    message: 'What is my name?',
    history: [
      {
        id: 'm1',
        chatId: 'c1',
        role: 'user',
        content: 'My name is Jordan',
        modelUsed: 'user',
        createdAtMs: 1,
      },
    ],
    systemInstruction: 'Professional',
    shareMemoryEnabled: true,
    sharedMemory: turn1.updatedMemory,
    now: fixedNow,
  });
  assert.match(turn2.reply, /Your name is \*\*Jordan\*\*/);

  // When shareMemoryEnabled is false and history is empty (a new chat), name should not carry over
  const newChatIsolated = generateOfflineReply({
    message: 'What is my name?',
    history: [],
    systemInstruction: 'Professional',
    shareMemoryEnabled: false,
    sharedMemory: turn1.updatedMemory,
    now: fixedNow,
  });
  assert.match(newChatIsolated.reply, /don't have your name saved yet/i);

  // AI basics
  const llmReply = generateOfflineReply({
    message: 'How do LLMs and tokens work?',
    history: [],
    systemInstruction: 'Coding Tutor',
    shareMemoryEnabled: true,
    sharedMemory: turn1.updatedMemory,
    now: fixedNow,
  });
  assert.match(llmReply.reply, /LLM/);

  // Date/time
  const dateReply = generateOfflineReply({
    message: "What is today's date?",
    history: [],
    systemInstruction: 'Professional',
    shareMemoryEnabled: true,
    sharedMemory: turn1.updatedMemory,
    now: fixedNow,
  });
  assert.match(dateReply.reply, /2026/);
});
