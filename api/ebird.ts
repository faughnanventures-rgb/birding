import type { VercelRequest, VercelResponse } from '@vercel/node';

// Allowed eBird API paths (security whitelist)
const ALLOWED_PATHS = [
  '/data/obs/',
  '/ref/hotspot/',
  '/ref/region/',
  '/product/spplist/',
  '/product/checklist/',
  '/product/top100/',
  '/ref/taxonomy/'
];

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only GET allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get endpoint from query string
  const { endpoint } = req.query;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({
      error: 'Missing endpoint parameter',
      example: '/api/ebird?endpoint=/data/obs/US-MA/recent'
    });
  }

  // Get API key from environment variable
  const apiKey = process.env.EBIRD_API_KEY;

  if (!apiKey) {
    console.error('EBIRD_API_KEY not set in environment variables');
    return res.status(500).json({
      error: 'Server configuration error',
      hint: 'EBIRD_API_KEY environment variable is not set'
    });
  }

  // Decode the endpoint
  let decodedEndpoint: string;
  try {
    decodedEndpoint = decodeURIComponent(endpoint);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid endpoint encoding' });
  }

  // Security: Only allow certain eBird API paths
  const isAllowed = ALLOWED_PATHS.some(path => decodedEndpoint.startsWith(path));
  if (!isAllowed) {
    return res.status(403).json({
      error: 'Endpoint not allowed',
      allowed: ALLOWED_PATHS
    });
  }

  // Build eBird URL
  const ebirdUrl = `https://api.ebird.org/v2${decodedEndpoint}`;

  try {
    console.log('Proxying to:', ebirdUrl);

    const response = await fetch(ebirdUrl, {
      method: 'GET',
      headers: {
        'X-eBirdApiToken': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('eBird API error:', response.status, errorText);
      return res.status(response.status).json({
        error: `eBird API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from eBird',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
