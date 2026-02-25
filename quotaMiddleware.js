/**
 * Quota Enforcement Middleware
 * S8.3 — Enforces plan limits before expensive operations
 */

'use strict';

const { checkWorkspaceLimits, auditLog } = require('../services/pg');

/**
 * Middleware to check agent creation quota
 */
function checkAgentQuota(req, res, next) {
  return checkQuota('agents')(req, res, next);
}

/**
 * Middleware to check token usage quota
 */
function checkTokenQuota(req, res, next) {
  return checkQuota('tokens')(req, res, next);
}

/**
 * Middleware to check storage quota
 */
function checkStorageQuota(req, res, next) {
  return checkQuota('storage')(req, res, next);
}

/**
 * Generic quota checker middleware
 * @param {string} resource - Resource type to check (agents, tokens, storage)
 */
function checkQuota(resource) {
  return async (req, res, next) => {
    try {
      const workspaceId = req.workspaceId || 'default';
      // Get workspace plan - for now default to 'free', later get from workspace settings
      const plan = req.workspacePlan || 'free'; // TODO: get from workspace_settings
      
      const quotaStatus = await checkWorkspaceLimits(workspaceId, plan);
      
      if (quotaStatus.error) {
        console.error(`[quota] Error checking ${resource} quota:`, quotaStatus.error);
        // Fail open - allow the request if we can't check quota
        return next();
      }
      
      const resourceAllowed = quotaStatus.allowed[resource];
      const resourceUsage = quotaStatus.usage[resource];
      const resourceLimit = quotaStatus.limits[getResourceLimitKey(resource)];
      
      if (!resourceAllowed) {
        // Log quota exceeded
        await auditLog(
          req.agent?.id || null,
          `quota.${resource}_exceeded`, 
          {
            workspace_id: workspaceId,
            plan,
            usage: resourceUsage,
            limit: resourceLimit,
            resource
          },
          workspaceId
        );
        
        return res.status(429).json({
          success: false,
          error: 'Quota exceeded',
          message: `${resource} limit reached for ${plan} plan`,
          quota: {
            resource,
            usage: resourceUsage,
            limit: resourceLimit,
            plan,
            percentage: quotaStatus.percentages[resource]
          },
          upgrade_url: process.env.BILLING_UPGRADE_URL || '/billing/upgrade'
        });
      }
      
      // Add quota info to request for later use
      req.quotaStatus = quotaStatus;
      next();
      
    } catch (err) {
      console.error(`[quota] ${resource} check error:`, err.message);
      // Fail open - don't block the request due to quota check errors
      next();
    }
  };
}

/**
 * Helper to map resource names to limit keys
 */
function getResourceLimitKey(resource) {
  const mapping = {
    agents: 'maxAgents',
    tokens: 'monthlyTokens', 
    storage: 'storageMB'
  };
  return mapping[resource] || resource;
}

/**
 * Middleware to add workspace plan to request
 * Fetches the plan from workspace_settings
 */
async function addWorkspacePlan(req, res, next) {
  try {
    const workspaceId = req.workspaceId || 'default';
    const { queryWithWorkspace } = require('../services/pg');
    
    const { rows } = await queryWithWorkspace(
      workspaceId,
      'SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2',
      [workspaceId, 'billing_plan']
    );
    
    req.workspacePlan = rows[0]?.value?.plan || 'free';
    next();
    
  } catch (err) {
    console.error('[quota] addWorkspacePlan error:', err.message);
    req.workspacePlan = 'free'; // Default to free plan on error
    next();
  }
}

/**
 * Combined middleware: workspace plan + specific quota check
 */
function checkAgentQuotaWithPlan(req, res, next) {
  addWorkspacePlan(req, res, (err) => {
    if (err) return next(err);
    checkAgentQuota(req, res, next);
  });
}

function checkTokenQuotaWithPlan(req, res, next) {
  addWorkspacePlan(req, res, (err) => {
    if (err) return next(err);
    checkTokenQuota(req, res, next);
  });
}

function checkStorageQuotaWithPlan(req, res, next) {
  addWorkspacePlan(req, res, (err) => {
    if (err) return next(err);
    checkStorageQuota(req, res, next);
  });
}

module.exports = {
  checkAgentQuota,
  checkTokenQuota, 
  checkStorageQuota,
  checkQuota,
  addWorkspacePlan,
  checkAgentQuotaWithPlan,
  checkTokenQuotaWithPlan,
  checkStorageQuotaWithPlan,
};