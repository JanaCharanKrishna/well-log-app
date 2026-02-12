# Well Log Analyzer

A full-stack application for ingesting LAS well-log files, visualizing gas chromatography curves, and running AI-assisted geochemical interpretation.

**Stack**: React 19 + Vite · FastAPI + SQLAlchemy · PostgreSQL · Groq / OpenAI · Docker + nginx

---

## Quick Start (Docker — recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) v2+

### 1. Clone and configure

```bash
git clone <your-repo-url> well-log-app
cd well-log-app

# Create backend environment file from example
cp backend/.env.example backend/.env
```

### 2. Add your AI API key

Edit `backend/.env` and set **at least one** AI key:

```dotenv
# Free option — get a key at https://console.groq.com/keys
GROQ_API_KEY=gsk_your_real_key_here

# Or use OpenAI
OPENAI_API_KEY=sk-your_real_key_here
```

> **Note**: The app works without an AI key — it will fall back to basic statistical analysis, but the AI interpretation and chat features require a valid key.

### 3. Build and launch

```bash
docker compose up --build -d
```

This starts three containers:

| Container | Port | Description |
|---|---|---|
| `welllog-frontend` | **80** | nginx serving the React SPA |
| `welllog-backend` | 8000 | FastAPI (proxied via nginx) |
| `welllog-db` | 5432 | PostgreSQL 16 |

### 4. Open the app

Navigate to **http://localhost** in your browser.

API docs are available at **http://localhost/api/docs**.

### 5. Manage

```bash
# View logs
docker compose logs -f

# Stop everything
docker compose down

# Stop and remove all data (including database)
docker compose down -v
```

---

## Development Setup (without Docker)

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 running locally

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your database URL and API keys

# Run
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies `/api` requests to the backend on port 8000 automatically.

---

## Production Deployment

### Docker Compose (self-hosted)

The default `docker-compose.yml` is production-ready:

- **Frontend**: Multi-stage build → nginx (port 80)
- **Backend**: uvicorn with 2 workers (no `--reload`)
- **Database**: PostgreSQL with persistent named volume
- **Uploads**: Persisted in a named Docker volume

Customize ports and credentials by setting environment variables:

```bash
# Optional: override defaults
export FRONTEND_PORT=443
export POSTGRES_PASSWORD=strong_random_password

docker compose up --build -d
```

### Custom domain (reverse proxy)

If deploying behind a domain with an external reverse proxy (Caddy, Traefik, etc.):

1. Set `CORS_ORIGINS=https://your-domain.com` in `backend/.env`
2. Point your reverse proxy to the frontend container (port 80)
3. The nginx inside the frontend container already proxies `/api/` to the backend

### Cloud deployment

The Docker images work on any container platform:

- **AWS ECS / Fargate**: Push images to ECR, create task definitions
- **Google Cloud Run**: Deploy backend and frontend as separate services
- **Railway / Render**: Connect your repo and configure build commands

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://welllog:welllog123@localhost:5432/welllog_db` | PostgreSQL connection string |
| `GROQ_API_KEY` | No* | — | Groq API key (free, recommended) |
| `OPENAI_API_KEY` | No* | — | OpenAI API key (fallback) |
| `CORS_ORIGINS` | No | `http://localhost` | Comma-separated allowed origins |
| `UPLOAD_DIR` | No | `/tmp/welllog_uploads` | Directory for uploaded LAS files |
| `AWS_ACCESS_KEY_ID` | No | — | For S3 file storage (optional) |
| `AWS_SECRET_ACCESS_KEY` | No | — | For S3 file storage (optional) |
| `S3_BUCKET_NAME` | No | `well-log-files` | S3 bucket name |

*\* At least one AI key is needed for AI interpretation and chat features.*

### Docker Compose (root `.env` or shell environment)

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `welllog` | Database user |
| `POSTGRES_PASSWORD` | `welllog123` | Database password |
| `POSTGRES_DB` | `welllog_db` | Database name |
| `FRONTEND_PORT` | `80` | Host port for the frontend |
| `BACKEND_PORT` | `8000` | Host port for the backend API |
| `DB_PORT` | `5432` | Host port for PostgreSQL |

---

## API Reference

Interactive API docs are available at `/api/docs` when the backend is running.

### Key endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/wells/upload` | Upload a LAS file |
| `GET` | `/api/wells` | List all wells |
| `GET` | `/api/wells/{id}` | Get well details + curves |
| `GET` | `/api/wells/{id}/data` | Get curve data for charting |
| `DELETE` | `/api/wells/{id}` | Delete a well |
| `POST` | `/api/wells/{id}/interpret` | Run AI interpretation |
| `POST` | `/api/chat` | Chat with AI about well data |
| `GET` | `/api/health` | Health check |

---

## Project Structure

```
well-log-app/
├── docker-compose.yml        # Production orchestration
├── .env.example              # Docker Compose env template
│
├── backend/
│   ├── Dockerfile            # Python + uvicorn
│   ├── requirements.txt
│   ├── .env.example          # Backend env template
│   └── app/
│       ├── main.py           # FastAPI app + optional SPA serving
│       ├── config.py         # Settings via pydantic-settings
│       ├── database.py       # SQLAlchemy engine + session
│       ├── models/           # ORM models
│       ├── routers/          # API route handlers
│       └── services/         # Business logic (AI, LAS parsing)
│
└── frontend/
    ├── Dockerfile            # Multi-stage: Node build → nginx
    ├── nginx.conf            # Production nginx config
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx           # Main application shell
        ├── index.css         # Design system
        ├── components/       # React components
        └── services/api.js   # API client
```

---

## License

MIT
