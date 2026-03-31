const express = require('express');
const {
  listProfiles,
  getProfile,
  listCapabilities,
  getActiveMatrix,
  getActionCatalog,
  getPolicyBundle,
  getLocalIntegrationRegistry,
  getHelperRules,
} = require('../services/nexusEnterpriseRegistry');
const { validateProfileSelection } = require('../services/nexusEnterpriseProvisioning');

const router = express.Router();

function getVersionParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function handleRegistryError(res, error) {
  const status = error?.code === 'NEXUS_ENTERPRISE_REGISTRY_INVALID' ? 500 : 500;
  return res.status(status).json({
    success: false,
    error: error?.message || 'Failed to load Nexus Enterprise registry',
  });
}

router.get('/profiles', async (req, res) => {
  try {
    const profiles = await listProfiles();
    res.json({ success: true, data: { profiles } });
  } catch (error) {
    handleRegistryError(res, error);
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
    handleRegistryError(res, error);
  }
});

router.get('/capabilities', async (_req, res) => {
  try {
    const capabilities = await listCapabilities();
    res.json({ success: true, data: { capabilities } });
  } catch (error) {
    handleRegistryError(res, error);
  }
});

router.get('/agent-level-matrix', async (req, res) => {
  try {
    const matrix = await getActiveMatrix(getVersionParam(req.query.version));
    if (!matrix) {
      return res.status(404).json({ success: false, error: 'Agent level matrix not found' });
    }
    res.json({ success: true, data: { matrix } });
  } catch (error) {
    handleRegistryError(res, error);
  }
});

router.get('/action-catalogs/:profileKey', async (req, res) => {
  try {
    const actionCatalog = await getActionCatalog(req.params.profileKey, getVersionParam(req.query.version));
    if (!actionCatalog) {
      return res.status(404).json({ success: false, error: 'Action catalog not found' });
    }
    res.json({ success: true, data: { actionCatalog } });
  } catch (error) {
    handleRegistryError(res, error);
  }
});

router.get('/policy-bundles/:profileKey', async (req, res) => {
  try {
    const policyBundle = await getPolicyBundle(req.params.profileKey, getVersionParam(req.query.version));
    if (!policyBundle) {
      return res.status(404).json({ success: false, error: 'Policy bundle not found' });
    }
    res.json({ success: true, data: { policyBundle } });
  } catch (error) {
    handleRegistryError(res, error);
  }
});

router.get('/local-integrations/:profileKey', async (req, res) => {
  try {
    const localIntegrationRegistry = await getLocalIntegrationRegistry(req.params.profileKey, getVersionParam(req.query.version));
    if (!localIntegrationRegistry) {
      return res.status(404).json({ success: false, error: 'Local integration registry not found' });
    }
    res.json({ success: true, data: { localIntegrationRegistry } });
  } catch (error) {
    handleRegistryError(res, error);
  }
});

router.get('/helper-rules/:profileKey', async (req, res) => {
  try {
    const helperRules = await getHelperRules(req.params.profileKey, getVersionParam(req.query.version));
    if (!helperRules) {
      return res.status(404).json({ success: false, error: 'Helper rules not found' });
    }
    res.json({ success: true, data: { helperRules } });
  } catch (error) {
    handleRegistryError(res, error);
  }
});

router.post('/agents/validate-profile-selection', async (req, res) => {
  try {
    const validation = await validateProfileSelection(req.body || {});
    res.json({ success: true, data: { validation } });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({
      success: false,
      error: error?.message || 'Failed to validate profile selection',
    });
  }
});

module.exports = router;
