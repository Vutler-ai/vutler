'use strict';

const fs = require('fs/promises');
const path = require('path');
const {
  uploadFile,
  getPresignedUrl,
} = require('../s3Storage');

const LOCAL_ROOT = path.join(process.cwd(), 'var', 'browser-operator-artifacts');

function hasS3Config() {
  return Boolean(process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY)
    && Boolean(process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY)
    && Boolean(process.env.S3_ENDPOINT);
}

function ensureParentDir(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function buildLocalPath(storageKey) {
  return path.join(LOCAL_ROOT, storageKey);
}

function serializeArtifact(mimeType, inlineText, artifactPayload) {
  if (artifactPayload && typeof artifactPayload === 'object' && typeof artifactPayload.data_url === 'string') {
    const parsed = dataUrlToBuffer(artifactPayload.data_url);
    if (parsed) {
      return {
        buffer: parsed.buffer,
        contentType: parsed.mimeType || mimeType || 'application/octet-stream',
      };
    }
  }

  if (typeof inlineText === 'string' && inlineText.length) {
    return {
      buffer: Buffer.from(inlineText, 'utf8'),
      contentType: mimeType || 'text/plain',
    };
  }

  if (artifactPayload != null) {
    return {
      buffer: Buffer.from(JSON.stringify(artifactPayload, null, 2), 'utf8'),
      contentType: mimeType || 'application/json',
    };
  }

  return null;
}

async function externalizeEvidence(workspaceId, storageKey, mimeType, metadata, inlineText, artifactPayload) {
  const serialized = serializeArtifact(mimeType, inlineText, artifactPayload);
  if (!serialized) {
    return {
      metadata,
      inlineText,
      artifactPayload,
    };
  }

  const nextMetadata = {
    ...(metadata || {}),
    externalized: true,
    content_length: serialized.buffer.length,
  };

  if (hasS3Config()) {
    await uploadFile(workspaceId, storageKey, serialized.buffer, serialized.contentType, {
      artifact_kind: metadata?.artifact_kind || 'artifact',
    });
    nextMetadata.storage_backend = 's3';
    nextMetadata.download_url = await getPresignedUrl(workspaceId, storageKey, 3600);
    return {
      metadata: nextMetadata,
      inlineText: null,
      artifactPayload: null,
    };
  }

  const filePath = buildLocalPath(storageKey);
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, serialized.buffer);
  nextMetadata.storage_backend = 'local_fs';
  nextMetadata.file_path = filePath;

  return {
    metadata: nextMetadata,
    inlineText: null,
    artifactPayload: null,
  };
}

async function hydrateEvidenceArtifact(workspaceId, evidence) {
  if (!evidence?.metadata?.externalized) return evidence;

  if (evidence.metadata.storage_backend === 's3') {
    try {
      return {
        ...evidence,
        metadata: {
          ...evidence.metadata,
          download_url: await getPresignedUrl(workspaceId, evidence.storage_key, 3600),
        },
      };
    } catch (_) {
      return evidence;
    }
  }

  return evidence;
}

module.exports = {
  externalizeEvidence,
  hydrateEvidenceArtifact,
};
