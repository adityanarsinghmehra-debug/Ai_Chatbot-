import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface IncomingHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  message?: string;
  history?: IncomingHistoryItem[];
  systemInstruction?: string;
  temperature?: number;
  model?: string;
}

function getStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.code === 'number') return e.code;
  const msg = typeof e.message === 'string' ? e.message : '';
  if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg)) return 429;
  if (/\b503\b|UNAVAILABLE|overloaded/i.test(msg)) return 503;
  if (/\b404\b|NOT_FOUND/i.test(msg)) return 404;
  return null;
}

function buildFallbackChain(requestedModel: string): string[] {
  const ordered = [
    requestedModel,
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-4-hydrogen',
  ];
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of ordered) {
    if (m && !seen.has(m)) {
      seen.add(m);
      chain.push(m);
    }
  }
  return chain;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      cloudAvailable: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'Cloud Gemini API key is not configured in server Secrets. Switch to Offline Local mode or add GEMINI_API_KEY in Settings > Secrets.',
        code: 'MISSING_SERVER_KEY',
      });
      return;
    }

    const body = (req.body || {}) as ChatRequestBody;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const requestedModel =
      typeof body.model === 'string' && body.model.trim()
        ? body.model.trim()
        : 'gemini-3.5-flash-lite';
    const systemInstruction =
      typeof body.systemInstruction === 'string' ? body.systemInstruction.trim().slice(0, 4000) : '';
    const rawTemp = typeof body.temperature === 'number' ? body.temperature : 1.0;
    const temperature = Math.max(0, Math.min(2, rawTemp));

    const history = Array.isArray(body.history) ? body.history.slice(-24) : [];
    const contents = [
      ...history
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const chain = buildFallbackChain(requestedModel);
    let lastError: unknown = null;

    for (let i = 0; i < chain.length; i++) {
      const candidateModel = chain[i];
      const isGemini4 = candidateModel.startsWith('gemini-4-');
      try {
        const config: Record<string, unknown> = {};
        if (systemInstruction) {
          config.systemInstruction = systemInstruction;
        }
        if (!isGemini4) {
          config.temperature = temperature;
        }

        const response = await ai.models.generateContent({
          model: candidateModel,
          contents,
          config,
        });

        const text = (response.text ?? '').trim();
        if (!text) {
          throw new Error('Model returned an empty response.');
        }

        res.json({
          text,
          modelUsed: candidateModel,
          fallbackFrom: candidateModel !== requestedModel ? requestedModel : undefined,
        });
        return;
      } catch (err) {
        lastError = err;
        const status = getStatusCode(err);
        const shouldFallback = status === 503 || status === 429 || status === 404;
        if (!shouldFallback || i === chain.length - 1) {
          break;
        }
      }
    }

    const status = getStatusCode(lastError) ?? 500;
    const errMessage =
      lastError instanceof Error ? lastError.message : 'Failed to generate Gemini response.';
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: errMessage,
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Material AI Chat server listening on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
