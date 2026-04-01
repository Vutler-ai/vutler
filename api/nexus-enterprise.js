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
const {
  createEventSubscription,
  getEventSubscriptionById,
  listEventSubscriptions,
  updateEventSubscription,
} = require('../services/nexusEnterpriseEventSubscriptions');
const {
  provisionEventSubscription,
} = require('../services/nexusEnterpriseSubscriptionProvisioner');

const router = express.Router();

function getVersionParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function handleRegistryError(res, error) {
  console.error('[nexus-enterprise] Registry error:', error);
  const status = error?.statusCode || 500;
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

router.get('/event-subscriptions', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const subscriptions = await listEventSubscriptions(req.workspaceId, {
      provider: req.query.provider,
      status: req.query.status,
    });
    res.json({ success: true, data: { subscriptions } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to list event subscriptions',
    });
  }
});

router.post('/event-subscriptions', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const payload = req.body || {};
    if (!payload.provider) {
      return res.status(400).json({ success: false, error: 'provider is required' });
    }

    const subscription = await createEventSubscription({
      workspaceId: req.workspaceId,
      provider: payload.provider,
      profileKey: payload.profileKey,
      agentId: payload.agentId,
      subscriptionType: payload.subscriptionType,
      sourceResource: payload.sourceResource,
      roomName: payload.roomName,
      events: payload.events,
      status: payload.status,
      deliveryMode: payload.deliveryMode,
      provisioningMode: payload.provisioningMode,
      config: payload.config,
    });

    const provisioned = await provisionEventSubscription(req.workspaceId, subscription);

    res.json({ success: true, data: { subscription: provisioned } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create event subscription',
    });
  }
});

router.patch('/event-subscriptions/:id', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const current = await getEventSubscriptionById(req.params.id, req.workspaceId);
    if (!current) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    const payload = req.body || {};
    const updated = await updateEventSubscription(
      req.params.id,
      {
        provider: current.provider,
        status: payload.status,
        provisioningMode: payload.provisioningMode,
        provisioningStatus: payload.provisioningStatus,
        provisioningError: payload.provisioningError,
        sourceResource: payload.sourceResource,
        roomName: payload.roomName,
        events: payload.events,
        configPatch: payload.configPatch,
      },
      req.workspaceId
    );

    res.json({ success: true, data: { subscription: updated } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update event subscription',
    });
  }
});

router.post('/event-subscriptions/:id/retry', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const current = await getEventSubscriptionById(req.params.id, req.workspaceId);
    if (!current) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    const payload = req.body || {};
    const prepared = await updateEventSubscription(
      req.params.id,
      {
        provider: current.provider,
        provisioningMode: payload.provisioningMode || current.provisioningMode,
        provisioningStatus: 'pending',
        provisioningError: null,
        configPatch: {
          retryRequestedAt: new Date().toISOString(),
          retryRequestedBy: 'workspace',
        },
      },
      req.workspaceId
    );

    const provisioned = await provisionEventSubscription(req.workspaceId, prepared);
    res.json({ success: true, data: { subscription: provisioned } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to retry event subscription provisioning',
    });
  }
});

module.exports = router;
