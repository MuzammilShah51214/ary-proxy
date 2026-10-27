const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// CORS enable karein
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Main proxy endpoint
app.post('/proxy', async (req, res) => {
  try {
    console.log("Request Body:", req.body); // Debugging ke liye

    // JazzTV API ko call kar rahe hain
    const response = await axios({
      method: 'post',
      url: 'https://web.jazztv.pk/alpha/api_gateway/v6/web/get-channel-url',
      headers: {
        'Authorization': req.headers['authorization'] || '', 
        'Accept': 'application/json',
        'platform': 'web',
        
        // ✅ YEH NAYE HEADERS ADD KIYE HAIN (Yeh eData error fix karenge)
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://jazztv.pk',
        'Referer': 'https://jazztv.pk/'
      },
      data: req.body 
    });
    
    // Debugging ke liye API ka jawab console mein print karein
    console.log("API Response:", response.data);

    // Frontend ko wapis bhej dein
    res.json(response.data);
    
  } catch (error) {
    console.error("API Error:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Proxy request failed', details: error.message });
  }
});

// Test route
app.get('/', (req, res) => {
    res.send('JazzTV Proxy is running perfectly!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
