'use strict';

const microsoftGraphApi = require('./microsoft/graphApi');
const {
  updateEventSubscriptionProvisioning,
} = require('./nexusEnterpriseEventSubscriptions');

function buildGraphExpirationDate(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function buildGraphSubscriptionPayload(subscription) {
  const config = subscription.config || {};
  const requestedBody = config.registrationHint?.body || {};
  return {
    changeType: requestedBody.changeType || 'updated',
    notificationUrl: subscription.callbackUrl,
    resource: subscription.sourceResource || requestedBody.resource,
    expirationDateTime: requestedBody.expirationDateTime || buildGraphExpirationDate(24),
    clientState: subscription.verificationSecret,
    latestSupportedTlsVersion: 'v1_2',
  };
}

async function provisionMicrosoftGraph(workspaceId, subscription) {
  const payload = buildGraphSubscriptionPayload(subscription);
  if (!payload.resource) {
    throw new Error('Microsoft Graph automatic provisioning requires sourceResource');
  }

  const response = await microsoftGraphApi.createSubscription(workspaceId, payload);
  return updateEventSubscriptionProvisioning(subscription.id, {
    provisioningMode: 'automatic',
    provisioningStatus: 'provisioned',
    externalSubscriptionId: response.id || null,
    provisioningError: null,
    configPatch: {
      autoProvisioning: {
        provider: 'microsoft_graph',
        requestedAt: new Date().toISOString(),
        requestPayload: payload,
        response,
      },
    },
  });
}

async function provisionEventSubscription(workspaceId, subscription) {
  const provider = String(subscription.provider || '').trim().toLowerCase();
  const mode = String(subscription.provisioningMode || 'manual').trim().toLowerCase();

  if (mode !== 'automatic') {
    return subscription;
  }

  if (provider === 'microsoft_graph') {
    try {
      return await provisionMicrosoftGraph(workspaceId, subscription);
    } catch (error) {
      return updateEventSubscriptionProvisioning(subscription.id, {
        provisioningMode: 'automatic',
        provisioningStatus: 'failed',
        provisioningError: error.message,
        configPatch: {
          autoProvisioning: {
            provider: 'microsoft_graph',
            failedAt: new Date().toISOString(),
          },
        },
      });
    }
  }

  return updateEventSubscriptionProvisioning(subscription.id, {
    provisioningMode: mode,
    provisioningStatus: provider === 'google' || provider === 'zoom'
      ? 'assisted_required'
      : 'manual_required',
    provisioningError: `Automatic provisioning is not implemented for provider ${provider}`,
    configPatch: {
      autoProvisioning: {
        provider,
        skippedAt: new Date().toISOString(),
        reason: 'provider_not_supported_yet',
      },
    },
  });
}

module.exports = {
  provisionEventSubscription,
};
