'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
  },
  forcePathStyle: true
});

/**
 * Ensure a bucket exists, create if not
 */
async function ensureBucket(bucket) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`[S3Driver] Creating bucket: ${bucket}`);
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } else {
      throw err;
    }
  }
}

/**
 * Create a bucket for a workspace
 */
async function createBucket(workspaceSlug) {
  const bucket = `drive-${workspaceSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  await ensureBucket(bucket);
  console.log(`[S3Driver] Bucket ready: ${bucket}`);
  return bucket;
}

/**
 * Upload a file to S3
 */
async function upload(bucket, key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream'
  }));
  console.log(`[S3Driver] Uploaded: ${bucket}/${key} (${buffer.length} bytes)`);
  return { bucket, key, size: buffer.length };
}

/**
 * Download a file from S3 (returns readable stream)
 */
async function download(bucket, key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return resp;
}

/**
 * List objects in a bucket with optional prefix
 */
async function list(bucket, prefix, delimiter) {
  const params = { Bucket: bucket, MaxKeys: 1000 };
  if (prefix) params.Prefix = prefix;
  if (delimiter) params.Delimiter = delimiter;

  const resp = await s3.send(new ListObjectsV2Command(params));
  const files = (resp.Contents || []).map(obj => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
    etag: obj.ETag
  }));
  const folders = (resp.CommonPrefixes || []).map(p => p.Prefix);
  return { files, folders, count: files.length };
}

/**
 * Delete an object from S3
 */
async function remove(bucket, key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log(`[S3Driver] Deleted: ${bucket}/${key}`);
}

/**
 * Get a presigned download URL
 */
async function getPresignedDownloadUrl(bucket, key, expiresIn) {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresIn || 3600
  });
  return url;
}

/**
 * Move/rename an object (copy + delete)
 */
async function move(bucket, oldKey, newKey) {
  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${oldKey}`,
    Key: newKey
  }));
  await remove(bucket, oldKey);
  console.log(`[S3Driver] Moved: ${oldKey} → ${newKey}`);
}

/**
 * Get bucket name for a workspace
 */
function getBucketName(workspaceSlug) {
  return `drive-${workspaceSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

module.exports = {
  s3,
  ensureBucket,
  createBucket,
  upload,
  download,
  list,
  remove,
  move,
  getPresignedDownloadUrl,
  getBucketName
};
