# KIKO LOCAL DEVELOPMENT — IMPLEMENTATION BRIEF FOR CLAUDE CODE
# Copy this entire file and paste into Claude Code to implement

---

## 1. PROJECT ASSUMPTIONS

Kiko is a **React + Vite** app (NOT Next.js) with Vercel serverless API routes.

**Stack:** React 18, Vite 5, Vercel serverless functions (Node.js), Supabase (PostgreSQL), Claude API
**Codebase:** `/Users/sunny/Desktop/vela-platform/`
**Production:** https://vela-platform-one.vercel.app
**GitHub:** https://github.com/VanHawke/vela-platform

### Current folder structure
```
vela-platform/
├── api/                    # Vercel serverless functions
│   ├── kiko.js            # Main AI brain endpoint
│   ├── agents/            # 25 agent files
│   ├── cron-*.js          # 30 cron jobs
│   ├── gmail-draft.js     # Gmail integration
│   └── ...
├── src/
│   ├── components/
│   │   ├── kiko/          # KikoChat, EmailDraft, KikoFloat, KikoWaveform, KikoVoice
│   │   ├── layout/        # Layout, Nav
│   │   ├── auth/          # LoginPage
│   │   └── settings/      # Settings
│   ├── pages/             # 16 page components (11 lazy-loaded)
│   ├── hooks/             # Custom hooks
│   └── lib/               # supabase.js, auth.js, theme.js
├── public/                # Static assets (logos)
├── dist/                  # Built output (670KB main + chunks)
├── vercel.json            # Cron schedules + function configs
├── vite.config.js         # Vite configuration
├── package.json           # Dependencies
└── index.html             # Entry point
```

---

## 2. LOCAL DEVELOPMENT ENVIRONMENT

### .devcontainer/devcontainer.json

Create `.devcontainer/devcontainer.json`:

```json
{
  "name": "Kiko Dev",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "forwardPorts": [5173, 3000],
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-vscode.vscode-typescript-next",
        "eamodio.gitlens",
        "github.copilot"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "editor.tabSize": 2
      }
    }
  },
  "features": {
    "ghcr.io/devcontainers/features/git:1": {}
  }
}
```

### VS Code Extensions (if not using Dev Container)
Install these manually:
- ESLint (dbaeumer.vscode-eslint)
- Prettier (esbenp.prettier-vscode)
- Tailwind CSS IntelliSense (bradlc.vscode-tailwindcss)
- GitLens (eamodio.gitlens)

### Setup instructions

```bash
# 1. Navigate to project
cd /Users/sunny/Desktop/vela-platform

# 2. Ensure Node 20+
node --version  # Must be >= 20

# 3. Install dependencies
npm install

# 4. Create .env.local from production env vars
# Copy from Vercel dashboard → Settings → Environment Variables
# Required vars:
cat > .env.local << 'EOF'
VITE_SUPABASE_URL=https://dwiywqeleyckzcxbwrlb.supabase.co
VITE_SUPABASE_ANON_KEY=<from Vercel>
SUPABASE_SERVICE_ROLE_KEY=<from Vercel>
ANTHROPIC_KEY=<from Vercel>
GOOGLE_CLIENT_ID=<from Vercel>
GOOGLE_CLIENT_SECRET=<from Vercel>
EOF

# 5. Verify .env.local is in .gitignore
grep -q ".env.local" .gitignore || echo ".env.local" >> .gitignore
```

---

## 3. LOCAL RUN WORKFLOW

```bash
# Start Vite dev server (frontend only — hot reload)
npm run dev
# → Access at http://localhost:5173

# To also test API routes locally (serverless functions):
npx vercel dev
# → Access at http://localhost:3000 (proxies both frontend + API)

# RECOMMENDED: Use `npx vercel dev` for full-stack local testing
# This emulates Vercel's serverless environment locally
```

### Browser access
| Mode | URL | What it does |
|------|-----|-------------|
| `npm run dev` | http://localhost:5173 | Frontend only, hot reload, fast |
| `npx vercel dev` | http://localhost:3000 | Full stack (frontend + API routes) |

---

## 4. CLAUDE CODE OPERATING RULES

**ABSOLUTE RULES — paste these as Claude Code instructions:**

```
RULES FOR EDITING KIKO:

1. NEVER deploy directly to production. NEVER run `npx vercel --prod`.
2. ONLY edit local files in /Users/sunny/Desktop/vela-platform/
3. ALWAYS show diffs before applying changes. Describe what you're changing and why.
4. ALWAYS run `npm run build` after changes to verify no compilation errors.
5. NEVER use VERCEL_FORCE_NO_BUILD_CACHE=1 or --force in any command.
6. NEVER modify .env.local or expose environment variables.
7. After editing, tell the user to check http://localhost:5173 or :3000.
8. Git operations: stage + commit only. NEVER push without user confirmation.
9. When editing api/ files, remind user to test with `npx vercel dev`.
10. Keep all changes incremental. One feature per commit.
```

---

## 5. GIT WORKFLOW

### Branch strategy

```bash
# Feature branches off main
git checkout main
git pull origin main
git checkout -b feature/descriptive-name

# After local testing passes:
git add -A
git commit -m 'feat: short description of change'

# Push feature branch (NOT main)
git push origin feature/descriptive-name

# Create PR on GitHub → review → merge to main
# Vercel auto-deploys from main via GitHub webhook
```

### Commit message format
```
feat: new feature
fix: bug fix
docs: documentation only
refactor: code restructure, no behavior change
perf: performance improvement
chore: build/tooling changes
```

### Branch protection (set on GitHub)
- main branch: require PR, require CI pass
- No direct pushes to main
- Vercel only deploys from main

---

## 6. AUTOMATED TESTING LAYER

### Add to package.json scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src/ --ext .js,.jsx --max-warnings 0",
    "test": "node scripts/test-build.js",
    "validate": "npm run lint && npm run build && npm run test"
  }
}
```

### Create scripts/test-build.js:

```javascript
// scripts/test-build.js — Build validation
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const errors = [];

// 1. Check dist exists
if (!fs.existsSync(dist)) {
  errors.push('dist/ directory does not exist. Run npm run build first.');
}

// 2. Check index.html exists
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  errors.push('dist/index.html missing');
}

// 3. Check JS bundle exists and is reasonable size
const assets = path.join(dist, 'assets');
if (fs.existsSync(assets)) {
  const jsFiles = fs.readdirSync(assets).filter(f => f.endsWith('.js'));
  const mainBundle = jsFiles.find(f => f.startsWith('index-'));
  if (!mainBundle) {
    errors.push('Main JS bundle not found in dist/assets/');
  } else {
    const size = fs.statSync(path.join(assets, mainBundle)).size;
    const sizeKB = Math.round(size / 1024);
    console.log(`Bundle size: ${sizeKB}KB`);
    if (sizeKB > 1200) errors.push(`Bundle too large: ${sizeKB}KB (max 1200KB)`);
    if (sizeKB < 100) errors.push(`Bundle suspiciously small: ${sizeKB}KB`);
  }
}

```javascript
// 4. Check all API routes parse correctly
const apiDir = path.join(__dirname, '..', 'api');
if (fs.existsSync(apiDir)) {
  const apiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));
  console.log(`API routes found: ${apiFiles.length}`);
  for (const file of apiFiles) {
    try {
      const content = fs.readFileSync(path.join(apiDir, file), 'utf-8');
      if (!content.includes('export default') && !content.includes('module.exports')) {
        errors.push(`${file}: missing default export`);
      }
    } catch (e) {
      errors.push(`${file}: cannot read — ${e.message}`);
    }
  }
}

// 5. Check critical env vars referenced correctly
const kikoJs = fs.readFileSync(path.join(apiDir, 'kiko.js'), 'utf-8');
if (kikoJs.includes('ANTHROPIC_API_KEY')) errors.push('kiko.js references ANTHROPIC_API_KEY (should be ANTHROPIC_KEY)');
if (kikoJs.includes("SUPABASE_URL'") && !kikoJs.includes('VITE_SUPABASE_URL')) errors.push('kiko.js may reference wrong SUPABASE_URL');

// Report
if (errors.length) {
  console.error('\n❌ VALIDATION FAILED:');
  errors.forEach(e => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log('\n✅ All validations passed');
  process.exit(0);
}
```

### Run validation locally:
```bash
npm run validate
# Runs: lint → build → test (all must pass)
```

---

## 7. GITHUB ACTIONS (CI/CD)

Create `.github/workflows/ci.yml`:

```yaml
name: Kiko CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

```yaml
      - name: Run tests
        run: node scripts/test-build.js

      - name: Check bundle size
        run: |
          SIZE=$(du -sk dist/assets/index-*.js | cut -f1)
          echo "Bundle size: ${SIZE}KB"
          if [ "$SIZE" -gt 1200 ]; then
            echo "::error::Bundle exceeds 1200KB limit"
            exit 1
          fi

      - name: Validate API routes
        run: |
          COUNT=$(ls api/*.js 2>/dev/null | wc -l)
          echo "API routes: $COUNT"
          if [ "$COUNT" -lt 10 ]; then
            echo "::error::Too few API routes detected"
            exit 1
          fi
```

### Add GitHub secrets (Settings → Secrets):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 8. DEPLOYMENT CONTROL

### Production deploy flow
```
Feature branch → PR → CI passes → Merge to main → Vercel auto-deploys
```

### Rules
1. Production deploys ONLY from `main` branch
2. Vercel GitHub integration handles deploy (no CLI needed)
3. Every PR must pass CI before merge
4. If CI fails, deploy is blocked automatically

### Rollback
```bash
# If bad deploy reaches production:
# Option 1: Revert commit on GitHub
git revert HEAD
git push origin main
# Vercel auto-deploys the revert

# Option 2: Vercel dashboard → Deployments → click previous good deploy → Promote
```

### Staging (optional)
```bash
# Preview deployments: every PR gets a unique preview URL from Vercel automatically
# No extra config needed — Vercel creates preview deploys for all non-main branches
```

---

## 9. COST-CONTROL LOGIC

| Problem | Old cost | New cost | How |
|---------|----------|----------|-----|
| VERCEL_FORCE_NO_BUILD_CACHE=1 | $830/month | $0 | Removed permanently. NEVER use this flag. |
| CLI deploys (npx vercel --prod) | ~$0.13/min × every push | $0 | Git push auto-deploys via webhook. No CLI deploy needed. |
| Double deploys (CLI + webhook) | 2× build minutes | 1× only | Webhook-only deployment eliminates duplication. |
| Uncached builds | ~2min each | ~20sec each | Vercel caches node_modules + build output between deploys. |
| Failed deploys hitting prod | Debug cycles + redeploys | 0 | CI blocks bad code from reaching main. |

### Monthly cost target: ~$20-30
- Vercel: ~$20 (Pro plan, cached builds, webhook deploys only)
- Anthropic: ~$15-20 (Sonnet for brain, Haiku for lightweight tasks)
- Supabase: Free tier (75MB of 500MB used)

### Cost rules for Claude Code:
```
1. NEVER use VERCEL_FORCE_NO_BUILD_CACHE=1
2. NEVER use --force flag on any Vercel command
3. NEVER run npx vercel --prod (git push handles deployment)
4. Batch changes into fewer commits (fewer webhook triggers)
5. Test locally with npm run dev BEFORE committing
```

---

## 10. FINAL WORKFLOW SUMMARY

```
┌─────────┐    ┌──────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌──────────┐
│  LOCAL   │ →  │ PREVIEW  │ →  │  TEST  │ →  │  PUSH  │ →  │   CI   │ →  │  DEPLOY  │
│ Edit in  │    │ Browser  │    │ Build  │    │ Feature│    │ GitHub │    │ Vercel   │
│ VS Code  │    │ :5173    │    │ + lint │    │ branch │    │ Actions│    │ auto     │
└─────────┘    └──────────┘    └────────┘    └────────┘    └────────┘    └──────────┘
```

### Step by step:
```bash
# 1. LOCAL — Edit files
# Claude Code edits src/ and api/ files locally

# 2. PREVIEW — Check in browser
npm run dev          # Frontend: http://localhost:5173
npx vercel dev       # Full stack: http://localhost:3000

# 3. TEST — Validate
npm run build        # Must succeed
node scripts/test-build.js  # Must pass

# 4. PUSH — Feature branch
git checkout -b feature/my-change
git add -A
git commit -m 'feat: description'
git push origin feature/my-change

# 5. CI — Automated checks
# GitHub Actions runs: install → build → test → bundle check
# Must all pass before merge is allowed

# 6. DEPLOY — Merge to main
# Create PR → review → merge → Vercel auto-deploys
# Zero manual deployment steps
```

---

END OF IMPLEMENTATION BRIEF
