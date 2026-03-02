/**
 * Email API (Legacy MongoDB - deprecated)
 * Use email-vaultbrix.js instead
 */
const express = require("express");
const router = express.Router();

// Deprecated - redirects to vaultbrix implementation
router.get("/inbox", async (req, res) => {
  res.redirect("/api/v1/email/inbox");
});

module.exports = router;
