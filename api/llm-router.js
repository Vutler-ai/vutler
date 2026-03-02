/**
 * LLM Router API
 */
const express = require("express");
const router = express.Router();

router.get("/providers", async (req, res) => {
  res.json({ success: true, providers: [] });
});

module.exports = router;
