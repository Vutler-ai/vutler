const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const PLAN_LIMITS = {
  free: { api: 50, llm: 10 },
  starter: { api: 200, llm: 50 },
  pro: { api: 1000, llm: 200 },
  enterprise: { api: 5000, llm: 1000 }
};

const globalLimiter = rateLimit({
  windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later." },
  skip: (req) => req.path === "/health" || req.path.startsWith("/static")
});

const apiLimiter = rateLimit({
  windowMs: 60000,
  max: (req) => { const plan = req.user?.plan || "free"; return PLAN_LIMITS[plan]?.api || 50; },
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  message: { success: false, error: "API rate limit exceeded." }
});

const llmLimiter = rateLimit({
  windowMs: 60000,
  max: (req) => { const plan = req.user?.plan || "free"; return PLAN_LIMITS[plan]?.llm || 10; },
  keyGenerator: (req) => req.user?.workspaceId || ipKeyGenerator(req),
  message: { success: false, error: "LLM rate limit exceeded. Upgrade your plan for higher limits." }
});

const authLimiter = rateLimit({
  windowMs: 60000, max: 5,
  message: { success: false, error: "Too many login attempts. Please wait." }
});

module.exports = { globalLimiter, apiLimiter, llmLimiter, authLimiter, PLAN_LIMITS };
