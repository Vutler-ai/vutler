"""Generate HTML email signatures for all Starbox Group team members."""

import os

TEMPLATE = open("signature-template.html").read()

TEAM = [
    {"name": "Alex Lopez", "role": "CEO & Founder", "email": "alex@starbox-group.com", "emoji": "🚀"},
    {"name": "Jarvis", "role": "Chief Coordinator & Strategy", "email": "jarvis@starbox-group.com", "emoji": "⚡"},
    {"name": "Andrea", "role": "Office Manager & Compliance", "email": "andrea@starbox-group.com", "emoji": "📋"},
    {"name": "Mike", "role": "Lead Engineer", "email": "mike@starbox-group.com", "emoji": "⚙️"},
    {"name": "Philip", "role": "UI/UX Designer", "email": "philip@starbox-group.com", "emoji": "🎨"},
    {"name": "Luna", "role": "Product Manager", "email": "luna@starbox-group.com", "emoji": "🧪"},
    {"name": "Max", "role": "Marketing & Growth", "email": "max@starbox-group.com", "emoji": "📈"},
    {"name": "Victor", "role": "Commercial & Sales", "email": "victor@starbox-group.com", "emoji": "💰"},
    {"name": "Oscar", "role": "Content & Copywriting", "email": "oscar@starbox-group.com", "emoji": "📝"},
    {"name": "Nora", "role": "Community Manager", "email": "nora@starbox-group.com", "emoji": "🎮"},
    {"name": "Stephen", "role": "Research", "email": "stephen@starbox-group.com", "emoji": "📖"},
]

os.makedirs("generated", exist_ok=True)

for member in TEAM:
    sig = TEMPLATE
    sig = sig.replace("{{NAME}}", member["name"])
    sig = sig.replace("{{ROLE}}", member["role"])
    sig = sig.replace("{{EMAIL}}", member["email"])
    sig = sig.replace("{{EMOJI}}", member["emoji"])
    
    filename = member["email"].split("@")[0]
    with open(f"generated/{filename}.html", "w") as f:
        f.write(sig)
    print(f"✅ {filename}.html")

# Generate JSON config for Postal API integration
import json
signatures = {}
for member in TEAM:
    username = member["email"].split("@")[0]
    sig = TEMPLATE
    sig = sig.replace("{{NAME}}", member["name"])
    sig = sig.replace("{{ROLE}}", member["role"])
    sig = sig.replace("{{EMAIL}}", member["email"])
    sig = sig.replace("{{EMOJI}}", member["emoji"])
    signatures[member["email"]] = sig

with open("generated/signatures.json", "w") as f:
    json.dump(signatures, f, indent=2)
print("✅ signatures.json")
