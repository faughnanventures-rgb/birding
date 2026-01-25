// Enhanced eBird API Proxy with Caching and Rate Limiting
// For Vercel Serverless Functions

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

// In-memory cache (persists across warm function invocations)
// Note: This resets when the function cold starts
const cache = new Map();
const CACHE_TTL = {
  '/data/obs/': 5 * 60 * 1000,        // 5 minutes for observations
  '/ref/hotspot/': 30 * 60 * 1000,    // 30 minutes for hotspot info
  '/ref/region/': 60 * 60 * 1000,     // 1 hour for region data
  '/product/spplist/': 60 * 60 * 1000, // 1 hour for species lists
  '/ref/taxonomy/': 24 * 60 * 60 * 1000, // 24 hours for taxonomy
  'default': 5 * 60 * 1000            // 5 minutes default
};

// Simple rate limiting (per IP, in-memory)
const rateLimits = new Map();
const RATE_LIMIT = {
  windowMs: 60 * 1000,  // 1 minute window
  maxRequests: 100      // 100 requests per minute per IP
};

function getCacheTTL(endpoint) {
  for (const [path, ttl] of Object.entries(CACHE_TTL)) {
    if (endpoint.startsWith(path)) return ttl;
  }
  return CACHE_TTL.default;
}

function getCacheKey(endpoint) {
  return `ebird:${endpoint}`;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT.windowMs };
  
  // Reset window if expired
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT.windowMs;
  }
  
  record.count++;
  rateLimits.set(ip, record);
  
  return {
    allowed: record.count <= RATE_LIMIT.maxRequests,
    remaining: Math.max(0, RATE_LIMIT.maxRequests - record.count),
    resetTime: record.resetTime
  };
}

// Clean up old rate limit records periodically
function cleanupRateLimits() {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    if (now > record.resetTime + 60000) { // Keep for 1 extra minute
      rateLimits.delete(ip);
    }
  }
}

// Clean up old cache entries
function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiry) {
      cache.delete(key);
    }
  }
}

module.exports = async (req, res) => {
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

  // Get client IP for rate limiting
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.headers['x-real-ip'] || 
                   'unknown';

  // Check rate limit
  const rateCheck = checkRateLimit(clientIP);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateCheck.resetTime / 1000));

  if (!rateCheck.allowed) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((rateCheck.resetTime - Date.now()) / 1000)
    });
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
  let decodedEndpoint;
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

  // Check cache first
  const cacheKey = getCacheKey(decodedEndpoint);
  const cachedEntry = cache.get(cacheKey);
  
  if (cachedEntry && Date.now() < cachedEntry.expiry) {
    // Cache hit
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(cachedEntry.data);
  }

  // Cache miss - fetch from eBird
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
      
      // Don't cache errors, but provide helpful response
      return res.status(response.status).json({
        error: `eBird API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();

    // Store in cache
    const ttl = getCacheTTL(decodedEndpoint);
    cache.set(cacheKey, {
      data: data,
      expiry: Date.now() + ttl
    });

    // Periodic cleanup (1% chance per request)
    if (Math.random() < 0.01) {
      cleanupCache();
      cleanupRateLimits();
    }

    // Set cache headers for CDN/browser caching
    const maxAge = Math.floor(ttl / 1000);
    res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
    res.setHeader('X-Cache', 'MISS');

    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from eBird',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
