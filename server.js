// server.js
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import Conversation from './src/models/Conversation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Use native fetch (Node 18+)
const globalFetch = global.fetch || (await import('node-fetch')).default;

// Allow JSON request bodies
app.use(express.json());

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend
const staticDir = path.join(__dirname, 'client', 'dist');
app.use(express.static(staticDir));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Create new conversation
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

// Get all messages from a conversation
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

// Add message, get Llama reply, store both
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

    // Save user message
    conversation.messages.push({ role: 'user', content });

    // Compose prompt
    const messagesForLlama = [];
    const systemPrompt = process.env.SYSTEM_PROMPT || 'You are a helpful assistant.';
    messagesForLlama.push({ role: 'system', content: systemPrompt });

    const memoryLength = parseInt(process.env.MEMORY_LENGTH, 10) || 15;
    const recentMessages = conversation.messages.slice(-memoryLength);
    recentMessages.forEach((msg) => messagesForLlama.push({ role: msg.role, content: msg.content }));

    // Get Llama reply
    const assistantReply = await callLlamaAPI(messagesForLlama);

    // Save assistant message
    conversation.messages.push({ role: 'assistant', content: assistantReply });
    await conversation.save();

    res.json({ reply: assistantReply });
  } catch (err) {
    console.error('❌ Error processing message:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Meta Llama API call
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

  // Compatible with Meta's Llama response
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    reply = data.choices[0].message?.content || '';
  } else if (data.completion_message?.content?.type === 'text') {
    reply = data.completion_message.content.text;
  }

  return reply;
}

// Launch server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
