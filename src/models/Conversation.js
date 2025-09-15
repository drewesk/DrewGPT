// src/models/Conversation.js

import mongoose from 'mongoose';

// Each message in a conversation
const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Full conversation schema
const conversationSchema = new mongoose.Schema({
  messages: [messageSchema]
});

// Export as ES module
const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
