import type { ChatMessage, SharedMemory } from '../types/chat';

const STOP_NAMES = new Set([
  'a',
  'an',
  'the',
  'not',
  'here',
  'ready',
  'fine',
  'good',
  'great',
  'sorry',
  'sure',
  'asking',
  'wondering',
  'trying',
  'looking',
  'using',
  'confused',
  'happy',
  'sad',
  'tired',
  'working',
  'building',
  'learning',
  'testing',
  'guest',
]);

export function sanitizeMemory(memory: SharedMemory): SharedMemory {
  const userName = (memory.userName || '').trim().slice(0, 80);
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const raw of memory.facts || []) {
    const cleaned = String(raw).trim().slice(0, 240);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      facts.push(cleaned);
      if (facts.length >= 25) break;
    }
  }
  return { userName, facts };
}

export function extractMemoryFromMessage(
  text: string,
  current: SharedMemory
): { updated: SharedMemory; changed: boolean } {
  let userName = current.userName || '';
  const facts = [...(current.facts || [])];
  let changed = false;

  const trimmed = text.trim();

  // Match "my name is X", "call me X", "i'm X", "i am X"
  const namePatterns = [
    /\bmy name is\s+([a-zA-Z][a-zA-Z'-]{1,28}(?:\s+[a-zA-Z][a-zA-Z'-]{1,28})?)/i,
    /\bcall me\s+([a-zA-Z][a-zA-Z'-]{1,28}(?:\s+[a-zA-Z][a-zA-Z'-]{1,28})?)/i,
    /\b(?:i'm|i am)\s+([A-Z][a-zA-Z'-]{1,24})\b(?:\s+and\b|\.|,|!|$)/,
  ];

  const trailingJoiners = new Set(['and', 'or', 'but', 'from', 'in', 'at', 'on', 'with', 'who', 'i', 'im', "i'm"]);

  for (const pattern of namePatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const rawWords = match[1].trim().split(/\s+/);
      const keptWords: string[] = [];
      for (const word of rawWords) {
        if (keptWords.length > 0 && trailingJoiners.has(word.toLowerCase())) {
          break;
        }
        keptWords.push(word);
      }
      const candidate = keptWords.join(' ').trim();
      const firstWord = keptWords[0]?.toLowerCase() ?? '';
      if (candidate && !STOP_NAMES.has(firstWord)) {
        const formatted = keptWords
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
          .slice(0, 80);
        if (formatted !== userName) {
          userName = formatted;
          changed = true;
        }
        break;
      }
    }
  }

  // Extract explicit memorable facts (ignore bare filler like "Remember that!")
  const factPatterns: RegExp[] = [
    /\bremember\s+that\s+([^.!?\n]{6,160})/i,
    /\bremember\s+(?!that\b|this\b|it\b)([^.!?\n]{6,160})/i,
    /\b(i live in\s+[^.!?\n]{2,80})/i,
    /\b(i work (?:as|at|in)\s+[^.!?\n]{2,80})/i,
    /\b(my favorite\s+[^.!?\n]{3,90})/i,
    /\b(i (?:love|like|prefer)\s+[^.!?\n]{3,80})/i,
    /\b(i am (?:a|an)\s+[^.!?\n]{3,80})/i,
  ];

  const trivialFacts = new Set(['that', 'this', 'it', 'me', 'please', 'to']);

  for (const fp of factPatterns) {
    const m = trimmed.match(fp);
    if (m && m[1]) {
      const factText = m[1]
        .replace(/^(that\s+)/i, '')
        .trim()
        .replace(/[.!?]+$/, '')
        .slice(0, 240);
      if (
        factText.length >= 5 &&
        !trivialFacts.has(factText.toLowerCase()) &&
        !/^(my name|what is|who am)/i.test(factText) &&
        !facts.some((f) => f.toLowerCase() === factText.toLowerCase())
      ) {
        facts.push(factText);
        changed = true;
      }
    }
  }

  const sanitized = sanitizeMemory({ userName, facts });
  return { updated: sanitized, changed };
}

export function deriveChatScopedMemory(messages: ChatMessage[]): SharedMemory {
  let memory: SharedMemory = { userName: '', facts: [] };
  for (const msg of messages) {
    if (msg.role === 'user') {
      const { updated } = extractMemoryFromMessage(msg.content, memory);
      memory = updated;
    }
  }
  return memory;
}

// Safe recursive-descent arithmetic parser (supports +, -, *, /, ^, %, parentheses, sqrt)
function evalArithmeticExpression(expr: string): number | null {
  const cleaned = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\^/g, '**')
    .trim();

  if (!/^[0-9+\-*/().\s*sqrt]+$/i.test(cleaned)) {
    return null;
  }

  let pos = 0;
  const str = cleaned.replace(/\s+/g, '');

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < str.length && (str[pos] === '+' || str[pos] === '-')) {
      const op = str[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (pos < str.length && ((str[pos] === '*' && str[pos + 1] !== '*') || str[pos] === '/')) {
      const op = str[pos++];
      const right = parsePower();
      if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (pos + 1 < str.length && str[pos] === '*' && str[pos + 1] === '*') {
      pos += 2;
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (str[pos] === '-') {
      pos++;
      return -parseUnary();
    }
    if (str[pos] === '+') {
      pos++;
      return parseUnary();
    }
    if (str.slice(pos, pos + 4).toLowerCase() === 'sqrt') {
      pos += 4;
      const val = parsePrimary();
      if (val < 0) throw new Error('Square root of negative');
      return Math.sqrt(val);
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (str[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (str[pos] !== ')') throw new Error('Mismatched parenthesis');
      pos++;
      return val;
    }
    const start = pos;
    while (pos < str.length && ((str[pos] >= '0' && str[pos] <= '9') || str[pos] === '.')) {
      pos++;
    }
    if (start === pos) throw new Error('Expected number');
    const num = Number(str.slice(start, pos));
    if (!Number.isFinite(num)) throw new Error('Invalid number');
    return num;
  }

  try {
    const result = parseExpression();
    if (pos !== str.length || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(6)).toString();
}

export function evaluateMathQuery(
  input: string
): { resultText: string; value: number } | null {
  const q = input.trim();

  // 1. "X% of Y"
  const pctOf = q.match(/(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/i);
  if (pctOf) {
    const pct = Number(pctOf[1]);
    const base = Number(pctOf[2]);
    const val = (pct / 100) * base;
    return {
      value: val,
      resultText: `**${formatNumber(pct)}% of ${formatNumber(base)}** = **${formatNumber(val)}**\n\nCalculation: (${formatNumber(pct)} / 100) × ${formatNumber(base)} = **${formatNumber(val)}**.`,
    };
  }

  // 2. "X% off Y" or "discount X% on Y"
  const pctOff = q.match(/(-?\d+(?:\.\d+)?)\s*%\s*off\s*(?:of\s*)?(-?\d+(?:\.\d+)?)/i);
  if (pctOff) {
    const pct = Number(pctOff[1]);
    const base = Number(pctOff[2]);
    const savings = (pct / 100) * base;
    const finalVal = base - savings;
    return {
      value: finalVal,
      resultText: `**${formatNumber(pct)}% off ${formatNumber(base)}** = **${formatNumber(finalVal)}**\n\nDiscount: **${formatNumber(savings)}** · Final price: **${formatNumber(finalVal)}**.`,
    };
  }

  // 3. "increase/decrease X by Y%"
  const pctAdjust = q.match(
    /\b(increase|add|decrease|reduce|subtract)\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)\s*%/i
  );
  if (pctAdjust) {
    const verb = pctAdjust[1].toLowerCase();
    const base = Number(pctAdjust[2]);
    const pct = Number(pctAdjust[3]);
    const delta = (pct / 100) * base;
    const isAdd = verb === 'increase' || verb === 'add';
    const finalVal = isAdd ? base + delta : base - delta;
    return {
      value: finalVal,
      resultText: `${isAdd ? 'Increasing' : 'Decreasing'} **${formatNumber(base)}** by **${formatNumber(pct)}%** gives **${formatNumber(finalVal)}** (${isAdd ? '+' : '-'}${formatNumber(delta)}).`,
    };
  }

  // 4. "X is what percent of Y"
  const whatPct = q.match(/(-?\d+(?:\.\d+)?)\s+is\s+what\s+(?:percent|%)\s+of\s+(-?\d+(?:\.\d+)?)/i);
  if (whatPct) {
    const part = Number(whatPct[1]);
    const whole = Number(whatPct[2]);
    if (whole === 0) {
      return { value: 0, resultText: 'Cannot divide by zero when calculating a percentage.' };
    }
    const pct = (part / whole) * 100;
    return {
      value: pct,
      resultText: `**${formatNumber(part)}** is **${formatNumber(pct)}%** of **${formatNumber(whole)}**.`,
    };
  }

  // 5. General arithmetic expression, e.g. "calculate (12 + 8) * 3" or "25 / 5"
  const stripped = q
    .replace(/^(?:what\s+is|calculate|compute|evaluate|solve|equals?)\s+/i, '')
    .replace(/[?!=]+$/g, '')
    .trim();

  if (/[0-9]/.test(stripped) && /[+\-*/^×÷()]|sqrt/i.test(stripped)) {
    const val = evalArithmeticExpression(stripped);
    if (val !== null) {
      return {
        value: val,
        resultText: `**${stripped}** = **${formatNumber(val)}**`,
      };
    }
  }

  return null;
}

interface AiTopic {
  keywords: RegExp;
  title: string;
  body: string;
}

const AI_TOPICS: AiTopic[] = [
  {
    keywords: /\b(llm|large language model|how do ai|how do llms|transformer)\b/i,
    title: 'How Large Language Models (LLMs) Work',
    body: 'An **LLM** predicts the next **token** (word or sub-word fragment) in a sequence using a **Transformer** neural network. During pre-training it learns grammar, facts, and reasoning patterns across massive text corpora; during inference, it reads your system instruction, memory context, and conversation history to generate coherent replies one token at a time.',
  },
  {
    keywords: /\b(token|tokens|context window)\b/i,
    title: 'Tokens & Context Windows',
    body: '**Tokens** are the basic text units models read and write—roughly 3 to 4 characters or ~0.75 English words per token. A model’s **context window** is the maximum number of tokens (system prompt + shared memory + chat history + reply) it can process in a single request.',
  },
  {
    keywords: /\b(system instruction|system prompt|persona)\b/i,
    title: 'System Instructions',
    body: 'A **System Instruction** sets the assistant’s persistent rules, tone, and boundaries before any user message arrives. Switching between presets like **Professional**, **Coding Tutor**, or **Fact-Checker** changes how answers are structured without altering the underlying model weights.',
  },
  {
    keywords: /\b(temperature|hallucination|hallucinations|creativity|randomness)\b/i,
    title: 'Temperature & Hallucinations',
    body: '**Temperature** controls randomness when sampling the next token. Values near **0.0–0.4** produce deterministic, factual answers; **1.0** balances fluency and variety; higher values increase creativity but also raise the risk of **hallucinations** (confident-sounding but inaccurate claims).',
  },
  {
    keywords: /\b(memory|shared memory|cloud memory|firestore)\b/i,
    title: 'Cross-Chat Memory & Cloud Sync',
    body: 'When **Share Memory Across Chats** is enabled, your remembered name and key facts are stored per user (`users/{uid}`) and carried into new conversations. Turning it off keeps each new chat isolated to its own local thread.',
  },
  {
    keywords: /\b(kotlin|jetpack compose|material 3|android)\b/i,
    title: 'Material 3 & Modern App Architecture',
    body: '**Material 3 (Material You)** emphasizes tonal surface elevation, high-contrast Light/Dark color roles, generous touch targets (at least **44–48dp**), and clear typographic hierarchy so multi-turn conversations remain legible on both mobile and desktop screens.',
  },
];

export interface OfflineReplyInput {
  message: string;
  history: ChatMessage[];
  systemInstruction: string;
  shareMemoryEnabled: boolean;
  sharedMemory: SharedMemory;
  now?: Date;
}

export interface OfflineReplyResult {
  reply: string;
  updatedMemory: SharedMemory;
  memoryChanged: boolean;
}

export function generateOfflineReply(input: OfflineReplyInput): OfflineReplyResult {
  const now = input.now ?? new Date();
  const text = input.message.trim();

  // Extract memory from current message
  const baseMemory = input.shareMemoryEnabled
    ? input.sharedMemory
    : deriveChatScopedMemory(input.history);
  const { updated, changed } = extractMemoryFromMessage(text, baseMemory);

  const activeMemory = input.shareMemoryEnabled
    ? extractMemoryFromMessage(text, input.sharedMemory).updated
    : updated;

  const isCodingTutor = /coding tutor/i.test(input.systemInstruction);
  const isFactChecker = /fact-checker/i.test(input.systemInstruction);

  // 1. Memory recall queries
  if (/\b(what(?:'s| is) my name|who am i|do you remember me|what do you remember)\b/i.test(text)) {
    const nameLine = activeMemory.userName
      ? `Your name is **${activeMemory.userName}**.`
      : `I don't have your name saved yet—tell me **"My name is ..."** and I'll remember it!`;
    const factsLine =
      activeMemory.facts.length > 0
        ? `\n\n**Remembered details:**\n${activeMemory.facts.map((f) => `- ${f}`).join('\n')}`
        : '';
    const scopeNote = input.shareMemoryEnabled
      ? '\n\nCross-chat memory is currently **ON**.'
      : '\n\nCross-chat memory is **OFF** (remembering within this chat only).';
    return {
      reply: `${nameLine}${factsLine}${scopeNote}`,
      updatedMemory: activeMemory,
      memoryChanged: changed,
    };
  }

  // 2. Date / Time queries
  if (/\b(current time|what time|time is it|today'?s date|current date|what day|what date)\b/i.test(text)) {
    const formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    const greeting = activeMemory.userName ? `${activeMemory.userName}, it` : 'It';
    return {
      reply: `${greeting} is currently **${formattedTime}** on **${formattedDate}**.`,
      updatedMemory: activeMemory,
      memoryChanged: changed,
    };
  }

  // 3. Math & percentage queries
  const mathResult = evaluateMathQuery(text);
  if (mathResult) {
    const prefix = isFactChecker ? '**Verified Calculation:** ' : '';
    return {
      reply: `${prefix}${mathResult.resultText}`,
      updatedMemory: activeMemory,
      memoryChanged: changed,
    };
  }

  // 4. AI basics knowledge base
  for (const topic of AI_TOPICS) {
    if (topic.keywords.test(text)) {
      const tutorSuffix = isCodingTutor
        ? '\n\n**Tip:** Try adjusting the **System Instruction** or **Temperature** in Settings above to see how responses adapt.'
        : '';
      return {
        reply: `**${topic.title}**\n\n${topic.body}${tutorSuffix}`,
        updatedMemory: activeMemory,
        memoryChanged: changed,
      };
    }
  }

  // 5. Name introduction acknowledgement
  if (changed && activeMemory.userName) {
    const factNote =
      activeMemory.facts.length > 0
        ? ` I also noted: **${activeMemory.facts[activeMemory.facts.length - 1]}**.`
        : '';
    return {
      reply: `Nice to meet you, **${activeMemory.userName}**!${factNote} I'm running in **Offline Local Assistant** mode—ask me about **AI basics**, **math & percentages** (e.g. \`25% of 400\`), **current date & time**, or test **Share Memory Across Chats**.`,
      updatedMemory: activeMemory,
      memoryChanged: changed,
    };
  }

  // 6. Greetings & general offline guidance
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text)) {
    const nameGreeting = activeMemory.userName ? `, **${activeMemory.userName}**` : '';
    return {
      reply: `Hello${nameGreeting}! I'm your **Offline Local Assistant**. I can help with:\n- **AI Basics** (LLMs, tokens, system instructions, temperature, hallucinations)\n- **Math & Percentages** (e.g., \`15% off 80\`, \`(42 + 18) / 3\`)\n- **Date & Time** (e.g., \`What is today's date?\`)\n- **Memory Recall** (tell me \`My name is ...\` and ask \`What is my name?\`)`,
      updatedMemory: activeMemory,
      memoryChanged: changed,
    };
  }

  const namePrefix = activeMemory.userName ? `**${activeMemory.userName}**, ` : '';
  const personaHint = isCodingTutor
    ? 'In **Coding Tutor** mode, you can ask about tokens, system instructions, or math step-by-step.'
    : isFactChecker
      ? 'In **Fact-Checker** mode, I only answer topics I can verify locally without guessing.'
      : 'Switch to **Cloud Gemini** in Settings when a server Gemini API key is configured for open-ended reasoning.';

  return {
    reply: `${namePrefix}I'm currently running in **Offline Local Assistant** mode. I can answer questions about **AI basics** (LLMs, tokens, temperature, system instructions), solve **math & percentages**, check the **current date & time**, and **remember your name**.\n\n${personaHint}`,
    updatedMemory: activeMemory,
    memoryChanged: changed,
  };
}
