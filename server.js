const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/api/stream', async (req, res) => {
  try {
    let slug = req.body.slug;
    if (!slug) return res.status(400).json({ error: 'Slug missing' });

    // Slug ko URL format mein convert karein (e.g. AbbTakNews-133 -> abb-takk-news-live)
    // Hum direct aapki di hui embed URL try karenge
    let embedUrl = `https://www.mjunoon.tv/embedplayer/${slug.toLowerCase()}-live.html`;

    // Agar slug already "live" ke baghair hai, toh backup URL
    // Hum direct embed page fetch karenge
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      }
    });

    const html = await response.text();

    // HTML ke andar se m3u8 link dhoondein (regular expression ke zariye)
    // Mjunoon apne HTML mein stream URL json format ya data attributes mein chhupa kar rakhta hai
    const streamRegex = /(https?:\/\/[^"']+\.m3u8[^"']*)/g;
    let matches = html.match(streamRegex);
    
    let streamUrl = null;
    if (matches && matches.length > 0) {
      // Pehla m3u8 link uthayen
      streamUrl = matches[0];
    } else {
      // Agar direct nahi mila, toh "streaming-url" API ka reference dhoondein
      const apiRegex = /https:\/\/cdn2\.mjunoon\.tv:9191\/v2\/[^"']+/g;
      // (Backup plan)
    }

    if (streamUrl) {
      // HTML player ko wahi format chahiye jo API deti thi
      res.json({ data: { live_stream_url: streamUrl } });
    } else {
      res.status(404).json({ error: 'Stream URL not found in embed page', slug: slug, url: embedUrl });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Proxy scrape error', details: error.message });
  }
});

app.get('/', (req, res) => res.send('Mjunoon Proxy (Scraper Mode) is Running ✅'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
