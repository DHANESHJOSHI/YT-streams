import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain?: string;
}

export function getR2Config(): R2Config {
  return {
    accountId: process.env.R2_ACCOUNT_ID || '897246136e2f1a0e2ecc4636e3112e49',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'noni-clips',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || 'clips.techwithjoshi.in',
  };
}

export function isR2Configured(config?: Partial<R2Config>): boolean {
  if (process.env.NONI_WORKER_URL) return true;
  const c = { ...getR2Config(), ...config };
  return Boolean(c.accountId && c.bucketName && (c.accessKeyId || process.env.NONI_WORKER_URL));
}

export function createR2Client(customConfig?: Partial<R2Config>): S3Client | null {
  const config = { ...getR2Config(), ...customConfig };
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export interface R2VideoItem {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  sourceType: 'r2';
}

export async function listR2Videos(customConfig?: Partial<R2Config>): Promise<R2VideoItem[]> {
  const config = { ...getR2Config(), ...customConfig };
  const client = createR2Client(config);
  if (!client || !config.bucketName) return [];

  try {
    const command = new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: 'videos/',
    });

    const response = await client.send(command);
    if (!response.Contents) return [];

    const publicBase = config.publicDomain
      ? (config.publicDomain.startsWith('http') ? config.publicDomain : `https://${config.publicDomain}`)
      : `https://${config.bucketName}.${config.accountId}.r2.dev`;

    return response.Contents
      .filter((item) => item.Key && !item.Key.endsWith('/'))
      .map((item) => {
        const key = item.Key!;
        const name = key.replace(/^videos\//, '');
        return {
          key,
          name,
          size: item.Size || 0,
          lastModified: item.LastModified?.toISOString() || new Date().toISOString(),
          url: `${publicBase.replace(/\/$/, '')}/${key}`,
          sourceType: 'r2' as const,
        };
      })
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  } catch (error) {
    console.error('Error listing R2 videos:', error);
    return [];
  }
}

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string = 'video/mp4',
  customConfig?: Partial<R2Config>
): Promise<{ uploadUrl: string; key: string; publicUrl: string } | null> {
  const config = { ...getR2Config(), ...customConfig };
  const client = createR2Client(config);
  if (!client || !config.bucketName) return null;

  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `videos/${Date.now()}_${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  const publicBase = config.publicDomain
    ? (config.publicDomain.startsWith('http') ? config.publicDomain : `https://${config.publicDomain}`)
    : `https://${config.bucketName}.${config.accountId}.r2.dev`;

  return {
    uploadUrl,
    key,
    publicUrl: `${publicBase.replace(/\/$/, '')}/${key}`,
  };
}

export async function deleteR2Video(key: string, customConfig?: Partial<R2Config>): Promise<boolean> {
  const config = { ...getR2Config(), ...customConfig };
  const client = createR2Client(config);
  if (!client || !config.bucketName) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch (err) {
    console.error('Failed to delete R2 video:', err);
    return false;
  }
}
