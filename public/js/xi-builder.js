/**
 * IPL AUCTION — Playing XI Builder & Impact Player Nominee
 * Enforces official IPL Playing XI limits:
 * - Exactly 11 players in Playing XI
 * - Exactly 1 Impact Player Nominee
 * - Maximum 4 overseas players in the starting XI
 */

class PlayingXIBuilder {
  constructor() {
    this.squad = [];
    this.selectedXI = []; // Array of player IDs (max 11)
    this.impactPlayerId = null; // Single player ID
    this.myTeamId = null;
  }

  setSquad(teamId, squad) {
    this.myTeamId = teamId;
    this.squad = squad || [];
    this.render();
  }

  loadSavedXI(savedData) {
    if (savedData) {
      this.selectedXI = savedData.playerIds || [];
      this.impactPlayerId = savedData.impactPlayerId || null;
      this.render();
    }
  }

  togglePlayerInXI(playerId) {
    const idx = this.selectedXI.indexOf(playerId);
    const player = this.squad.find((p) => p.id === playerId);
    if (!player) return;

    if (idx >= 0) {
      // Remove from XI
      this.selectedXI.splice(idx, 1);
    } else {
      // If already set as Impact Player, clear impact
      if (this.impactPlayerId === playerId) {
        this.impactPlayerId = null;
      }

      // Check max 11
      if (this.selectedXI.length >= 11) {
        showNotification("Playing XI already has 11 players! Remove someone first.");
        return;
      }

      // Check max 4 overseas
      if (player.overseas) {
        const overseasCount = this.selectedXI.filter((id) => {
          const p = this.squad.find((item) => item.id === id);
          return p && p.overseas;
        }).length;

        if (overseasCount >= 4) {
          showNotification("Maximum 4 overseas players allowed in Playing XI!");
          return;
        }
      }

      this.selectedXI.push(playerId);
    }

    this.render();
  }

  setImpactPlayer(playerId) {
    if (this.impactPlayerId === playerId) {
      this.impactPlayerId = null;
    } else {
      // Remove from XI if currently in XI
      const idx = this.selectedXI.indexOf(playerId);
      if (idx >= 0) {
        this.selectedXI.splice(idx, 1);
      }
      this.impactPlayerId = playerId;
    }
    this.render();
  }

  render() {
    const squadCountEl = document.getElementById("xiSquadCount");
    const availableListEl = document.getElementById("xiAvailableList");
    const pitchSlotsEl = document.getElementById("pitchSlotsGrid");
    const impactSlotEl = document.getElementById("impactPlayerSlot");
    const totalBadge = document.getElementById("xiTotalCountBadge");
    const overseasBadge = document.getElementById("xiOverseasCountBadge");
    const impactBadge = document.getElementById("xiImpactBadge");

    if (squadCountEl) squadCountEl.textContent = this.squad.length;

    // Calculate overseas in XI
    const overseasCount = this.selectedXI.filter((id) => {
      const p = this.squad.find((item) => item.id === id);
      return p && p.overseas;
    }).length;

    if (totalBadge) totalBadge.textContent = `Players: ${this.selectedXI.length} / 11`;
    if (overseasBadge) {
      overseasBadge.textContent = `Overseas: ${overseasCount} / 4 Max`;
      overseasBadge.style.color = overseasCount > 4 ? "var(--accent-red)" : "inherit";
    }

    const impactPlayer = this.squad.find((p) => p.id === this.impactPlayerId);
    if (impactBadge) {
      impactBadge.textContent = `Impact Player: ${impactPlayer ? impactPlayer.name : "None"}`;
    }

    // Render Squad Picker List
    if (availableListEl) {
      if (this.squad.length === 0) {
        availableListEl.innerHTML = `<div class="empty-state-text">Your franchise has not purchased any players yet.</div>`;
      } else {
        availableListEl.innerHTML = this.squad
          .map((player) => {
            const inXI = this.selectedXI.includes(player.id);
            const isImpact = this.impactPlayerId === player.id;
            const statusClass = inXI ? "in-xi" : isImpact ? "is-impact" : "";
            const statusLabel = inXI ? "In XI" : isImpact ? "Impact" : "+ Pick";

            return `
              <div class="xi-picker-item ${statusClass}" data-id="${player.id}">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <img src="${player.imageUrl || ''}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: #1e293b;">
                  <div>
                    <div style="font-weight: 700; font-size: 0.85rem;">
                      ${player.name} ${player.overseas ? '✈️' : '🇮🇳'}
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${player.role}</div>
                  </div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-xs ${inXI ? 'btn-danger-outline' : 'btn-success-outline'}" onclick="window.xiBuilder.togglePlayerInXI('${player.id}')">
                    ${inXI ? 'Remove' : 'Add to XI'}
                  </button>
                  <button class="btn-xs ${isImpact ? 'btn-danger-outline' : 'btn-warning-outline'}" onclick="window.xiBuilder.setImpactPlayer('${player.id}')">
                    ${isImpact ? 'Clear' : 'Impact'}
                  </button>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }

    // Render 11 Pitch Slots
    if (pitchSlotsEl) {
      let slotsHTML = "";
      for (let i = 0; i < 11; i++) {
        const playerId = this.selectedXI[i];
        if (playerId) {
          const player = this.squad.find((p) => p.id === playerId);
          slotsHTML += `
            <div class="pitch-slot filled">
              <span style="font-weight: 800; font-size: 0.82rem; color: #fff;">${i + 1}. ${player ? player.displayName || player.name : ''}</span>
              <span style="font-size: 0.68rem; color: var(--accent-cyan);">${player ? player.role : ''} ${player && player.overseas ? '✈️' : ''}</span>
            </div>
          `;
        } else {
          slotsHTML += `
            <div class="pitch-slot">
              <span style="color: rgba(255,255,255,0.4); font-weight: 600;">Slot #${i + 1}</span>
              <span style="font-size: 0.65rem; color: var(--text-muted);">Empty</span>
            </div>
          `;
        }
      }
      pitchSlotsEl.innerHTML = slotsHTML;
    }

    // Render Impact Nominee Box
    if (impactSlotEl) {
      if (impactPlayer) {
        impactSlotEl.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.2rem;">⚡</span>
              <span style="font-weight: 800;">${impactPlayer.name}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">(${impactPlayer.role})</span>
            </div>
            <button class="btn-xs btn-danger-outline" onclick="window.xiBuilder.setImpactPlayer('${impactPlayer.id}')">Remove</button>
          </div>
        `;
      } else {
        impactSlotEl.innerHTML = `<span>Select an Impact Player Nominee from your squad</span>`;
      }
    }
  }

  save() {
    if (this.selectedXI.length !== 11) {
      showNotification("You must select exactly 11 players for your Playing XI!");
      return;
    }

    const overseasCount = this.selectedXI.filter((id) => {
      const p = this.squad.find((item) => item.id === id);
      return p && p.overseas;
    }).length;

    if (overseasCount > 4) {
      showNotification("Maximum 4 overseas players allowed in Playing XI!");
      return;
    }

    if (!this.myTeamId) {
      showNotification("No franchise selected.");
      return;
    }

    window.auctionSocket.send("SAVE_PLAYING_XI", {
      teamId: this.myTeamId,
      playerIds: this.selectedXI,
      impactPlayerId: this.impactPlayerId
    });
  }
}

window.xiBuilder = new PlayingXIBuilder();
