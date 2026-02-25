#!/usr/bin/env python3
"""Fix navigation across all Vutler user-facing pages"""
import re, sys

BASE = "/home/ubuntu/vutler/app/custom/frontend"

NAV_HTML = """<nav class="sidebar-nav">
            <a href="/home" class="nav-item{home}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                Home
            </a>
            <a href="/channel/general" class="nav-item{chat}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Chat
            </a>
            <a href="/knowledge" class="nav-item{knowledge}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                Knowledge
            </a>
            <a href="/memory" class="nav-item{memory}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                Memory
            </a>
            <a href="/admin" class="nav-item{admin}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9"/></svg>
                Settings
            </a>
        </nav>"""

pages = {
    "home.html": "home",
    "knowledge.html": "knowledge",
}

for fname, active_page in pages.items():
    path = f"{BASE}/{fname}"
    with open(path) as f:
        html = f.read()
    
    nav_start = html.find('<nav class="sidebar-nav">')
    nav_end = html.find('</nav>', nav_start) + 6
    
    if nav_start < 0:
        print(f"SKIP {fname}: no nav found")
        continue
    
    nav = NAV_HTML
    for page in ["home", "chat", "knowledge", "memory", "admin"]:
        nav = nav.replace("{" + page + "}", " active" if page == active_page else "")
    
    html = html[:nav_start] + nav + html[nav_end:]
    
    with open(path, "w") as f:
        f.write(html)
    print(f"Fixed {fname}")
