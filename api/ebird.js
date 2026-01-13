// api/ebird.js
// Vercel Serverless Function to proxy eBird API requests
// This keeps the eBird API key secure on the server side

export default async function handler(req, res) {
  // Enable CORS for the frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { endpoint } = req.query;
  
  if (!endpoint) {
    return res.status(400).json({ 
      error: 'Missing endpoint parameter',
      usage: '/api/ebird?endpoint=/data/obs/geo/recent?lat=42&lng=-72'
    });
  }
  
  // Check for API key
  const apiKey = process.env.EBIRD_API_KEY;
  if (!apiKey) {
    console.error('EBIRD_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  // Decode and validate the endpoint
  let decodedEndpoint;
  try {
    decodedEndpoint = decodeURIComponent(endpoint);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid endpoint encoding' });
  }
  
  // Security: Only allow certain eBird API paths
  const allowedPaths = [
    '/data/obs/',      // Observations
    '/ref/hotspot/',   // Hotspots
    '/ref/region/',    // Regions
    '/product/spplist/', // Species lists
    '/product/checklist/', // Checklists
    '/product/top100/',  // Top 100
    '/ref/taxonomy/'   // Taxonomy
  ];
  
  const isAllowed = allowedPaths.some(path => decodedEndpoint.startsWith(path));
  if (!isAllowed) {
    return res.status(403).json({ 
      error: 'Endpoint not allowed',
      allowedPaths: allowedPaths
    });
  }
  
  // Build the full eBird API URL
  const ebirdUrl = `https://api.ebird.org/v2${decodedEndpoint}`;
  
  try {
    console.log(`Proxying request to: ${ebirdUrl}`);
    
    const response = await fetch(ebirdUrl, {
      method: 'GET',
      headers: {
        'X-eBirdApiToken': apiKey,
        'Accept': 'application/json'
      }
    });
    
    // Forward eBird's status code if it's an error
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`eBird API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `eBird API error: ${response.status}`,
        details: errorText
      });
    }
    
    const data = await response.json();
    
    // Cache successful responses for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('eBird API proxy error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from eBird API',
      message: error.message
    });
  }
}
