import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import Conversation from './src/models/Conversation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const globalFetch = global.fetch || (await import('node-fetch')).default;

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const staticDir = path.join(__dirname, 'client', 'dist');
app.use(express.static(staticDir));

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

app.post('/api/conversation', async (req, res) => {
  try {
    const conversation = new Conversation({ messages: [] });
    await conversation.save();
    res.json({ conversationId: conversation._id });
  } catch (err) {
    console.error('❌ Error creating conversation:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/api/conversation/:id/messages', async (req, res) => {
  const { id } = req.params;
  try {
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation.messages);
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
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversation.messages.push({ role: 'user', content });

    const messagesForLlama = [];
    const systemPrompt = process.env.SYSTEM_PROMPT || 'You are a helpful assistant.';
    messagesForLlama.push({ role: 'system', content: systemPrompt });

    const memoryLength = parseInt(process.env.MEMORY_LENGTH, 10) || 15;
    const recentMessages = conversation.messages.slice(-memoryLength);
    recentMessages.forEach((msg) => messagesForLlama.push({ role: msg.role, content: msg.content }));

    const assistantReply = await callLlamaAPI(messagesForLlama);

    conversation.messages.push({ role: 'assistant', content: assistantReply });
    await conversation.save();

    res.json({ reply: assistantReply });
  } catch (err) {
    console.error('❌ Error processing message:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

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
