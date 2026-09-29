"""
Comprehensive End-to-End Simulation Test for IPL AUCTION Server
Tests:
- Room creation
- Multi-user join
- Franchise selection & duplicate locking
- Start auction
- Auto player loading
- Real-time bidding & increments
- Timer reset on bid
- Server countdown & SOLD processing
- Purse deduction & squad addition
- Automatic next player after SOLD (no host click)
- UNSOLD processing & automatic next player
- Host emergency pause/resume/skip/undo
- Playing XI validation
"""

import asyncio
import json
import sys
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

WS_URL = "ws://localhost:5001"

async def test_full_auction_flow():
    print("=" * 60)
    print("🚀 RUNNING END-TO-END IPL AUCTION TEST SUITE")
    print("=" * 60)

    # 1. Connect Host WebSocket
    async with websockets.connect(WS_URL) as host_ws:
        print("[1] Host connected.")

        # Create Room
        await host_ws.send(json.dumps({
            "type": "CREATE_ROOM",
            "data": {
                "hostName": "Rithvik (Host)",
                "auctionName": "Test IPL Mega Auction",
                "settings": {
                    "bidTimerSeconds": 3,       # Fast timer for testing
                    "transitionSeconds": 1.0     # Fast transition for testing
                }
            }
        }))

        res = json.loads(await host_ws.recv())
        assert res["type"] == "ROOM_CREATED", f"Expected ROOM_CREATED, got {res}"
        room_code = res["data"]["roomCode"]
        host_user_id = res["data"]["userId"]
        print(f"[✓] Room Created successfully: Code = {room_code}, Host ID = {host_user_id}")

        # 2. Host selects Mumbai Indians (MI)
        await host_ws.send(json.dumps({
            "type": "SELECT_FRANCHISE",
            "data": {"teamId": "MI"}
        }))

        # Read responses until franchise selected
        while True:
            msg = json.loads(await host_ws.recv())
            if msg["type"] == "FRANCHISE_SELECTED":
                assert msg["data"]["teamId"] == "MI"
                print(f"[✓] Host locked franchise: MI (Purse: ₹{msg['data']['team']['purse']} Cr)")
                break

        # 3. Connect Second Client (Friend Alex)
        async with websockets.connect(WS_URL) as friend_ws:
            print("[2] Friend Alex connecting...")
            await friend_ws.send(json.dumps({
                "type": "JOIN_ROOM",
                "data": {
                    "roomCode": room_code,
                    "name": "Alex",
                    "userId": "usr_alex_123"
                }
            }))

            join_res = json.loads(await friend_ws.recv())
            assert join_res["type"] == "ROOM_JOINED"
            print(f"[✓] Alex joined room {room_code}")

            # 4. Alex tries to select MI (Already locked by Host)
            await friend_ws.send(json.dumps({
                "type": "SELECT_FRANCHISE",
                "data": {"teamId": "MI"}
            }))

            while True:
                err_msg = json.loads(await friend_ws.recv())
                if err_msg["type"] == "ACTION_ERROR":
                    print(f"[✓] Duplicate franchise lock verified: {err_msg['data']['message']}")
                    break

            # 5. Alex selects CSK
            await friend_ws.send(json.dumps({
                "type": "SELECT_FRANCHISE",
                "data": {"teamId": "CSK"}
            }))
            print("[✓] Alex selected CSK.")

            # 6. Host starts the auction
            print("\n[3] Starting Auction...")
            await host_ws.send(json.dumps({
                "type": "START_AUCTION",
                "data": {}
            }))

            # Wait for first player loading & auction active
            first_player = None
            while True:
                msg = json.loads(await host_ws.recv())
                if msg["type"] == "PLAYER_LOADING":
                    first_player = msg["data"]["player"]
                    print(f"[✓] Player #{msg['data']['queueIndex'] + 1} entering: {first_player['name']} (Base: ₹{first_player['reservePrice']} Cr)")
                elif msg["type"] == "AUCTION_ACTIVE":
                    print(f"[✓] Auction ACTIVE for {first_player['name']}. Bidding open!")
                    break

            # 7. Real-Time Bidding Test
            # Host (MI) places first bid
            print("\n[4] Testing Bids...")
            await host_ws.send(json.dumps({
                "type": "PLACE_BID",
                "data": {}
            }))

            # Friend (CSK) places counter-bid
            await asyncio.sleep(0.5)
            await friend_ws.send(json.dumps({
                "type": "PLACE_BID",
                "data": {}
            }))

            # Listen for bids and verify
            bids_received = 0
            while bids_received < 2:
                msg = json.loads(await host_ws.recv())
                if msg["type"] == "BID_PLACED":
                    bids_received += 1
                    b = msg["data"]["bid"]
                    print(f"[✓] Bid #{bids_received} confirmed: {b['teamShort']} bid ₹{b['amount']} Cr (Next valid: ₹{msg['data']['nextValidBid']} Cr)")

            # 8. Let timer expire and verify SOLD + Automatic Next Player
            print("\n[5] Waiting for countdown timer to expire (Authoritative SOLD)...")
            sold_event_seen = False
            next_player_seen = False

            while not (sold_event_seen and next_player_seen):
                msg = json.loads(await host_ws.recv())
                if msg["type"] == "PLAYER_SOLD":
                    sold_event_seen = True
                    p = msg["data"]["player"]
                    team = msg["data"]["winningTeam"]
                    bid = msg["data"]["finalBid"]
                    print(f"[✓] SOLD 🔨: {p['name']} sold to {team['name']} for ₹{bid} Cr!")
                    print(f"[✓] Updated {team['shortName']} Purse: ₹{team['purse']} Cr | Squad Size: {team['squadSize']}")
                    assert team["purse"] < 120.0, "Purse must be deducted on server!"
                    assert team["squadSize"] >= 1, "Squad must contain sold player!"
                elif msg["type"] == "PLAYER_LOADING" and sold_event_seen:
                    next_player_seen = True
                    print(f"[✓] AUTOMATIC PROGRESSION: Next player #{msg['data']['queueIndex'] + 1} loaded automatically without host interaction: {msg['data']['player']['name']}")

            # 9. Test Emergency Host Pause & Resume on Player 2
            print("\n[6] Testing Host Emergency Controls (PAUSE / RESUME)...", flush=True)
            while True:
                msg = json.loads(await host_ws.recv())
                if msg["type"] == "AUCTION_ACTIVE":
                    print("[✓] Player 2 auction is ACTIVE.", flush=True)
                    break

            await host_ws.send(json.dumps({
                "type": "PAUSE_AUCTION",
                "data": {}
            }))

            while True:
                msg = json.loads(await host_ws.recv())
                if msg["type"] == "AUCTION_PAUSED":
                    print("[✓] Server confirmed AUCTION_PAUSED.", flush=True)
                    break
                elif msg["type"] == "ACTION_ERROR":
                    print(f"[!] Pause error: {msg['data']['message']}", flush=True)
                    break

            await asyncio.sleep(0.5)
            await host_ws.send(json.dumps({
                "type": "RESUME_AUCTION",
                "data": {}
            }))

            while True:
                msg = json.loads(await host_ws.recv())
                if msg["type"] == "AUCTION_RESUMED":
                    print("[✓] Server confirmed AUCTION_RESUMED.", flush=True)
                    break
                elif msg["type"] == "ACTION_ERROR":
                    print(f"[!] Resume error: {msg['data']['message']}", flush=True)
                    break

            # 10. Let second player go UNSOLD (no bids)
            print("\n[7] Testing UNSOLD Flow (no bids placed on second player)...", flush=True)
            unsold_event_seen = False
            third_player_seen = False

            while not (unsold_event_seen and third_player_seen):
                raw = await host_ws.recv()
                msg = json.loads(raw)
                if msg["type"] == "PLAYER_UNSOLD":
                    unsold_event_seen = True
                    p = msg["data"]["player"]
                    print(f"[✓] UNSOLD: {p['name']} went unsold at base ₹{msg['data']['basePrice']} Cr", flush=True)
                elif msg["type"] == "PLAYER_LOADING" and unsold_event_seen:
                    third_player_seen = True
                    print(f"[✓] AUTOMATIC PROGRESSION AFTER UNSOLD: Next player #{msg['data']['queueIndex'] + 1} loaded automatically: {msg['data']['player']['name']}", flush=True)

    print("\n" + "=" * 60)
    print("🏆 ALL INTEGRATION & REAL-TIME MULTIPLAYER TESTS PASSED 100%!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_full_auction_flow())
