'use strict';

const { S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://REDACTED_DB_HOST:9000';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX || 'vutler-drive';

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Sanitize workspace ID into a valid S3 bucket name suffix.
 */
function _bucketName(workspaceId) {
  const sanitized = String(workspaceId).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
  return `${BUCKET_PREFIX}-${sanitized}`;
}

/**
 * Ensure bucket exists, create if not.
 */
async function createBucket(workspaceId) {
  const bucket = _bucketName(workspaceId);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return bucket;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404 || err.name === '404') {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[S3] Created bucket: ${bucket}`);
      return bucket;
    }
    throw err;
  }
}

/**
 * Upload file to S3.
 * @returns {string} The S3 key used.
 */
async function uploadFile(workspaceId, key, buffer, contentType, metadata) {
  const bucket = await createBucket(workspaceId);
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
    Metadata: metadata
      ? Object.fromEntries(
        Object.entries(metadata)
          .filter(([, value]) => value != null)
          .map(([metaKey, value]) => [metaKey, String(value)])
      )
      : undefined,
  }));
  return key;
}

/**
 * Download file from S3.
 * @returns {Buffer} File contents.
 */
async function downloadFile(workspaceId, key) {
  const bucket = _bucketName(workspaceId);
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  // Convert readable stream to buffer
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), contentType: resp.ContentType };
}

/**
 * Delete file from S3.
 */
async function deleteFile(workspaceId, key) {
  const bucket = _bucketName(workspaceId);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function headFile(workspaceId, key) {
  const bucket = _bucketName(workspaceId);
  const resp = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return {
    contentType: resp.ContentType,
    lastModified: resp.LastModified,
    metadata: resp.Metadata || {},
    contentLength: resp.ContentLength,
  };
}

/**
 * List files in bucket under prefix.
 */
async function listFiles(workspaceId, prefix) {
  const bucket = _bucketName(workspaceId);
  const resp = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix || '',
  }));
  return (resp.Contents || []).map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
  }));
}

async function listEntries(workspaceId, prefix) {
  const bucket = _bucketName(workspaceId);
  const cleanPrefix = String(prefix || '').replace(/^\/+/, '');
  const normalizedPrefix = cleanPrefix ? (cleanPrefix.endsWith('/') ? cleanPrefix : `${cleanPrefix}/`) : '';
  const resp = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: normalizedPrefix,
    Delimiter: '/',
  }));

  const folders = (resp.CommonPrefixes || []).map((entry) => ({
    key: entry.Prefix,
    isFolder: true,
    size: undefined,
    lastModified: undefined,
  }));

  const files = (resp.Contents || [])
    .filter((entry) => entry.Key && entry.Key !== normalizedPrefix)
    .map((entry) => ({
      key: entry.Key,
      isFolder: false,
      size: entry.Size,
      lastModified: entry.LastModified,
    }));

  return [...folders, ...files];
}

/**
 * Get presigned download URL.
 */
function getPresignedUrl(workspaceId, key, expiresIn) {
  const bucket = _bucketName(workspaceId);
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresIn || 3600 });
}

module.exports = {
  createBucket,
  uploadFile,
  downloadFile,
  deleteFile,
  headFile,
  listFiles,
  listEntries,
  getPresignedUrl,
  _bucketName,
  s3,
};
