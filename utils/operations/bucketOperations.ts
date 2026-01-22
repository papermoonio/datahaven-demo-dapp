import type { Bucket } from '@storagehub-sdk/msp-client';
import {
  getStorageHubClient,
  getConnectedAddress,
  getPublicClient,
  getPolkadotApi,
  buildGasTxOpts,
} from '../services/clientService';
import { getMspInfo, getValueProps, getMspClient } from '../services/mspService';
import type { BucketInfo } from '../../src/types';
import type { TransactionReceipt } from 'viem';

// Create a new bucket
export async function createBucket(
  bucketName: string,
  isPrivate: boolean = false
): Promise<{ bucketId: string; txReceipt: TransactionReceipt }> {
  const storageHubClient = getStorageHubClient();
  const address = getConnectedAddress();
  const publicClient = getPublicClient();
  const polkadotApi = getPolkadotApi();

  if (!address) {
    throw new Error('Wallet not connected');
  }

  // Get MSP info and value prop
  const { mspId } = await getMspInfo();
  const valuePropId = await getValueProps();

  // Derive bucket ID
  const bucketId = (await storageHubClient.deriveBucketId(address, bucketName)) as string;

  // Check that bucket doesn't already exist
  const bucketBeforeCreation = await polkadotApi.query.providers.buckets(bucketId);
  if (!bucketBeforeCreation.isEmpty) {
    throw new Error(`Bucket already exists: ${bucketId}`);
  }

  // Build gas options based on current network conditions
  const gasTxOpts = await buildGasTxOpts();

  // Create bucket on chain
  const txHash: `0x${string}` | undefined = await storageHubClient.createBucket(
    mspId as `0x${string}`,
    bucketName,
    isPrivate,
    valuePropId,
    gasTxOpts
  );

  if (!txHash) {
    throw new Error('createBucket() did not return a transaction hash');
  }

  // Wait for transaction receipt
  const txReceipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (txReceipt.status !== 'success') {
    throw new Error(`Bucket creation failed: ${txHash}`);
  }

  return { bucketId, txReceipt };
}

// Verify bucket creation on chain
export async function verifyBucketCreation(bucketId: string): Promise<BucketInfo> {
  const polkadotApi = getPolkadotApi();
  const { mspId } = await getMspInfo();

  const bucket = await polkadotApi.query.providers.buckets(bucketId);
  if (bucket.isEmpty) {
    throw new Error('Bucket not found on chain after creation');
  }

  const bucketData = bucket.unwrap().toHuman() as unknown as BucketInfo;

  // Verify ownership
  const address = getConnectedAddress();
  if (bucketData.userId !== address) {
    console.warn('Bucket owner mismatch');
  }

  // Verify MSP
  if (bucketData.mspId !== mspId) {
    console.warn('Bucket MSP mismatch');
  }

  return bucketData;
}

// Wait for backend to index the bucket
export async function waitForBackendBucketReady(bucketId: string): Promise<void> {
  const mspClient = getMspClient();
  const maxAttempts = 10;
  const delayMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const bucket = await mspClient.buckets.getBucket(bucketId);
      if (bucket) {
        return;
      }
    } catch (error: unknown) {
      const err = error as { status?: number; body?: { error?: string } };
      if (err.status === 404 || err.body?.error === 'Not found: Record') {
        // Bucket not yet indexed, continue polling
      } else {
        throw error;
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Bucket ${bucketId} not found in MSP backend after waiting`);
}

// Delete a bucket
export async function deleteBucket(bucketId: string): Promise<boolean> {
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();

  // Build gas options based on current network conditions
  const gasTxOpts = await buildGasTxOpts();

  const txHash: `0x${string}` | undefined = await storageHubClient.deleteBucket(
    bucketId as `0x${string}`,
    gasTxOpts
  );

  if (!txHash) {
    throw new Error('deleteBucket() did not return a transaction hash');
  }

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.status !== 'success') {
    throw new Error(`Bucket deletion failed: ${txHash}`);
  }

  return true;
}

// Get all buckets from MSP
export async function getBucketsFromMSP(): Promise<Bucket[]> {
  const mspClient = getMspClient();
  const buckets: Bucket[] = await mspClient.buckets.listBuckets();
  return buckets;
}

// Get a single bucket info
export async function getBucket(bucketId: string): Promise<Bucket> {
  const mspClient = getMspClient();
  const bucket = await mspClient.buckets.getBucket(bucketId);
  return bucket;
}
