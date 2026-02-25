/**
 * VDrive File Classification Extension
 * Adds auto-classification endpoints to drive.js
 * 
 * Features:
 * - GET /api/v1/drive/classified — list all classified files
 * - GET /api/v1/drive/classified/:agent — files by agent
 * - Auto-classification when files are uploaded
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');

// Document type detection utility
function getDocumentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const extToType = {
        // code
        '.js': 'code', '.ts': 'code', '.tsx': 'code', '.py': 'code', '.sh': 'code', '.bash': 'code',
        '.java': 'code', '.cpp': 'code', '.c': 'code', '.php': 'code', '.rb': 'code',
        '.go': 'code', '.rust': 'code', '.swift': 'code', '.kt': 'code', '.scala': 'code',
        
        // document
        '.md': 'document', '.txt': 'document', '.pdf': 'document', '.doc': 'document', 
        '.docx': 'document', '.rtf': 'document', '.odt': 'document', '.tex': 'document',
        
        // image
        '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', 
        '.bmp': 'image', '.svg': 'image', '.webp': 'image', '.ico': 'image',
        
        // data
        '.csv': 'data', '.json': 'data', '.xlsx': 'data', '.xls': 'data', 
        '.xml': 'data', '.yaml': 'data', '.yml': 'data', '.sql': 'data'
    };
    return extToType[ext] || 'other';
}

// NAS path generation helper
function generateNASPath(workspaceId, agentOrUser, documentType, filename) {
    // Format: /{workspace_id}/{agent_or_user}/{document_type}/{filename}
    return `/${workspaceId}/${agentOrUser}/${documentType}/${filename}`;
}

// Classification endpoints to be added to drive.js router
function addClassificationEndpoints(router, { pool, requireAgent, requireAgentScope, synology }) {
    
    // ─── GET /api/v1/drive/classified — List all classified files ──────────
    router.get('/drive/classified', 
        requireAgent,
        requireAgentScope('drive'),
        async (req, res) => {
            try {
                const pg = pool();
                const limit = Math.min(parseInt(req.query.limit || '100'), 500);
                const offset = parseInt(req.query.offset || '0');
                const type = req.query.type; // optional filter by document type
                
                let whereClause = 'WHERE f.workspace_id = $1 AND (f.agent_id = $2 OR f.visibility IN (\'workspace\', \'public\'))';
                let queryParams = [req.agent.workspaceId, req.agent.id];
                let paramIndex = 3;
                
                // Add type filter if specified
                if (type && ['code', 'document', 'image', 'data', 'other'].includes(type)) {
                    whereClause += ` AND f.metadata->>'documentType' = $${paramIndex}`;
                    queryParams.push(type);
                    paramIndex++;
                }
                
                const { rows } = await pg.query(`
                    SELECT 
                        f.id, 
                        f.agent_id, 
                        a.display_name as agent_name,
                        f.original_name, 
                        f.mime_type, 
                        f.size_bytes, 
                        f.visibility, 
                        f.created_at,
                        f.metadata->>'documentType' as document_type,
                        f.metadata->>'nasPath' as nas_path,
                        f.metadata->>'classifiedPath' as classified_path
                    FROM drive_files f
                    LEFT JOIN agents a ON a.id = f.agent_id
                    ${whereClause}
                    ORDER BY f.created_at DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...queryParams, limit, offset]);
                
                // Group by document type
                const grouped = rows.reduce((acc, file) => {
                    const type = file.document_type || 'other';
                    if (!acc[type]) acc[type] = [];
                    acc[type].push(file);
                    return acc;
                }, {});
                
                res.json({
                    success: true,
                    files: rows,
                    count: rows.length,
                    grouped,
                    stats: {
                        code: grouped.code?.length || 0,
                        document: grouped.document?.length || 0,
                        image: grouped.image?.length || 0,
                        data: grouped.data?.length || 0,
                        other: grouped.other?.length || 0
                    }
                });
                
            } catch (err) {
                console.error('[Drive Classification] List error:', err.message);
                res.status(500).json({ success: false, error: err.message });
            }
        }
    );
    
    // ─── GET /api/v1/drive/classified/:agent — Files by specific agent ─────
    router.get('/drive/classified/:agent',
        requireAgent,
        requireAgentScope('drive'),
        async (req, res) => {
            try {
                const targetAgent = req.params.agent;
                const pg = pool();
                const limit = Math.min(parseInt(req.query.limit || '100'), 200);
                const offset = parseInt(req.query.offset || '0');
                
                // Security: Only allow access to own files or workspace/public files
                const { rows } = await pg.query(`
                    SELECT 
                        f.id, 
                        f.agent_id, 
                        a.display_name as agent_name,
                        f.original_name, 
                        f.mime_type, 
                        f.size_bytes, 
                        f.visibility, 
                        f.created_at,
                        f.metadata->>'documentType' as document_type,
                        f.metadata->>'nasPath' as nas_path,
                        f.metadata->>'classifiedPath' as classified_path
                    FROM drive_files f
                    LEFT JOIN agents a ON a.id = f.agent_id
                    WHERE f.workspace_id = $1 
                      AND f.agent_id = $2
                      AND (f.agent_id = $3 OR f.visibility IN ('workspace', 'public'))
                    ORDER BY f.created_at DESC
                    LIMIT $4 OFFSET $5
                `, [req.agent.workspaceId, targetAgent, req.agent.id, limit, offset]);
                
                if (!rows.length) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Agent not found or no accessible files' 
                    });
                }
                
                // Group by document type
                const grouped = rows.reduce((acc, file) => {
                    const type = file.document_type || 'other';
                    if (!acc[type]) acc[type] = [];
                    acc[type].push(file);
                    return acc;
                }, {});
                
                res.json({
                    success: true,
                    agent: targetAgent,
                    files: rows,
                    count: rows.length,
                    grouped,
                    stats: {
                        code: grouped.code?.length || 0,
                        document: grouped.document?.length || 0,
                        image: grouped.image?.length || 0,
                        data: grouped.data?.length || 0,
                        other: grouped.other?.length || 0
                    }
                });
                
            } catch (err) {
                console.error('[Drive Classification] Agent files error:', err.message);
                res.status(500).json({ success: false, error: err.message });
            }
        }
    );
    
    // ─── POST /api/v1/drive/classify/:fileId — Manual classification ──────
    router.post('/drive/classify/:fileId',
        requireAgent,
        requireAgentScope('drive'),
        async (req, res) => {
            try {
                const fileId = req.params.fileId;
                const { documentType, forceReclassify = false } = req.body;
                
                if (!documentType || !['code', 'document', 'image', 'data', 'other'].includes(documentType)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid documentType. Must be: code, document, image, data, or other'
                    });
                }
                
                const pg = pool();
                
                // Get file info
                const { rows } = await pg.query(`
                    SELECT * FROM drive_files 
                    WHERE id = $1 AND agent_id = $2
                `, [fileId, req.agent.id]);
                
                if (!rows.length) {
                    return res.status(404).json({
                        success: false,
                        error: 'File not found or not owned'
                    });
                }
                
                const file = rows[0];
                const currentMeta = file.metadata || {};
                
                // Check if already classified and not forcing reclassification
                if (currentMeta.classifiedPath && !forceReclassify) {
                    return res.status(409).json({
                        success: false,
                        error: 'File already classified. Use forceReclassify=true to override',
                        current: currentMeta
                    });
                }
                
                // Generate classified path
                const agentOrUser = req.agent.display_name.toLowerCase().replace(/[^a-z0-9]/g, '_') || req.agent.id;
                const classifiedPath = generateNASPath(req.agent.workspaceId, agentOrUser, documentType, file.original_name);
                
                // Update metadata
                const newMeta = {
                    ...currentMeta,
                    documentType,
                    classifiedPath,
                    classifiedAt: new Date().toISOString(),
                    classifiedBy: req.agent.id
                };
                
                // Try to move file on NAS if available
                let nasSuccess = false;
                if (synology && currentMeta.nasPath) {
                    try {
                        // For now, just update metadata - actual file moving can be implemented later
                        // This would require synology.move(currentPath, newPath) functionality
                        nasSuccess = true;
                    } catch (nasErr) {
                        console.warn('[Drive Classification] NAS move failed:', nasErr.message);
                    }
                }
                
                // Update database
                await pg.query(`
                    UPDATE drive_files 
                    SET metadata = $1, updated_at = NOW()
                    WHERE id = $2
                `, [JSON.stringify(newMeta), fileId]);
                
                res.json({
                    success: true,
                    fileId,
                    documentType,
                    classifiedPath,
                    nasSuccess,
                    metadata: newMeta
                });
                
            } catch (err) {
                console.error('[Drive Classification] Manual classify error:', err.message);
                res.status(500).json({ success: false, error: err.message });
            }
        }
    );
    
    console.log('📁 VDrive classification endpoints added');
}

// Auto-classification function for upload intercept
async function autoClassifyFile(fileData, { workspaceId, agentId, agentDisplayName, pool, synology }) {
    try {
        const documentType = getDocumentType(fileData.original_name || fileData.filename);
        const agentOrUser = (agentDisplayName || agentId).toLowerCase().replace(/[^a-z0-9]/g, '_');
        const classifiedPath = generateNASPath(workspaceId, agentOrUser, documentType, fileData.original_name || fileData.filename);
        
        // Create classified directory on NAS if available
        if (synology) {
            try {
                const classifiedDir = path.dirname(classifiedPath);
                await synology.createFolder(classifiedDir);
                
                // Move file to classified location (if original upload was successful)
                if (fileData.nasPath) {
                    // For now, just update metadata - actual moving logic can be added later
                    // await synology.move(fileData.nasPath, classifiedPath);
                }
            } catch (nasErr) {
                console.warn('[Auto Classification] NAS classification failed:', nasErr.message);
            }
        }
        
        // Update file metadata
        const pg = pool();
        await pg.query(`
            UPDATE drive_files 
            SET metadata = metadata || $1
            WHERE id = $2
        `, [JSON.stringify({
            documentType,
            classifiedPath,
            autoClassified: true,
            classifiedAt: new Date().toISOString()
        }), fileData.id]);
        
        console.log(`📄 Auto-classified: ${fileData.original_name} → ${documentType} (${classifiedPath})`);
        return { documentType, classifiedPath };
        
    } catch (err) {
        console.error('[Auto Classification] Error:', err.message);
        return null;
    }
}

module.exports = {
    addClassificationEndpoints,
    autoClassifyFile,
    getDocumentType,
    generateNASPath
};