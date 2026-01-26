export interface CodeSnippet {
  id: string;
  title: string;
  code: string;
}

export const dashboardSnippets: CodeSnippet[] = [
  {
    id: 'connectWallet',
    title: 'Connect Wallet',
    code: `// src/services/clientService.ts

export async function connectWallet(): Promise<\`0x\${string}\`> {
  const provider = getEthereumProvider();

  // Opens the wallet popup (e.g., MetaMask) asking the user to connect
  const accounts = await provider.request({
    method: 'eth_requestAccounts',
  });

  // Ensure the wallet is on the StorageHub testnet
  await switchToCorrectNetwork(provider);

  connectedAddress = accounts[0] as \`0x\${string}\`;

  // Create a viem WalletClient for signing transactions
  walletClientInstance = createWalletClient({
    chain,
    account: connectedAddress,
    transport: custom(provider),
  });

  // Initialize the StorageHub SDK for on-chain storage operations
  storageHubClientInstance = new StorageHubClient({
    rpcUrl: NETWORKS.testnet.rpcUrl,
    chain,
    walletClient: walletClientInstance,
    filesystemContractAddress: '0x...0404',
  });

  return connectedAddress;
}`,
  },
  {
    id: 'connectToMsp',
    title: 'Connect to MSP',
    code: `// src/services/mspService.ts

// Returns auth credentials for each request, or undefined if not logged in
const sessionProvider = async () => {
  const address = getConnectedAddress();
  return sessionToken && address
    ? { token: sessionToken, user: { address } }
    : undefined;
};

export async function connectToMsp(): Promise<MspClient> {
  // Return cached instance if already connected
  if (mspClientInstance) {
    return mspClientInstance;
  }

  const httpCfg: HttpClientConfig = {
    baseUrl: NETWORKS.testnet.mspUrl,
  };

  // Connect to MSP — sessionProvider attaches auth to each request
  mspClientInstance = await MspClient.connect(
    httpCfg,
    sessionProvider
  );

  return mspClientInstance;
}`,
  },
  {
    id: 'authenticateUser',
    title: 'Authenticate (SIWE)',
    code: `// src/services/mspService.ts

export async function authenticateUser(): Promise<UserInfo> {
  const client = getMspClient();
  const walletClient = getWalletClient();

  // SIWE requires the current domain and URI for the signed message
  const domain = window.location.hostname;
  const uri = window.location.origin;

  // Sign-In With Ethereum: MSP sends challenge → user signs → MSP verifies
  const siweSession = await client.auth.SIWE(
    walletClient,
    domain,
    uri
  );

  sessionToken = siweSession.token;

  const profile = await client.auth.getProfile();
  authenticatedUserProfile = profile;

  // Persist to sessionStorage (survives refresh, cleared on tab close)
  sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  sessionStorage.setItem(
    USER_PROFILE_KEY,
    JSON.stringify(profile)
  );

  return profile;
}`,
  },
];

export const bucketSnippets: CodeSnippet[] = [
  {
    id: 'listBuckets',
    title: 'List Buckets',
    code: `// src/operations/bucketOperations.ts

export async function getBucketsFromMSP(): Promise<Bucket[]> {
  const mspClient = getMspClient();

  // Fetch all buckets owned by the authenticated user
  const buckets = await mspClient.buckets.listBuckets();

  return buckets;
}

export async function getBucket(
  bucketId: string
): Promise<Bucket> {
  const mspClient = getMspClient();

  const bucket = await mspClient.buckets.getBucket(bucketId);

  return bucket;
}`,
  },
  {
    id: 'createBucket',
    title: 'Create Bucket',
    code: `// src/operations/bucketOperations.ts

export async function createBucket(
  bucketName: string,
  isPrivate: boolean = false
): Promise<{ bucketId: string; txReceipt: TransactionReceipt }> {
  const storageHubClient = getStorageHubClient();
  const address = getConnectedAddress();

  const { mspId } = await getMspInfo();
  const valuePropId = await getValueProps();

  // Deterministically derive bucket ID from owner address + name
  const bucketId = await storageHubClient.deriveBucketId(
    address,
    bucketName
  );

  const gasTxOpts = await buildGasTxOpts();

  // Create bucket on-chain with the chosen MSP and pricing terms
  const txHash = await storageHubClient.createBucket(
    mspId,
    bucketName,
    isPrivate,
    valuePropId,
    gasTxOpts
  );

  const txReceipt = await publicClient
    .waitForTransactionReceipt({ hash: txHash });

  return { bucketId, txReceipt };
}`,
  },
  {
    id: 'deleteBucket',
    title: 'Delete Bucket',
    code: `// src/operations/bucketOperations.ts

export async function deleteBucket(
  bucketId: string
): Promise<boolean> {
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();

  const gasTxOpts = await buildGasTxOpts();

  // Note: bucket must be empty before deletion
  const txHash = await storageHubClient.deleteBucket(
    bucketId,
    gasTxOpts
  );

  const receipt = await publicClient
    .waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('Bucket deletion failed (bucket must be empty)');
  }

  return true;
}`,
  },
];

export const fileSnippets: CodeSnippet[] = [
  {
    id: 'uploadFile',
    title: 'Upload File',
    code: `// src/operations/fileOperations.ts

export async function uploadFile(
  bucketId: string,
  file: File
): Promise<{ fileKey: string; uploadReceipt: unknown }> {
  const fileBuffer = await file.arrayBuffer();

  // FileManager handles chunking and hashing
  const fileManager = new FileManager({
    size: file.size,
    stream: () => new ReadableStream({ ... }),
  });

  // Compute Merkle root hash — uniquely identifies the file content
  const fingerprint = await fileManager.getFingerprint();

  const { mspId, multiaddresses } = await getMspInfo();

  // Extract libp2p peer IDs from multiaddresses
  const peerIds = multiaddresses
    .map(addr => addr.split('/p2p/').pop());

  // Register file on-chain and assign MSP to store it
  const txHash = await storageHubClient.issueStorageRequest(
    bucketId, file.name, fingerprint.toHex(),
    BigInt(file.size), mspId, peerIds,
    ReplicationLevel.Custom, 1, gasTxOpts
  );

  // Derive unique file key from owner + bucket + filename
  const fileKey = await fileManager.computeFileKey(
    owner, bucketIdH256, file.name
  );

  // Upload file data to MSP (verified against on-chain fingerprint)
  const uploadReceipt = await mspClient.files.uploadFile(
    bucketId, fileKey.toHex(), fileBlob,
    address, file.name
  );

  return { fileKey: fileKey.toHex(), uploadReceipt };
}`,
  },
  {
    id: 'listFiles',
    title: 'List Files',
    code: `// src/operations/fileOperations.ts

export async function getBucketFilesFromMSP(
  bucketId: string
): Promise<FileListResponse> {
  const mspClient = getMspClient();

  // Returns hierarchical structure with folders and files
  const files = await mspClient.buckets.getFiles(bucketId);

  return files;
}

export async function getFileInfo(
  bucketId: string,
  fileKey: string
): Promise<StorageFileInfo> {
  const mspClient = getMspClient();

  const fileInfo = await mspClient.files.getFileInfo(
    bucketId,
    fileKey
  );

  return fileInfo;
}`,
  },
  {
    id: 'deleteFile',
    title: 'Delete File',
    code: `// src/operations/fileOperations.ts

export async function requestDeleteFile(
  bucketId: string,
  fileKey: string
): Promise<boolean> {
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();
  const mspClient = getMspClient();

  // Fetch file metadata (needed for deletion tx)
  const fileInfo = await mspClient.files.getFileInfo(
    bucketId,
    fileKey
  );

  const gasTxOpts = await buildGasTxOpts();

  // Submit deletion request on-chain
  const txHash = await storageHubClient.requestDeleteFile(
    fileInfo,
    gasTxOpts
  );

  const receipt = await publicClient
    .waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('File deletion failed');
  }

  return true;
}`,
  },
  {
    id: 'downloadFile',
    title: 'Download File',
    code: `// src/operations/fileOperations.ts

export async function downloadFile(
  fileKey: string
): Promise<Blob> {
  const mspClient = getMspClient();

  // Returns a ReadableStream for memory-efficient large file handling
  const downloadResponse = await mspClient.files.downloadFile(
    fileKey
  );

  if (downloadResponse.status !== 200) {
    throw new Error(
      \`Download failed: \${downloadResponse.status}\`
    );
  }

  // Convert stream to Blob for browser download
  const response = new Response(downloadResponse.stream);
  const blob = await response.blob();

  const contentType =
    downloadResponse.contentType || 'application/octet-stream';

  return new Blob([blob], { type: contentType });
}`,
  },
];
