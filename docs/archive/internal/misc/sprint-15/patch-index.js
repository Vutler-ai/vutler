const fs = require('fs');
let code = fs.readFileSync('/app/index.js', 'utf8');

// 1. Add webhook + logs routes after automations mount
const anchor1 = 'app.use("/api/v1/automations", automationsAPI);';
const replacement1 = `app.use("/api/v1/automations", automationsAPI);
    // Sprint 15 — Automation Engine routes
    const webhookRoutes = require('./api/webhook-routes');
    const automationLogsRoutes = require('./api/automation-logs-routes');
    app.use('/api/v1/webhooks', webhookRoutes);
    app.use('/api/v1/automations', automationLogsRoutes);`;

if (code.includes(anchor1) && !code.includes('webhook-routes')) {
  code = code.replace(anchor1, replacement1);
  console.log('Patched: webhook + logs routes');
}

// 2. Add scheduler init after server listen log
const anchor2 = "console.log(`🎉 Vutler API listening on http://0.0.0.0:${port}`);";
const replacement2 = `console.log(\`🎉 Vutler API listening on http://0.0.0.0:\${port}\`);
      // Sprint 15 — Init schedule triggers
      try { const { initSchedules } = require('./runtime/schedule-trigger'); const pool = require('./lib/vaultbrix'); initSchedules(pool); console.log('⏰ Schedule triggers initialized'); } catch(e) { console.warn('Schedule init skip:', e.message); }`;

if (code.includes('Vutler API listening') && !code.includes('initSchedules')) {
  code = code.replace(anchor2, replacement2);
  console.log('Patched: scheduler init');
}

// 3. Add X-Webhook-Secret to allowed headers in CORS
if (!code.includes('X-Webhook-Secret')) {
  code = code.replace(
    "allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']",
    "allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Webhook-Secret']"
  );
  console.log('Patched: CORS headers');
}

fs.writeFileSync('/app/index.js', code);
console.log('Done!');
