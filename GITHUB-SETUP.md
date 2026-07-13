# Push this repo to a private GitHub repository

The code is committed and ready. I can't create the GitHub repo or authenticate for you
(that needs your login), so here are the two ways to do it. **Option A (gh CLI) is easiest.**

Your repo-local git identity is already set to `Rohan Shah <rohan@navingroup.in>` —
change it first if your GitHub account uses a different email:

```bash
cd "/Users/rohanshah/Desktop/AI Instructions/O&M Work/ITV Trip App/itv-app"
git config user.email "your-github-email@example.com"
```

---

## Option A — GitHub CLI (recommended, ~2 minutes)

```bash
# 1. Install the GitHub CLI
brew install gh

# 2. Log in (opens your browser to authenticate)
gh auth login          # choose: GitHub.com → HTTPS → login with browser

# 3. Create the PRIVATE repo and push this folder in one command
cd "/Users/rohanshah/Desktop/AI Instructions/O&M Work/ITV Trip App/itv-app"
gh repo create itv-ops --private --source=. --remote=origin --push
```

Done. The repo will be at `https://github.com/<your-username>/itv-ops` (private).

---

## Option B — create the repo on github.com, then push

1. Go to https://github.com/new
2. Name it e.g. `itv-ops`, set it to **Private**, and **do NOT** initialize with a README /
   .gitignore / license (this repo already has them).
3. Click **Create repository**, then run (replace `<your-username>`):

```bash
cd "/Users/rohanshah/Desktop/AI Instructions/O&M Work/ITV Trip App/itv-app"
git remote add origin https://github.com/<your-username>/itv-ops.git
git branch -M main
git push -u origin main
```

If prompted for a password, GitHub needs a **Personal Access Token** (not your account
password): github.com → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → generate one with "Contents: Read and write" for this repo, and paste
it as the password.

---

## What is / isn't included in the push

- ✅ All source, migrations, docs, and clean commit history.
- ✅ `.env.local.example` (the template — safe, no secrets).
- ❌ `.env.local` (your real config) — **git-ignored on purpose**, never pushed.
- ❌ `node_modules/`, `.next/` — git-ignored (the team runs `npm install`).

## After it's pushed

Hand the team the repo link + `TEAM-HANDOFF.md`. They deploy from GitHub → Vercel and
provision Supabase per `DEPLOY.md`.
