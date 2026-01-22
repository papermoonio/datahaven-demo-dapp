import { defineChain, createPublicClient, createWalletClient, http, custom } from 'viem';
import type { Chain, EIP1193Provider } from 'viem';
import { StorageHubClient } from '@storagehub-sdk/core';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { types } from '@storagehub/types-bundle';
import { NETWORKS } from '../config/networks';

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

// Connect wallet using browser extension (MetaMask, etc.)
export async function connectWallet(): Promise<`0x${string}`> {
  const provider = getEthereumProvider();

  // Request account access
  const accounts = await provider.request({
    method: 'eth_requestAccounts'
  }) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts found. Please connect your wallet.');
  }

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

// Disconnect wallet
export function disconnectWallet() {
  walletClientInstance = null;
  storageHubClientInstance = null;
  connectedAddress = null;
}

// Disconnect Polkadot API
export async function disconnectPolkadotApi() {
  if (polkadotApiInstance) {
    await polkadotApiInstance.disconnect();
    polkadotApiInstance = null;
  }
}
