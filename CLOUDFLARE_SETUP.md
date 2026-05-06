# Cloudflare Pages Setup Guide

This guide walks you through deploying your PD_Roster project to Cloudflare Pages.

## Step 1: Create Cloudflare Account

1. Go to [Cloudflare](https://dash.cloudflare.com/signup)
2. Sign up for a free account
3. Verify your email

## Step 2: Generate API Token

1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Configure permissions:
   - Account > Pages (Read & Edit)
   - Account > Workers (Read & Edit)
   - User > API Tokens (Read)
5. Click "Continue to summary"
6. Copy the token and save it securely

## Step 3: Get Account ID

1. Go to [API Tokens page](https://dash.cloudflare.com/profile/api-tokens)
2. Look for "Account ID" in the top right
3. Copy and save it

## Step 4: Add GitHub Secrets

1. Go to your repository: https://github.com/nafishfuyedrizon/PD_Roster
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add two secrets:

   **Secret 1:**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: (paste your token from Step 2)

   **Secret 2:**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: (paste your account ID from Step 3)

5. Click "Add secret" for each

## Step 5: Deploy

### Automatic Deployment (Recommended)

The GitHub Actions workflow automatically deploys on every push to `main`:

```bash
git push origin main
```

Watch the deployment:
1. Go to your repository
2. Click "Actions" tab
3. Click the latest workflow run
4. View logs in "Deploy to Cloudflare Pages" job

### Manual Deployment

If you need to deploy manually:

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages deploy artifacts/api-server/dist --project-name=pd-roster
```

## Step 6: Configure Build Settings

In Cloudflare Pages UI:

1. Go to [Cloudflare Pages](https://pages.cloudflare.com)
2. Select your project (pd-roster)
3. Settings → Builds & deployments
4. Set:
   - **Build command**: `pnpm run build`
   - **Build output directory**: `artifacts/api-server/dist`

## Step 7: Set Environment Variables

In Cloudflare Pages:

1. Settings → Environment variables
2. Add your production environment variables:
   - `DATABASE_URL` (your production database)
   - `NODE_ENV` = `production`
   - Any other required variables

## Verify Deployment

After deployment:

1. Go to Cloudflare Pages dashboard
2. Your project will show deployment status
3. Visit your site at `https://pd-roster.pages.dev`

## Troubleshooting

### Build fails with "pnpm: command not found"

Add this to your workflow before build:
```yaml
- name: Install pnpm
  uses: pnpm/action-setup@v2
  with:
    version: latest
```

### Database connection errors

Ensure these are set in Cloudflare Pages environment variables:
- `DATABASE_URL` with your production database
- All other required environment variables

### Pages won't deploy

Check GitHub Actions logs:
1. Repository → Actions tab
2. Click the failed workflow
3. Click "Deploy to Cloudflare Pages" job
4. View error messages in logs

## Custom Domain

To add a custom domain:

1. In Cloudflare Pages project settings
2. Click "Custom domains"
3. Add your domain
4. Update DNS records if needed

## Monitoring

Access analytics:
1. Cloudflare Pages dashboard → Your project
2. View traffic, errors, performance metrics
3. Check deployment history and rollback if needed

## Support

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Actions Docs](https://docs.github.com/actions)
