# Deploy AI SOC ANALYSIS SYSTEM

Deploy the **frontend on Vercel** and the **backend on Render**. The frontend calls the Render API directly — all features (auth, chat, uploads, cloud connect, SSE streams) work the same as locally.

---

## Prerequisites

- GitHub repo with this project pushed
- [Vercel](https://vercel.com) account
- [Render](https://render.com) account
- OpenAI API key (optional — fallback works without it)

---

## Step 1 — Deploy backend on Render

### Option A: Blueprint (recommended)

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect your GitHub repo
3. Set **Root directory** to `backend` (or use the `backend/render.yaml` in that folder)
4. Render creates:
   - Web service: `ai-soc-analysis-api`
   - PostgreSQL database: `soc-db`
   - Persistent disk for uploads + RAG data

### Option B: Manual web service

1. **New** → **Web Service** → connect repo
2. **Root directory:** `backend`
3. **Runtime:** Docker
4. **Health check path:** `/health`
5. Add a **PostgreSQL** database and attach `DATABASE_URL`

### Required environment variables (Render)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | From Render Postgres (auto-linked in Blueprint) |
| `SECRET_KEY` | Auto-generated or a long random string |
| `CORS_ORIGINS` | Your Vercel URL, e.g. `https://your-app.vercel.app` |
| `OPENAI_API_KEY` | Your OpenAI key (optional) |
| `LLM_PROVIDER` | `openai` |
| `UPLOAD_DIR` | `/app/data/uploads` |
| `CHROMA_PERSIST_DIR` | `/app/data/chroma_data` |

### After deploy

1. Copy your API URL, e.g. `https://ai-soc-analysis-api.onrender.com`
2. Test: open `https://YOUR-API.onrender.com/health` → should return `{"status":"healthy"}`
3. Demo login is seeded automatically on startup:
   - **Email:** `analyst@soc-copilot.com`
   - **Password:** `Analyst123!`

> **Note:** Render free tier sleeps after inactivity. First request may take 30–60 seconds to wake up.

---

## Step 2 — Deploy frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/new) → import your GitHub repo
2. **Root directory:** `frontend`
3. **Framework:** Next.js (auto-detected)
4. Add environment variable:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-RENDER-API.onrender.com/api/v1` |

5. Click **Deploy**

### After deploy

1. Copy your Vercel URL, e.g. `https://your-app.vercel.app`
2. Go back to **Render** → your API service → **Environment**
3. Set `CORS_ORIGINS` to your Vercel URL (comma-separated if multiple):
   ```
   https://your-app.vercel.app
   ```
4. **Save** and wait for Render to redeploy

---

## Step 3 — Verify all features

| Feature | How to test |
|---------|-------------|
| Login / Register | Sign in with demo analyst or register new account |
| Dashboard | Stats load; live SSE updates |
| AI Chat | Send message + use suggestions |
| Upload Center | Upload a log or PDF |
| Cloud Connect | Connect AWS credentials |
| Reports / Analytics | View generated data |

---

## Local development (unchanged)

```powershell
# Backend
cd backend
.\venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm run dev
```

Frontend uses `http://localhost:8000/api/v1` by default.

---

## Troubleshooting

### CORS errors in browser
- Ensure `CORS_ORIGINS` on Render includes your exact Vercel URL (no trailing slash)
- Redeploy backend after changing CORS

### API unreachable / timeout
- Render free tier may be sleeping — wait ~60s and retry
- Confirm `NEXT_PUBLIC_API_URL` ends with `/api/v1`

### Login fails after deploy
- Check Render logs for `Created analyst:` or `Analyst already exists`
- Database must be PostgreSQL (not SQLite) on Render

### Chat / streams fail
- Confirm OpenAI key is set, or fallback responses will still work
- Check browser Network tab for `/chat/stream` and `/dashboard/stream`

---

## Architecture

```
Browser  →  Vercel (Next.js frontend)
                ↓ NEXT_PUBLIC_API_URL
           Render (FastAPI + PostgreSQL + disk storage)
```
