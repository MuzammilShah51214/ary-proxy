const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const MJUNOON_BASE = 'https://cdn2.mjunoon.tv:9191/v2';

// Headers jo Mjunoon TV API ko chahiye
const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

app.post('/api/stream', async (req, res) => {
  try {
    const response = await fetch(`${MJUNOON_BASE}/embed-player-url`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(req.body).toString()
    });
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
});

app.get('/api/channel-types', async (req, res) => {
  try {
    const response = await fetch(`${MJUNOON_BASE}/channel-types`, { headers: HEADERS });
    res.status(response.status).send(await response.text());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/streaming-url', async (req, res) => {
  try {
    const response = await fetch(`${MJUNOON_BASE}/streaming-url`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(req.body).toString()
    });
    res.status(response.status).send(await response.text());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.send('Mjunoon Proxy is Running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
