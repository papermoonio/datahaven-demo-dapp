import '@storagehub/api-augment';
import { FileManager, ReplicationLevel } from '@storagehub-sdk/core';
import type { FileInfo } from '@storagehub-sdk/core';
import { TypeRegistry } from '@polkadot/types';
import type { AccountId20, H256 } from '@polkadot/types/interfaces';
import type { FileListResponse, StorageFileInfo } from '@storagehub-sdk/msp-client';
import {
  getStorageHubClient,
  getConnectedAddress,
  getPublicClient,
  getPolkadotApi,
  buildGasTxOpts,
} from '../services/clientService';
import { getMspClient, getMspInfo, authenticateUser, isAuthenticated } from '../services/mspService';

// Upload a file
export async function uploadFile(bucketId: string, file: File): Promise<{ fileKey: string; uploadReceipt: unknown }> {
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();
  const polkadotApi = getPolkadotApi();
  const mspClient = getMspClient();
  const address = getConnectedAddress();

  if (!address) {
    throw new Error('Wallet not connected');
  }

  // Create a FileManager from the browser File object
  const fileBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(fileBuffer);

  const fileManager = new FileManager({
    size: file.size,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(fileBytes);
          controller.close();
        },
      }),
  });

  // Get file details
  const fingerprint = await fileManager.getFingerprint();
  const fileSizeBigInt = BigInt(fileManager.getFileSize());

  // Get MSP details
  const { mspId, multiaddresses } = await getMspInfo();

  if (!multiaddresses?.length) {
    throw new Error('MSP multiaddresses are missing');
  }

  // Extract peer IDs from multiaddresses
  const peerIds: string[] = (multiaddresses ?? [])
    .map((addr: string) => addr.split('/p2p/').pop())
    .filter((id): id is string => !!id);

  if (peerIds.length === 0) {
    throw new Error('MSP multiaddresses had no /p2p/<peerId> segment');
  }

  // Issue storage request
  const replicationLevel = ReplicationLevel.Custom;
  const replicas = 1;

  // Build gas options based on current network conditions
  const gasTxOpts = await buildGasTxOpts();

  const txHash: `0x${string}` | undefined = await storageHubClient.issueStorageRequest(
    bucketId as `0x${string}`,
    file.name,
    fingerprint.toHex() as `0x${string}`,
    fileSizeBigInt,
    mspId as `0x${string}`,
    peerIds,
    replicationLevel,
    replicas,
    gasTxOpts
  );

  if (!txHash) {
    throw new Error('issueStorageRequest() did not return a transaction hash');
  }

  // Wait for transaction
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.status !== 'success') {
    throw new Error(`Storage request failed: ${txHash}`);
  }

  // Compute file key
  const registry = new TypeRegistry();
  const owner = registry.createType('AccountId20', address) as AccountId20;
  const bucketIdH256 = registry.createType('H256', bucketId) as H256;
  const fileKey = await fileManager.computeFileKey(owner, bucketIdH256, file.name);

  // Verify storage request on chain
  const storageRequest = await polkadotApi.query.fileSystem.storageRequests(fileKey);
  if (!storageRequest.isSome) {
    throw new Error('Storage request not found on chain');
  }

  // Authenticate if not already
  if (!isAuthenticated()) {
    await authenticateUser();
  }

  // Upload file to MSP
  const fileBlob = await fileManager.getFileBlob();
  const uploadReceipt = await mspClient.files.uploadFile(bucketId, fileKey.toHex(), fileBlob, address, file.name);

  if (uploadReceipt.status !== 'upload_successful') {
    throw new Error('File upload to MSP failed');
  }

  return { fileKey: fileKey.toHex(), uploadReceipt };
}

// Wait for MSP to confirm on chain
export async function waitForMSPConfirmOnChain(fileKey: string): Promise<void> {
  const polkadotApi = getPolkadotApi();
  const maxAttempts = 10;
  const delayMs = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const req = await polkadotApi.query.fileSystem.storageRequests(fileKey);

    if (req.isNone) {
      throw new Error(`StorageRequest for ${fileKey} no longer exists on-chain.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = req.unwrap() as any;
    const mspTuple = data.msp?.isSome ? data.msp.unwrap() : null;
    const mspConfirmed = mspTuple ? mspTuple[1]?.isTrue : false;

    if (mspConfirmed) {
      return;
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error(`FileKey ${fileKey} not confirmed by MSP after waiting`);
}

// Wait for backend to mark file as ready
export async function waitForBackendFileReady(bucketId: string, fileKey: string): Promise<FileInfo> {
  const mspClient = getMspClient();
  const maxAttempts = 60; // 5 minutes with 5s delay
  const delayMs = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const fileInfo = await mspClient.files.getFileInfo(bucketId, fileKey);

      if (fileInfo.status === 'ready') {
        return fileInfo;
      } else if (fileInfo.status === 'revoked') {
        throw new Error('File upload was cancelled by user');
      } else if (fileInfo.status === 'rejected') {
        throw new Error('File upload was rejected by MSP');
      } else if (fileInfo.status === 'expired') {
        throw new Error('Storage request expired');
      }

      // For "pending" status, continue waiting
    } catch (error: unknown) {
      const err = error as { status?: number; body?: { error?: string } };
      if (err?.status === 404 || err?.body?.error === 'Not found: Record') {
        // File not yet indexed, continue waiting
      } else {
        throw error;
      }
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error('Timed out waiting for file to be ready');
}

// Download a file
export async function downloadFile(fileKey: string): Promise<Blob> {
  const mspClient = getMspClient();

  const downloadResponse = await mspClient.files.downloadFile(fileKey);

  if (downloadResponse.status !== 200) {
    throw new Error(`Download failed with status: ${downloadResponse.status}`);
  }

  // Convert ReadableStream to Blob using Response API (cleaner approach)
  const response = new Response(downloadResponse.stream);
  const blob = await response.blob();

  const contentType = downloadResponse.contentType || 'application/octet-stream';
  return new Blob([blob], { type: contentType });
}

// Delete a file
export async function requestDeleteFile(bucketId: string, fileKey: string): Promise<boolean> {
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();
  const mspClient = getMspClient();

  // Get file info before deletion
  const fileInfo: FileInfo = await mspClient.files.getFileInfo(bucketId, fileKey);

  // Build gas options based on current network conditions
  const gasTxOpts = await buildGasTxOpts();

  // Request file deletion
  const txHash: `0x${string}` = await storageHubClient.requestDeleteFile(fileInfo, gasTxOpts);

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.status !== 'success') {
    throw new Error(`File deletion failed: ${txHash}`);
  }

  return true;
}

// Get files in a bucket
export async function getBucketFilesFromMSP(bucketId: string): Promise<FileListResponse> {
  const mspClient = getMspClient();
  const files: FileListResponse = await mspClient.buckets.getFiles(bucketId);
  return files;
}

// Get file info
export async function getFileInfo(bucketId: string, fileKey: string): Promise<StorageFileInfo> {
  const mspClient = getMspClient();
  const fileInfo = await mspClient.files.getFileInfo(bucketId, fileKey);
  return fileInfo;
}
