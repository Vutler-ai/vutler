const express = require('express');
const router = express.Router();

const COORDINATOR_NAME = process.env.VUTLER_COORDINATOR_NAME || 'Jarvis';

router.get('/', (req, res) => res.json({
  success: true,
  data: [],
  coordinator: {
    name: COORDINATOR_NAME,
    type: 'coordinator',
    includedInAllPlans: true,
    notCountedInAgentLimits: false,
    countsTowardsAgentLimits: true,
    nonDeletable: true,
    badge: 'system-coordinator'
  }
}));

module.exports = router;
