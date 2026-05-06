# Complete Setup Guide for PD Roster

## Quick Start (5 minutes)

### Step 1: Clone & Install
```bash
git clone https://github.com/nafishfuyedrizon/PD_Roster.git
cd PD_Roster
pnpm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### Step 3: Start Development Server
```bash
pnpm run dev
```

Visit `http://localhost:3000/shift-roster/` in your browser.

---

## Detailed Setup by Platform

### macOS / Linux

```bash
# Install Node.js (if not installed)
# Using nvm (recommended):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Install pnpm
npm install -g pnpm

# Clone and setup
git clone https://github.com/nafishfuyedrizon/PD_Roster.git
cd PD_Roster
pnpm install

# Setup environment
cp .env.example .env
nano .env  # Edit with your values

# Start development
pnpm run dev
```

### Windows

**Option 1: Using PowerShell (Recommended)**
```powershell
# Install Node.js from https://nodejs.org/
# Then open PowerShell and run:
npm install -g pnpm

# Clone repository
git clone https://github.com/nafishfuyedrizon/PD_Roster.git
cd PD_Roster

# Run Windows setup script
pnpm run win:setup

# Start
pnpm run win:start
```

**Option 2: Manual Setup**
```powershell
pnpm install
Copy-Item .env.example .env
# Edit .env in your text editor

# Start API server
pnpm run win:api

# In another PowerShell window, start panel
pnpm run win:panel
```

---

## Database Setup

### PostgreSQL (Recommended)

**macOS:**
```bash
brew install postgresql
brew services start postgresql

# Create database
createdb pd_roster

# Connect
psql -d pd_roster
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database
sudo -u postgres createdb pd_roster
```

**Windows:**
- Download from: https://www.postgresql.org/download/windows/
- During installation, remember the password you set
- Add to `.env`:
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pd_roster
```

### MySQL

```bash
# Install MySQL
# macOS: brew install mysql
# Linux: sudo apt-get install mysql-server
# Windows: https://dev.mysql.com/downloads/mysql/

# Start MySQL service
sudo systemctl start mysql  # Linux
brew services start mysql   # macOS

# Create database
mysql -u root -p
mysql> CREATE DATABASE pd_roster;
mysql> EXIT;

# Add to .env:
# DATABASE_URL=mysql://root:password@localhost:3306/pd_roster
```

---

## Cloudflare Pages Deployment

### Prerequisites
1. Cloudflare account (free tier is fine)
2. GitHub repository (you already have this)

### Steps

#### 1. Create Cloudflare API Token
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create a token with these permissions:
   - Account → Pages (Read & Edit)
   - User → API Tokens (Read)
3. Copy the token

#### 2. Add GitHub Secrets
In your repository settings (`Settings → Secrets and variables → Actions`):

Add these secrets:
- `CLOUDFLARE_API_TOKEN` = (paste your token from step 1)
- `CLOUDFLARE_ACCOUNT_ID` = (find at https://dash.cloudflare.com/profile/api-tokens)

#### 3. Deploy via GitHub Actions
The workflow in `.github/workflows/deploy.yml` will:
- Run on every push to `main`
- Install dependencies
- Type-check code
- Build the project
- Deploy to Cloudflare Pages

Just push to main:
```bash
git add .
git commit -m "Initial setup"
git push origin main
```

Monitor deployment in: `Actions → Deploy to Cloudflare Pages`

#### 4. Connect Custom Domain (Optional)
1. In Cloudflare Pages, select your project
2. Go to `Custom domains`
3. Add your domain

---

## Troubleshooting

### Issue: `pnpm: command not found`
**Solution:**
```bash
npm install -g pnpm
# Verify: pnpm --version
```

### Issue: Database connection error
**Solution:**
```bash
# Check database is running
# PostgreSQL:
sudo systemctl status postgresql
# MySQL:
sudo systemctl status mysql

# Verify DATABASE_URL in .env is correct
# Test connection:
psql -d pd_roster  # PostgreSQL
mysql -u root -p   # MySQL
```

### Issue: Port 3000 already in use
**Solution:** Edit `.env`:
```env
PORT=3001
```

### Issue: Node version issues
**Solution:**
```bash
node --version  # Should be v18+
# If wrong version, install via nvm:
nvm install 18
nvm use 18
```

### Issue: `pnpm install` hangs
**Solution:**
```bash
pnpm store prune
rm -rf node_modules
pnpm install
```

---

## Development Workflow

### Project Structure
```
PD_Roster/
├── artifacts/
│   └── api-server/      # Main API server
│       ├── src/
│       ├── dist/        # Built output
│       └── package.json
├── libs/
│   ├── api-zod/         # API validation schemas
│   └── db/              # Database schemas
├── scripts/             # Utility scripts
├── package.json         # Root package
└── pnpm-workspace.yaml  # Monorepo config
```

### Common Tasks

**Add a dependency:**
```bash
# Add to a specific workspace
pnpm add express --filter @workspace/api-server

# Add to all workspaces
pnpm add -r some-package
```

**TypeScript checking:**
```bash
pnpm run typecheck
```

**Building for production:**
```bash
pnpm run build
# Output: artifacts/api-server/dist/
```

---

## Next Steps

1. ✅ Local development running
2. ✅ Database configured
3. ✅ GitHub secrets added
4. ⏭️ Push to `main` to trigger automatic deployment
5. ⏭️ Monitor build in GitHub Actions
6. ⏭️ View live site on Cloudflare Pages URL

---

## Support

For issues:
1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check Cloudflare Pages build logs
4. Open an issue in the repository

Good luck! 🚀
