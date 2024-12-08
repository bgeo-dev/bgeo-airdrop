import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { method, params } = req.body;

    try {
        const response = await axios.post(
            process.env.BGEO_GATEWAY_URL || '',
            {
                method,
                params,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.API_KEY
                }
            }
        );

        if (response.data.error) {
            throw new Error(`Gateway Error: ${response.data.error.message}`);
        }

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Gateway API error:', error);
        res.status(500).json({ error: 'Gateway request failed' });
    }
} 