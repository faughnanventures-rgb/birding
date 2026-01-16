import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers for same-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  // Cache the response for 1 hour to reduce function calls
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  // Return the Maps API key from environment variable
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!mapsApiKey) {
    console.error('GOOGLE_MAPS_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Maps API key not configured' });
  }

  res.status(200).json({
    mapsApiKey: mapsApiKey
  });
}
