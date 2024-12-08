import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const { address } = req.query;

    try {
        const response = await axios.get(
            `${process.env.BGEO_API_URL}/utxo/${address}`
        );
        res.status(200).json(response.data);
    } catch (error) {
        console.error('UTXO fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch UTXOs' });
    }
} 