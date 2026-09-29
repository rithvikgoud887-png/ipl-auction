# 🚀 IPL AUCTION — DEPLOYMENT GUIDE

You can easily deploy **IPL AUCTION** online so that you and your friends can play from anywhere in the world on your phones and laptops.

Here are the **3 best ways to deploy**, starting with the fastest (ready in 10 seconds without any signups!):

---

## ⚡ Method 1: Instant Public Link in 10 Seconds (No Sign-Up Needed)
If you want to play with your friends **RIGHT NOW**:

1. Make sure your local server is running:
   ```bash
   python server.py
   ```
2. In a second terminal window, run either:
   ```bash
   npx localtunnel --port 5000
   ```
   *OR* using Cloudflare (free, no account needed):
   ```bash
   # Download cloudflared from cloudflare.com/products/tunnel
   cloudflared tunnel --url http://localhost:5000
   ```
3. You will get a public link like:
   `https://ipl-auction-game.loca.lt` or `https://xxxx.trycloudflare.com`
4. Send that link to your friends via WhatsApp or Discord. They can open it on their phones, enter the room code, and start bidding immediately!

---

## 🌐 Method 2: Free 24/7 Cloud Deployment on Render.com (Recommended)
Render hosts Python web apps and WebSockets for **100% free** with automatic SSL (`https://...` and `wss://...`):

### Steps:
1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "IPL Auction Ready for Deploy"
   git branch -M main
   # Create a new repository on github.com and link it:
   git remote add origin https://github.com/<your-username>/ipl-auction.git
   git push -u origin main
   ```
2. Go to **[Render.com](https://render.com)** and sign in with GitHub.
3. Click **New +** → **Web Service**.
4. Select your `ipl-auction` GitHub repository.
5. Render will auto-detect everything from `render.yaml` or fill in:
   * **Name**: `ipl-auction`
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `python server.py`
   * **Plan**: `Free`
6. Click **Deploy Web Service**!
7. In ~60 seconds, your app will be live at:
   `https://ipl-auction.onrender.com`

---

## 🚂 Method 3: Railway.app (1-Click Deployment)
Railway gives you a generous free trial with zero setup:
1. Go to **[Railway.app](https://railway.app)**.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select this repository.
4. Railway will automatically build the `Dockerfile` or `Procfile`.
5. Under **Settings** → **Networking**, click **Generate Domain**.
6. Your auction is immediately live with HTTPS and WSS!

---

## 🐳 Method 4: Docker Container (Any VPS / Cloud Run / AWS)
To run anywhere using Docker:
```bash
docker build -t ipl-auction .
docker run -p 5000:5000 ipl-auction
```

---

## 🔒 What Was Configured for Production Deployment
1. **Unified Single-Port Architecture**: The application serves both HTTP (static assets, images, API) and WebSockets over a **single port** (`PORT` environment variable), which is required by cloud hosts like Render, Railway, and Cloud Run.
2. **Instant Vector Logos & Avatars**: Embedded into memory (`assets-data.js`), ensuring zero CDN drops and zero broken images on all mobile networks.
3. **Automatic Protocol Detection**: Client dynamically switches between `ws://` (local HTTP) and `wss://` (production HTTPS).
