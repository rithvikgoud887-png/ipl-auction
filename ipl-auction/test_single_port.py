"""
Test single port serve of HTTP + WebSockets in websockets 17.1
"""
import asyncio
import os
import mimetypes
import websockets
from websockets.http11 import Response
from websockets.datastructures import Headers

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

async def process_http(conn, request):
    # Check if WebSocket upgrade
    upgrade = request.headers.get("Upgrade", "")
    if upgrade.lower() == "websocket":
        return None  # Proceed with WebSocket handshake!

    path = request.path.split("?")[0]
    if path == "/" or path == "":
        rel_path = "index.html"
    else:
        rel_path = path.lstrip("/")

    safe_path = os.path.normpath(os.path.join(PUBLIC_DIR, rel_path))
    if not safe_path.startswith(PUBLIC_DIR) or not os.path.exists(safe_path) or os.path.isdir(safe_path):
        if any(path.startswith(p) for p in ("/assets/", "/css/", "/js/")):
            return Response(404, "Not Found", Headers([("Content-Type", "text/plain")]), b"Not Found")
        safe_path = os.path.join(PUBLIC_DIR, "index.html")

    mime, _ = mimetypes.guess_type(safe_path)
    if not mime:
        mime = "application/octet-stream"

    try:
        with open(safe_path, "rb") as f:
            content = f.read()
        headers = Headers([
            ("Content-Type", mime),
            ("Content-Length", str(len(content))),
            ("Cache-Control", "public, max-age=86400"),
            ("Access-Control-Allow-Origin", "*"),
        ])
        return Response(200, "OK", headers, content)
    except Exception as e:
        return Response(500, "Internal Error", Headers([("Content-Type", "text/plain")]), str(e).encode())

async def ws_handler(ws):
    await ws.send("CONNECTED_SINGLE_PORT")
    async for msg in ws:
        await ws.send(f"ECHO: {msg}")

async def main():
    server = await websockets.serve(ws_handler, "127.0.0.1", 9999, process_request=process_http)
    print("Unified Server listening on http://127.0.0.1:9999 and ws://127.0.0.1:9999")
    await asyncio.Event().wait()

if __name__ == "__main__":
    asyncio.run(main())
