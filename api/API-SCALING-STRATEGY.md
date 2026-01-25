# Traveling Birder - API Scaling Strategy

## Current Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│  Vercel Proxy    │────▶│  eBird API  │
│  (Client)   │◀────│  (/api/ebird.js) │◀────│             │
└─────────────┘     └──────────────────┘     └─────────────┘
```

## eBird API Limitations

### Rate Limits (Per API Key)
- **Undocumented official limit**: ~100-200 requests/minute per API key
- **Soft limit**: eBird may throttle or block after sustained high usage
- **Hard limit**: Excessive abuse can result in API key revocation

### Data Limits
- **Observation queries**: Max 10,000 results per request
- **Radius**: Max 50 km (31 miles) per geo query
- **Time range**: Max 30 days for recent observations
- **Notable observations**: Limited to recent timeframe

### Current Usage Pattern
A single route search can generate:
- **Short route (<50 mi)**: 3-5 API calls
- **Medium route (50-200 mi)**: 10-20 API calls  
- **Long route (200+ mi)**: 30-50 API calls
- **Cross-country (1000+ mi)**: 100+ API calls

---

## Scaling Solutions (By Complexity)

### Tier 1: Quick Wins (Implement Now)

#### 1. Enhanced In-Memory Caching ✅
**File: `api/ebird-enhanced.js`**

```javascript
const CACHE_TTL = {
  '/data/obs/': 5 * 60 * 1000,        // 5 min for observations
  '/ref/hotspot/': 30 * 60 * 1000,    // 30 min for hotspots
  '/ref/region/': 60 * 60 * 1000,     // 1 hour for regions
  '/ref/taxonomy/': 24 * 60 * 60 * 1000, // 24 hours for taxonomy
};
```

**Benefits:**
- Reduces duplicate requests for same location
- Fast response for cached data
- No additional infrastructure

**Limitations:**
- Cache resets on cold start
- Not shared across serverless instances

#### 2. Client-Side Rate Limiting
Add to `index.html`:

```javascript
const requestQueue = [];
const MAX_CONCURRENT = 5;
const REQUEST_DELAY = 100; // ms between requests

async function throttledFetch(url) {
  return new Promise((resolve) => {
    requestQueue.push({ url, resolve });
    processQueue();
  });
}
```

**Benefits:**
- Prevents client from overwhelming the proxy
- Smoother user experience
- Reduces server load

#### 3. Smarter Grid Search
Current: Fixed 20-mile intervals
Better: Adaptive based on route length

```javascript
function calculateSearchInterval(routeLength) {
  if (routeLength < 50) return 15;    // Dense for short routes
  if (routeLength < 200) return 25;   // Standard
  if (routeLength < 500) return 35;   // Sparse for medium
  return 45;                           // Very sparse for long routes
}
```

---

### Tier 2: Production-Ready (1-2 Days Work)

#### 4. Vercel KV or Redis Cache
Use persistent caching that survives cold starts:

```javascript
import { kv } from '@vercel/kv';

// In your API handler:
const cached = await kv.get(cacheKey);
if (cached) return res.json(cached);

const data = await fetchFromEBird(endpoint);
await kv.set(cacheKey, data, { ex: 300 }); // 5 min TTL
return res.json(data);
```

**Pricing:**
- Vercel KV: Free tier = 30K requests/month
- Upstash Redis: Free tier = 10K requests/day

#### 5. Multiple API Keys (Key Rotation)
Register multiple eBird API keys and rotate:

```javascript
const API_KEYS = [
  process.env.EBIRD_API_KEY_1,
  process.env.EBIRD_API_KEY_2,
  process.env.EBIRD_API_KEY_3,
];

let keyIndex = 0;
function getNextApiKey() {
  keyIndex = (keyIndex + 1) % API_KEYS.length;
  return API_KEYS[keyIndex];
}
```

**Note:** Check eBird ToS - this should be fine for legitimate use but don't abuse it.

#### 6. Request Batching
Combine multiple nearby searches into single requests where possible:

```javascript
// Instead of 5 separate requests for nearby points:
// Request once with larger radius, then filter client-side
const BATCH_RADIUS = 50; // km (eBird max)
```

---

### Tier 3: Enterprise Scale (1 Week+ Work)

#### 7. Background Data Pre-fetching
Scheduled job to pre-cache popular regions:

```javascript
// Vercel Cron job (vercel.json)
{
  "crons": [{
    "path": "/api/prefetch-popular",
    "schedule": "0 */4 * * *"  // Every 4 hours
  }]
}

// Pre-fetch top 50 US birding hotspots
const POPULAR_REGIONS = ['US-FL', 'US-TX', 'US-CA', 'US-AZ', ...];
```

#### 8. Database-Backed Caching (PostgreSQL/Supabase)
Store observations in a real database:

```sql
CREATE TABLE observation_cache (
  id SERIAL PRIMARY KEY,
  region_code VARCHAR(20),
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  radius_km INTEGER,
  data JSONB,
  fetched_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_cache_location ON observation_cache 
  USING gist (point(lng, lat));
```

**Benefits:**
- Persistent across deploys
- Query by location efficiently
- Can serve stale data while refreshing

#### 9. Edge Caching with Cloudflare
Put Cloudflare in front of Vercel:

```
Browser → Cloudflare CDN → Vercel → eBird
              ↓ (cached)
         Return cached
```

**Cache-Control Headers:**
```javascript
res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
res.setHeader('CDN-Cache-Control', 'max-age=300');
```

---

### Tier 4: Maximum Scale (Major Architecture Change)

#### 10. Build Your Own Bird Database
Instead of proxying eBird, maintain your own data:

1. **Daily Sync**: Download eBird data exports (available for researchers)
2. **Store in PostgreSQL** with PostGIS for geo queries
3. **Serve from your database** instead of API calls

**eBird Data Access:**
- Basic API: Free, rate limited
- eBird Basic Dataset (EBD): Free for research, requires application
- Full dataset: 500M+ observations, updated monthly

```sql
-- Your own observations table
CREATE TABLE observations (
  id BIGSERIAL PRIMARY KEY,
  species_code VARCHAR(10),
  common_name VARCHAR(100),
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  observation_date DATE,
  location_name VARCHAR(200),
  checklist_id VARCHAR(20),
  geom GEOGRAPHY(POINT)
);

-- Fast geo queries
CREATE INDEX idx_obs_geom ON observations USING gist(geom);
CREATE INDEX idx_obs_date ON observations(observation_date);
```

---

## Recommended Implementation Roadmap

### Phase 1: Immediate (This Week)
1. ✅ Deploy `ebird-enhanced.js` with in-memory caching
2. Add client-side request throttling
3. Implement smarter grid search intervals

### Phase 2: Growth (100-1000 users)
4. Add Vercel KV for persistent caching
5. Register 2-3 backup API keys
6. Implement request batching

### Phase 3: Scale (1000+ users)
7. Set up Cloudflare CDN
8. Add background pre-fetching for popular regions
9. Consider PostgreSQL for heavy caching

### Phase 4: Enterprise (10,000+ users)
10. Apply for eBird Basic Dataset access
11. Build your own observation database
12. Implement real-time sync with eBird

---

## Cost Estimates

| Solution | Monthly Cost | Requests Supported |
|----------|-------------|-------------------|
| Current (no caching) | $0 | ~50 users |
| In-memory cache | $0 | ~200 users |
| Vercel KV | $0-25 | ~1,000 users |
| Cloudflare + KV | $20-50 | ~5,000 users |
| PostgreSQL + CDN | $50-100 | ~20,000 users |
| Own Database | $100-500 | Unlimited |

---

## Monitoring & Alerts

Add these to track API health:

```javascript
// Log API usage metrics
console.log(JSON.stringify({
  event: 'ebird_api_call',
  endpoint: decodedEndpoint,
  cacheHit: !!cachedEntry,
  responseTime: Date.now() - startTime,
  clientIP: clientIP.substring(0, 8) + '...' // Anonymized
}));
```

Set up alerts in Vercel for:
- Error rate > 5%
- Response time > 3s
- 429 (rate limit) errors

---

## Quick Reference: eBird API Endpoints Used

| Endpoint | Usage | Cache Duration |
|----------|-------|----------------|
| `/data/obs/geo/recent` | Main search | 5 min |
| `/data/obs/{region}/recent` | Region search | 5 min |
| `/data/obs/geo/recent/notable` | Notable sightings | 5 min |
| `/ref/hotspot/geo` | Find hotspots | 30 min |
| `/ref/hotspot/{locId}/info` | Hotspot details | 1 hour |
| `/product/spplist/{region}` | Species list | 1 hour |
| `/ref/taxonomy/ebird` | Bird names | 24 hours |

---

## Files to Deploy

1. **Replace** `api/ebird.js` with `api/ebird-enhanced.js`
2. **Add** client-side throttling to `index.html`
3. **Configure** Vercel KV when ready for persistent caching

The enhanced proxy is backward-compatible and can be deployed immediately.
