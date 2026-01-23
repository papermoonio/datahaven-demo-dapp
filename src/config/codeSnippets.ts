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
  // Get the injected Ethereum provider (MetaMask, etc.)
  const provider = getEthereumProvider();

  // Prompt the user to unlock their wallet and grant access
  const accounts = await provider.request({
    method: 'eth_requestAccounts',
  });

  // Ensure the wallet is on the correct chain (StorageHub testnet)
  await switchToCorrectNetwork(provider);

  // Store the first connected account address
  connectedAddress = accounts[0] as \`0x\${string}\`;

  // Create a viem WalletClient for signing transactions
  // - chain: the target blockchain configuration
  // - account: the user's connected address
  // - transport: uses the browser wallet as the transport layer
  walletClientInstance = createWalletClient({
    chain,
    account: connectedAddress,
    transport: custom(provider),
  });

  // Initialize the StorageHub SDK client for on-chain operations
  // - rpcUrl: the blockchain RPC endpoint
  // - walletClient: used for signing transactions
  // - filesystemContractAddress: the on-chain storage contract
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

// Session provider callback — called on every authenticated request
// Returns the current session token + user address, or undefined if not authenticated
const sessionProvider = async () => {
  const address = getConnectedAddress();
  return sessionToken && address
    ? { token: sessionToken, user: { address } }
    : undefined;
};

// Connect to the MSP (Main Storage Provider) HTTP API
export async function connectToMsp(): Promise<MspClient> {
  // Return existing instance if already connected (singleton pattern)
  if (mspClientInstance) {
    return mspClientInstance;
  }

  // Configure the HTTP connection to the MSP server
  const httpCfg: HttpClientConfig = {
    baseUrl: NETWORKS.testnet.mspUrl,
  };

  // Establish connection — sessionProvider is called on each request
  // to attach auth credentials automatically
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
  // Get the connected MSP client and wallet client instances
  const client = getMspClient();
  const walletClient = getWalletClient();

  // SIWE requires the current domain and URI for the signed message
  const domain = window.location.hostname;
  const uri = window.location.origin;

  // Perform Sign-In With Ethereum (EIP-4361):
  // 1. MSP generates a challenge message
  // 2. User signs it with their wallet (MetaMask popup)
  // 3. MSP verifies the signature and returns a session token
  const siweSession = await client.auth.SIWE(
    walletClient,
    domain,
    uri
  );

  // Store the session token for subsequent authenticated requests
  sessionToken = siweSession.token;

  // Fetch the authenticated user's profile from the MSP
  const profile = await client.auth.getProfile();
  authenticatedUserProfile = profile;

  // Persist session data to sessionStorage so it survives page refreshes
  // (cleared when the browser tab is closed)
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
  // Get the authenticated MSP client instance
  const mspClient = getMspClient();

  // Fetch all buckets belonging to the authenticated user
  const buckets = await mspClient.buckets.listBuckets();

  return buckets;
}

// Get a single bucket's detailed info by its ID
export async function getBucket(
  bucketId: string
): Promise<Bucket> {
  const mspClient = getMspClient();

  // Query the MSP for a specific bucket's metadata
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
  // Get SDK clients for on-chain operations
  const storageHubClient = getStorageHubClient();
  const address = getConnectedAddress();

  // Fetch MSP identity and its value proposition (pricing/terms)
  const { mspId } = await getMspInfo();
  const valuePropId = await getValueProps();

  // Deterministically derive the bucket ID from the owner's address + name
  // This ensures the same user+name always produces the same bucket ID
  const bucketId = await storageHubClient.deriveBucketId(
    address,
    bucketName
  );

  // Build EIP-1559 gas parameters (maxFeePerGas, maxPriorityFeePerGas)
  const gasTxOpts = await buildGasTxOpts();

  // Submit the createBucket transaction to the StorageHub blockchain
  // - mspId: which storage provider will store the data
  // - isPrivate: whether the bucket contents are encrypted
  // - valuePropId: the agreed pricing terms with the MSP
  const txHash = await storageHubClient.createBucket(
    mspId,
    bucketName,
    isPrivate,
    valuePropId,
    gasTxOpts
  );

  // Wait for the transaction to be included in a block
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
  // Get SDK clients for on-chain operations
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();

  // Build EIP-1559 gas parameters for the transaction
  const gasTxOpts = await buildGasTxOpts();

  // Submit the deleteBucket transaction on-chain
  // Note: the bucket must be empty (no files) before deletion
  const txHash = await storageHubClient.deleteBucket(
    bucketId,
    gasTxOpts
  );

  // Wait for the transaction to be mined and get the receipt
  const receipt = await publicClient
    .waitForTransactionReceipt({ hash: txHash });

  // Verify the transaction succeeded (revert = 'reverted')
  if (receipt.status !== 'success') {
    throw new Error('Bucket deletion failed (make sure that the bucket is empty prior to deletion)');
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
  // Read the browser File object into an ArrayBuffer for processing
  const fileBuffer = await file.arrayBuffer();

  // Create a FileManager instance that handles chunking and hashing
  // The stream factory allows the SDK to read the file multiple times
  const fileManager = new FileManager({
    size: file.size,
    stream: () => new ReadableStream({ ... }),
  });

  // Compute the file's fingerprint (Merkle root hash of all chunks)
  // This uniquely identifies the file content on-chain
  const fingerprint = await fileManager.getFingerprint();

  // Get the MSP's identity and network addresses for P2P upload
  const { mspId, multiaddresses } = await getMspInfo();

  // Extract libp2p peer IDs from multiaddresses (e.g., "/ip4/.../p2p/<peerId>")
  const peerIds = multiaddresses
    .map(addr => addr.split('/p2p/').pop());

  // Submit a storage request transaction on-chain
  // This registers the file metadata and assigns the MSP to store it
  // - fingerprint: proves file content without uploading to chain
  // - BigInt(file.size): file size in bytes
  // - ReplicationLevel: how many copies to maintain
  const txHash = await storageHubClient.issueStorageRequest(
    bucketId, file.name, fingerprint.toHex(),
    BigInt(file.size), mspId, peerIds,
    ReplicationLevel.Custom, 1, gasTxOpts
  );

  // Derive the unique file key from owner address + bucket + filename
  // This key is used to reference the file in all future operations
  const fileKey = await fileManager.computeFileKey(
    owner, bucketIdH256, file.name
  );

  // Upload the actual file data to the MSP via HTTP
  // The MSP verifies the data matches the on-chain fingerprint
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
  // Get the authenticated MSP client
  const mspClient = getMspClient();

  // Fetch the file tree for a bucket from the MSP
  // Returns a hierarchical structure with folders and files
  const files = await mspClient.buckets.getFiles(bucketId);

  return files;
}

// Get detailed metadata for a single file by its key
export async function getFileInfo(
  bucketId: string,
  fileKey: string
): Promise<StorageFileInfo> {
  const mspClient = getMspClient();

  // Query the MSP for file metadata (size, status, fingerprint, etc.)
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
  // Get SDK clients for on-chain and off-chain operations
  const storageHubClient = getStorageHubClient();
  const publicClient = getPublicClient();
  const mspClient = getMspClient();

  // Fetch the file's current metadata from the MSP
  // This is needed to construct the deletion transaction
  const fileInfo = await mspClient.files.getFileInfo(
    bucketId,
    fileKey
  );

  // Build EIP-1559 gas parameters for the transaction
  const gasTxOpts = await buildGasTxOpts();

  // Submit a file deletion request on-chain
  // The MSP will process this and remove the file from storage
  const txHash = await storageHubClient.requestDeleteFile(
    fileInfo,
    gasTxOpts
  );

  // Wait for the transaction to be included in a block
  const receipt = await publicClient
    .waitForTransactionReceipt({ hash: txHash });

  // Verify the deletion transaction succeeded
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
  // Get the authenticated MSP client
  const mspClient = getMspClient();

  // Request the file data from the MSP by its unique key
  // Returns a ReadableStream for efficient memory usage with large files
  const downloadResponse = await mspClient.files.downloadFile(
    fileKey
  );

  // Check that the MSP returned a successful response
  if (downloadResponse.status !== 200) {
    throw new Error(
      \`Download failed: \${downloadResponse.status}\`
    );
  }

  // Convert the ReadableStream into a Blob for browser download
  // The Response API handles stream consumption automatically
  const response = new Response(downloadResponse.stream);
  const blob = await response.blob();

  // Use the content type from the response, or fall back to binary
  const contentType =
    downloadResponse.contentType || 'application/octet-stream';

  // Return a properly typed Blob that the browser can save
  return new Blob([blob], { type: contentType });
}`,
  },
];
