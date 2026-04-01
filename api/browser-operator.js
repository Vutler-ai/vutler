'use strict';

const express = require('express');
const {
  listProfiles,
  getProfile,
  listFlows,
  getFlow,
  getActionCatalog,
} = require('../services/browserOperator/registryService');
const {
  createRun,
  listRuns,
  getRun,
  listRunSteps,
  listRunEvidence,
  getRunReport,
  cancelRun,
} = require('../services/browserOperator/runService');
const {
  listCredentials,
  createCredential,
  rotateCredential,
  testCredential,
} = require('../services/browserOperator/credentialService');

const router = express.Router();

function requireWorkspace(req, res, next) {
  if (!req.workspaceId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  return next();
}

function getVersionParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function handleError(res, error, fallback) {
  const status = error?.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: error?.message || fallback,
  });
}

router.use(requireWorkspace);

router.get('/profiles', async (_req, res) => {
  try {
    const profiles = await listProfiles();
    res.json({ success: true, data: { profiles } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator profiles');
  }
});

router.get('/profiles/:profileKey', async (req, res) => {
  try {
    const profile = await getProfile(req.params.profileKey, getVersionParam(req.query.version));
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, data: { profile } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator profile');
  }
});

router.get('/flows', async (_req, res) => {
  try {
    const flows = await listFlows();
    res.json({ success: true, data: { flows } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator flows');
  }
});

router.get('/flows/:flowKey', async (req, res) => {
  try {
    const flow = await getFlow(req.params.flowKey, getVersionParam(req.query.version));
    if (!flow) {
      return res.status(404).json({ success: false, error: 'Flow not found' });
    }
    res.json({ success: true, data: { flow } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator flow');
  }
});

router.get('/action-catalog', async (req, res) => {
  try {
    const actionCatalog = await getActionCatalog({
      catalogKey: req.query.catalogKey,
      profileKey: req.query.profileKey,
      version: getVersionParam(req.query.version),
    });
    if (!actionCatalog) {
      return res.status(404).json({ success: false, error: 'Action catalog not found' });
    }
    res.json({ success: true, data: { actionCatalog } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator action catalog');
  }
});

router.post('/runs', async (req, res) => {
  try {
    const run = await createRun(req.workspaceId, req.body || {}, req.userId || req.user?.id || null);
    res.status(201).json({ success: true, data: { run } });
  } catch (error) {
    handleError(res, error, 'Failed to create browser operator run');
  }
});

router.get('/runs', async (req, res) => {
  try {
    const runs = await listRuns(req.workspaceId, req.query.limit);
    res.json({ success: true, data: { runs } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator runs');
  }
});

router.get('/runs/:runId', async (req, res) => {
  try {
    const run = await getRun(req.workspaceId, req.params.runId);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }
    res.json({ success: true, data: { run } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator run');
  }
});

router.get('/runs/:runId/steps', async (req, res) => {
  try {
    const steps = await listRunSteps(req.workspaceId, req.params.runId);
    res.json({ success: true, data: { steps } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator run steps');
  }
});

router.get('/runs/:runId/evidence', async (req, res) => {
  try {
    const evidence = await listRunEvidence(req.workspaceId, req.params.runId);
    res.json({ success: true, data: { evidence } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator evidence');
  }
});

router.get('/runs/:runId/report', async (req, res) => {
  try {
    const report = await getRunReport(req.workspaceId, req.params.runId);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    res.json({ success: true, data: { report } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator report');
  }
});

router.post('/runs/:runId/cancel', async (req, res) => {
  try {
    const run = await cancelRun(req.workspaceId, req.params.runId);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }
    res.json({ success: true, data: { run } });
  } catch (error) {
    handleError(res, error, 'Failed to cancel browser operator run');
  }
});

router.get('/credentials', async (req, res) => {
  try {
    const credentials = await listCredentials(req.workspaceId);
    res.json({ success: true, data: { credentials } });
  } catch (error) {
    handleError(res, error, 'Failed to load browser operator credentials');
  }
});

router.post('/credentials', async (req, res) => {
  try {
    const credential = await createCredential(req.workspaceId, req.body || {}, req.userId || req.user?.id || null);
    res.status(201).json({ success: true, data: { credential } });
  } catch (error) {
    handleError(res, error, 'Failed to create browser operator credential');
  }
});

router.post('/credentials/:id/rotate', async (req, res) => {
  try {
    const credential = await rotateCredential(req.workspaceId, req.params.id, req.body || {}, req.userId || req.user?.id || null);
    res.json({ success: true, data: { credential } });
  } catch (error) {
    handleError(res, error, 'Failed to rotate browser operator credential');
  }
});

router.post('/credentials/:id/test', async (req, res) => {
  try {
    const result = await testCredential(req.workspaceId, req.params.id, req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, error, 'Failed to test browser operator credential');
  }
});

module.exports = router;
