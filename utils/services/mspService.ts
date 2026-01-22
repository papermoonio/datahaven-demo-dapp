import { MspClient } from '@storagehub-sdk/msp-client';
import type { HealthStatus, InfoResponse, UserInfo, ValueProp } from '@storagehub-sdk/msp-client';
import type { HttpClientConfig } from '@storagehub-sdk/core';
import { getConnectedAddress, getWalletClient } from './clientService';
import { NETWORKS } from '../config/networks';

// State
let mspClientInstance: MspClient | null = null;
let sessionToken: string | undefined = undefined;
let authenticatedUserProfile: UserInfo | null = null;

// Session provider for authenticated requests
const sessionProvider = async () => {
  const address = getConnectedAddress();
  return sessionToken && address
    ? ({ token: sessionToken, user: { address } } as const)
    : undefined;
};

// Connect to MSP
export async function connectToMsp(): Promise<MspClient> {
  if (mspClientInstance) {
    return mspClientInstance;
  }

  const httpCfg: HttpClientConfig = { baseUrl: NETWORKS.testnet.mspUrl };
  mspClientInstance = await MspClient.connect(httpCfg, sessionProvider);
  return mspClientInstance;
}

// Get MSP client instance
export function getMspClient(): MspClient {
  if (!mspClientInstance) {
    throw new Error('MSP client not connected. Please connect to MSP first.');
  }
  return mspClientInstance;
}

// Check if MSP is connected
export function isMspConnected(): boolean {
  return mspClientInstance !== null;
}

// Get MSP health status
export async function getMspHealth(): Promise<HealthStatus> {
  const client = getMspClient();
  const health = await client.info.getHealth();
  return health;
}

// Get MSP information
export async function getMspInfo(): Promise<InfoResponse> {
  const client = getMspClient();
  const info = await client.info.getInfo();
  return info;
}

// Authenticate user via SIWE
export async function authenticateUser(): Promise<UserInfo> {
  const client = getMspClient();
  const walletClient = getWalletClient();

  // In development domain and uri can be arbitrary placeholders,
  // but in production they must match your actual frontend origin.
  const domain = window.location.hostname || 'localhost';
  const uri = window.location.origin || 'http://localhost';

  const siweSession = await client.auth.SIWE(walletClient, domain, uri);
  sessionToken = (siweSession as { token: string }).token;

  const profile: UserInfo = await client.auth.getProfile();
  authenticatedUserProfile = profile;
  return profile;
}

// Get value propositions
export async function getValueProps(): Promise<`0x${string}`> {
  const client = getMspClient();
  const valueProps: ValueProp[] = await client.info.getValuePropositions();

  if (!Array.isArray(valueProps) || valueProps.length === 0) {
    throw new Error('No value propositions available from MSP');
  }

  // For simplicity, select the first value proposition
  const valuePropId = valueProps[0].id as `0x${string}`;
  return valuePropId;
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return sessionToken !== undefined && authenticatedUserProfile !== null;
}

// Get authenticated user profile
export function getUserProfile(): UserInfo | null {
  return authenticatedUserProfile;
}

// Reset MSP connection
export function disconnectMsp() {
  mspClientInstance = null;
  sessionToken = undefined;
  authenticatedUserProfile = null;
}
