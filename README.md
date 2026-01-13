# Traveling Birder v8.0

A birding trip planner that helps you find target species along routes and in areas.

## Project Structure

```
traveling-birder-ts/
├── api/
│   └── ebird.ts        ← TypeScript serverless function
├── public/
│   └── index.html      ← Main application
├── package.json        ← Node.js project config
├── tsconfig.json       ← TypeScript config
├── vercel.json         ← Vercel deployment config
├── .gitignore          ← Git ignore rules
└── README.md           ← This file
```

## Prerequisites

1. **eBird API Key** (free): https://ebird.org/api/keygen
2. **GitHub Account**: https://github.com
3. **Vercel Account**: https://vercel.com (sign up with GitHub)

---

## Deployment Instructions

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `traveling-birder`
3. Select **Public**
4. Click **Create repository**

### Step 2: Upload Files to GitHub

**Option A: Upload via GitHub web interface**

1. On your new repo page, click **"uploading an existing file"**
2. Drag and drop ALL files and folders from this package
3. Click **Commit changes**

**Option B: Use Git command line**

```bash
cd traveling-birder-ts
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/traveling-birder.git
git push -u origin main
```

### Step 3: Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select your `traveling-birder` repo
4. Vercel should auto-detect settings. If asked:
   - **Framework Preset:** Other
   - **Build Command:** (leave empty or `echo 'No build needed'`)
   - **Output Directory:** `public`
5. Click **Environment Variables** → Add:
   - **Name:** `EBIRD_API_KEY`
   - **Value:** Your key from https://ebird.org/api/keygen
6. Click **Deploy**

### Step 4: Wait & Test

- Deployment takes 1-2 minutes
- You'll get a URL like `traveling-birder-xyz.vercel.app`
- Visit it - you should see the landing page!

---

## Testing the API

Once deployed, test the API proxy:

```
https://your-site.vercel.app/api/ebird?endpoint=/data/obs/US-MA/recent?maxResults=5
```

You should see JSON data with recent bird observations from Massachusetts.

---

## Troubleshooting

### Build Errors
- Make sure all files are uploaded, especially `tsconfig.json`
- Check that `api/ebird.ts` exists (not `.js`)

### API Not Working
- Verify `EBIRD_API_KEY` is set in Vercel → Settings → Environment Variables
- Check the Vercel function logs for errors

### Old Design Showing
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache

### Private Repo Issues
- Go to https://github.com/settings/installations
- Configure Vercel → make sure it has access to your repo

---

## Local Development

```bash
# Install Vercel CLI
npm install -g vercel

# Run locally
vercel dev
```

---

## Secure Your Google Maps API Key

1. Go to https://console.cloud.google.com
2. APIs & Services → Credentials
3. Click on your API key
4. Set **HTTP referrers** restriction:
   - `https://your-site.vercel.app/*`
   - `https://*.vercel.app/*`
5. Save

---

Built with ❤️ for birders everywhere 🦩
