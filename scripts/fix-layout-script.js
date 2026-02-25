// Clean Layout_Custom_Script - remove duplicates, fix redirects
const navCode = `
// Vutler Top Nav
(function(){
  if(document.getElementById("vutler-topnav")) return;
  var nav=document.createElement("nav");
  nav.id="vutler-topnav";
  nav.style.cssText="background:#0d1117;border-bottom:1px solid rgba(255,255,255,.06);padding:10px 24px;font-family:Inter,sans-serif;font-size:13px;display:flex;gap:16px;align-items:center;z-index:9999;position:relative";
  var links=[
    {href:"/home",label:"Home"},
    {href:"/channel/general",label:"Chat",active:location.pathname.startsWith("/channel")},
    {href:"/knowledge",label:"Knowledge"},
    {href:"/memory",label:"Memory"},
    {href:"/admin/",label:"Settings"}
  ];
  links.forEach(function(l,i){
    if(i>0){var s=document.createElement("span");s.textContent="/";s.style.color="rgba(255,255,255,.12)";nav.appendChild(s);}
    var a=document.createElement("a");
    a.href=l.href;a.textContent=l.label;
    a.style.cssText=l.active?"color:#3b82f6;font-weight:600;text-decoration:none":"color:rgba(255,255,255,.5);text-decoration:none";
    nav.appendChild(a);
  });
  document.body.insertBefore(nav,document.body.firstChild);
})();
`;

const authCode = `
// Auth guard
(function() {
  var path = window.location.pathname;
  var token = localStorage.getItem("Meteor.loginToken");
  if (!token && path !== "/login" && path !== "/onboarding" && !path.startsWith("/landing")) {
    window.location.replace("/login"); return;
  }
  if (path === "/") { if (token) { window.location.replace("/home"); } else { window.location.replace("/login"); } return; }
  window.addEventListener("storage", function(e) {
    if (e.key === "Meteor.loginToken" && !e.newValue) window.location.replace("/login");
  });
})();
`;

const fullScript = navCode + "\n" + authCode;

db.rocketchat_settings.updateOne(
  {_id: "Layout_Custom_Script"},
  {$set: {value: fullScript}}
);
print("Layout_Custom_Script cleaned and fixed");
