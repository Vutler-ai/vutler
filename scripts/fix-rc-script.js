const script = db.rocketchat_settings.findOne({_id: "Layout_Custom_Script"});
let val = script.value;

// Fix: / goes to /home, /home stays (no redirect to channel/general)
val = val.replace(
  /if \(path === "\/home" \|\| path === "\/"\) \{[^}]*if \(token\) \{ window\.location\.replace\("\/channel\/general"\); \}[^}]*else \{ window\.location\.replace\("\/login"\); \}[^}]*return;[^}]*\}/,
  'if (path === "/") { if (token) { window.location.replace("/home"); } else { window.location.replace("/login"); } return; }'
);

// Also fix /admin redirect if any
val = val.replace(/if \(!token && path !== "\/login"/,
  'if (!token && path !== "/login" && path !== "/home" && path !== "/knowledge" && path !== "/memory" && path !== "/admin"');

db.rocketchat_settings.updateOne(
  {_id: "Layout_Custom_Script"},
  {$set: {value: val}}
);
print("Fixed redirects");
