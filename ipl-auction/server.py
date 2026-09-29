"""
IPL AUCTION - Authoritative Real-Time Multiplayer Auction Server
Tech stack: Python 3 asyncio + websockets + http.server + SQLite
"""

import asyncio
import json
import logging
import mimetypes
import os
import random
import re
import sqlite3
import string
import sys
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("IPLAuction")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(BASE_DIR, "ipl_auction.db")

# Ensure proper mime types on Windows
mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")

# Load official seeds
with open(os.path.join(DATA_DIR, "teams.json"), "r", encoding="utf-8") as f:
    SEEDED_TEAMS = json.load(f)

with open(os.path.join(DATA_DIR, "players.json"), "r", encoding="utf-8") as f:
    SEEDED_PLAYERS = json.load(f)

# Initialize SQLite Database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host_user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        created_at REAL NOT NULL
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        final_bid REAL NOT NULL,
        timestamp REAL NOT NULL,
        bid_history_json TEXT NOT NULL
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS playing_xis (
        room_code TEXT NOT NULL,
        team_id TEXT NOT NULL,
        player_ids_json TEXT NOT NULL,
        impact_player_id TEXT,
        created_at REAL NOT NULL,
        PRIMARY KEY (room_code, team_id)
    )
    """)
    conn.commit()
    conn.close()

init_db()

# Calculate next bid based on official IPL increments
def get_next_valid_bid(current_bid: float, reserve_price: float) -> float:
    if current_bid <= 0.0:
        return round(reserve_price, 2)
    
    # Increment engine
    if current_bid < 1.00:
        inc = 0.10  # 10 Lakhs
    elif current_bid < 2.00:
        inc = 0.20  # 20 Lakhs
    elif current_bid < 5.00:
        inc = 0.25  # 25 Lakhs
    elif current_bid < 10.00:
        inc = 0.50  # 50 Lakhs
    else:
        inc = 1.00  # 1 Crore
    
    return round(current_bid + inc, 2)

class AuctionRoom:
    def __init__(self, code: str, name: str, host_user_id: str, host_name: str, settings: dict):
        self.code = code
        self.name = name
        self.host_user_id = host_user_id
        self.status = "WAITING"  # WAITING, PLAYER_LOADING, AUCTION_ACTIVE, BIDDING, SOLD, UNSOLD, PAUSED, AUCTION_COMPLETE
        self.settings = {
            "startingPurse": 120.0,
            "minSquad": 18,
            "maxSquad": 25,
            "maxOverseas": 8,
            "playingXI": 11,
            "maxOverseasInXI": 4,
            "impactPlayer": True,
            "bidTimerSeconds": 0,
            "transitionSeconds": 2.5,
            "autoNextPlayer": True,
            **settings
        }
        self.created_at = time.time()
        
        # Participants: user_id -> dict
        self.participants = {}
        # Sockets: websocket -> user_id
        self.clients = set()
        
        # Teams: team_id -> state dict
        self.teams = {}
        for t in SEEDED_TEAMS:
            self.teams[t["id"]] = {
                "id": t["id"],
                "name": t["name"],
                "shortName": t["shortName"],
                "primaryColor": t["primaryColor"],
                "secondaryColor": t["secondaryColor"],
                "accentColor": t["accentColor"],
                "city": t["city"],
                "homeGround": t["homeGround"],
                "logo": t["logo"],
                "purse": float(self.settings["startingPurse"]),
                "initialPurse": float(self.settings["startingPurse"]),
                "squad": [],
                "squadSize": 0,
                "overseasCount": 0,
                "controlledBy": None,  # user_id
                "controllerName": None
            }
        
        # Auction Queue
        self.queue = [dict(p) for p in SEEDED_PLAYERS]
        self.queue_index = -1
        self.current_player = None
        self.current_bid = 0.0
        self.highest_bidder = None
        self.highest_bidder_name = None
        self.bid_history = []
        self.not_interested_teams = set()
        self.unsold_list = []
        self.transactions = []
        self.last_transaction = None
        
        # Bidding remains open until the host closes the player.
        self.timer_remaining = 0
        self.timer_task = None
        self.is_paused = False
        self.pause_remaining = 0
        self.in_unsold_round = False
        
        # Playing XIs: team_id -> { playerIds, impactPlayerId }
        self.playing_xis = {}

    def get_public_state(self, for_user_id=None):
        participant = self.participants.get(for_user_id, {}) if for_user_id else {}
        my_team_id = participant.get("teamId")
        return {
            "room": {
                "code": self.code,
                "name": self.name,
                "status": self.status,
                "hostUserId": self.host_user_id,
                "isHost": (for_user_id == self.host_user_id) if for_user_id else False,
                "settings": self.settings,
                "isPaused": self.is_paused,
                "inUnsoldRound": self.in_unsold_round
            },
            "participants": list(self.participants.values()),
            "teams": self.teams,
            "currentPlayer": self.current_player,
            "currentBid": self.current_bid,
            "nextValidBid": get_next_valid_bid(self.current_bid, self.current_player["reservePrice"]) if self.current_player else 0.0,
            "highestBidder": self.highest_bidder,
            "highestBidderName": self.highest_bidder_name,
            "bidHistory": self.bid_history[-10:],
            "notInterestedTeams": sorted(self.not_interested_teams),
            "myTeamNotInterested": bool(my_team_id and my_team_id in self.not_interested_teams),
            "timerRemaining": self.timer_remaining,
            "queueIndex": self.queue_index,
            "totalInQueue": len(self.queue),
            "unsoldCount": len(self.unsold_list),
            "transactions": self.transactions[-15:],
            "lastTransaction": self.last_transaction,
            "playingXIs": self.playing_xis
        }

    async def broadcast(self, event_type: str, data: dict):
        if not self.clients:
            return
        payload = json.dumps({"type": event_type, "data": data})
        stale = set()
        for ws in list(self.clients):
            try:
                await ws.send(payload)
            except Exception:
                stale.add(ws)
        self.clients -= stale

    async def broadcast_state(self):
        if not self.clients:
            return
        for ws in list(self.clients):
            user_id = getattr(ws, "user_id", None)
            try:
                state = self.get_public_state(for_user_id=user_id)
                await ws.send(json.dumps({"type": "ROOM_STATE_SYNC", "data": state}))
            except Exception:
                pass

    def select_franchise(self, user_id: str, team_id: str):
        if team_id not in self.teams:
            return False, "Invalid franchise"
        
        # Check if already taken by someone else
        current_owner = self.teams[team_id]["controlledBy"]
        if current_owner and current_owner != user_id:
            return False, f"Franchise already locked by {self.teams[team_id]['controllerName']}"
        
        # Release previously controlled team if any
        for tid, t in self.teams.items():
            if t["controlledBy"] == user_id and tid != team_id:
                t["controlledBy"] = None
                t["controllerName"] = None
        
        user_name = self.participants.get(user_id, {}).get("name", "Player")
        self.teams[team_id]["controlledBy"] = user_id
        self.teams[team_id]["controllerName"] = user_name
        if user_id in self.participants:
            self.participants[user_id]["teamId"] = team_id
        return True, "Franchise assigned"

    def release_franchise(self, user_id: str):
        for tid, t in self.teams.items():
            if t["controlledBy"] == user_id:
                t["controlledBy"] = None
                t["controllerName"] = None
        if user_id in self.participants:
            self.participants[user_id]["teamId"] = None

    async def start_auction(self, user_id: str):
        if user_id != self.host_user_id:
            return False, "Only the host can start the auction."
        if self.status != "WAITING":
            return False, "Auction already started."
        
        logger.info(f"Room {self.code}: Auction started by host.")
        self.queue_index = -1
        await self.load_next_player()
        return True, "Auction started"

    async def load_next_player(self):
        # Cancel any pending timer from an external caller
        if self.timer_task and self.timer_task is not asyncio.current_task() and not self.timer_task.done():
            self.timer_task.cancel()

        if self.queue_index + 1 < len(self.queue):
            self.queue_index += 1
            self.current_player = self.queue[self.queue_index]
            self.current_bid = 0.0
            self.highest_bidder = None
            self.highest_bidder_name = None
            self.bid_history = []
            self.not_interested_teams = set()
            self.timer_remaining = 0
            self.status = "PLAYER_LOADING"
            
            logger.info(f"Room {self.code}: Loading player #{self.queue_index + 1} - {self.current_player['name']}")
            await self.broadcast("PLAYER_LOADING", {
                "player": self.current_player,
                "queueIndex": self.queue_index,
                "totalInQueue": len(self.queue)
            })
            await self.broadcast_state()

            # Cinematic intro pause (1.8s) before bidding opens automatically
            await asyncio.sleep(1.8)

            self.status = "AUCTION_ACTIVE"
            self.timer_remaining = 0
            await self.broadcast("AUCTION_ACTIVE", {
                "player": self.current_player,
                "timer": self.timer_remaining,
                "nextBid": get_next_valid_bid(0.0, self.current_player["reservePrice"])
            })
            await self.broadcast_state()

        else:
            # Reached end of current queue
            self.status = "AUCTION_COMPLETE"
            self.current_player = None
            self.current_bid = 0.0
            self.highest_bidder = None
            logger.info(f"Room {self.code}: Queue completed. Auction complete.")
            await self.broadcast("AUCTION_COMPLETE", {
                "totalSold": len(self.transactions),
                "totalUnsold": len(self.unsold_list),
                "teams": self.teams
            })
            await self.broadcast_state()

    async def run_timer_loop(self):
        # Kept as a no-op for compatibility with any already-created room tasks.
        return

    async def close_player(self, user_id: str, sold: bool):
        if user_id != self.host_user_id:
            return False, "Only the host can close bidding."
        if self.status not in ("AUCTION_ACTIVE", "BIDDING") or not self.current_player:
            return False, "There is no open player to close."
        if sold and not self.highest_bidder:
            return False, "Place a bid before marking this player sold."
        if sold:
            await self.process_sold()
        else:
            await self.process_unsold()
        return True, "Player closed"

    async def pass_on_player(self, user_id: str):
        if self.status not in ("AUCTION_ACTIVE", "BIDDING") or not self.current_player:
            return False, "There is no open player to pass on."
        if self.is_paused:
            return False, "The auction is paused."
        participant = self.participants.get(user_id)
        team_id = participant.get("teamId") if participant else None
        if not team_id or team_id not in self.teams:
            return False, "Select a franchise before passing on a player."
        if team_id == self.highest_bidder:
            return False, "Your franchise holds the highest bid and cannot pass."
        if team_id in self.not_interested_teams:
            return False, "Your franchise already passed on this player."
        self.not_interested_teams.add(team_id)

        connected_user_ids = {
            getattr(client, "user_id", None) for client in self.clients
        }
        active_team_ids = {
            p.get("teamId")
            for participant_id, p in self.participants.items()
            if participant_id in connected_user_ids and p.get("teamId") in self.teams
        }
        resolve_as_sold = False
        resolve_as_unsold = False
        if self.highest_bidder:
            competing_team_ids = active_team_ids - {self.highest_bidder}
            resolve_as_sold = competing_team_ids.issubset(self.not_interested_teams)
        else:
            resolve_as_unsold = bool(active_team_ids) and active_team_ids.issubset(self.not_interested_teams)

        # Lock bidding synchronously before the first await so a concurrent bid
        # cannot arrive after the final pass but before the sale is recorded.
        if resolve_as_sold or resolve_as_unsold:
            self.status = "PLAYER_RESOLVING"

        team = self.teams[team_id]
        await self.broadcast("TEAM_PASSED_ON_PLAYER", {
            "teamId": team_id,
            "teamName": team["name"],
            "teamShortName": team["shortName"],
            "playerId": self.current_player["id"]
        })
        await self.broadcast_state()
        if resolve_as_sold:
            await self.process_sold(automatic=True)
            return True, "All other franchises passed; player sold to the highest bidder"
        if resolve_as_unsold:
            await self.process_unsold()
            return True, "All active franchises passed; player is unsold"

        return True, "Your franchise passed on this player"

    async def process_sold(self, automatic=False):
        self.status = "SOLD"
        winning_team = self.teams[self.highest_bidder]
        sold_price = self.current_bid
        player = self.current_player

        # Deduct purse and add to squad
        winning_team["purse"] = round(winning_team["purse"] - sold_price, 2)
        sold_player_entry = {
            **player,
            "finalBid": sold_price,
            "winningTeam": winning_team["id"],
            "soldTimestamp": time.time()
        }
        winning_team["squad"].append(sold_player_entry)
        winning_team["squadSize"] = len(winning_team["squad"])
        if player.get("overseas"):
            winning_team["overseasCount"] += 1

        tx = {
            "id": f"tx_{int(time.time()*1000)}",
            "roomCode": self.code,
            "playerId": player["id"],
            "playerName": player["name"],
            "teamId": winning_team["id"],
            "teamName": winning_team["name"],
            "finalBid": sold_price,
            "timestamp": time.time(),
            "bidHistory": list(self.bid_history)
        }
        self.transactions.append(tx)
        self.last_transaction = tx

        # Save to SQLite
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("""
            INSERT INTO transactions (id, room_code, player_id, player_name, team_id, team_name, final_bid, timestamp, bid_history_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (tx["id"], tx["roomCode"], tx["playerId"], tx["playerName"], tx["teamId"], tx["teamName"], tx["finalBid"], tx["timestamp"], json.dumps(tx["bidHistory"])))
            conn.commit()
            conn.close()
        except Exception as db_err:
            logger.error(f"Error saving transaction: {db_err}")

        logger.info(f"Room {self.code}: {player['name']} SOLD to {winning_team['name']} for ₹{sold_price} Cr")
        await self.broadcast("PLAYER_SOLD", {
            "player": player,
            "winningTeam": winning_team,
            "finalBid": sold_price,
            "transaction": tx,
            "automatic": automatic
        })
        await self.broadcast_state()

        # Automatic progression after configured transition (default 2.5s)
        transition = float(self.settings.get("transitionSeconds", 2.5))
        await asyncio.sleep(transition)

        if self.settings.get("autoNextPlayer", True):
            await self.load_next_player()

    async def process_unsold(self):
        self.status = "UNSOLD"
        player = self.current_player
        self.unsold_list.append(player)

        logger.info(f"Room {self.code}: {player['name']} UNSOLD at base ₹{player['reservePrice']} Cr")
        await self.broadcast("PLAYER_UNSOLD", {
            "player": player,
            "basePrice": player["reservePrice"]
        })
        await self.broadcast_state()

        # Automatic progression after configured transition (default 2.5s)
        transition = float(self.settings.get("transitionSeconds", 2.5))
        await asyncio.sleep(transition)

        if self.settings.get("autoNextPlayer", True):
            await self.load_next_player()

    async def place_bid(self, user_id: str, client_bid_amount: float = None):
        if self.status not in ("AUCTION_ACTIVE", "BIDDING"):
            return False, "Bidding is currently closed."
        if self.is_paused:
            return False, "Auction is paused by host."
        if not self.current_player:
            return False, "No active player."
        
        # Check user's assigned franchise
        participant = self.participants.get(user_id)
        if not participant or not participant.get("teamId"):
            return False, "You must select a franchise to place bids."
        
        team_id = participant["teamId"]
        team = self.teams.get(team_id)
        if not team:
            return False, "Franchise not found."
        if team_id in self.not_interested_teams:
            return False, "Your franchise marked this player as not interested."
        
        # Prevent self-bidding against own team
        if self.highest_bidder == team_id:
            return False, f"Your franchise ({team['shortName']}) already holds the highest bid!"

        # Determine expected next bid
        expected_bid = get_next_valid_bid(self.current_bid, self.current_player["reservePrice"])
        bid_amount = expected_bid
        if client_bid_amount and round(client_bid_amount, 2) >= expected_bid:
            bid_amount = round(client_bid_amount, 2)

        # Validate team purse
        if team["purse"] < bid_amount:
            return False, f"Insufficient purse! Remaining: ₹{team['purse']} Cr, Required: ₹{bid_amount} Cr"
        
        # Validate squad size (max 25)
        if len(team["squad"]) >= self.settings["maxSquad"]:
            return False, f"Squad full! Reached maximum limit of {self.settings['maxSquad']} players."
        
        # Validate overseas limit (max 8)
        if self.current_player.get("overseas") and team["overseasCount"] >= self.settings["maxOverseas"]:
            return False, f"Overseas limit reached! Maximum {self.settings['maxOverseas']} overseas players allowed."

        # Accept bid
        self.current_bid = bid_amount
        self.highest_bidder = team_id
        self.highest_bidder_name = team["name"]
        self.status = "BIDDING"
        
        self.timer_remaining = 0

        bid_entry = {
            "teamId": team_id,
            "teamName": team["name"],
            "teamShort": team["shortName"],
            "teamLogo": team["logo"],
            "primaryColor": team["primaryColor"],
            "bidderName": participant["name"],
            "amount": bid_amount,
            "timestamp": time.time()
        }
        self.bid_history.append(bid_entry)

        logger.info(f"Room {self.code}: BID placed by {team['name']} for ₹{bid_amount} Cr")
        await self.broadcast("BID_PLACED", {
            "bid": bid_entry,
            "currentBid": self.current_bid,
            "nextValidBid": get_next_valid_bid(self.current_bid, self.current_player["reservePrice"]),
            "timerRemaining": self.timer_remaining
        })
        await self.broadcast_state()
        return True, "Bid placed successfully"

    # Emergency Host Controls
    async def pause_auction(self, user_id: str):
        if user_id != self.host_user_id:
            return False, "Host only action."
        if self.status not in ("AUCTION_ACTIVE", "BIDDING"):
            return False, "Can only pause when bidding is active."
        if self.is_paused:
            return False, "Already paused."
        self.is_paused = True
        self.pause_remaining = self.timer_remaining
        logger.info(f"Room {self.code}: Auction PAUSED by host.")
        await self.broadcast("AUCTION_PAUSED", {"timer": self.timer_remaining})
        await self.broadcast_state()
        return True, "Auction paused"

    async def resume_auction(self, user_id: str):
        if user_id != self.host_user_id:
            return False, "Host only action."
        if not self.is_paused:
            return False, "Not paused."
        self.is_paused = False
        self.timer_remaining = max(1, self.pause_remaining)
        logger.info(f"Room {self.code}: Auction RESUMED by host.")
        await self.broadcast("AUCTION_RESUMED", {"timer": self.timer_remaining})
        await self.broadcast_state()
        return True, "Auction resumed"

    async def skip_player(self, user_id: str):
        if user_id != self.host_user_id:
            return False, "Host only action."
        if not self.current_player:
            return False, "No active player to skip."
        
        logger.info(f"Room {self.code}: Player {self.current_player['name']} SKIPPED by host.")
        if self.timer_task and not self.timer_task.done():
            self.timer_task.cancel()
        
        # Add to unsold/review list
        self.unsold_list.append(self.current_player)
        await self.broadcast("PLAYER_SKIPPED", {"player": self.current_player})
        await self.load_next_player()
        return True, "Player skipped"

    async def undo_last_sale(self, user_id: str):
        if user_id != self.host_user_id:
            return False, "Host only action."
        if not self.last_transaction:
            return False, "No recent sale to undo."

        tx = self.last_transaction
        team = self.teams.get(tx["teamId"])
        if not team:
            return False, "Winning team not found."

        # Find player in team squad
        player_idx = next((i for i, p in enumerate(team["squad"]) if p["id"] == tx["playerId"]), None)
        if player_idx is None:
            return False, "Player not in team squad."

        removed_player = team["squad"].pop(player_idx)
        team["squadSize"] = len(team["squad"])
        if removed_player.get("overseas"):
            team["overseasCount"] = max(0, team["overseasCount"] - 1)
        
        # Refund purse
        team["purse"] = round(team["purse"] + tx["finalBid"], 2)
        
        # Remove from transactions
        self.transactions = [t for t in self.transactions if t["id"] != tx["id"]]
        self.last_transaction = self.transactions[-1] if self.transactions else None

        # Insert player back into the queue right after current index
        insert_pos = max(0, self.queue_index)
        self.queue.insert(insert_pos, removed_player)

        # Delete from DB
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("DELETE FROM transactions WHERE id = ?", (tx["id"],))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error undoing db transaction: {e}")

        logger.info(f"Room {self.code}: UNDO sale of {tx['playerName']} to {team['name']}.")
        await self.broadcast("SALE_UNDONE", {
            "transaction": tx,
            "team": team,
            "player": removed_player
        })
        await self.broadcast_state()
        return True, "Sale successfully undone and purse restored"

    async def start_unsold_round(self, user_id: str):
        if user_id != self.host_user_id:
            return False, "Host only action."
        if not self.unsold_list:
            return False, "No unsold players available."
        
        logger.info(f"Room {self.code}: Starting UNSOLD ROUND with {len(self.unsold_list)} players.")
        self.queue = [dict(p) for p in self.unsold_list]
        self.unsold_list = []
        self.queue_index = -1
        self.in_unsold_round = True
        await self.load_next_player()
        return True, "Unsold round started"

    async def save_playing_xi(self, user_id: str, team_id: str, player_ids: list, impact_player_id: str):
        team = self.teams.get(team_id)
        if not team:
            return False, "Team not found."
        
        # Verify user ownership
        if team["controlledBy"] != user_id and user_id != self.host_user_id:
            return False, "You do not control this franchise."
        
        # Validate 11 players
        if len(player_ids) != 11:
            return False, "Playing XI must have exactly 11 players."
        
        # Check distinct
        all_ids = set(player_ids)
        if len(all_ids) != 11:
            return False, "Duplicate players in Playing XI."
        
        if impact_player_id and impact_player_id in all_ids:
            return False, "Impact Player cannot be inside the initial Playing XI."
        
        # Verify all belong to team squad
        squad_lookup = {p["id"]: p for p in team["squad"]}
        for pid in player_ids:
            if pid not in squad_lookup:
                return False, f"Player {pid} does not belong to your squad."
        
        if impact_player_id and impact_player_id not in squad_lookup:
            return False, "Impact Player does not belong to your squad."
        
        # Check overseas limit in Playing XI (max 4)
        overseas_in_xi = sum(1 for pid in player_ids if squad_lookup[pid].get("overseas"))
        if overseas_in_xi > self.settings["maxOverseasInXI"]:
            return False, f"Maximum {self.settings['maxOverseasInXI']} overseas players allowed in Playing XI (Selected: {overseas_in_xi})."
        
        self.playing_xis[team_id] = {
            "playerIds": player_ids,
            "impactPlayerId": impact_player_id,
            "updatedAt": time.time()
        }

        # Persist to SQLite
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("""
            INSERT OR REPLACE INTO playing_xis (room_code, team_id, player_ids_json, impact_player_id, created_at)
            VALUES (?, ?, ?, ?, ?)
            """, (self.code, team_id, json.dumps(player_ids), impact_player_id, time.time()))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error saving Playing XI: {e}")

        await self.broadcast("PLAYING_XI_UPDATED", {
            "teamId": team_id,
            "playingXI": self.playing_xis[team_id]
        })
        await self.broadcast_state()
        return True, "Playing XI saved successfully"


# Global Room Directory
ROOMS = {}

def generate_room_code():
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(50):
        code = "IPL" + "".join(random.choices(chars, k=4))
        if code not in ROOMS:
            return code
    return "IPL" + "".join(random.choices(chars, k=5))

# WebSocket Protocol Handler
async def handle_websocket(websocket):
    current_room = None
    user_id = None
    
    try:
        async for message in websocket:
            try:
                msg = json.loads(message)
            except Exception:
                continue

            msg_type = msg.get("type")
            data = msg.get("data", {})

            if msg_type == "LEAVE_ROOM":
                if not current_room or not user_id:
                    continue

                room = current_room
                leaving_user_id = user_id
                leaving_participant = room.participants.pop(leaving_user_id, None)
                room.clients.discard(websocket)
                room.release_franchise(leaving_user_id)

                if leaving_user_id == room.host_user_id and room.participants:
                    # Keep the room manageable after its host exits.
                    new_host_id = min(
                        room.participants,
                        key=lambda participant_id: room.participants[participant_id].get("joinedAt", 0)
                    )
                    room.host_user_id = new_host_id
                    for participant_id, participant in room.participants.items():
                        participant["isHost"] = participant_id == new_host_id
                    try:
                        conn = sqlite3.connect(DB_PATH)
                        conn.execute("UPDATE rooms SET host_user_id = ? WHERE code = ?", (new_host_id, room.code))
                        conn.commit()
                        conn.close()
                    except Exception as db_err:
                        logger.error(f"Error updating room host: {db_err}")

                await websocket.send(json.dumps({
                    "type": "ROOM_LEFT",
                    "data": {"roomCode": room.code}
                }))

                if room.participants:
                    await room.broadcast("PARTICIPANT_LEFT", {
                        "userId": leaving_user_id,
                        "name": leaving_participant.get("name", "Participant") if leaving_participant else "Participant",
                        "newHostUserId": room.host_user_id
                    })
                    await room.broadcast_state()
                else:
                    ROOMS.pop(room.code, None)

                current_room = None
                user_id = None
                websocket.user_id = None

            if msg_type == "CREATE_ROOM":
                host_name = data.get("hostName", "Auctioneer").strip() or "Auctioneer"
                room_name = data.get("auctionName", "IPL Mega Auction").strip() or "IPL Mega Auction"
                host_user_id = data.get("userId") or f"usr_{int(time.time()*1000)}"
                settings = data.get("settings", {})
                
                code = generate_room_code()
                room = AuctionRoom(code, room_name, host_user_id, host_name, settings)
                ROOMS[code] = room
                
                current_room = room
                user_id = host_user_id
                websocket.user_id = user_id
                room.clients.add(websocket)
                
                room.participants[user_id] = {
                    "id": user_id,
                    "name": host_name,
                    "teamId": None,
                    "isHost": True,
                    "joinedAt": time.time()
                }

                # Save room to DB
                try:
                    conn = sqlite3.connect(DB_PATH)
                    cur = conn.cursor()
                    cur.execute("""
                    INSERT INTO rooms (code, name, host_user_id, status, settings_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, (code, room_name, host_user_id, room.status, json.dumps(room.settings), room.created_at))
                    conn.commit()
                    conn.close()
                except Exception as e:
                    logger.error(f"Error saving room: {e}")

                await websocket.send(json.dumps({
                    "type": "ROOM_CREATED",
                    "data": {
                        "roomCode": code,
                        "userId": user_id,
                        "isHost": True,
                        "state": room.get_public_state(for_user_id=user_id)
                    }
                }))

            elif msg_type == "JOIN_ROOM":
                code = data.get("roomCode", "").strip().upper()
                name = data.get("name", "Participant").strip() or "Participant"
                req_user_id = data.get("userId") or f"usr_{int(time.time()*1000)}"
                
                room = ROOMS.get(code)
                if not room:
                    await websocket.send(json.dumps({
                        "type": "ERROR",
                        "data": {"message": f"Room code '{code}' not found."}
                    }))
                    continue
                
                current_room = room
                user_id = req_user_id
                websocket.user_id = user_id
                room.clients.add(websocket)

                # Reconnection or new participant
                if user_id in room.participants:
                    room.participants[user_id]["name"] = name
                else:
                    is_host = (user_id == room.host_user_id)
                    room.participants[user_id] = {
                        "id": user_id,
                        "name": name,
                        "teamId": None,
                        "isHost": is_host,
                        "joinedAt": time.time()
                    }

                # Check if this user was already controlling a franchise
                for tid, t in room.teams.items():
                    if t["controlledBy"] == user_id:
                        room.participants[user_id]["teamId"] = tid
                        t["controllerName"] = name
                        break

                await websocket.send(json.dumps({
                    "type": "ROOM_JOINED",
                    "data": {
                        "roomCode": code,
                        "userId": user_id,
                        "isHost": (user_id == room.host_user_id),
                        "state": room.get_public_state(for_user_id=user_id)
                    }
                }))
                await room.broadcast_state()

            elif msg_type == "SELECT_FRANCHISE":
                if not current_room or not user_id:
                    continue
                team_id = data.get("teamId")
                ok, msg_text = current_room.select_franchise(user_id, team_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))
                else:
                    await current_room.broadcast("FRANCHISE_SELECTED", {
                        "userId": user_id,
                        "teamId": team_id,
                        "team": current_room.teams[team_id]
                    })
                    await current_room.broadcast_state()

            elif msg_type == "START_AUCTION":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.start_auction(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "PLACE_BID":
                if not current_room or not user_id:
                    continue
                custom_amt = data.get("amount")
                ok, msg_text = await current_room.place_bid(user_id, custom_amt)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "PASS_ON_PLAYER":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.pass_on_player(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "PAUSE_AUCTION":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.pause_auction(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "RESUME_AUCTION":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.resume_auction(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "SKIP_PLAYER":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.skip_player(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "UNDO_LAST_SALE":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.undo_last_sale(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type in ("CLOSE_PLAYER_SOLD", "CLOSE_PLAYER_UNSOLD"):
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.close_player(user_id, msg_type == "CLOSE_PLAYER_SOLD")
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "START_UNSOLD_ROUND":
                if not current_room or not user_id:
                    continue
                ok, msg_text = await current_room.start_unsold_round(user_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))

            elif msg_type == "SAVE_PLAYING_XI":
                if not current_room or not user_id:
                    continue
                team_id = data.get("teamId")
                player_ids = data.get("playerIds", [])
                impact_id = data.get("impactPlayerId")
                ok, msg_text = await current_room.save_playing_xi(user_id, team_id, player_ids, impact_id)
                if not ok:
                    await websocket.send(json.dumps({"type": "ACTION_ERROR", "data": {"message": msg_text}}))
                else:
                    await websocket.send(json.dumps({"type": "ACTION_SUCCESS", "data": {"message": msg_text}}))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if current_room:
            current_room.clients.discard(websocket)
            # Do not immediately delete participant on momentary refresh to allow smooth reconnection!


from websockets.http11 import Response
from websockets.datastructures import Headers

async def process_http(conn, request):
    upgrade = request.headers.get("Upgrade", "")
    if upgrade.lower() == "websocket":
        return None  # Upgrade to WebSocket!

    raw_path = request.path
    path = raw_path.split("?")[0]

    if path == "/api/health":
        body = json.dumps({"status": "ok", "activeRooms": len(ROOMS)}).encode("utf-8")
        headers = Headers([
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
            ("Access-Control-Allow-Origin", "*"),
        ])
        return Response(200, "OK", headers, body)

    if path == "/api/data/teams":
        body = json.dumps(SEEDED_TEAMS).encode("utf-8")
        headers = Headers([
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
            ("Access-Control-Allow-Origin", "*"),
        ])
        return Response(200, "OK", headers, body)

    if path == "/api/data/players":
        body = json.dumps(SEEDED_PLAYERS).encode("utf-8")
        headers = Headers([
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
            ("Access-Control-Allow-Origin", "*"),
        ])
        return Response(200, "OK", headers, body)

    if path == "/" or path == "":
        rel_path = "index.html"
    else:
        rel_path = path.lstrip("/")

    safe_path = os.path.normpath(os.path.join(PUBLIC_DIR, rel_path))
    is_asset = any(path.startswith(prefix) for prefix in ("/assets/", "/css/", "/js/")) or "." in os.path.basename(path)

    if not safe_path.startswith(PUBLIC_DIR) or not os.path.exists(safe_path) or os.path.isdir(safe_path):
        if is_asset:
            return Response(404, "Not Found", Headers([("Content-Type", "text/plain")]), b"Asset Not Found")
        safe_path = os.path.join(PUBLIC_DIR, "index.html")

    mime_type, _ = mimetypes.guess_type(safe_path)
    if not mime_type:
        mime_type = "application/octet-stream"

    try:
        with open(safe_path, "rb") as f:
            content = f.read()
        headers = Headers([
            ("Content-Type", mime_type),
            ("Content-Length", str(len(content))),
            ("Cache-Control", "public, max-age=86400"),
            ("Access-Control-Allow-Origin", "*"),
        ])
        return Response(200, "OK", headers, content)
    except Exception as e:
        return Response(500, "Internal Server Error", Headers([("Content-Type", "text/plain")]), str(e).encode())


async def main():
    PORT = int(os.environ.get("PORT", 5000))
    WS_PORT = int(os.environ.get("WS_PORT", 5001))

    logger.info("=" * 60)
    logger.info("🏏 IPL AUCTION - REAL-TIME MULTIPLAYER SERVER 🏏")
    logger.info("=" * 60)
    logger.info(f"Loaded {len(SEEDED_TEAMS)} Real IPL Franchises (CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH)")
    logger.info(f"Loaded {len(SEEDED_PLAYERS)} players across the 2026 squads and auction pool")
    logger.info(f"Purse per franchise: ₹120.00 Cr | Zero Retentions | Authoritative Engine")

    # Start Unified Server on PORT (handles both HTTP static app and WebSocket on same port!)
    unified_server = await websockets.serve(
        handle_websocket,
        "0.0.0.0",
        PORT,
        process_request=process_http
    )
    logger.info(f"🌐 Unified Server (Web App + WebSocket) running on port {PORT}")
    logger.info(f"📱 Local / LAN URL: http://localhost:{PORT}")

    servers = [unified_server.wait_closed()]

    # Also support secondary port 5001 if different for backwards compatibility
    if WS_PORT != PORT:
        try:
            legacy_ws = await websockets.serve(handle_websocket, "0.0.0.0", WS_PORT)
            logger.info(f"⚡ Secondary WebSocket port running at: ws://localhost:{WS_PORT}")
            servers.append(legacy_ws.wait_closed())
        except Exception as e:
            logger.warning(f"Could not bind secondary port {WS_PORT}: {e}")

    logger.info("=" * 60)

    try:
        await asyncio.gather(*servers)
    except (asyncio.CancelledError, KeyboardInterrupt):
        logger.info("Server shutting down...")
    finally:
        unified_server.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
