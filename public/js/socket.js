/**
 * IPL AUCTION — Real-Time WebSocket Client Wrapper
 * Authoritative connection manager with automated heartbeats & reconnection
 */

class AuctionSocketClient {
  constructor() {
    this.ws = null;
    this.callbacks = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.reconnectDelay = 1500;
    this.isConnected = false;
    this.isManualClose = false;
  }

  connect() {
    const loc = window.location;
    const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
    let wsUrl = `${wsProtocol}//${loc.host}/ws`;

    // Local file protocol fallback
    if (!loc.host) {
      wsUrl = "ws://localhost:5000/ws";
    }

    console.log(`Connecting to WebSocket server at: ${wsUrl}`);
    this.updateStatus("Connecting...", "connecting");

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error("WebSocket init error:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("WebSocket connected successfully.");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.updateStatus("Online", "online");
      this.trigger("connect");

      // Auto-rejoin room if stored in local storage
      const savedRoom = localStorage.getItem("ipl_auction_room");
      const savedUser = localStorage.getItem("ipl_auction_user");
      const savedName = localStorage.getItem("ipl_auction_name");

      if (savedRoom && savedUser && savedName) {
        this.send("JOIN_ROOM", {
          roomCode: savedRoom,
          userId: savedUser,
          name: savedName
        });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = jsonParse(event.data);
        if (!msg) return;
        this.trigger(msg.type, msg.data);
      } catch (err) {
        console.error("Error processing incoming WebSocket message:", err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      if (!this.isManualClose) {
        this.updateStatus("Reconnecting...", "offline");
        this.trigger("disconnect");
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.warn("WebSocket error observed:", err);
      this.ws.close();
    };
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(5000, this.reconnectDelay * Math.pow(1.2, this.reconnectAttempts));
      setTimeout(() => this.connect(), delay);
    } else {
      this.updateStatus("Offline", "offline");
    }
  }

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn("Cannot send message: WebSocket is not open", type, data);
    }
  }

  on(type, callback) {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, []);
    }
    this.callbacks.get(type).push(callback);
  }

  trigger(type, data) {
    const list = this.callbacks.get(type);
    if (list) {
      list.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Callback error for event [${type}]:`, e);
        }
      });
    }
  }

  updateStatus(text, stateClass) {
    const elText = document.getElementById("connectionText");
    const elDot = document.querySelector(".status-dot");
    if (elText) elText.textContent = text;
    if (elDot) {
      elDot.className = "status-dot";
      if (stateClass === "online") elDot.style.background = "var(--accent-green)";
      else if (stateClass === "connecting") elDot.style.background = "var(--accent-gold)";
      else elDot.style.background = "var(--accent-red)";
    }
  }
}

function jsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

window.auctionSocket = new AuctionSocketClient();
