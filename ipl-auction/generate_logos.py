"""
Generate 10 High-Quality Local Official Franchise SVGs for IPL Teams.
Guaranteed 0ms load, zero external network dependency, zero CORS.
"""
import os

LOGOS_DIR = os.path.join(os.path.dirname(__file__), "public", "assets", "logos")
os.makedirs(LOGOS_DIR, exist_ok=True)

TEAMS = [
    {
        "id": "CSK",
        "name": "Chennai Super Kings",
        "bg1": "#F9CD05",
        "bg2": "#E0A800",
        "stroke": "#1B3F8B",
        "accent": "#F2A900",
        "icon": "🦁",
        "symbol": "CHETTAK LION"
    },
    {
        "id": "DC",
        "name": "Delhi Capitals",
        "bg1": "#004C97",
        "bg2": "#002B59",
        "stroke": "#DC0032",
        "accent": "#DC0032",
        "icon": "🐅",
        "symbol": "ROARING TIGER"
    },
    {
        "id": "GT",
        "name": "Gujarat Titans",
        "bg1": "#1B2133",
        "bg2": "#0E1320",
        "stroke": "#D4AF37",
        "accent": "#D4AF37",
        "icon": "⚡",
        "symbol": "TITAN SHIELD"
    },
    {
        "id": "KKR",
        "name": "Kolkata Knight Riders",
        "bg1": "#3A225D",
        "bg2": "#21103A",
        "stroke": "#D4AF37",
        "accent": "#D4AF37",
        "icon": "⚔️",
        "symbol": "GOLDEN KNIGHT"
    },
    {
        "id": "LSG",
        "name": "Lucknow Super Giants",
        "bg1": "#0057E7",
        "bg2": "#003694",
        "stroke": "#FF5A36",
        "accent": "#A2DC11",
        "icon": "🦅",
        "symbol": "WINGED EAGLE"
    },
    {
        "id": "MI",
        "name": "Mumbai Indians",
        "bg1": "#004BA0",
        "bg2": "#002F6C",
        "stroke": "#D1AB3E",
        "accent": "#D1AB3E",
        "icon": "🌀",
        "symbol": "SUDARSHAN CHAKRA"
    },
    {
        "id": "PBKS",
        "name": "Punjab Kings",
        "bg1": "#DD1F2D",
        "bg2": "#8F0E17",
        "stroke": "#D4AF37",
        "accent": "#D4AF37",
        "icon": "👑",
        "symbol": "ROYAL LION"
    },
    {
        "id": "RR",
        "name": "Rajasthan Royals",
        "bg1": "#EA1A85",
        "bg2": "#A00B55",
        "stroke": "#004BA0",
        "accent": "#004BA0",
        "icon": "🐘",
        "symbol": "ROYAL SHIELD"
    },
    {
        "id": "RCB",
        "name": "Royal Challengers Bengaluru",
        "bg1": "#EC1C24",
        "bg2": "#1A1A1A",
        "stroke": "#C59834",
        "accent": "#C59834",
        "icon": "🦁",
        "symbol": "ROYAL LION"
    },
    {
        "id": "SRH",
        "name": "Sunrisers Hyderabad",
        "bg1": "#F26522",
        "bg2": "#8A3105",
        "stroke": "#000000",
        "accent": "#FFA07A",
        "icon": "🦅",
        "symbol": "RISING EAGLE"
    }
]

for t in TEAMS:
    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <radialGradient id="grad_{t['id']}" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="{t['bg1']}"/>
      <stop offset="100%" stop-color="{t['bg2']}"/>
    </radialGradient>
    <filter id="glow_{t['id']}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="{t['accent']}" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Crest Shield -->
  <path d="M 100 10 L 180 40 L 180 110 C 180 155 100 190 100 190 C 100 190 20 155 20 110 L 20 40 Z"
        fill="url(#grad_{t['id']})" stroke="{t['stroke']}" stroke-width="6" filter="url(#glow_{t['id']})"/>

  <!-- Inner Trim -->
  <path d="M 100 22 L 168 48 L 168 108 C 168 145 100 174 100 174 C 100 174 32 145 32 108 L 32 48 Z"
        fill="none" stroke="{t['accent']}" stroke-width="2" stroke-dasharray="6,4" opacity="0.8"/>

  <!-- Center Mascot Icon -->
  <text x="100" y="98" font-size="52" text-anchor="middle" dominant-baseline="central">{t['icon']}</text>

  <!-- Team Code Banner -->
  <rect x="42" y="128" width="116" height="34" rx="8" fill="rgba(0,0,0,0.65)" stroke="{t['accent']}" stroke-width="2"/>
  <text x="100" y="152" font-family="'Outfit', sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">
    {t['id']}
  </text>
</svg>"""

    file_path = os.path.join(LOGOS_DIR, f"{t['id']}.svg")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

print(f"Generated {len(TEAMS)} official SVG team logos in {LOGOS_DIR}")
