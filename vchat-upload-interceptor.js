/**
 * VChat Upload Interceptor
 * Intercepts file uploads from Rocket.Chat and auto-classifies them to VDrive
 * 
 * Methods:
 * 1. Webhook from RC on file uploads 
 * 2. Polling RC for new file attachments
 * 3. Direct API integration
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { autoClassifyFile } = require('./drive-classification');

class VChatUploadInterceptor {
    constructor({ pool, synology, rcClient, logger = console }) {
        this.pool = pool;
        this.synology = synology;
        this.rcClient = rcClient;
        this.logger = logger;
        this.processedUploads = new Set(); // Prevent duplicate processing
    }

    // ─── Webhook Handler for RC File Uploads ────────────────────────────────
    async handleRCWebhook(webhookData) {
        try {
            // RC webhook structure for file uploads
            const { user_id, user_name, channel_id, channel_name, attachments, timestamp } = webhookData;
            
            if (!attachments || !attachments.length) {
                return { success: true, skipped: 'No attachments' };
            }

            let processedFiles = 0;
            
            for (const attachment of attachments) {
                if (this.processedUploads.has(attachment.title_link || attachment.message_id)) {
                    continue; // Already processed
                }
                
                const result = await this.processAttachment(attachment, {
                    userId: user_id,
                    userName: user_name,
                    channelId: channel_id,
                    channelName: channel_name,
                    timestamp
                });
                
                if (result.success) {
                    processedFiles++;
                    this.processedUploads.add(attachment.title_link || attachment.message_id);
                }
            }
            
            return {
                success: true,
                processedFiles,
                totalAttachments: attachments.length
            };
            
        } catch (err) {
            this.logger.error('[VChat Upload Interceptor] Webhook error:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ─── Process Individual Attachment ──────────────────────────────────────
    async processAttachment(attachment, context) {
        try {
            // Extract file info from RC attachment
            const fileInfo = {
                title: attachment.title,
                filename: attachment.title || 'unknown',
                mimeType: attachment.mime_type || this.guessMimeType(attachment.title),
                size: attachment.size || 0,
                downloadUrl: attachment.title_link,
                messageId: attachment.message_id || context.messageId
            };
            
            // Determine workspace and agent
            const workspaceId = await this.resolveWorkspaceId(context);
            const agent = await this.resolveAgent(context, workspaceId);
            
            if (!agent) {
                this.logger.warn('[VChat Upload] Could not resolve agent for:', context.userName);
                return { success: false, error: 'Agent not found' };
            }
            
            // Download file from RC
            const downloadResult = await this.downloadFromRC(fileInfo.downloadUrl);
            if (!downloadResult.success) {
                return downloadResult;
            }
            
            // Upload to VDrive
            const uploadResult = await this.uploadToVDrive(downloadResult.buffer, fileInfo, agent, workspaceId);
            if (!uploadResult.success) {
                return uploadResult;
            }
            
            // Auto-classify
            const classifyResult = await autoClassifyFile(uploadResult.fileData, {
                workspaceId,
                agentId: agent.id,
                agentDisplayName: agent.display_name,
                pool: this.pool,
                synology: this.synology
            });
            
            this.logger.info(`📎 Processed upload: ${fileInfo.filename} → ${classifyResult?.documentType || 'unknown'}`);
            
            return {
                success: true,
                file: uploadResult.fileData,
                classification: classifyResult
            };
            
        } catch (err) {
            this.logger.error('[VChat Upload] Process attachment error:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ─── Download File from RC ──────────────────────────────────────────────
    async downloadFromRC(downloadUrl) {
        try {
            if (!downloadUrl) {
                return { success: false, error: 'No download URL provided' };
            }
            
            // Use RC client to download the file
            const response = await fetch(downloadUrl, {
                headers: this.rcClient ? {
                    'X-Auth-Token': this.rcClient.token,
                    'X-User-Id': this.rcClient.userId
                } : {}
            });
            
            if (!response.ok) {
                return { success: false, error: `Download failed: ${response.status}` };
            }
            
            const buffer = await response.arrayBuffer();
            return {
                success: true,
                buffer: Buffer.from(buffer),
                size: buffer.byteLength
            };
            
        } catch (err) {
            this.logger.error('[VChat Upload] Download error:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ─── Upload to VDrive ────────────────────────────────────────────────────
    async uploadToVDrive(buffer, fileInfo, agent, workspaceId) {
        try {
            const pg = this.pool();
            const fileId = crypto.randomBytes(16).toString('hex');
            
            // Generate unique filename
            const ext = path.extname(fileInfo.filename);
            const name = path.basename(fileInfo.filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
            const storedName = `${name}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
            
            // Save to local disk first
            const localDir = path.join(process.env.DRIVE_STORAGE_PATH || '/data/drive', workspaceId, agent.id);
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }
            
            const localPath = path.join(localDir, storedName);
            fs.writeFileSync(localPath, buffer);
            
            // Upload to Synology NAS if configured
            let nasPath = null;
            if (this.synology) {
                try {
                    const nasResult = await this.synology.uploadBufferForAgent(
                        agent.id, buffer, storedName, fileInfo.mimeType
                    );
                    nasPath = nasResult.path;
                } catch (nasErr) {
                    this.logger.warn('[VChat Upload] NAS upload failed:', nasErr.message);
                }
            }
            
            // Store in database
            await pg.query(`
                INSERT INTO drive_files (id, workspace_id, agent_id, uploaded_by, original_name,
                                        stored_name, mime_type, size_bytes, storage_path, visibility, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                fileId, workspaceId, agent.id, agent.id,
                fileInfo.filename, storedName, fileInfo.mimeType,
                buffer.length, localPath, 'private',
                JSON.stringify({ 
                    nasPath, 
                    source: 'vchat_upload',
                    originalMessageId: fileInfo.messageId,
                    uploadedAt: new Date().toISOString()
                })
            ]);
            
            return {
                success: true,
                fileData: {
                    id: fileId,
                    original_name: fileInfo.filename,
                    stored_name: storedName,
                    nasPath
                }
            };
            
        } catch (err) {
            this.logger.error('[VChat Upload] VDrive upload error:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ─── Helper Methods ──────────────────────────────────────────────────────
    async resolveWorkspaceId(context) {
        // For now, return default workspace
        // In the future, this could map RC channels to workspaces
        return 'default';
    }

    async resolveAgent(context, workspaceId) {
        try {
            const pg = this.pool();
            
            // Try to find agent by RC username
            const { rows } = await pg.query(`
                SELECT * FROM agents 
                WHERE workspace_id = $1 
                AND (username = $2 OR display_name ILIKE $3)
                AND status = 'active'
                LIMIT 1
            `, [workspaceId, context.userName, `%${context.userName}%`]);
            
            if (rows.length) {
                return rows[0];
            }
            
            // If no agent found, create a placeholder or use default
            this.logger.warn(`[VChat Upload] No agent found for RC user: ${context.userName}`);
            return null;
            
        } catch (err) {
            this.logger.error('[VChat Upload] Agent resolution error:', err.message);
            return null;
        }
    }

    guessMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const mimeMap = {
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.js': 'text/javascript',
            '.py': 'text/x-python',
            '.sh': 'text/x-shellscript'
        };
        return mimeMap[ext] || 'application/octet-stream';
    }

    // ─── Polling Method (Alternative to Webhooks) ───────────────────────────
    async pollForNewUploads() {
        try {
            if (!this.rcClient) {
                throw new Error('RC client not configured');
            }
            
            // This would poll RC API for recent messages with attachments
            // Implementation depends on RC API capabilities
            this.logger.info('[VChat Upload] Polling not implemented yet');
            
        } catch (err) {
            this.logger.error('[VChat Upload] Polling error:', err.message);
        }
    }
}

// Express middleware for webhook endpoint
function createWebhookMiddleware(interceptor) {
    return async (req, res) => {
        try {
            // Enhanced webhook handler that processes file uploads
            const { attachments } = req.body;
            
            if (attachments && attachments.length > 0) {
                // This is a file upload webhook
                const result = await interceptor.handleRCWebhook(req.body);
                
                // Also store in vchat_inbox for regular processing
                const { channel_id, channel_name, user_id, user_name, message_id, text, timestamp } = req.body;
                
                if (text && text.trim()) {
                    const pg = interceptor.pool();
                    await pg.query(
                        `INSERT INTO vchat_inbox (channel_id, channel_name, user_id, username, message_id, message, timestamp, metadata)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                         ON CONFLICT (message_id) DO NOTHING`,
                        [
                            channel_id, channel_name, user_id, user_name, 
                            message_id || `msg-${Date.now()}`, text, timestamp || new Date(),
                            JSON.stringify({ hasAttachments: true, attachmentCount: attachments.length })
                        ]
                    );
                }
                
                res.json({
                    success: true,
                    processed: result.processedFiles || 0,
                    message: 'File upload processed'
                });
                
            } else {
                // Regular message webhook
                const { channel_id, channel_name, user_id, user_name, message_id, text, timestamp } = req.body;
                
                if (req.body.bot || req.body.is_bot || !text || !text.trim()) {
                    return res.json({ success: true, skipped: 'bot message or empty' });
                }

                const pg = interceptor.pool();
                await pg.query(
                    `INSERT INTO vchat_inbox (channel_id, channel_name, user_id, username, message_id, message, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (message_id) DO NOTHING`,
                    [channel_id, channel_name, user_id, user_name, message_id || `msg-${Date.now()}`, text, timestamp || new Date()]
                );
                
                res.json({ success: true });
            }
            
        } catch (err) {
            console.error('[VChat Upload Webhook]', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    };
}

module.exports = {
    VChatUploadInterceptor,
    createWebhookMiddleware
};