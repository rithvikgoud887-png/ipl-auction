/**
 * IPL AUCTION — Master Application Controller
 * Real-time auction synchronization, mobile bottom navigation, and live all-players pool.
 */

// Application State
const state = {
  roomCode: null,
  userId: localStorage.getItem("ipl_auction_user") || `usr_${Date.now()}`,
  userName: localStorage.getItem("ipl_auction_name") || "",
  isHost: false,
  myTeamId: null,
  roomState: null,
  allPlayers: [],
  allTeams: [],
  activeArenaSubTab: "arenaMainTab"
};

// Save user id
localStorage.setItem("ipl_auction_user", state.userId);

// DOM Elements
const views = {
  lobby: document.getElementById("lobbyView"),
  teamSelect: document.getElementById("teamSelectView"),
  arena: document.getElementById("auctionArenaView"),
  complete: document.getElementById("auctionCompleteView")
};

function showView(viewName) {
  Object.keys(views).forEach((key) => {
    if (views[key]) {
      views[key].classList.toggle("active", key === viewName);
    }
  });

  // Mobile Bottom Nav visibility
  const mobileNav = document.getElementById("mobileBottomNav");
  const arenaTabs = document.getElementById("arenaNavTabs");
  if (viewName === "arena") {
    if (mobileNav) mobileNav.classList.remove("hidden");
    if (arenaTabs) arenaTabs.classList.remove("hidden");
  } else {
    if (mobileNav) mobileNav.classList.add("hidden");
    if (arenaTabs) arenaTabs.classList.add("hidden");
  }

  const exitBtn = document.getElementById("exitRoomBtn");
  const roomBadge = document.getElementById("roomBadgeContainer");
  const hostEmergencyBar = document.getElementById("hostEmergencyBar");
  const hostNotice = document.getElementById("hostNotice");
  const startBtn = document.getElementById("startAuctionBtn");
  if (exitBtn) exitBtn.classList.toggle("hidden", !state.roomCode || viewName === "lobby");
  if (roomBadge) roomBadge.classList.toggle("hidden", !state.roomCode || viewName === "lobby");
  if (hostEmergencyBar) hostEmergencyBar.classList.toggle("hidden", !state.isHost || viewName !== "arena");
  if (hostNotice) hostNotice.classList.toggle("hidden", !state.isHost || viewName !== "teamSelect");
  if (startBtn) startBtn.classList.toggle("hidden", !state.isHost || viewName !== "teamSelect");
}

function showNotification(msg, duration = 3000) {
  const banner = document.getElementById("notificationBanner");
  const msgEl = document.getElementById("notificationMessage");
  if (banner && msgEl) {
    msgEl.textContent = msg;
    banner.classList.remove("hidden");
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => {
      banner.classList.add("hidden");
    }, duration);
  }
}

// Format Currency
function formatCrore(num) {
  if (num === undefined || num === null) return "₹0.00 Cr";
  return `₹${Number(num).toFixed(2)} Cr`;
}

// Switch Sub Tabs inside Arena (Main Bidding, All Players Pool, Teams)
function switchArenaSubTab(targetId) {
  state.activeArenaSubTab = targetId;

  // Header Segmented Tabs
  document.querySelectorAll(".arena-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });

  // Mobile Bottom Nav
  document.querySelectorAll(".mobile-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === targetId);
  });

  // Content Panes
  document.querySelectorAll(".arena-tab-content").forEach((pane) => {
    pane.classList.toggle("active", pane.id === targetId);
  });

  if (targetId === "arenaPlayersTab") {
    renderAllPlayersPool();
  } else if (targetId === "arenaTeamsTab") {
    renderTeamsLeaderboard();
  }
}
window.switchArenaSubTab = switchArenaSubTab;

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  console.log("IPL Auction App Initialized.");

  // Audio Toggle
  const audioBtn = document.getElementById("audioToggleBtn");
  if (audioBtn) {
    audioBtn.textContent = window.soundEngine.isMuted ? "🔇" : "🔊";
    audioBtn.addEventListener("click", () => {
      const isMuted = window.soundEngine.toggleMute();
      audioBtn.textContent = isMuted ? "🔇" : "🔊";
      showNotification(isMuted ? "Audio Muted" : "Audio Enabled");
    });
  }

  // Load Seeded Players & Teams via API
  try {
    const [playersRes, teamsRes] = await Promise.all([
      fetch("/api/data/players").then((r) => r.json()),
      fetch("/api/data/teams").then((r) => r.json())
    ]);
    state.allPlayers = playersRes;
    state.allTeams = teamsRes;

    const countEl = document.getElementById("allPlayersTotalCount");
    const poolCountEl = document.getElementById("poolTotalCount");
    if (countEl) countEl.textContent = playersRes.length;
    if (poolCountEl) poolCountEl.textContent = playersRes.length;
  } catch (err) {
    console.error("Error loading seed data:", err);
  }

  // Connect WebSocket
  window.auctionSocket.connect();

  // Attach Event Handlers
  setupFormHandlers();
  setupHostControls();
  setupModalHandlers();
  setupNavigationHandlers();
  setupSocketListeners();
});

// Setup Form Handlers
function setupFormHandlers() {
  // Create Room Form
  const createForm = document.getElementById("createRoomForm");
  if (createForm) {
    createForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const hostName = document.getElementById("hostNameInput").value.trim();
      const auctionName = document.getElementById("auctionNameInput").value.trim();

      if (!hostName) {
        showNotification("Please enter your name.");
        return;
      }

      state.userName = hostName;
      localStorage.setItem("ipl_auction_name", hostName);

      window.auctionSocket.send("CREATE_ROOM", {
        hostName,
        auctionName,
        userId: state.userId,
        settings: {}
      });
    });
  }

  // Join Room Form
  const joinForm = document.getElementById("joinRoomForm");
  if (joinForm) {
    joinForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = document.getElementById("joinRoomCodeInput").value.trim().toUpperCase();
      const name = document.getElementById("participantNameInput").value.trim();

      if (!code || !name) {
        showNotification("Please enter both Room Code and your Name.");
        return;
      }

      state.userName = name;
      localStorage.setItem("ipl_auction_name", name);

      window.auctionSocket.send("JOIN_ROOM", {
        roomCode: code,
        name,
        userId: state.userId
      });
    });
  }

  // Copy Room Code Button
  const copyBtn = document.getElementById("copyRoomBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (state.roomCode) {
        navigator.clipboard.writeText(state.roomCode);
        showNotification(`Room Code ${state.roomCode} copied to clipboard!`);
      }
    });
  }

  // Place Bid Button
  const placeBidBtn = document.getElementById("placeBidBtn");
  if (placeBidBtn) {
    placeBidBtn.addEventListener("click", () => {
      window.soundEngine.init();
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (e) {}
      }
      window.auctionSocket.send("PLACE_BID", {
        amount: null // Server calculates next increment
      });
    });
  }

  const exitRoomBtn = document.getElementById("exitRoomBtn");
  if (exitRoomBtn) {
    exitRoomBtn.addEventListener("click", () => {
      if (!state.roomCode) return;
      if (!window.auctionSocket.isConnected) {
        showNotification("Reconnect to the auction before leaving the room.");
        return;
      }
      if (window.confirm("Leave this auction room?")) {
        window.auctionSocket.send("LEAVE_ROOM", {});
      }
    });
  }

  const passPlayerBtn = document.getElementById("passPlayerBtn");
  if (passPlayerBtn) {
    passPlayerBtn.addEventListener("click", () => window.auctionSocket.send("PASS_ON_PLAYER", {}));
  }

  // Start Auction Button (Host)
  const startBtn = document.getElementById("startAuctionBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      window.auctionSocket.send("START_AUCTION", {});
    });
  }
}

// Host Emergency Controls
function setupHostControls() {
  const pauseBtn = document.getElementById("pauseAuctionBtn");
  const resumeBtn = document.getElementById("resumeAuctionBtn");
  const skipBtn = document.getElementById("skipPlayerBtn");
  const manualNextBtn = document.getElementById("manualNextBtn");
  const startUnsoldBtn = document.getElementById("btnStartUnsoldRound");
  const closeSoldBtn = document.getElementById("closePlayerSoldBtn");
  const closeUnsoldBtn = document.getElementById("closePlayerUnsoldBtn");

  if (closeSoldBtn) closeSoldBtn.addEventListener("click", () => window.auctionSocket.send("CLOSE_PLAYER_SOLD", {}));
  if (closeUnsoldBtn) closeUnsoldBtn.addEventListener("click", () => window.auctionSocket.send("CLOSE_PLAYER_UNSOLD", {}));

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      window.auctionSocket.send("PAUSE_AUCTION", {});
    });
  }

  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => {
      window.auctionSocket.send("RESUME_AUCTION", {});
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to skip this player?")) {
        window.auctionSocket.send("SKIP_PLAYER", {});
      }
    });
  }

  if (manualNextBtn) {
    manualNextBtn.addEventListener("click", () => {
      if (confirm("EMERGENCY ONLY: Force transition to next player?")) {
        window.auctionSocket.send("SKIP_PLAYER", {});
      }
    });
  }

  if (startUnsoldBtn) {
    startUnsoldBtn.addEventListener("click", () => {
      window.auctionSocket.send("START_UNSOLD_ROUND", {});
    });
  }

  const saveXIBtn = document.getElementById("savePlayingXIBtn");
  if (saveXIBtn) {
    saveXIBtn.addEventListener("click", () => {
      window.xiBuilder.save();
    });
  }
}

// Setup Navigation & Tabs (Desktop Segmented Tabs + Mobile Bottom Nav)
function setupNavigationHandlers() {
  // Desktop Header Nav
  document.querySelectorAll(".arena-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchArenaSubTab(btn.dataset.target);
    });
  });

  // Mobile Bottom Nav
  document.querySelectorAll(".mobile-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.id === "mobileSquadNavBtn") {
        const squadModal = document.getElementById("fullSquadModal");
        if (squadModal) {
          squadModal.classList.remove("hidden");
          renderFullSquadModal();
        }
      } else {
        switchArenaSubTab(btn.dataset.tab);
      }
    });
  });

  // Header "All Players" Button
  const allPlayersBtn = document.getElementById("searchPlayersBtn");
  if (allPlayersBtn) {
    allPlayersBtn.addEventListener("click", () => {
      switchArenaSubTab("arenaPlayersTab");
    });
  }

  // Filter inputs inside All Players Pool
  const poolSearch = document.getElementById("poolSearchInput");
  const poolRole = document.getElementById("poolRoleFilter");
  const poolStar = document.getElementById("poolStarFilter");
  const poolStatus = document.getElementById("poolStatusFilter");

  if (poolSearch) poolSearch.addEventListener("input", renderAllPlayersPool);
  if (poolRole) poolRole.addEventListener("change", renderAllPlayersPool);
  if (poolStar) poolStar.addEventListener("change", renderAllPlayersPool);
  if (poolStatus) poolStatus.addEventListener("change", renderAllPlayersPool);

  // Complete View Tabs
  const completeTabs = document.querySelectorAll(".tab-btn");
  completeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      completeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const targetId = tab.dataset.tab;
      document.querySelectorAll(".tab-pane").forEach((pane) => {
        pane.classList.toggle("active", pane.id === targetId);
      });
      if (targetId === "tabStats") renderStatsTab();
      if (targetId === "tabSquads") renderAllSquadsTab();
      if (targetId === "tabXI") renderPlayingXITab();
    });
  });
}

// Modals Setup
function setupModalHandlers() {
  // Full Squad Modal
  const squadModalBtn = document.getElementById("toggleFullSquadModalBtn");
  const squadModal = document.getElementById("fullSquadModal");
  const closeSquadBtn = document.getElementById("closeFullSquadModalBtn");

  if (squadModalBtn && squadModal) {
    squadModalBtn.addEventListener("click", () => {
      squadModal.classList.remove("hidden");
      renderFullSquadModal();
    });
  }

  if (closeSquadBtn && squadModal) {
    closeSquadBtn.addEventListener("click", () => {
      squadModal.classList.add("hidden");
    });
  }
}

// Setup WebSocket Incoming Event Listeners
function setupSocketListeners() {
  const sock = window.auctionSocket;

  sock.on("ROOM_CREATED", (data) => {
    handleRoomJoined(data);
    showNotification(`Room ${data.roomCode} created! Share the code with your friends.`);
  });

  sock.on("ROOM_JOINED", (data) => {
    handleRoomJoined(data);
    showNotification(`Joined Room ${data.roomCode}`);
  });

  sock.on("ROOM_LEFT", () => {
    state.roomCode = null;
    state.roomState = null;
    state.myTeamId = null;
    state.isHost = false;
    state.activeArenaSubTab = "arenaMainTab";
    localStorage.removeItem("ipl_auction_room");
    const badge = document.getElementById("roomBadgeContainer");
    const miniFranchise = document.getElementById("myFranchiseMini");
    if (badge) badge.classList.add("hidden");
    if (miniFranchise) miniFranchise.classList.add("hidden");
    hideCelebrations();
    showView("lobby");
    showNotification("You left the auction room.");
  });

  sock.on("ROOM_STATE_SYNC", (roomState) => {
    state.roomState = roomState;
    applyRoomState(roomState);
  });

  sock.on("BID_PLACED", (data) => {
    window.soundEngine.playBid();
    showNotification(`${data.bid.teamShort} bid ${formatCrore(data.bid.amount)}!`);
  });


  sock.on("PLAYER_SOLD", (data) => {
    window.soundEngine.playSold();
    triggerSoldCelebration(data);
    if (data.automatic) {
      showNotification(`${data.player.name} sold to ${data.winningTeam.name} after all other franchises passed.`);
    }
    if (state.activeArenaSubTab === "arenaPlayersTab") renderAllPlayersPool();
  });

  sock.on("PLAYER_UNSOLD", (data) => {
    window.soundEngine.playUnsold();
    triggerUnsoldCelebration(data);
    if (state.activeArenaSubTab === "arenaPlayersTab") renderAllPlayersPool();
  });

  sock.on("PLAYER_LOADING", (data) => {
    hideCelebrations();
    showNotification(`Entering Auction: ${data.player.name}`);
    if (state.activeArenaSubTab === "arenaPlayersTab") renderAllPlayersPool();
  });

  sock.on("AUCTION_ACTIVE", (data) => {
    hideCelebrations();
  });

  sock.on("AUCTION_PAUSED", () => {
    const pausedEl = document.getElementById("pausedOverlay");
    if (pausedEl) pausedEl.classList.remove("hidden");
    const pauseBtn = document.getElementById("pauseAuctionBtn");
    const resumeBtn = document.getElementById("resumeAuctionBtn");
    if (pauseBtn) pauseBtn.classList.add("hidden");
    if (resumeBtn) resumeBtn.classList.remove("hidden");
  });

  sock.on("AUCTION_RESUMED", () => {
    const pausedEl = document.getElementById("pausedOverlay");
    if (pausedEl) pausedEl.classList.add("hidden");
    const pauseBtn = document.getElementById("pauseAuctionBtn");
    const resumeBtn = document.getElementById("resumeAuctionBtn");
    if (pauseBtn) pauseBtn.classList.remove("hidden");
    if (resumeBtn) resumeBtn.classList.add("hidden");
  });

  sock.on("AUCTION_COMPLETE", () => {
    showNotification("Main Auction Pool Completed!");
    showView("complete");
    renderStatsTab();
  });

  sock.on("ACTION_ERROR", (data) => {
    showNotification(`⚠️ ${data.message}`);
  });

  sock.on("ACTION_SUCCESS", (data) => {
    showNotification(`✓ ${data.message}`);
  });

  sock.on("ERROR", (data) => {
    showNotification(`Error: ${data.message}`);
  });
}

function handleRoomJoined(data) {
  state.roomCode = data.roomCode;
  state.userId = data.userId;
  state.isHost = data.isHost;
  state.roomState = data.state;

  localStorage.setItem("ipl_auction_room", data.roomCode);

  // Update Room Code Display
  const codeDisplay = document.getElementById("roomCodeDisplay");
  const badgeContainer = document.getElementById("roomBadgeContainer");
  if (codeDisplay) codeDisplay.textContent = data.roomCode;
  if (badgeContainer) badgeContainer.classList.remove("hidden");

  applyRoomState(data.state);
}

// Apply Full Room State
function applyRoomState(roomState) {
  if (!roomState) return;

  const room = roomState.room;
  state.isHost = room.isHost;

  // Find user's assigned team
  const myParticipant = roomState.participants.find((p) => p.id === state.userId);
  state.myTeamId = myParticipant ? myParticipant.teamId : null;

  // Manage Views based on status
  if (room.status === "WAITING") {
    showView("teamSelect");
    renderTeamSelectionGrid(roomState.teams);
    renderParticipantsList(roomState.participants);
  } else if (room.status === "AUCTION_COMPLETE") {
    showView("complete");
    renderStatsTab();
    renderAllSquadsTab();
    renderPlayingXITab();
  } else {
    showView("arena");
    renderArena(roomState);
    if (state.activeArenaSubTab === "arenaPlayersTab") {
      renderAllPlayersPool();
    } else if (state.activeArenaSubTab === "arenaTeamsTab") {
      renderTeamsLeaderboard();
    }
  }

  // Update Mini Header Team
  updateHeaderTeamMini(roomState.teams);
}

// Render Team Selection Grid
function renderTeamSelectionGrid(teams) {
  const grid = document.getElementById("teamsGrid");
  if (!grid || !teams) return;

  const teamList = Object.values(teams);
  grid.innerHTML = teamList
    .map((team) => {
      const isSelectedByMe = team.controlledBy === state.userId;
      const isLockedByOther = team.controlledBy && !isSelectedByMe;

      let cardClass = "franchise-card glass-card";
      let btnClass = "team-card-status-btn status-btn-available";
      let btnText = "SELECT FRANCHISE";

      if (isSelectedByMe) {
        cardClass += " selected-by-me";
        btnClass = "team-card-status-btn status-btn-selected";
        btnText = "YOUR FRANCHISE ✓";
      } else if (isLockedByOther) {
        cardClass += " locked";
        btnClass = "team-card-status-btn status-btn-locked";
        btnText = `LOCKED (${team.controllerName || "TAKEN"})`;
      }

      return `
        <div class="${cardClass}" onclick="selectFranchise('${team.id}')" style="--team-color: ${team.primaryColor};">
          <div class="team-card-header">
            <img src="${window.getTeamLogoSrc ? window.getTeamLogoSrc(team.id) : team.logo}" alt="${team.name}" class="team-card-logo" onerror="this.src='/assets/logos/${team.id}.svg'">
            <div>
              <h3 class="team-card-title">${team.name}</h3>
              <span class="team-card-city">${team.city}</span>
            </div>
          </div>
          <div class="team-card-stats">
            <div>
              <span style="font-size: 0.65rem; color: var(--text-muted); display: block;">STARTING PURSE</span>
              <strong style="color: var(--accent-green); font-family: var(--font-mono); font-size: 1.05rem;">${formatCrore(team.purse)}</strong>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 0.65rem; color: var(--text-muted); display: block;">SQUAD LIMIT</span>
              <strong>18–25 Players</strong>
            </div>
          </div>
          <div class="${btnClass}">
            ${btnText}
          </div>
        </div>
      `;
    })
    .join("");
}

function selectFranchise(teamId) {
  window.auctionSocket.send("SELECT_FRANCHISE", { teamId });
}

// Render Participants list
function renderParticipantsList(participants) {
  const countEl = document.getElementById("participantCount");
  const listEl = document.getElementById("participantsList");
  if (countEl) countEl.textContent = participants ? participants.length : 1;
  if (!listEl || !participants) return;

  listEl.innerHTML = participants
    .map((p) => {
      const isMe = p.id === state.userId;
      const hostTag = p.isHost ? "👑 " : "";
      const teamTag = p.teamId ? `[${p.teamId}]` : "[No Team]";
      const chipClass = p.isHost ? "participant-chip host-chip" : "participant-chip";
      return `
        <div class="${chipClass}">
          <span>${hostTag}${p.name} ${isMe ? "(You)" : ""}</span>
          <strong style="color: var(--accent-gold);">${teamTag}</strong>
        </div>
      `;
    })
    .join("");
}

// Update Header Team Mini
function updateHeaderTeamMini(teams) {
  const mini = document.getElementById("myFranchiseMini");
  const miniLogo = document.getElementById("myMiniLogo");
  const miniName = document.getElementById("myMiniName");
  const miniPurse = document.getElementById("myMiniPurse");

  if (!mini || !teams || !state.myTeamId || !teams[state.myTeamId]) {
    if (mini) mini.classList.add("hidden");
    return;
  }

  const team = teams[state.myTeamId];
  mini.classList.remove("hidden");
  if (miniLogo) miniLogo.src = window.getTeamLogoSrc ? window.getTeamLogoSrc(team.id) : team.logo;
  if (miniName) miniName.textContent = team.shortName;
  if (miniPurse) miniPurse.textContent = formatCrore(team.purse);
}

// Render Arena
function renderArena(roomState) {
  const p = roomState.currentPlayer;
  const myTeam = state.myTeamId ? roomState.teams[state.myTeamId] : null;

  // Left Column: My Franchise
  renderMyFranchiseDashboard(myTeam);

  // Left Column: Upcoming Queue peek
  renderQueuePeek(roomState);

  // Center Column: Player Podium
  if (p) {
    document.getElementById("playerNameDisplay").textContent = p.name;
    const portraitEl = document.getElementById("playerPortrait");
    if (portraitEl) {
      portraitEl.src = window.getPlayerAvatarSrc ? window.getPlayerAvatarSrc(p) : (p.imageUrl || "/assets/players/generic.svg");
      portraitEl.alt = `${p.name} profile photo`;
      portraitEl.onerror = () => { portraitEl.src = "/assets/players/generic.svg"; };
    }

    document.getElementById("playerCountryFlag").textContent = `${p.overseas ? '✈️' : '🇮🇳'} ${p.country.toUpperCase()}`;
    document.getElementById("playerSetTag").textContent = (p.auctionCategory || "AUCTION POOL").toUpperCase();
    
    const starBadge = document.getElementById("playerStarBadge");
    if (starBadge) {
      const stars = p.starValue || 3;
      const label = p.starLabel || `${stars}-STAR`;
      starBadge.textContent = `${'⭐'.repeat(stars)} ${label}`;
    }

    document.getElementById("playerCappedBadge").textContent = p.capped ? "CAPPED" : "UNCAPPED";
    document.getElementById("playerRoleBadge").textContent = p.role.toUpperCase();
    document.getElementById("playerCurrentTeam").textContent = p.currentTeam && p.currentTeam !== "POOL" ? `2026 IPL SQUAD · ${p.currentTeam}` : "ADDITIONAL AUCTION POOL";
    document.getElementById("battingStyleDisplay").textContent = `🏏 ${p.battingStyle || "Bat"}`;
    document.getElementById("bowlingStyleDisplay").textContent = `🎯 ${p.bowlingStyle || "Bowl"}`;
    document.getElementById("basePriceDisplay").textContent = formatCrore(p.reservePrice);
    document.getElementById("queueCounterDisplay").textContent = `Player ${roomState.queueIndex + 1} of ${roomState.totalInQueue}`;

    // Current Bid Display
    const currentBidVal = roomState.currentBid > 0 ? roomState.currentBid : p.reservePrice;
    document.getElementById("currentBidDisplay").textContent = formatCrore(currentBidVal);

    // Highest bidder leader box
    const leaderBox = document.getElementById("highestBidderBox");
    const leaderLogo = document.getElementById("highestBidderLogo");
    const leaderName = document.getElementById("highestBidderName");

    if (roomState.highestBidder && roomState.teams[roomState.highestBidder]) {
      const leaderTeam = roomState.teams[roomState.highestBidder];
      leaderLogo.src = window.getTeamLogoSrc ? window.getTeamLogoSrc(leaderTeam.id) : leaderTeam.logo;
      leaderLogo.onerror = () => { leaderLogo.src = `/assets/logos/${leaderTeam.id}.svg`; };
      leaderLogo.classList.remove("hidden");
      leaderName.textContent = leaderTeam.name;
      leaderName.style.color = leaderTeam.primaryColor || "#fff";
    } else {
      leaderLogo.classList.add("hidden");
      leaderName.textContent = "NO BIDS YET";
      leaderName.style.color = "var(--text-muted)";
    }

    // Bid Button Precomputed Amount
    const nextBid = roomState.nextValidBid;
    document.getElementById("nextBidAmountText").textContent = formatCrore(nextBid);

    // Mobile purse indicator
    const mobilePurseEl = document.getElementById("mobilePurseText");
    const mobileSquadEl = document.getElementById("mobileSquadText");
    if (mobilePurseEl) mobilePurseEl.textContent = myTeam ? formatCrore(myTeam.purse) : "No Team";
    if (mobileSquadEl) mobileSquadEl.textContent = myTeam ? `${myTeam.squadSize} / 25 (${myTeam.overseasCount}✈️)` : "0/25";

    // Check button disabled state
    const bidBtn = document.getElementById("placeBidBtn");
    const errHint = document.getElementById("bidErrorMessage");

    let canBid = true;
    let errReason = "";

    if (!myTeam) {
      canBid = false;
      errReason = "You must select a franchise to bid.";
    } else if (roomState.highestBidder === state.myTeamId) {
      canBid = false;
      errReason = "Your franchise currently holds the highest bid!";
    } else if (myTeam.purse < nextBid) {
      canBid = false;
      errReason = `Insufficient purse (${formatCrore(myTeam.purse)}) for next bid (${formatCrore(nextBid)})`;
    } else if (myTeam.squadSize >= 25) {
      canBid = false;
      errReason = "Squad full (25 players reached).";
    } else if (p.overseas && myTeam.overseasCount >= 8) {
      canBid = false;
      errReason = "Overseas limit reached (8 overseas players).";
    } else if (roomState.room.isPaused) {
      canBid = false;
      errReason = "Auction is paused.";
    }

    bidBtn.disabled = !canBid;
    const passBtn = document.getElementById("passPlayerBtn");
    if (passBtn) {
      const canPass = Boolean(myTeam) && !roomState.myTeamNotInterested && roomState.highestBidder !== state.myTeamId && ["AUCTION_ACTIVE", "BIDDING"].includes(roomState.room.status) && !roomState.room.isPaused;
      passBtn.disabled = !canPass;
      passBtn.textContent = roomState.myTeamNotInterested ? "PASSED ON THIS PLAYER" : "NOT INTERESTED · PASS";
    }
    const interestStatus = document.getElementById("playerInterestStatus");
    if (interestStatus) {
      const passed = roomState.notInterestedTeams || [];
      const shortNames = passed.map((teamId) => roomState.teams[teamId]?.shortName).filter(Boolean);
      interestStatus.textContent = shortNames.length ? `Passed: ${shortNames.join(", ")}` : "No franchises have passed yet";
    }
    if (!canBid && errReason) {
      errHint.textContent = errReason;
      errHint.classList.remove("hidden");
    } else {
      errHint.classList.add("hidden");
    }
  }

  // Right Column: All 10 Franchises
  renderAllFranchisesList(roomState.teams, roomState.highestBidder);

  // Right Column: Bid History Stream
  renderBidStream(roomState.bidHistory);

}

// Render My Franchise Dashboard
function renderMyFranchiseDashboard(team) {
  const logo = document.getElementById("myDashboardLogo");
  const name = document.getElementById("myDashboardName");
  const city = document.getElementById("myDashboardCity");
  const purse = document.getElementById("myDashboardPurse");
  const squadCount = document.getElementById("myDashboardSquadCount");
  const overseasCount = document.getElementById("myDashboardOverseasCount");
  const squadMiniList = document.getElementById("mySquadMiniList");

  if (!team) {
    if (name) name.textContent = "NO FRANCHISE SELECTED";
    if (city) city.textContent = "Spectator Mode";
    if (purse) purse.textContent = "₹0.00 Cr";
    return;
  }

  if (logo) {
    logo.src = window.getTeamLogoSrc ? window.getTeamLogoSrc(team.id) : team.logo;
    logo.onerror = () => { logo.src = `/assets/logos/${team.id}.svg`; };
  }
  if (name) name.textContent = team.name;
  if (city) city.textContent = team.homeGround;
  if (purse) purse.textContent = formatCrore(team.purse);
  if (squadCount) squadCount.textContent = `${team.squadSize} / 25`;
  if (overseasCount) overseasCount.textContent = `${team.overseasCount} / 8`;

  if (squadMiniList) {
    if (!team.squad || team.squad.length === 0) {
      squadMiniList.innerHTML = `<div class="empty-state-text">No players purchased yet. Place bids to build your dream squad!</div>`;
    } else {
      squadMiniList.innerHTML = team.squad
        .map(
          (p) => `
            <div class="squad-mini-item">
              <span class="squad-mini-name">${p.name} ${p.overseas ? '✈️' : ''}</span>
              <span class="squad-mini-price">${formatCrore(p.finalBid)}</span>
            </div>
          `
        )
        .join("");
    }
  }

  // Also sync XI Builder
  if (window.xiBuilder) {
    window.xiBuilder.setSquad(team.id, team.squad);
  }
}

// Render Queue Peek
function renderQueuePeek(roomState) {
  const previewList = document.getElementById("queueListPreview");
  if (!previewList) return;

  const currentIdx = roomState.queueIndex;
  const upcoming = (roomState.upcomingQueue && roomState.upcomingQueue.length > 0)
    ? roomState.upcomingQueue
    : state.allPlayers.slice(currentIdx + 1, currentIdx + 6);

  if (upcoming.length === 0) {
    previewList.innerHTML = `<div class="empty-state-text">Final player in queue!</div>`;
    return;
  }

  previewList.innerHTML = upcoming
    .map(
      (p) => `
        <div class="queue-item">
          <img src="${window.getPlayerAvatarSrc ? window.getPlayerAvatarSrc(p) : (p.imageUrl || '/assets/players/generic.svg')}" class="queue-item-thumb" alt="${p.name}" onerror="this.src='/assets/players/generic.svg'">
          <div class="queue-item-info">
            <span class="queue-item-name">${p.name}</span>
            <span class="queue-item-star">${'⭐'.repeat(p.starValue || 3)}</span>
          </div>
          <span class="queue-item-price">${formatCrore(p.reservePrice)}</span>
        </div>
      `
    )
    .join("");
}

// Render All 10 Franchises Live Table
function renderAllFranchisesList(teams, highestBidderId) {
  const listEl = document.getElementById("allFranchisesList");
  if (!listEl || !teams) return;

  const teamArr = Object.values(teams);
  listEl.innerHTML = teamArr
    .map((t) => {
      const isLeader = t.id === highestBidderId;
      const leaderClass = isLeader ? "franchise-mini-row active-leader" : "franchise-mini-row";
      return `
        <div class="${leaderClass}">
          <div class="mini-team-left">
            <img src="${window.getTeamLogoSrc ? window.getTeamLogoSrc(t.id) : t.logo}" class="mini-team-logo" alt="${t.shortName}" onerror="this.src='/assets/logos/${t.id}.svg'">
            <span class="mini-team-code" style="color: ${t.primaryColor};">${t.shortName}</span>
          </div>
          <div class="mini-team-right">
            <span class="mini-team-count">${t.squadSize}/25 (${t.overseasCount}✈️)</span>
            <span class="mini-team-purse">${formatCrore(t.purse)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

// Render Live Bid History Feed
function renderBidStream(bidHistory) {
  const feed = document.getElementById("bidHistoryStream");
  if (!feed) return;

  if (!bidHistory || bidHistory.length === 0) {
    feed.innerHTML = `<div class="empty-state-text">Waiting for first bid...</div>`;
    return;
  }

  const reversed = [...bidHistory].reverse();
  feed.innerHTML = reversed
    .map((b) => {
      const timeStr = new Date(b.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `
        <div class="bid-stream-item">
          <div>
            <span class="bid-stream-team" style="color: ${b.primaryColor || '#fff'};">${b.teamShort}</span>
            <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 4px;">(${b.bidderName})</span>
          </div>
          <div style="text-align: right;">
            <div class="bid-stream-amount">${formatCrore(b.amount)}</div>
            <div style="font-size: 0.65rem; color: var(--text-muted);">${timeStr}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// Celebrations (SOLD / UNSOLD)
function triggerSoldCelebration(data) {
  const overlay = document.getElementById("soldCelebrationOverlay");
  if (!overlay) return;

  document.getElementById("celebrationPlayerName").textContent = data.player.name;
  document.getElementById("celebrationAmount").textContent = formatCrore(data.finalBid);
  document.getElementById("celebrationTeamName").textContent = data.winningTeam.name;
  const teamLogoEl = document.getElementById("celebrationTeamLogo");
  if (teamLogoEl) {
    teamLogoEl.src = window.getTeamLogoSrc ? window.getTeamLogoSrc(data.winningTeam.id) : data.winningTeam.logo;
    teamLogoEl.onerror = () => { teamLogoEl.src = `/assets/logos/${data.winningTeam.id}.svg`; };
  }

  overlay.classList.remove("hidden");

  let cd = 2.5;
  const cdEl = document.getElementById("nextPlayerCountdown");
  const interval = setInterval(() => {
    cd = Math.max(0, cd - 0.5);
    if (cdEl) cdEl.textContent = cd.toFixed(1);
    if (cd <= 0) clearInterval(interval);
  }, 500);
}

function triggerUnsoldCelebration(data) {
  const overlay = document.getElementById("unsoldCelebrationOverlay");
  if (!overlay) return;

  document.getElementById("unsoldPlayerName").textContent = data.player.name;
  document.getElementById("unsoldBasePrice").textContent = `Base Reserve: ${formatCrore(data.basePrice)}`;

  overlay.classList.remove("hidden");

  let cd = 2.5;
  const cdEl = document.getElementById("unsoldNextCountdown");
  const interval = setInterval(() => {
    cd = Math.max(0, cd - 0.5);
    if (cdEl) cdEl.textContent = cd.toFixed(1);
    if (cd <= 0) clearInterval(interval);
  }, 500);
}

function hideCelebrations() {
  const sold = document.getElementById("soldCelebrationOverlay");
  const unsold = document.getElementById("unsoldCelebrationOverlay");
  if (sold) sold.classList.add("hidden");
  if (unsold) unsold.classList.add("hidden");
}

// ============================================================
// FULL ALL PLAYERS POOL (Seen by ALL players in the auction!)
// ============================================================
function renderAllPlayersPool() {
  const container = document.getElementById("poolGridContainer");
  const search = document.getElementById("poolSearchInput")?.value.toLowerCase() || "";
  const role = document.getElementById("poolRoleFilter")?.value || "ALL";
  const starFilter = document.getElementById("poolStarFilter")?.value || "ALL";
  const status = document.getElementById("poolStatusFilter")?.value || "ALL";

  if (!container || !state.allPlayers) return;

  // If active room has a specific shuffled queue order, sort allPlayers to match it
  if (state.roomState && state.roomState.queueOrder && state.roomState.queueOrder.length > 0) {
    const orderMap = new Map(state.roomState.queueOrder.map((id, index) => [id, index]));
    state.allPlayers.sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
  }

  // Build map of sold players from transactions
  const txMap = {};
  if (state.roomState && state.roomState.transactions) {
    state.roomState.transactions.forEach((tx) => {
      txMap[tx.playerId] = tx;
    });
  }

  // Set of unsold players
  const currentPid = state.roomState?.currentPlayer?.id;
  const queueIdx = state.roomState?.queueIndex ?? -1;

  const filtered = state.allPlayers.filter((p, idx) => {
    const matchName = p.name.toLowerCase().includes(search) || p.country.toLowerCase().includes(search);
    const matchRole = role === "ALL" || p.role === role;
    const matchStar = starFilter === "ALL" || String(p.starValue) === starFilter;

    // Determine status
    let playerStatus = "UPCOMING";
    if (txMap[p.id]) {
      playerStatus = "SOLD";
    } else if (p.id === currentPid) {
      playerStatus = "CURRENT";
    } else if (idx <= queueIdx && !txMap[p.id]) {
      playerStatus = "UNSOLD";
    }

    const matchStatus = status === "ALL" || status === playerStatus;
    return matchName && matchRole && matchStar && matchStatus;
  });

  const poolCountEl = document.getElementById("poolTotalCount");
  const allCountEl = document.getElementById("allPlayersTotalCount");
  if (poolCountEl) poolCountEl.textContent = filtered.length;
  if (allCountEl && state.allPlayers) allCountEl.textContent = state.allPlayers.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state-text" style="grid-column: 1 / -1; padding: 40px 0;">No players match your search filter.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((p, idx) => {
      let statusBadge = "";
      let cardClass = "pool-player-card";

      if (txMap[p.id]) {
        const tx = txMap[p.id];
        cardClass += " status-sold";
        const teamLogo = window.getTeamLogoSrc ? window.getTeamLogoSrc(tx.teamId) : '';
        statusBadge = `<span class="pool-status-badge badge-sold"><img src="${teamLogo}" class="mini-team-logo" style="width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px;" alt="">SOLD to ${tx.teamName} (${formatCrore(tx.finalBid)})</span>`;
      } else if (p.id === currentPid) {
        cardClass += " status-current";
        statusBadge = `<span class="pool-status-badge badge-current">🔴 CURRENTLY BIDDING</span>`;
      } else if (idx <= queueIdx && !txMap[p.id]) {
        cardClass += " status-unsold";
        statusBadge = `<span class="pool-status-badge badge-unsold">UNSOLD (Review Round)</span>`;
      } else {
        statusBadge = `<span class="pool-status-badge badge-upcoming">UPCOMING (#${idx + 1})</span>`;
      }

      return `
        <div class="${cardClass}">
          <div class="pool-player-left">
            <img src="${window.getPlayerAvatarSrc ? window.getPlayerAvatarSrc(p) : (p.imageUrl || '/assets/players/generic.svg')}" class="pool-player-avatar" alt="${p.name}" onerror="this.src='/assets/players/generic.svg'">
            <div>
              <div class="pool-player-name">${p.name} <span class="badge-star-mini">${p.starValue || 3}★</span> ${p.overseas ? '✈️' : '🇮🇳'}</div>
              <div class="pool-player-meta"><span style="color: #ffd700;">${'⭐'.repeat(p.starValue || 3)}</span> • ${p.role} • ${p.auctionCategory || 'Pool'}</div>
            </div>
          </div>
          <div class="pool-player-right">
            <div style="font-family: var(--font-mono); font-weight: 800; color: var(--accent-gold); font-size: 0.95rem;">${formatCrore(p.reservePrice)}</div>
            ${statusBadge}
          </div>
        </div>
      `;
    })
    .join("");
}

// Render Teams Leaderboard in Tab 3
function renderTeamsLeaderboard() {
  const container = document.getElementById("fullTeamsGridContainer");
  if (!container || !state.roomState) return;

  const teams = Object.values(state.roomState.teams || {});
  container.innerHTML = teams
    .map((t) => {
      const spent = 120.0 - t.purse;
      return `
        <div class="franchise-card glass-card" style="border-top: 3px solid ${t.primaryColor}; cursor: default;">
          <div class="team-card-header">
            <img src="${window.getTeamLogoSrc ? window.getTeamLogoSrc(t.id) : t.logo}" alt="${t.name}" class="team-card-logo" onerror="this.src='/assets/logos/${t.id}.svg'">
            <div>
              <h3 class="team-card-title">${t.name}</h3>
              <span class="team-card-city">Managed by: ${t.controllerName || "Inactive"}</span>
            </div>
          </div>
          <div class="team-card-stats">
            <div>
              <span style="font-size: 0.65rem; color: var(--text-muted); display: block;">PURSE REMAINING</span>
              <strong style="color: var(--accent-green); font-family: var(--font-mono); font-size: 1.15rem;">${formatCrore(t.purse)}</strong>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 0.65rem; color: var(--text-muted); display: block;">SQUAD</span>
              <strong>${t.squadSize}/25 (${t.overseasCount}✈️)</strong>
            </div>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid var(--border-subtle); padding-top: 8px;">
            Total Spent: <strong style="color: #fff;">${formatCrore(spent)}</strong>
          </div>
        </div>
      `;
    })
    .join("");
}

// Render Full Squad Modal for Current User
function renderFullSquadModal() {
  const content = document.getElementById("fullSquadModalContent");
  const title = document.getElementById("fullSquadModalTitle");
  if (!content) return;

  const myTeam = state.myTeamId && state.roomState ? state.roomState.teams[state.myTeamId] : null;
  if (!myTeam) {
    content.innerHTML = `<div class="empty-state-text">No franchise selected.</div>`;
    return;
  }

  if (title) title.textContent = `${myTeam.name.toUpperCase()} SQUAD (${myTeam.squadSize}/25)`;

  const categories = ["Wicketkeeper Batter", "Batter", "All-rounder", "Bowler"];
  content.innerHTML = categories
    .map((cat) => {
      const playersInCat = myTeam.squad.filter((p) => p.role.includes(cat) || (cat === "Batter" && p.role === "Batter"));
      return `
        <div style="margin-bottom: 16px;">
          <h4 style="font-size: 0.85rem; color: var(--accent-gold); margin-bottom: 8px;">${cat.toUpperCase()}S (${playersInCat.length})</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px;">
            ${
              playersInCat.length === 0
                ? `<span style="font-size: 0.75rem; color: var(--text-muted);">None purchased yet</span>`
                : playersInCat
                    .map(
                      (p) => `
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div>
                    <div style="font-weight: 700; font-size: 0.82rem;">${p.name} ${p.overseas ? '✈️' : ''}</div>
                    <div style="font-size: 0.68rem; color: var(--text-muted);">${p.battingStyle || ''}</div>
                  </div>
                  <strong style="color: var(--accent-green); font-family: var(--font-mono); font-size: 0.85rem;">${formatCrore(p.finalBid)}</strong>
                </div>
              `
                    )
                    .join("")
            }
          </div>
        </div>
      `;
    })
    .join("");
}

// Complete Tab 1: Factual Statistics
function renderStatsTab() {
  const container = document.getElementById("statsGrid");
  if (!container || !state.roomState) return;

  const txs = state.roomState.transactions || [];
  const teams = Object.values(state.roomState.teams || {});

  const sortedTxs = [...txs].sort((a, b) => b.finalBid - a.finalBid);
  const topTx = sortedTxs[0];
  const totalSpent = txs.reduce((sum, t) => sum + t.finalBid, 0);

  const sortedPurse = [...teams].sort((a, b) => b.purse - a.purse);
  const highestPurseTeam = sortedPurse[0];

  const sortedSquad = [...teams].sort((a, b) => b.squadSize - a.squadSize);
  const mostSquadTeam = sortedSquad[0];

  const avgPrice = txs.length > 0 ? (totalSpent / txs.length) : 0;

  container.innerHTML = `
    <div class="stat-card glass-card">
      <div class="stat-card-title">MOST EXPENSIVE PURCHASE</div>
      <div class="stat-card-val">${topTx ? formatCrore(topTx.finalBid) : "N/A"}</div>
      <div class="stat-card-sub">${topTx ? `${topTx.playerName} (${topTx.teamName})` : "No purchases yet"}</div>
    </div>

    <div class="stat-card glass-card">
      <div class="stat-card-title">TOTAL MONEY SPENT</div>
      <div class="stat-card-val" style="color: var(--accent-gold);">${formatCrore(totalSpent)}</div>
      <div class="stat-card-sub">Across ${txs.length} transactions</div>
    </div>

    <div class="stat-card glass-card">
      <div class="stat-card-title">HIGHEST REMAINING PURSE</div>
      <div class="stat-card-val" style="color: var(--accent-green);">${highestPurseTeam ? formatCrore(highestPurseTeam.purse) : "₹120.00 Cr"}</div>
      <div class="stat-card-sub">${highestPurseTeam ? highestPurseTeam.name : ""}</div>
    </div>

    <div class="stat-card glass-card">
      <div class="stat-card-title">TOTAL PLAYERS SOLD / UNSOLD</div>
      <div class="stat-card-val">${txs.length} <span style="font-size: 1.1rem; color: var(--text-muted);">SOLD</span> / ${state.roomState.unsoldCount || 0} <span style="font-size: 1.1rem; color: var(--text-muted);">UNSOLD</span></div>
      <div class="stat-card-sub">Official Mega Auction Pool</div>
    </div>

    <div class="stat-card glass-card">
      <div class="stat-card-title">AVERAGE PURCHASE PRICE</div>
      <div class="stat-card-val">${formatCrore(avgPrice)}</div>
      <div class="stat-card-sub">Per sold player</div>
    </div>

    <div class="stat-card glass-card">
      <div class="stat-card-title">MOST PLAYERS ACQUIRED</div>
      <div class="stat-card-val">${mostSquadTeam ? mostSquadTeam.squadSize : 0} Players</div>
      <div class="stat-card-sub">${mostSquadTeam ? `${mostSquadTeam.name} (${mostSquadTeam.overseasCount} overseas)` : ""}</div>
    </div>
  `;

  // Host Action: Unsold Round CTA
  const unsoldCTA = document.getElementById("unsoldRoundHostAction");
  const unsoldBadge = document.getElementById("unsoldPoolCount");
  if (unsoldBadge) unsoldBadge.textContent = state.roomState.unsoldCount || 0;
  if (unsoldCTA) {
    if (state.isHost && (state.roomState.unsoldCount || 0) > 0) {
      unsoldCTA.classList.remove("hidden");
    } else {
      unsoldCTA.classList.add("hidden");
    }
  }
}

// Complete Tab 2: All Squads
function renderAllSquadsTab() {
  const container = document.getElementById("allSquadsContainer");
  if (!container || !state.roomState) return;

  const teams = Object.values(state.roomState.teams || {});
  container.innerHTML = teams
    .map((t) => {
      const spent = 120.0 - t.purse;
      return `
        <div class="squad-breakdown-card glass-card" style="border-top: 3px solid ${t.primaryColor};">
          <div class="squad-card-head">
            <img src="${window.getTeamLogoSrc ? window.getTeamLogoSrc(t.id) : t.logo}" style="width: 38px; height: 38px; object-fit: contain;" onerror="this.src='/assets/logos/${t.id}.svg'">
            <div>
              <h3 style="font-size: 1.1rem; font-weight: 800;">${t.name}</h3>
              <span style="font-size: 0.72rem; color: var(--text-muted);">Managed by: ${t.controllerName || "Inactive"}</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 0.78rem;">
            <div>Purse Left: <strong style="color: var(--accent-green);">${formatCrore(t.purse)}</strong></div>
            <div>Spent: <strong>${formatCrore(spent)}</strong></div>
            <div>Squad: <strong>${t.squadSize}/25</strong> (${t.overseasCount}✈️)</div>
          </div>
          <div style="max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
            ${
              t.squad.length === 0
                ? `<div class="empty-state-text">No players purchased</div>`
                : t.squad
                    .map(
                      (p) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 6px; font-size: 0.75rem;">
                  <span>${p.name} ${p.overseas ? '✈️' : ''} <small style="color: var(--text-muted);">(${p.role})</small></span>
                  <strong style="font-family: var(--font-mono); color: var(--accent-gold);">${formatCrore(p.finalBid)}</strong>
                </div>
              `
                    )
                    .join("")
            }
          </div>
        </div>
      `;
    })
    .join("");
}

// Complete Tab 3: Playing XI Tab
function renderPlayingXITab() {
  if (window.xiBuilder && state.myTeamId && state.roomState) {
    const myTeam = state.roomState.teams[state.myTeamId];
    if (myTeam) {
      window.xiBuilder.setSquad(myTeam.id, myTeam.squad);
      if (state.roomState.playingXIs && state.roomState.playingXIs[state.myTeamId]) {
        window.xiBuilder.loadSavedXI(state.roomState.playingXIs[state.myTeamId]);
      }
    }
  }
}
