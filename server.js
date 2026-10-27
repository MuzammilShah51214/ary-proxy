const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// CORS enable karein taake aapki HTML file bina kisi rok-tok ke is server se baat kar sake
app.use(cors());

// JSON data aur URL-encoded data dono ko accept karne ke liye
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Railway apna port khud assign karta hai, isliye process.env.PORT use karna zaroori hai
const PORT = process.env.PORT || 3000;

// Yeh aapka main proxy endpoint hai
app.post('/proxy', async (req, res) => {
  try {
    // JazzTV ki asli API ko call kar rahe hain
    const response = await axios({
      method: 'post',
      url: 'https://web.jazztv.pk/alpha/api_gateway/v6/web/get-channel-url',
      headers: {
        // Token aapki HTML file se aayega
        'Authorization': req.headers['authorization'] || '', 
        'Accept': 'application/json',
        'platform': 'web'
      },
      // HTML se aane wala data (channel_id aur platform) as it is bhej rahe hain
      data: req.body 
    });
    
    // API ka jo jawab aaya, usko wapis HTML file ko bhej dein
    res.json(response.data);
    
  } catch (error) {
    // Agar koi error aaye toh console mein print karein
    console.error("API Error:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

// Ek basic test route taake pata chale server zinda hai
app.get('/', (req, res) => {
    res.send('JazzTV Proxy is running perfectly!');
});

// Server start karein
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
