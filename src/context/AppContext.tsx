import { createContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { initWasm } from '@storagehub-sdk/core';
import {
  connectWallet as connectWalletService,
  disconnectWallet,
  getConnectedAddress,
  initPolkadotApi,
  restoreWalletConnection,
} from '../services/clientService';
import {
  connectToMsp,
  getMspInfo,
  getMspHealth,
  authenticateUser as authUser,
  disconnectMsp,
  isAuthenticated as checkAuth,
  getUserProfile,
  clearSession,
  isAuthError,
} from '../services/mspService';
import type { AppState, InfoResponse, UserInfo, HealthStatus } from '../types';

export interface AppContextType extends AppState {
  connectWallet: () => Promise<void>;
  disconnect: () => void;
  connectMsp: () => Promise<void>;
  authenticateUser: () => Promise<void>;
  getMspHealthStatus: () => Promise<HealthStatus>;
  handleAuthError: (error: unknown) => boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export const AppContext = createContext<AppContextType | null>(null);

let wasmInitialized = false;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    isWalletConnected: false,
    isMspConnected: false,
    isAuthenticated: false,
    address: null,
    mspInfo: null,
    userProfile: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const connectWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!wasmInitialized) {
        await initWasm();
        wasmInitialized = true;
      }

      const address = await connectWalletService();
      await initPolkadotApi();

      setState((prev) => ({
        ...prev,
        isWalletConnected: true,
        address,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet();
    disconnectMsp();
    setState({
      isWalletConnected: false,
      isMspConnected: false,
      isAuthenticated: false,
      address: null,
      mspInfo: null,
      userProfile: null,
    });
  }, []);

  const connectMsp = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await connectToMsp();
      const mspInfo: InfoResponse = await getMspInfo();

      setState((prev) => ({
        ...prev,
        isMspConnected: true,
        mspInfo,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to MSP';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const authenticateUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profile: UserInfo = await authUser();

      setState((prev) => ({
        ...prev,
        isAuthenticated: true,
        userProfile: profile,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to authenticate';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getMspHealthStatus = useCallback(async (): Promise<HealthStatus> => {
    try {
      return await getMspHealth();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get MSP health';
      setError(message);
      throw err;
    }
  }, []);

  const handleAuthError = useCallback((error: unknown): boolean => {
    if (isAuthError(error)) {
      clearSession();
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        userProfile: null,
      }));
      setError('Session expired. Please re-authenticate.');
      return true;
    }
    return false;
  }, []);

  // Restore session from storage on mount
  useEffect(() => {
    const restoreSession = async () => {
      const persistedAddress = getConnectedAddress();
      if (!persistedAddress) {
        return;
      }

      setIsLoading(true);
      try {
        if (!wasmInitialized) {
          await initWasm();
          wasmInitialized = true;
        }

        const restoredAddress = await restoreWalletConnection();
        if (!restoredAddress) {
          return;
        }

        await initPolkadotApi();

        const isAuth = checkAuth();
        const profile = getUserProfile();

        if (isAuth) {
          await connectToMsp();
          const mspInfo: InfoResponse = await getMspInfo();

          setState({
            isWalletConnected: true,
            isMspConnected: true,
            isAuthenticated: true,
            address: restoredAddress,
            mspInfo,
            userProfile: profile,
          });
        } else {
          setState((prev) => ({
            ...prev,
            isWalletConnected: true,
            address: restoredAddress,
          }));
        }
      } catch {
        // Failed to restore session, start fresh
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const value: AppContextType = {
    ...state,
    connectWallet,
    disconnect,
    connectMsp,
    authenticateUser,
    getMspHealthStatus,
    handleAuthError,
    isLoading,
    error,
    clearError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
