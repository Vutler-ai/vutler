/**
 * LLM API
 */
const express = require("express");
const router = express.Router();

router.get("/llm/providers", async (req, res) => {
  res.json({ success: true, providers: [] });
});

module.exports = router;
