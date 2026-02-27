
// === Sprint 16-19 API Routes ===
try {
  const tasksV2 = require("./patches/s16-tasks-api");
  app.use("/api/v1/tasks-v2", tasksV2);
  console.log("[BOOT] S16 Tasks V2 API mounted");
} catch(e) { console.warn("[BOOT] S16 Tasks skip:", e.message); }

try {
  const calendarV2 = require("./patches/s17-calendar-api");
  app.use("/api/v1/calendar-v2", calendarV2);
  console.log("[BOOT] S17 Calendar V2 API mounted");
} catch(e) { console.warn("[BOOT] S17 Calendar skip:", e.message); }

try {
  const mailAPI = require("./patches/s18-mail-api");
  app.use("/api/v1/mail", mailAPI);
  console.log("[BOOT] S18 Mail API mounted");
} catch(e) { console.warn("[BOOT] S18 Mail skip:", e.message); }

try {
  const hybridAPI = require("./patches/s19-hybrid-gateway-api");
  app.use("/api/v1/hybrid", hybridAPI);
  console.log("[BOOT] S19 Hybrid Agents API mounted");
} catch(e) { console.warn("[BOOT] S19 Hybrid skip:", e.message); }
