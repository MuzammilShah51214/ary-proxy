const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const API = 'https://cdn2.mjunoon.tv:9191/v2/embed-player-url';

app.post('/api/stream', async (req, res) => {
  try {
    const params = new URLSearchParams(req.body).toString();

    const r = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://mjunoon.tv/',
        'Origin':  'https://mjunoon.tv',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      },
      body: params
    });

    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'proxy_failed', message: err.message });
  }
});

app.get('/', (req, res) => res.send('Mjunoon proxy is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy on port ' + PORT));
