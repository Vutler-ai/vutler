'use strict';

/**
 * Provisioning Service
 * Handles workspace provisioning including S3 bucket creation
 */

const { pool } = require('../lib/postgres');
const s3Driver = require('./s3Driver');

/**
 * Provision a new workspace
 * @param {Object} workspace - Workspace object
 * @param {string} workspace.id - Workspace UUID
 * @param {string} workspace.slug - Workspace slug
 * @param {string} workspace.name - Workspace name
 * @returns {Promise<Object>} - Provisioned workspace info
 */
async function provisionWorkspace(workspace) {
  try {
    console.log(`[Provisioning] Provisioning workspace: ${workspace.slug} (${workspace.id})`);
    
    // Generate bucket name
    const bucketName = s3Driver.generateBucketName(workspace.slug);
    
    // Create S3 bucket
    await s3Driver.createBucket(workspace.slug);
    
    // Update workspace with storage bucket
    await pool.query(
      `UPDATE tenant_vutler.workspaces 
       SET storage_bucket = $1, updated_at = NOW()
       WHERE id = $2`,
      [bucketName, workspace.id]
    );
    
    console.log(`[Provisioning] Workspace provisioned successfully: ${workspace.slug} with bucket ${bucketName}`);
    
    return {
      id: workspace.id,
      slug: workspace.slug,
      bucketName
    };
  } catch (err) {
    console.error(`[Provisioning] Failed to provision workspace ${workspace.slug}:`, err.message);
    throw err;
  }
}

/**
 * Ensure workspace has a storage bucket
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<string>} - Bucket name
 */
async function ensureWorkspaceBucket(workspaceId) {
  try {
    // Get workspace info
    const result = await pool.query(
      'SELECT id, slug, storage_bucket FROM tenant_vutler.workspaces WHERE id = $1',
      [workspaceId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    
    const workspace = result.rows[0];
    
    // If already has bucket, return it
    if (workspace.storage_bucket) {
      return workspace.storage_bucket;
    }
    
    // Otherwise provision the bucket
    const provisioned = await provisionWorkspace(workspace);
    return provisioned.bucketName;
  } catch (err) {
    console.error(`[Provisioning] Failed to ensure bucket for workspace ${workspaceId}:`, err.message);
    throw err;
  }
}

/**
 * Initialize storage for existing workspaces without buckets
 * Useful for migration
 */
async function initializeExistingWorkspaces() {
  try {
    console.log('[Provisioning] Initializing storage for existing workspaces...');
    
    // Find workspaces without storage_bucket
    const result = await pool.query(
      `SELECT id, slug, name 
       FROM tenant_vutler.workspaces 
       WHERE storage_bucket IS NULL 
       OR storage_bucket = ''`
    );
    
    console.log(`[Provisioning] Found ${result.rows.length} workspaces without storage bucket`);
    
    for (const workspace of result.rows) {
      try {
        await provisionWorkspace(workspace);
      } catch (err) {
        console.error(`[Provisioning] Failed to provision workspace ${workspace.slug}:`, err.message);
        // Continue with other workspaces
      }
    }
    
    console.log('[Provisioning] Existing workspace initialization complete');
  } catch (err) {
    console.error('[Provisioning] Failed to initialize existing workspaces:', err.message);
    throw err;
  }
}

module.exports = {
  provisionWorkspace,
  ensureWorkspaceBucket,
  initializeExistingWorkspaces
};
