"""
Generate crisp local SVG avatar cards for every player in data/players.json.
Guaranteed 0ms load, offline capable, zero external dependencies.
"""
import json
import os

BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "data", "players.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "public", "assets", "players")
os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(DATA_PATH, "r", encoding="utf-8") as f:
    players = json.load(f)

ROLE_CONFIGS = {
    "Batter": {"bg1": "#1e3a8a", "bg2": "#0f172a", "accent": "#38bdf8", "icon": "🏏"},
    "Wicketkeeper Batter": {"bg1": "#7c2d12", "bg2": "#1c1917", "accent": "#fb923c", "icon": "🧤"},
    "All-rounder": {"bg1": "#701a75", "bg2": "#1e1b4b", "accent": "#e879f9", "icon": "⚡"},
    "Bowler": {"bg1": "#064e3b", "bg2": "#022c22", "accent": "#34d399", "icon": "🎯"}
}

def get_initials(name):
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[-1][0]}".upper()
    return name[:2].upper()

for p in players:
    role = p.get("role", "Batter")
    cfg = ROLE_CONFIGS.get(role, ROLE_CONFIGS["Batter"])
    initials = get_initials(p["name"])
    flag = "✈️" if p.get("overseas") else "🇮🇳"

    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280" width="240" height="280">
  <defs>
    <linearGradient id="bg_{p['id']}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{cfg['bg1']}"/>
      <stop offset="100%" stop-color="{cfg['bg2']}"/>
    </linearGradient>
    <radialGradient id="halo_{p['id']}" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="{cfg['accent']}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="{cfg['accent']}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background Card -->
  <rect width="240" height="280" rx="16" fill="url(#bg_{p['id']})" stroke="{cfg['accent']}" stroke-width="2" stroke-opacity="0.4"/>
  <circle cx="120" cy="110" r="85" fill="url(#halo_{p['id']})"/>

  <!-- Stylized Sports Player Silhouette Profile -->
  <circle cx="120" cy="90" r="42" fill="#FFFFFF" fill-opacity="0.12" stroke="{cfg['accent']}" stroke-width="2"/>
  <text x="120" y="102" font-family="'Outfit', sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
    {initials}
  </text>

  <!-- Role Icon Badge -->
  <circle cx="158" cy="120" r="16" fill="{cfg['bg1']}" stroke="{cfg['accent']}" stroke-width="2"/>
  <text x="158" y="125" font-size="14" text-anchor="middle" dominant-baseline="central">{cfg['icon']}</text>

  <!-- Player Name Banner -->
  <rect x="16" y="196" width="208" height="42" rx="8" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.1)"/>
  <text x="120" y="216" font-family="'Outfit', sans-serif" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle">
    {p['name']}
  </text>
  <text x="120" y="231" font-family="'Outfit', sans-serif" font-size="11" font-weight="600" fill="{cfg['accent']}" text-anchor="middle">
    {flag} {p.get('country', '').upper()} • {role.upper()}
  </text>

  <!-- Base Price Footer -->
  <text x="120" y="260" font-family="'Space Grotesk', monospace" font-size="13" font-weight="700" fill="#F59E0B" text-anchor="middle">
    BASE: ₹{p.get('reservePrice', 2.0)} Cr
  </text>
</svg>"""

    file_path = os.path.join(OUTPUT_DIR, f"{p['id']}.svg")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

    # Update imageUrl to local guaranteed avatar
    p["imageUrl"] = f"/assets/players/{p['id']}.svg"

with open(DATA_PATH, "w", encoding="utf-8") as f:
    json.dump(players, f, indent=2)

print(f"Generated {len(players)} local high-res player avatar SVGs in {OUTPUT_DIR}")
