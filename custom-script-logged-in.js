// Vutler Responsive Header + SPA Panels
(function(){
  if(document.getElementById("vutler-topnav")) return;

  var style = document.createElement("style");
  style.textContent = `
    #vutler-topnav {
      background: #0d1117;
      border-bottom: 1px solid rgba(255,255,255,.06);
      padding: 0 24px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 13px;
      display: flex;
      gap: 16px;
      align-items: center;
      z-index: 9999;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 48px;
      box-sizing: border-box;
    }
    #vutler-topnav .vutler-brand {
      color: #58a6ff;
      font-weight: 700;
      font-size: 16px;
      text-decoration: none;
      margin-right: 8px;
      white-space: nowrap;
    }
    #vutler-topnav .vutler-sep { color: rgba(255,255,255,.12); }
    #vutler-topnav a.vutler-link {
      color: rgba(255,255,255,.5);
      text-decoration: none;
      font-size: 13px;
      white-space: nowrap;
      padding: 4px 2px;
    }
    #vutler-topnav a.vutler-link.active { color: #3b82f6; font-weight: 600; }
    #vutler-topnav a.vutler-link:hover { color: #c9d1d9; }
    body { padding-top: 48px !important; }

    @media (max-width: 768px) {
      #vutler-topnav { height: 36px; padding: 0 10px; gap: 8px; font-size: 11px; }
      #vutler-topnav .vutler-brand { font-size: 13px; margin-right: 4px; }
      #vutler-topnav a.vutler-link { font-size: 11px; }
      body { padding-top: 36px !important; }
    }
    @media (max-width: 480px) {
      #vutler-topnav { gap: 4px; padding: 0 6px; }
      #vutler-topnav .vutler-brand span.brand-text { display: none; }
    }

    /* SPA Panel Overlay */
    #vutler-panel {
      display: none;
      position: fixed;
      top: 48px;
      left: 0; right: 0; bottom: 0;
      background: #0d1117;
      color: #c9d1d9;
      z-index: 9998;
      overflow-y: auto;
      font-family: Inter, -apple-system, sans-serif;
    }
    #vutler-panel.open { display: block; }
    @media (max-width: 768px) {
      #vutler-panel { top: 36px; }
    }
    .vp-container { max-width: 1000px; margin: 0 auto; padding: 24px; }
    .vp-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .vp-header h1 { font-size: 24px; font-weight: 700; color: #e6edf3; margin: 0; }
    .vp-back {
      background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1);
      color: #c9d1d9; padding: 6px 14px; border-radius: 6px; cursor: pointer;
      font-size: 13px; white-space: nowrap;
    }
    .vp-back:hover { background: rgba(255,255,255,.14); }
    .vp-search {
      width: 100%; padding: 10px 14px; background: #161b22; border: 1px solid #30363d;
      border-radius: 8px; color: #c9d1d9; font-size: 14px; margin-bottom: 16px;
      box-sizing: border-box;
    }
    .vp-search:focus { outline: none; border-color: #58a6ff; }
    .vp-card {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 16px; margin-bottom: 12px; cursor: pointer; transition: border-color .15s;
    }
    .vp-card:hover { border-color: #58a6ff; }
    .vp-card h3 { color: #e6edf3; margin: 0 0 6px; font-size: 15px; }
    .vp-card p { color: #8b949e; margin: 0; font-size: 13px; line-height: 1.5; }
    .vp-badge {
      display: inline-block; padding: 2px 8px; border-radius: 12px;
      font-size: 11px; font-weight: 600; margin-right: 6px;
    }
    .vp-badge-fact { background: #1f6feb33; color: #58a6ff; }
    .vp-badge-decision { background: #f0883e33; color: #f0883e; }
    .vp-badge-learning { background: #3fb95033; color: #3fb950; }
    .vp-select {
      background: #161b22; border: 1px solid #30363d; color: #c9d1d9;
      padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 16px;
    }

    /* Team grid */
    .vp-team-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .vp-team-card {
      background: #161b22; border: 1px solid #30363d; border-radius: 10px;
      padding: 20px; display: flex; flex-direction: column; align-items: center;
      text-align: center; transition: border-color .15s;
    }
    .vp-team-card:hover { border-color: #58a6ff; }
    .vp-team-avatar { font-size: 40px; margin-bottom: 8px; }
    .vp-team-name { color: #e6edf3; font-weight: 700; font-size: 16px; margin-bottom: 2px; }
    .vp-team-role { color: #8b949e; font-size: 13px; margin-bottom: 8px; }
    .vp-team-meta { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 12px; }
    .vp-mbti { background: #1f6feb33; color: #58a6ff; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .vp-type-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .vp-type-agent { background: #3fb95033; color: #3fb950; }
    .vp-type-human { background: #f0883e33; color: #f0883e; }
    .vp-team-actions { display: flex; gap: 8px; margin-top: auto; }
    .vp-team-actions a {
      padding: 6px 14px; border-radius: 6px; font-size: 12px;
      text-decoration: none; font-weight: 600;
    }
    .vp-btn-chat { background: #238636; color: #fff; }
    .vp-btn-chat:hover { background: #2ea043; }
    .vp-btn-email { background: rgba(255,255,255,.08); color: #c9d1d9; border: 1px solid #30363d; }
    .vp-btn-email:hover { background: rgba(255,255,255,.14); }
    .vp-filter-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .vp-filter-btn {
      background: rgba(255,255,255,.06); border: 1px solid #30363d; color: #8b949e;
      padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px;
    }
    .vp-filter-btn.active { background: #1f6feb33; color: #58a6ff; border-color: #58a6ff; }
    .vp-expanded { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-top: 8px; font-size: 13px; line-height: 1.7; color: #c9d1d9; }
  `;
  document.head.appendChild(style);

  // --- Nav bar ---
  var nav = document.createElement("nav");
  nav.id = "vutler-topnav";
  var brand = document.createElement("a");
  brand.href = "/home";
  brand.className = "vutler-brand";
  brand.innerHTML = "⚡ <span class='brand-text'>Vutler</span>";
  nav.appendChild(brand);

  var links = [
    {href: "/channel/general", label: "Chat", match: "/channel"},
    {href: "/knowledge", label: "Knowledge", match: "/knowledge"},
    {href: "/memory", label: "Memory", match: "/memory"},
    {href: "/team", label: "Team", match: "/team"},
    {href: "/admin/", label: "Admin", match: "/admin"}
  ];

  links.forEach(function(l) {
    var sep = document.createElement("span");
    sep.className = "vutler-sep";
    sep.textContent = "/";
    nav.appendChild(sep);
    var a = document.createElement("a");
    a.href = l.href;
    a.textContent = l.label;
    a.className = "vutler-link";
    a.dataset.match = l.match;
    nav.appendChild(a);
  });
  document.body.insertBefore(nav, document.body.firstChild);

  // --- Panel container ---
  var panel = document.createElement("div");
  panel.id = "vutler-panel";
  document.body.appendChild(panel);

  // --- Team data ---
  var teamData = [
    {name:"Jarvis",role:"Coordinator & Strategy",mbti:"INTJ",email:"jarvis@starbox-group.com",emoji:"🤖",type:"agent",user:"jarvis"},
    {name:"Andrea",role:"Office Manager, Legal & Compliance",mbti:"ISTJ",email:"andrea@starbox-group.com",emoji:"📋",type:"agent",user:"andrea"},
    {name:"Mike",role:"Lead Engineer",mbti:"INTP",email:"mike@starbox-group.com",emoji:"⚙️",type:"agent",user:"mike"},
    {name:"Philip",role:"UI/UX Designer",mbti:"ISFP",email:"philip@starbox-group.com",emoji:"🎨",type:"agent",user:"philip"},
    {name:"Luna",role:"Product Manager",mbti:"ENTJ",email:"luna@starbox-group.com",emoji:"🧪",type:"agent",user:"luna"},
    {name:"Max",role:"Marketing & Growth",mbti:"ENTP",email:"max@starbox-group.com",emoji:"📈",type:"agent",user:"max"},
    {name:"Victor",role:"Commercial / Sales",mbti:"ENFJ",email:"victor@starbox-group.com",emoji:"💰",type:"agent",user:"victor"},
    {name:"Oscar",role:"Content & Copywriting",mbti:"ENFP",email:"oscar@starbox-group.com",emoji:"📝",type:"agent",user:"oscar"},
    {name:"Nora",role:"Community Manager",mbti:"ESFJ",email:"nora@starbox-group.com",emoji:"🎮",type:"agent",user:"nora"},
    {name:"Stephen",role:"Spiritual Research",mbti:"INFJ",email:"stephen@starbox-group.com",emoji:"📖",type:"agent",user:"stephen"},
    {name:"Rex",role:"Security Officer",mbti:"ISTJ",email:"rex@starbox-group.com",emoji:"🛡️",type:"agent",user:"rex"},
    {name:"Alex",role:"CEO & Founder",mbti:"",email:"alex@starbox-group.com",emoji:"👤",type:"human",user:"alex"}
  ];

  // --- Mock knowledge data ---
  var knowledgeDocs = [
    {title:"Vutler Platform Architecture",snippet:"Overview of the multi-agent platform built on Rocket.Chat 8.x with MongoDB backend...",content:"The Vutler platform is a multi-agent collaboration system built on top of Rocket.Chat. It features 11 AI agents and human team members working together. The architecture uses RC as the communication layer, with a custom Node.js API server handling agent orchestration, memory, and knowledge management."},
    {title:"Agent Communication Protocol",snippet:"How agents communicate via RC channels and direct messages...",content:"Agents communicate through dedicated RC channels. Each agent has a bot account. The orchestrator (Jarvis) coordinates task assignment. Messages are processed by the Vutler API which routes them to the appropriate agent handler."},
    {title:"Knowledge Base Indexing",snippet:"Document indexing pipeline using Snipara for semantic search...",content:"Documents are indexed via Snipara MCP. The system supports PDF, Markdown, and plain text. Each document is split into sections and embedded for semantic search. Currently 54 files indexed across 708 sections."},
    {title:"Memory System Design",snippet:"How agent memories are stored, retrieved, and used for context...",content:"Agent memories are stored as typed records: facts, decisions, learnings, preferences, and todos. Each memory has a source, timestamp, and embedding for semantic recall. Memories persist across sessions and inform agent behavior."},
    {title:"Deployment Guide",snippet:"Docker Compose setup on VPS with Rocket.Chat, MongoDB, and Vutler API...",content:"The platform runs on a single VPS (83.228.222.180) using Docker Compose. Services: vutler-rocketchat (RC 8.x), vutler-mongo (MongoDB 7), vutler-api (Node.js). SSL terminated by Caddy reverse proxy at app.vutler.ai."},
    {title:"Security & Access Control",snippet:"Authentication, API keys, and permission model...",content:"RC handles user auth. The Vutler API uses API keys (X-API-Key header). Agent accounts have specific roles and permissions. Rex (Security Officer) monitors access patterns and flags anomalies."}
  ];

  // --- Mock memory data ---
  var memoryData = [
    {agent:"jarvis",type:"decision",content:"Adopted Rocket.Chat 8.x as the primary communication platform for all agents.",source:"Architecture Review",date:"2025-12-15"},
    {agent:"jarvis",type:"fact",content:"Team consists of 11 AI agents and 1 human (Alex, CEO).",source:"Team Setup",date:"2025-12-10"},
    {agent:"mike",type:"learning",content:"Custom scripts in RC must be self-contained — no ES modules, no imports.",source:"Development",date:"2026-01-20"},
    {agent:"mike",type:"decision",content:"Use MongoDB direct updates for RC settings to avoid API limitations.",source:"Development",date:"2026-02-01"},
    {agent:"luna",type:"fact",content:"MVP launch target: Q1 2026. Focus on agent collaboration features.",source:"Product Roadmap",date:"2026-01-05"},
    {agent:"luna",type:"decision",content:"Prioritize knowledge base and memory panels for the frontend.",source:"Sprint Planning",date:"2026-02-10"},
    {agent:"rex",type:"learning",content:"API keys should use X-API-Key header, not Authorization Bearer.",source:"Security Audit",date:"2026-01-28"},
    {agent:"andrea",type:"fact",content:"Starbox Group is the legal entity. Domain: starbox-group.com.",source:"Legal Setup",date:"2025-11-01"},
    {agent:"max",type:"learning",content:"Dark theme with #0d1117 background tested well with users.",source:"A/B Testing",date:"2026-02-15"},
    {agent:"oscar",type:"decision",content:"Brand voice: professional but approachable. Tech-savvy audience.",source:"Brand Guidelines",date:"2026-01-12"}
  ];

  // --- Render functions ---
  function renderKnowledge() {
    var h = '<div class="vp-container">';
    h += '<div class="vp-header"><button class="vp-back" onclick="vutlerNav(\'/channel/general\')">← Chat</button><h1>📚 Knowledge Base</h1></div>';
    h += '<input class="vp-search" id="vp-kb-search" placeholder="Search knowledge base..." oninput="vutlerKBSearch(this.value)">';
    h += '<div id="vp-kb-list">';
    knowledgeDocs.forEach(function(d,i) {
      h += '<div class="vp-card" onclick="vutlerKBExpand('+i+')" id="vp-kb-'+i+'">';
      h += '<h3>'+d.title+'</h3><p>'+d.snippet+'</p>';
      h += '<div id="vp-kb-exp-'+i+'" style="display:none"></div></div>';
    });
    h += '</div></div>';
    return h;
  }

  function renderMemory() {
    var agents = ['All'];
    teamData.forEach(function(t){ if(t.type==='agent') agents.push(t.name); });
    var h = '<div class="vp-container">';
    h += '<div class="vp-header"><button class="vp-back" onclick="vutlerNav(\'/channel/general\')">← Chat</button><h1>🧠 Agent Memory</h1></div>';
    h += '<select class="vp-select" id="vp-mem-filter" onchange="vutlerMemFilter(this.value)">';
    agents.forEach(function(a){ h += '<option value="'+a+'">'+a+'</option>'; });
    h += '</select>';
    h += '<div id="vp-mem-list">' + renderMemoryList('All') + '</div></div>';
    return h;
  }

  function renderMemoryList(agent) {
    var h = '';
    memoryData.forEach(function(m) {
      if(agent !== 'All' && m.agent !== agent.toLowerCase()) return;
      var bc = m.type==='fact'?'vp-badge-fact':m.type==='decision'?'vp-badge-decision':'vp-badge-learning';
      h += '<div class="vp-card" style="cursor:default">';
      h += '<span class="vp-badge '+bc+'">'+m.type+'</span>';
      h += '<span class="vp-badge" style="background:rgba(255,255,255,.06);color:#8b949e;">'+m.agent+'</span>';
      h += '<span style="float:right;color:#484f58;font-size:12px;">'+m.date+'</span>';
      h += '<p style="margin-top:10px">'+m.content+'</p>';
      h += '<p style="color:#484f58;font-size:12px;margin-top:6px">Source: '+m.source+'</p>';
      h += '</div>';
    });
    return h || '<p style="color:#484f58;text-align:center;padding:40px;">No memories found.</p>';
  }

  function renderTeam() {
    var h = '<div class="vp-container">';
    h += '<div class="vp-header"><button class="vp-back" onclick="vutlerNav(\'/channel/general\')">← Chat</button><h1>👥 Team Directory</h1></div>';
    h += '<div class="vp-filter-row">';
    ['All','Agents','Humans'].forEach(function(f){
      h += '<button class="vp-filter-btn'+(f==='All'?' active':'')+'" onclick="vutlerTeamFilter(\''+f+'\',this)">'+f+'</button>';
    });
    h += '</div>';
    h += '<div class="vp-team-grid" id="vp-team-grid">' + renderTeamCards('All') + '</div></div>';
    return h;
  }

  function renderTeamCards(filter) {
    var h = '';
    teamData.forEach(function(t) {
      if(filter==='Agents' && t.type!=='agent') return;
      if(filter==='Humans' && t.type!=='human') return;
      h += '<div class="vp-team-card">';
      h += '<div class="vp-team-avatar">'+t.emoji+'</div>';
      h += '<div class="vp-team-name">'+t.name+'</div>';
      h += '<div class="vp-team-role">'+t.role+'</div>';
      h += '<div class="vp-team-meta">';
      h += '<span class="vp-type-badge '+(t.type==='agent'?'vp-type-agent':'vp-type-human')+'">'+(t.type==='agent'?'🤖 Agent':'👤 Human')+'</span>';
      if(t.mbti) h += '<span class="vp-mbti">'+t.mbti+'</span>';
      h += '</div>';
      h += '<div class="vp-team-actions">';
      h += '<a class="vp-btn-chat" href="/direct/'+t.user+'" onclick="event.preventDefault();vutlerNav(\'/direct/'+t.user+'\')">💬 Chat</a>';
      h += '<a class="vp-btn-email" href="mailto:'+t.email+'">✉️ Email</a>';
      h += '</div></div>';
    });
    return h;
  }

  // --- Global helpers ---
  window.vutlerKBExpand = function(i) {
    var el = document.getElementById('vp-kb-exp-'+i);
    if(el.style.display==='none') {
      el.style.display='block';
      el.innerHTML='<div class="vp-expanded">'+knowledgeDocs[i].content+'</div>';
    } else { el.style.display='none'; }
  };
  window.vutlerKBSearch = function(q) {
    q = q.toLowerCase();
    knowledgeDocs.forEach(function(d,i) {
      var el = document.getElementById('vp-kb-'+i);
      el.style.display = (!q || d.title.toLowerCase().includes(q) || d.snippet.toLowerCase().includes(q)) ? 'block' : 'none';
    });
  };
  window.vutlerMemFilter = function(agent) {
    document.getElementById('vp-mem-list').innerHTML = renderMemoryList(agent);
  };
  window.vutlerTeamFilter = function(filter, btn) {
    document.querySelectorAll('.vp-filter-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('vp-team-grid').innerHTML = renderTeamCards(filter);
  };

  // --- Router ---
  var customRoutes = {'/knowledge': renderKnowledge, '/memory': renderMemory, '/team': renderTeam};

  function updateActiveLink() {
    nav.querySelectorAll('.vutler-link').forEach(function(a) {
      a.classList.toggle('active', location.pathname.startsWith(a.dataset.match));
    });
  }

  function showPanel(path) {
    var render = customRoutes[path];
    if(render) {
      panel.innerHTML = render();
      panel.classList.add('open');
      updateActiveLink();
    }
  }

  function hidePanel() {
    panel.classList.remove('open');
    panel.innerHTML = '';
    updateActiveLink();
  }

  window.vutlerNav = function(path) {
    if(customRoutes[path]) {
      history.pushState(null, '', path);
      showPanel(path);
    } else {
      hidePanel();
      // Let RC handle the navigation
      if(path.startsWith('/admin')) {
        window.location.href = path;
      } else {
        history.pushState(null, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  // Intercept nav clicks
  nav.addEventListener('click', function(e) {
    var a = e.target.closest('a.vutler-link');
    if(!a) return;
    e.preventDefault();
    vutlerNav(a.getAttribute('href'));
  });

  // Brand click
  brand.addEventListener('click', function(e) {
    e.preventDefault();
    vutlerNav('/channel/general');
  });

  // Handle popstate (browser back/forward)
  window.addEventListener('popstate', function() {
    var path = location.pathname;
    if(customRoutes[path]) { showPanel(path); }
    else { hidePanel(); }
  });

  // Handle initial load on custom route
  if(customRoutes[location.pathname]) {
    showPanel(location.pathname);
  }
})();
