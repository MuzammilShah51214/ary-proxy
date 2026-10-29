# mjunoon.tv Proxy Player

Ye ek custom Live TV Player hai jo mjunoon.tv ki streams ko proxy ke zariye play karta hai. 

## Features
- mjunoon.tv API se automatic token fetch karta hai.
- Expired tokens ko auto-refresh karta hai.
- HLS stream proxy bypass CORS aur Referer restrictions.
- Responsive UI (Mobile + Desktop supported).

## Tech Stack
- **Backend:** Node.js, Express.js
- **Frontend:** HTML, CSS, HLS.js

## Setup Instructions (Local)
1. Clone the repo: `git clone https://github.com/MuzammilShah51214/mjunoon.tv-proxy.git`
2. Install dependencies: `npm install`
3. Run the server: `npm start`
4. Open: `http://localhost:3000`

## Environment Variables
To run this project, you will need to add the following environment variables:
- `MJ_EMAIL` = your_mjunoon_email
- `MJ_PASSWORD` = your_mjunoon_password
- `MJ_TOKEN` = (Optional fallback token)

## Live Demo
*(Deploy karne ke baad yahan apna Render ka link add kar dein)*
