import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];

const PREFERENCE_KEYS = ['systemPrompt', 'tone', 'safetyNotes'];
const preferencesPath = path.join(__dirname, 'preferences.yaml');
const defaultPreferences = Object.freeze({
  systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful assistant.',
  tone: 'Friendly, precise, and concise.',
  safetyNotes: 'Politely decline unsafe or policy-violating requests.',
});

let currentPreferences = await loadPreferences();

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

const useDatabase = Boolean(process.env.DATABASE_URL);
console.log('📦 DATABASE_URL loaded:', useDatabase ? 'yes' : 'no');
const prisma = useDatabase ? new PrismaClient() : null;
const hasLlamaApiKey = Boolean(process.env.LLAMA_API_KEY);

if (!useDatabase) {
  console.warn('⚠️ DATABASE_URL not set. Using in-memory conversation store.');
}

if (!hasLlamaApiKey) {
  console.warn('⚠️ LLAMA_API_KEY not set. Falling back to stubbed assistant responses.');
}

const memoryConversations = new Map();

const globalFetch = global.fetch || (await import('node-fetch')).default;

app.use(express.json());

const staticDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(staticDir));

app.get('/api/preferences', (req, res) => {
  res.json({ preferences: currentPreferences });
});

app.post('/api/preferences', async (req, res) => {
  try {
    const incoming = sanitizeIncomingPreferences(req.body || {});
    const merged = applyPreferenceDefaults({ ...currentPreferences, ...incoming });

    await persistPreferences(merged);
    currentPreferences = merged;

    res.json({ preferences: currentPreferences });
  } catch (err) {
    console.error('❌ Error saving preferences:', err);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

app.post('/api/conversation', async (req, res) => {
  try {
    const conversationId = await createConversation();
    res.json({ conversationId });
  } catch (err) {
    console.error('❌ Error creating conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/api/conversation/:id/messages', async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await conversationExists(id))) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await getAllMessages(id);
    res.json(messages.map(({ role, content }) => ({ role, content })));
  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/conversation/:id/message', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Missing message content' });
  }

  try {
    if (!(await conversationExists(id))) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await addMessage(id, 'user', content);

    const effectivePreferences = currentPreferences || defaultPreferences;
    const systemPrompt = buildSystemPrompt(effectivePreferences);
    const memoryLength = getMemoryLength();
    const recentMessages = await getRecentMessages(id, memoryLength);

    const messagesForLlama = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map((msg) => ({ role: msg.role, content: msg.content })),
    ];

    const assistantReply = await generateAssistantReply(messagesForLlama);

    await addMessage(id, 'assistant', assistantReply);

    res.json({ reply: assistantReply });
  } catch (err) {
    console.error('❌ Error processing message:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

function buildSystemPrompt(preferences) {
  const base = (preferences?.systemPrompt || defaultPreferences.systemPrompt).trim();
  const sections = [base];

  const tone = preferences?.tone?.trim();
  if (tone) {
    sections.push(`Preferred tone: ${tone}`);
  }

  const safety = preferences?.safetyNotes?.trim();
  if (safety) {
    sections.push(`Safety guidance: ${safety}`);
  }

  return sections.join('\n\n');
}

async function loadPreferences() {
  const stored = await readPreferencesFromDisk();
  return applyPreferenceDefaults(stored);
}

async function readPreferencesFromDisk() {
  try {
    const yamlRaw = await fs.readFile(preferencesPath, 'utf8');
    const parsed = parseYaml(yamlRaw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('⚠️ Unable to read preferences file:', err.message);
    }
    return {};
  }
}

async function persistPreferences(preferences) {
  const toPersist = {};
  for (const key of PREFERENCE_KEYS) {
    const value = preferences?.[key];
    if (typeof value === 'string' && value.trim()) {
      toPersist[key] = value.trim();
    }
  }

  const serialized = stringifyYaml(toPersist, { indent: 2 });
  await fs.writeFile(preferencesPath, serialized, 'utf8');
}

function sanitizeIncomingPreferences(raw) {
  const sanitized = {};
  for (const key of PREFERENCE_KEYS) {
    const value = raw[key];
    if (typeof value === 'string') {
      const trimmed = value.trim().slice(0, 1500);
      if (trimmed) {
        sanitized[key] = trimmed;
      }
    }
  }
  return sanitized;
}

function applyPreferenceDefaults(overrides) {
  const cleaned = {};
  for (const key of PREFERENCE_KEYS) {
    const value = overrides?.[key];
    if (typeof value === 'string' && value.trim()) {
      cleaned[key] = value.trim();
    }
  }
  return { ...defaultPreferences, ...cleaned };
}

async function createConversation() {
  if (useDatabase && prisma) {
    const conversation = await prisma.conversation.create({ data: {} });
    return conversation.conversationId;
  }

  const id = randomUUID();
  memoryConversations.set(id, []);
  return id;
}

async function conversationExists(conversationId) {
  if (useDatabase && prisma) {
    const conversation = await prisma.conversation.findUnique({
      where: { conversationId },
    });
    return Boolean(conversation);
  }

  return memoryConversations.has(conversationId);
}

async function getAllMessages(conversationId) {
  if (useDatabase && prisma) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: [
        { createdAt: 'asc' },
        { messageId: 'asc' },
      ],
    });

    return messages.map(({ role, content, createdAt }) => ({
      role,
      content,
      createdAt: createdAt.toISOString(),
    }));
  }

  const stored = memoryConversations.get(conversationId);
  if (!stored) {
    throw new Error('Conversation not found');
  }

  return [...stored];
}

async function addMessage(conversationId, role, content) {
  if (useDatabase && prisma) {
    await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    });
    return;
  }

  const stored = memoryConversations.get(conversationId);
  if (!stored) {
    throw new Error('Conversation not found');
  }

  stored.push({ role, content, createdAt: new Date().toISOString() });
}

function getMemoryLength() {
  const memoryLengthEnv = parseInt(process.env.MEMORY_LENGTH, 10);
  const defaultLength = 15;
  return Number.isFinite(memoryLengthEnv)
    ? Math.max(memoryLengthEnv, 6)
    : Math.max(defaultLength, 6);
}

async function getRecentMessages(conversationId, limit) {
  if (useDatabase && prisma) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: [
        { createdAt: 'desc' },
        { messageId: 'desc' },
      ],
      take: limit,
    });

    return messages.reverse().map(({ role, content }) => ({ role, content }));
  }

  const stored = memoryConversations.get(conversationId) || [];
  return stored.slice(-limit).map(({ role, content }) => ({ role, content }));
}

async function generateAssistantReply(messages) {
  if (!hasLlamaApiKey) {
    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
    const userContent = lastUserMessage?.content || '';
    return `LLAMA_API_KEY not configured. Echoing your message:\n\n${userContent}`;
  }
  return callLlamaAPI(messages);
}

async function callLlamaAPI(messages) {
  const apiKey = process.env.LLAMA_API_KEY;
  const model = process.env.LLAMA_MODEL || 'Llama-3.3-70B-Instruct';
  const url = 'https://api.llama.com/v1/chat/completions';

  if (!apiKey) throw new Error('Missing LLAMA_API_KEY in .env');

  const payload = {
    model,
    messages,
  };

  const response = await globalFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Llama API error:', errorText);
    throw new Error(`Llama API failed with status ${response.status}`);
  }

  const data = await response.json();
  let reply = '';

  if (Array.isArray(data.choices) && data.choices.length > 0) {
    reply = data.choices[0].message?.content || '';
  } else if (data.completion_message?.content?.type === 'text') {
    reply = data.completion_message.content.text;
  }

  return reply;
}

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
  process.exit(0);
});
