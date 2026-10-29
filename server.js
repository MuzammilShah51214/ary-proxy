// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
app.use(cors());
app.use(express.json());

const MJ_API = 'https://cdn2.mjunoon.tv:9191';
let token = null;
let expiry = 0;

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await axios.post(`${MJ_API}/v2/auth/login`, { email, password }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
      }
    });
    token = r.data.token || r.data.access_token;
    expiry = Date.now() + (r.data.expires_in || 3600) * 1000;
    res.json({ ok: true, expires_in: r.data.expires_in });
  } catch(e) {
    res.status(500).json({ error: e.message, detail: e.response?.data });
  }
});

// Channel list
app.get('/api/channels', async (req, res) => {
  try {
    const r = await axios.get(`${MJ_API}/v2//channel-types`, {
      headers: {
        'Authorization': `bearer ${token}`,
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/'
      }
    });
    res.json(r.data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Stream URL
app.post('/api/stream-url', async (req, res) => {
  try {
    const r = await axios.post(`${MJ_API}/v2/streaming-url`, req.body, {
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/'
      }
    });
    res.json(r.data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// HLS proxy (CORS + Origin headers)
app.get('/hls/*', async (req, res) => {
  try {
    const url = 'https://cdn5.mjunoon.tv:8087/' + req.params[0];
    const r = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
      }
    });
    res.set('Content-Type', r.headers['content-type'] || 'application/octet-stream');
    r.data.pipe(res);
  } catch(e) {
    res.status(500).send(e.message);
  }
});

app.listen(3000, () => console.log('✅ http://localhost:3000'));
