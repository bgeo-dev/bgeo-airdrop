'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';;
import CryptoJS from 'crypto-js';

interface WalletContextType {
  encryptedPrivateKey: string | null;
  address: string | null;
  balance: string;
  isConnected: boolean;
  connectWallet: (mnemonic: string, password: string) => Promise<void>;
  disconnectWallet: () => void;
  updateBalance: () => Promise<void>;
  getDecryptedPrivateKey: (password: string) => string | null;
  getBalance: () => Promise<string>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState('0');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem('wallet-data');
    if (savedData) {
      const { encryptedPrivateKey, address } = JSON.parse(savedData);
      setEncryptedPrivateKey(encryptedPrivateKey);
      setAddress(address);
      setIsConnected(true);
    }
  }, []);

  const getBalance = useCallback(async (): Promise<string> => {
    if (!address) return '0';
    try {
      const response = await fetch(`/api/balance/${address}`);
      const data = await response.json();
      return data.balance;
    } catch (err) {
      console.error('Balance fetching failed', err);
      return '0';
    }
  }, [address]);

  const updateBalance = useCallback(async () => {
    const newBalance = await getBalance();
    setBalance(newBalance);
  }, [getBalance]);

  const connectWallet = useCallback(async (mnemonic: string, password: string) => {
    try {
      let sdk;
      if (typeof window !== 'undefined') {
        const { BgeoSDK } = await import('@bgeo/sdk');
        sdk = new BgeoSDK({ apiKey: process.env.NEXT_PUBLIC_BGEO_API_KEY || '' });
        const wallet = sdk.createWalletFromMnemonic(mnemonic);
        const encryptedPrivateKey = CryptoJS.AES.encrypt(
          wallet.privateKey || '', // Add null check by providing empty string as fallback
          password
        ).toString();

        setEncryptedPrivateKey(encryptedPrivateKey);
        setAddress(wallet.address);
        setIsConnected(true);

        localStorage.setItem('wallet-data', JSON.stringify({
          encryptedPrivateKey,
          address: wallet.address
        }));

        await updateBalance();
      }
    } catch (err) {
      console.error('connectWallet error', err);
      throw new Error('Wallet connection failed');
    }
  }, [updateBalance]);

  const getDecryptedPrivateKey = useCallback((password: string): string | null => {
    try {
      if (!encryptedPrivateKey) return null;
      const bytes = CryptoJS.AES.decrypt(encryptedPrivateKey, password);
      const privateKey = bytes.toString(CryptoJS.enc.Utf8);
      return privateKey;
    } catch (err) {
      console.error('Failed to decrypt private key:', err);
      return null;
    }
  }, [encryptedPrivateKey]);

  const disconnectWallet = useCallback(() => {
    setEncryptedPrivateKey(null);
    setAddress(null);
    setBalance('0');
    setIsConnected(false);
    localStorage.removeItem('wallet-data');
  }, []);

  return (
    <WalletContext.Provider value={{
      encryptedPrivateKey,
      address,
      balance,
      isConnected,
      connectWallet,
      disconnectWallet,
      updateBalance,
      getDecryptedPrivateKey,
      getBalance
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}