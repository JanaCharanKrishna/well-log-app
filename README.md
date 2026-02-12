# ⌬ Well Log Analyzer & AI Assistant

A high-performance, full-stack platform for **Petrophysical Data Analysis** and **Geochemical Interpretation**. Ingest LAS files, visualize complex gas chromatography curves, and leverage Large Language Models (LLMs) for automated log interpretation and anomaly detection.

[![Tech Stack](https://img.shields.io/badge/Stack-React_19_|_FastAPI_|_PostgreSQL_|_Groq-0ea5e9?style=for-the-badge)](https://github.com/JanaCharanKrishna/well-log-app)
[![Deployment](https://img.shields.io/badge/Deployment-Docker_|_Railway-14b8a6?style=for-the-badge)](https://well-log-analyzer.up.railway.app)

---

## 🚀 Key Features

- **Advanced LAS Ingestion**: Precise parsing of industry-standard `.las` (Log ASCII Standard) files with automated metadata extraction.
- **Interactive Visualization**: Real-time rendering of multiple GC curves (HC1-HC5, Total Gas, Ratios) with dynamic depth scaling and log-scale support.
- **AI Geochemical Assistant**: 
  - **Automated Interpretation**: One-click geochemical analysis of hydrocarbon signals and fluid behavior.
  - **Context-Aware Chat**: Interactive LLM assistant that "sees" your current chart window to answer specific depth-range questions.
- **Hybrid Storage Architecture**: PostgreSQL for structured petrophysical data + Amazon S3 for raw file persistence.
- **Premium Design System**: Ultra-dense, "Deep Space" themed UI utilizing glassmorphism and modern dashboard aesthetics.

---

## 🛠 Architecture

### Backend: FastAPI & Python 3.12
- High-concurrency async processing for large dataset parsing.
- **SQLAlchemy 2.0** ORM for complex structured queries.
- **Groq/OpenAI Integration**: Real-time geochemical reasoning via Llama-3 (Groq) or GPT-4.

### Frontend: React 19 & Vite
- **Plotly.js**: Industrial-grade interactive chart rendering.
- **Axios with Auto-Proxy**: Intelligent API routing for both local and cloud environments.
- **Dense Layout Engine**: Optimized for multi-monitor interpretation workflows.

### Infrastructure: Cloud-Native
- **Nginx Reverse Proxy**: Performance-tuned for heavy binary file uploads.
- **Docker Orchestration**: Containerized microservices architecture.
- **Railway Deployment**: Continuous delivery with direct private networking.

---

## ⚡ Quick Start (Self-Hosted)

### 1. Requirements
- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) v2+

### 2. Environment Configuration
Create a `.env` in the `backend/` directory:
```bash
# Get your free key at https://console.groq.com/keys
GROQ_API_KEY=your_key_here

# Database connection (automatically handled by Docker Compose)
DATABASE_URL=postgresql://welllog:welllog123@db:5432/welllog_db
```

### 3. Launch
```bash
docker compose up --build -d
```
The application will be available at **`http://localhost`**.

---

## 📁 Repository Structure

```text
well-log-app/
├── 📂 backend/           # FastAPI 0.115+, SQLAlchemy 2.0, Pydantic 2.0
│   ├── 📂 app/           # Core logic (Routers, Models, Services)
│   └── Dockerfile        # Uvicorn-optimized Python production image
├── 📂 frontend/          # React 19, Vite, Plotly.js
│   ├── 📂 src/           # Component library and API services
│   └── Dockerfile        # Multi-stage build (Node build -> Nginx)
└── docker-compose.yml    # Full stack orchestration (App + Postgres)
```

---

## 📊 API Specification

The platform exports a fully documented REST API. Interactive documentation is available at `/api/docs` upon deployment.

| Endpoint | Action | Logic |
|---|---|---|
| `POST /api/wells/upload` | **Ingest** | Multi-pass LAS parsing + S3 backup |
| `GET /api/wells/{id}/data` | **Query** | High-performance curve data paging |
| `POST /api/wells/{id}/interpret` | **AI** | Geochemical reasoning pipeline |
| `POST /api/chat` | **LLM** | Context-injected assistant |

---

## ⚖ License
Distributed under the **MIT License**. Created by [JanaCharanKrishna](https://github.com/JanaCharanKrishna).
