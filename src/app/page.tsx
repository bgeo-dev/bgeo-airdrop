'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWallet } from '@/contexts/WalletContext';

import ConnectWalletDialog from '@/components/ConnectWalletDialog';
import CheckPasswordDialog from '@/components/CheckPasswordDialog';

import axios from 'axios';

interface AirdropResult {
  address: string;
  amount: string;
  txHash?: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

interface UTXO {
  txid: string;
  vout: number;
  amount: string;
  // 필요한 다른 UTXO 필드들
}

interface TransactionResult {
  status: 'success' | 'failed';
  txHash?: string;
  message?: string;
}

interface AirdropTransaction {
  txHash: string;
  timestamp: number;
  recipients: {
    address: string;
    amount: string;
    status: 'pending' | 'success' | 'failed';
  }[];
  status: 'pending' | 'success' | 'failed';
}

export default function AirdropPage() {
  const [recipients, setRecipients] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AirdropTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { address, balance, isConnected, updateBalance, disconnectWallet, getDecryptedPrivateKey, getBalance } = useWallet();

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  useEffect(() => {
    if (isConnected) {
      updateBalance();
    }
  }, [isConnected]);

  const handleAirdropClick = () => {
    if (!isConnected) {
      setError('Please connect your wallet first.');
      return;
    }
    setIsPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = async (password: string) => {
    try {
      const privateKey = getDecryptedPrivateKey(password);
      if (!privateKey) {
        throw new Error('Invalid password.');
      }

      setIsPasswordDialogOpen(false);
      handleAirdrop(privateKey);
    } catch (error) {
      setError('Invalid password. Please try again.');
    }
  };

  const processRecipients = (input: string) => {
    const lines = input.split('\n').filter(line => line.trim());
    const uniqueRecipients = new Map(); // Use Map for unique recipients

    lines.forEach(line => {
      const [address, amount] = line.split(',').map(s => s.trim());
      if (address && amount) {
        // Sum amounts for duplicate addresses
        if (uniqueRecipients.has(address)) {
          const currentAmount = parseFloat(uniqueRecipients.get(address));
          const newAmount = currentAmount + parseFloat(amount);
          uniqueRecipients.set(address, newAmount.toString());
        } else {
          uniqueRecipients.set(address, amount);
        }
      }
    });

    return Array.from(uniqueRecipients.entries()).map(([address, amount]) => ({
      address,
      amount: amount.toString()
    }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setRecipients(text);
      };
      reader.readAsText(file);
    }
  };

  const getUtxos = async (address: string) => {
    try {
      const response = await axios.get(`/api/utxo/${address}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching UTXOs:', error);
      throw new Error('Failed to fetch UTXOs');
    }
  };

  const callRpcGateway = async (method: string, params: any[]) => {
    try {
      const response = await axios.post('/api/gateway', {
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(`Gateway Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      console.error('Gateway API error:', error);
      throw error;
    }
  };

  const sendTransaction = async (fromPrivateKey: string, toAddress: string, amount: string) => {
    try {
      if (!address) {
        throw new Error('Sender address is not initialized');
      }

      const response = await axios.post('/api/transaction', {
        fromAddress: address,
        toAddress,
        amount,
        privateKey: fromPrivateKey
      });

      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.error);
      }

      return data.txHash;
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  };

  const handleAirdrop = async (privateKey: string) => {
    if (!address || !recipients) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);
      setResults([]);
      setError(null);

      const recipientList = processRecipients(recipients);
      const initialBalance = balance;

      console.log('initial balance', initialBalance);

      try {
        const response = await axios.post('/api/transaction', {
          fromAddress: address,
          recipients: recipientList,
          privateKey
        });

        const { txHash } = response.data;
        
        // 초기 트랜잭션 상태 설정
        const transaction: AirdropTransaction = {
          txHash,
          timestamp: Date.now(),
          recipients: recipientList.map(({ address, amount }) => ({
            address,
            amount,
            status: 'pending'
          })),
          status: 'pending'
        };

        setResults([transaction]);
        
        // 밸런스 변경 모니터링
        let attempts = 0;
        const maxAttempts = 300; // 5분 타임아웃 (300초)
        const checkBalanceChange = async () => {
          const currentBalance = await getBalance();
          console.log('current balance:', currentBalance, 'initial balance:', initialBalance);
          attempts++;
          
          if (currentBalance !== initialBalance) {
            setResults(prev => prev.map(tx => ({
              ...tx,
              status: 'success',
              recipients: tx.recipients.map(recipient => ({
                ...recipient,
                status: 'success'
              }))
            })));
            setProgress(100);
            setIsProcessing(false);
            await updateBalance();
          } else if (attempts >= maxAttempts) {
            // 타임아웃 시 상태 업데이트
            setResults(prev => prev.map(tx => ({
              ...tx,
              status: 'pending',  // failed 대신 pending으로 변경
              recipients: tx.recipients.map(recipient => ({
                ...recipient,
                status: 'pending'
              }))
            })));
            setIsProcessing(false);
            throw new Error("Transaction verification timeout. Please check the transaction status on the blockchain explorer.");
          } else {
            setProgress((attempts / maxAttempts) * 100);
            setTimeout(checkBalanceChange, 1000);
          }
        };

        checkBalanceChange();

      } catch (error) {
        setResults(prev => prev.map(tx => ({
          ...tx,
          status: 'failed',
          recipients: tx.recipients.map(recipient => ({
            ...recipient,
            status: 'failed'
          }))
        })));
        throw error;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>BGEO Airdrop</CardTitle>
          {isConnected ? (
            <div className="text-right space-y-2">
              <div>
                <p className="font-medium text-sm">{address}</p>
                <p className="text-sm text-gray-500">{balance} BGEO</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  disconnectWallet();  // WalletContext에서 제공하는 함수 사용
                  setResults([]);      // 결과 초기화
                  setError(null);      // 에러 초기화
                  setRecipients('');   // 수신자 목록 초기화
                }}
                size="sm"
              >
                Disconnect Wallet
              </Button>
            </div>
          ) : (
            <Button onClick={() => setIsDialogOpen(true)}>
              Connect Wallet
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
          <Input
              placeholder="From Address"
              value={address || ''}
              readOnly
              disabled
              className="bg-gray-50"
            />
            <div className="space-y-2">
              <Textarea
                placeholder="Recipient List (Format: Address, Amount)"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                rows={10}
                disabled={isProcessing}
              />
              <div className="text-sm text-gray-500">
                Upload CSV File:
                <Input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="mt-2"
                />
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center">{Math.round(progress)}% Completed</p>
            </div>
          )}

          <Button 
            onClick={handleAirdropClick} 
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? 'Processing...' : 'Start Airdrop'}
          </Button>

          {results.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-full divide-y">
                  {results.map((transaction) => (
                    <div key={transaction.txHash} className="bg-white">
                      <div className="px-4 py-3 bg-gray-50 flex justify-between items-center">
                        <div className="space-y-1">
                          <a 
                            href={`https://scan.bgeo.app/tx/${transaction.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-mono"
                          >
                            {transaction.txHash}
                          </a>
                          <div className="text-sm text-gray-500">
                            {new Date(transaction.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className={`font-medium ${
                          transaction.status === 'success' ? 'text-green-600' : 
                          transaction.status === 'failed' ? 'text-red-600' : 
                          'text-yellow-600'
                        }`}>
                          {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                        </div>
                      </div>
                      <div className="divide-y">
                        {transaction.recipients.map((recipient, index) => (
                          <div key={index} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
                            <div className="font-mono truncate">{recipient.address}</div>
                            <div>{recipient.amount} BGEO</div>
                            <div className={
                              recipient.status === 'success' ? 'text-green-600' : 
                              recipient.status === 'failed' ? 'text-red-600' : 
                              'text-yellow-600'
                            }>
                              {recipient.status.charAt(0).toUpperCase() + recipient.status.slice(1)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConnectWalletDialog 
        open={isDialogOpen} 
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open && isConnected) {
            updateBalance(); // 지갑 연결 다이얼로그가 닫힐 때 잔고 업데이트
          }
        }}
      />

      <CheckPasswordDialog 
        open={isPasswordDialogOpen} 
        onOpenChange={setIsPasswordDialogOpen}
        onConfirm={handlePasswordConfirm}
      />
    </div>
  );
}