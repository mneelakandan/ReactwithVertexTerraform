/**
 * server.js — Express backend for Vertex AI (Gemini) proxy
 * Serves the React build in production, exposes /api/chat
 */

const express  = require('express');
const path     = require('path');
const cors     = require('cors');

// Vertex AI SDK (google-cloud/aiplatform or @google-cloud/vertexai)
const { VertexAI } = require('@google-cloud/vertexai');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Vertex AI setup ───────────────────────────────────────────────────────────
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION   = process.env.GCP_LOCATION || 'us-central1';

if (!PROJECT_ID) {
  console.error('ERROR: GCP_PROJECT_ID environment variable is required');
  process.exit(1);
}

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', project: PROJECT_ID, location: LOCATION });
});

// ── Chat endpoint ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, model = 'gemini-1.5-flash', history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    });

    // Build chat history
    const chat = generativeModel.startChat({
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      })),
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    res.json({
      response: text,
      model,
      usageMetadata: response.usageMetadata || null,
    });
  } catch (err) {
    console.error('Vertex AI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Serve React build in production ──────────────────────────────────────────
const BUILD_DIR = path.join(__dirname, 'build');
app.use(express.static(BUILD_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅  Server running on port ${PORT}`);
  console.log(`   Project: ${PROJECT_ID} | Location: ${LOCATION}`);
});
