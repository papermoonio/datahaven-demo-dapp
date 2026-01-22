import { defineChain, createPublicClient, createWalletClient, http, custom } from 'viem';
import type { Chain, EIP1193Provider } from 'viem';
import { StorageHubClient } from '@storagehub-sdk/core';
import type { EvmWriteOptions } from '@storagehub-sdk/core';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { types } from '@storagehub/types-bundle';
import { NETWORKS } from '../../src/config/networks';

// Storage key
const CONNECTED_ADDRESS_KEY = 'datahaven_connected_address';

// Define the chain configuration
export const chain: Chain = defineChain({
  id: NETWORKS.testnet.id,
  name: NETWORKS.testnet.name,
  nativeCurrency: NETWORKS.testnet.nativeCurrency,
  rpcUrls: { default: { http: [NETWORKS.testnet.rpcUrl] } },
});

// State for connected clients
let walletClientInstance: ReturnType<typeof createWalletClient> | null = null;
let publicClientInstance: ReturnType<typeof createPublicClient> | null = null;
let storageHubClientInstance: StorageHubClient | null = null;
let polkadotApiInstance: ApiPromise | null = null;
let connectedAddress: `0x${string}` | null = null;

// Initialize address from storage
function initFromStorage() {
  if (typeof window === 'undefined') return;

  const storedAddress = sessionStorage.getItem(CONNECTED_ADDRESS_KEY);
  if (storedAddress) {
    connectedAddress = storedAddress as `0x${string}`;
  }
}

// Initialize on module load
initFromStorage();

// Get ethereum provider from window
function getEthereumProvider(): EIP1193Provider {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No Ethereum wallet found. Please install MetaMask or another Web3 wallet.');
  }
  return window.ethereum as EIP1193Provider;
}

// Create public client (read-only, always available)
export function getPublicClient() {
  if (!publicClientInstance) {
    publicClientInstance = createPublicClient({
      chain,
      transport: http(NETWORKS.testnet.rpcUrl),
    });
  }
  return publicClientInstance;
}

// Switch wallet to the correct network
async function switchToCorrectNetwork(provider: EIP1193Provider): Promise<void> {
  const chainIdHex = NETWORKS.testnet.idHex;

  try {
    // Try to switch to the network
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (switchError: unknown) {
    // Error code 4902 means the chain hasn't been added to the wallet
    const error = switchError as { code?: number };
    if (error.code === 4902) {
      // Add the network to the wallet
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: NETWORKS.testnet.name,
            nativeCurrency: NETWORKS.testnet.nativeCurrency,
            rpcUrls: [NETWORKS.testnet.rpcUrl],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

// Connect wallet using browser extension (MetaMask, etc.)
export async function connectWallet(): Promise<`0x${string}`> {
  const provider = getEthereumProvider();

  // Request account access
  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts found. Please connect your wallet.');
  }

  // Switch to the correct network
  await switchToCorrectNetwork(provider);

  connectedAddress = accounts[0] as `0x${string}`;

  // Create wallet client with browser wallet
  walletClientInstance = createWalletClient({
    chain,
    account: connectedAddress,
    transport: custom(provider),
  });

  // Create StorageHub client
  storageHubClientInstance = new StorageHubClient({
    rpcUrl: NETWORKS.testnet.rpcUrl,
    chain: chain,
    walletClient: walletClientInstance,
    filesystemContractAddress: '0x0000000000000000000000000000000000000404' as `0x${string}`,
  });

  // Persist to session storage
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(CONNECTED_ADDRESS_KEY, connectedAddress);
  }

  return connectedAddress;
}

// Initialize Polkadot API for chain queries
export async function initPolkadotApi(): Promise<ApiPromise> {
  if (polkadotApiInstance) {
    return polkadotApiInstance;
  }

  const provider = new WsProvider(NETWORKS.testnet.wsUrl);
  polkadotApiInstance = await ApiPromise.create({
    provider,
    typesBundle: types,
    noInitWarn: true,
  });

  return polkadotApiInstance;
}

// Getters for client instances
export function getWalletClient() {
  if (!walletClientInstance) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }
  return walletClientInstance;
}

export function getStorageHubClient() {
  if (!storageHubClientInstance) {
    throw new Error('StorageHub client not initialized. Please connect your wallet first.');
  }
  return storageHubClientInstance;
}

export function getPolkadotApi() {
  if (!polkadotApiInstance) {
    throw new Error('Polkadot API not initialized. Please initialize it first.');
  }
  return polkadotApiInstance;
}

export function getConnectedAddress() {
  return connectedAddress;
}

export function isWalletConnected() {
  return walletClientInstance !== null && connectedAddress !== null;
}

// Restore wallet connection from persisted state (call this on app init)
export async function restoreWalletConnection(): Promise<`0x${string}` | null> {
  // Check if we have a persisted address
  if (!connectedAddress) {
    return null;
  }

  try {
    const provider = getEthereumProvider();

    // Check if wallet is still connected by getting accounts (without prompting)
    const accounts = (await provider.request({
      method: 'eth_accounts',
    })) as string[];

    // Check if our persisted address is still among connected accounts
    const addressLower = connectedAddress.toLowerCase();
    const isStillConnected = accounts.some((acc) => acc.toLowerCase() === addressLower);

    if (!isStillConnected) {
      // Wallet is no longer connected, clear persisted state
      disconnectWallet();
      return null;
    }

    // Switch to the correct network
    await switchToCorrectNetwork(provider);

    // Re-establish wallet client
    walletClientInstance = createWalletClient({
      chain,
      account: connectedAddress,
      transport: custom(provider),
    });

    // Re-create StorageHub client
    storageHubClientInstance = new StorageHubClient({
      rpcUrl: NETWORKS.testnet.rpcUrl,
      chain: chain,
      walletClient: walletClientInstance,
      filesystemContractAddress: '0x0000000000000000000000000000000000000404' as `0x${string}`,
    });

    return connectedAddress;
  } catch {
    // Failed to restore, clear state
    disconnectWallet();
    return null;
  }
}

// Disconnect wallet
export function disconnectWallet() {
  walletClientInstance = null;
  storageHubClientInstance = null;
  connectedAddress = null;

  // Clear session storage
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(CONNECTED_ADDRESS_KEY);
  }
}

// Disconnect Polkadot API
export async function disconnectPolkadotApi() {
  if (polkadotApiInstance) {
    await polkadotApiInstance.disconnect();
    polkadotApiInstance = null;
  }
}

// Build gas transaction options based on current network conditions
export async function buildGasTxOpts(): Promise<EvmWriteOptions> {
  const publicClient = getPublicClient();
  const gas = BigInt('1500000');

  // EIP-1559 fees based on latest block
  const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
  const baseFeePerGas = latestBlock.baseFeePerGas;
  if (baseFeePerGas == null) {
    throw new Error('RPC did not return baseFeePerGas for the latest block. Cannot build EIP-1559 fees.');
  }

  const maxPriorityFeePerGas = BigInt('1500000000'); // 1.5 gwei
  const maxFeePerGas = baseFeePerGas * BigInt(2) + maxPriorityFeePerGas;

  return { gas, maxFeePerGas, maxPriorityFeePerGas };
}
