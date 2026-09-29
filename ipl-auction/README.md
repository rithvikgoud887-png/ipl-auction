# 🏏 IPL AUCTION — Real-Time Multiplayer Web Application

An authentic, production-grade real-time multiplayer IPL Auction web application built for friends to host and participate in live auctions.

---

## 🌟 Key Features

1. **10 Real Official Franchises**:
   - Chennai Super Kings (CSK)
   - Delhi Capitals (DC)
   - Gujarat Titans (GT)
   - Kolkata Knight Riders (KKR)
   - Lucknow Super Giants (LSG)
   - Mumbai Indians (MI)
   - Punjab Kings (PBKS)
   - Rajasthan Royals (RR)
   - Royal Challengers Bengaluru (RCB)
   - Sunrisers Hyderabad (SRH)

2. **Complete 100% Reset**:
   - Zero retentions, zero existing squads, no RTM.
   - Every player enters the auction pool as available.
   - Starting purse: **₹120.00 Crore** per franchise.

3. **Real Official Player Database**:
   - Official BCCI/IPL player pool (Marquee Sets 1 & 2, Capped Batters, Wicketkeepers, All-rounders, Fast Bowlers, Spinners, Uncapped Stars).
   - Real base reserve prices: ₹2.0 Cr, ₹1.5 Cr, ₹1.25 Cr, ₹1.0 Cr, ₹75 L, ₹50 L, ₹30 L.
   - Roles, batting styles, bowling styles, country flags, high-res portraits.

4. **Authoritative Real-Time Bidding**:
   - Server-synchronized 10-second countdown timer.
   - Increments engine:
     - Below ₹1 Cr: +₹10 L
     - ₹1 Cr – ₹2 Cr: +₹20 L
     - ₹2 Cr – ₹5 Cr: +₹25 L
     - ₹5 Cr – ₹10 Cr: +₹50 L
     - Above ₹10 Cr: +₹1.00 Cr
   - Prevents self-bidding, insufficient purse bids, squad overflows (>25), and overseas limits (>8).

5. **Automatic Next-Player Progression**:
   - **No manual next button needed during normal flow!**
   - After **SOLD 🔨**: 2.5-second cinematic celebration -> automatically deducts purse -> saves transaction -> updates squad -> loads next player!
   - After **UNSOLD**: 2.5-second transition -> records unsold player -> loads next player!

6. **Host Emergency Controls**:
   - Pause / Resume Auction
   - Skip Player
   - Undo Last Sale (restores winning team purse, reverses squad count, re-queues player)
   - Emergency Manual Next

7. **Auction Statistics & Unsold Round**:
   - Comprehensive factual statistics: Most expensive purchase, total spend, highest remaining purse, sold/unsold counts, average price.
   - Host can trigger an **Unsold Round** to re-auction all unsold players.

8. **Playing XI Builder & Impact Player Nominee**:
   - Select 11 players for your starting lineup + 1 Impact Player.
   - Server checks: exactly 11 players, max 4 overseas in the 11, impact player from squad.

9. **Synthesized Audio Engine**:
   - Native Web Audio API sounds: Gavel/hammer strike, bidding chimes, countdown ticks, alert warning, victory fanfare, mute/unmute toggle.
   - Zero external audio assets (works offline and on mobile without missing asset errors).

10. **Mobile & Desktop Responsive Design**:
    - Desktop: 3-column command dashboard.
    - Mobile: Optimized single-column layout with sticky timer and large one-touch bid button.

---

## 🚀 How to Run Locally

### Prerequisites
- Python 3.10+ (Python 3.14 installed)
- `websockets` package (installed via `pip install websockets`)

### Start the Server
From the project folder:
```bash
cd C:\Users\rithv\.gemini\antigravity-ide\scratch\ipl-auction
python server.py
```

- **Web Application URL**: [http://localhost:5000](http://localhost:5000)
- **Real-Time WebSocket Server**: `ws://localhost:5001`

---

## 📱 Playing with Friends on Mobile / LAN

1. Find your computer's local IP address (`ipconfig` in cmd/PowerShell, e.g. `192.168.1.50`).
2. Make sure your friends are connected to the same Wi-Fi network.
3. Friends open the browser on their phones and navigate to:
   ```text
   http://<YOUR-IP>:5000
   ```
4. Friend enters the **Room Code** (e.g. `IPLU9Q2`) and their name to join!

---

## 🧪 Running the Automated Test Suite

To verify the real-time multiplayer bidding, automatic next player progression, timer reset, pause/resume, and sold/unsold transitions:
```bash
python -u test_auction.py
```
