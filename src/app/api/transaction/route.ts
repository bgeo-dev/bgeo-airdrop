import { BgeoSDK } from '@bgeo/sdk';
import { NextResponse } from 'next/server';

interface Recipient {
    address: string;
    amount: string;
}

export async function POST(request: Request) {
    try {
        const { fromAddress, recipients, privateKey } = await request.json();

        const sdk = new BgeoSDK({ apiKey: process.env.BGEO_API_KEY || '' });
        console.log('from address', fromAddress);
        console.log('recipients', recipients);
        console.log('private key', privateKey);

        const txHash = await sdk.sendBatchTransaction(
            fromAddress,
            recipients,
            privateKey
        );

        return NextResponse.json({ success: true, txHash });
    } catch (error) {
        console.error('Transaction error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
} 