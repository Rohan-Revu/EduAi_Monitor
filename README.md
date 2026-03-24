<div align="center">

# EduAI Monitor

### Real-Time AI Workflow Monitoring Dashboard

**Built for Cerevyn Solutions** — A production-grade observability platform for AI-enhanced learning pipelines.

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python)](https://python.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socket.io)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)

<br/>

![Dashboard Preview](https://placehold.co/1200x600/0d1117/39d0d8?text=EduAI+Monitor+Dashboard&font=mono)

> ⚡ Live WebSocket updates · 🎛️ Workflow control panel · 📊 Real-time analytics · 🔔 Intelligent alerting

</div>

---
## 🧠 Overview

**EduAI Monitor** is a full-stack, real-time observability dashboard built to monitor, control, and analyze AI workflows in an educational technology platform. It gives platform operators instant visibility into the health, performance, and cost of every AI pipeline — from LLM inference and RAG retrieval to computer vision and speech transcription.

The project was built as part of a technical assessment for **Cerevyn Solutions**, demonstrating full-stack engineering across a modern React/Next.js frontend and a Python/FastAPI backend with live WebSocket communication.

### The Problem It Solves

Modern EdTech platforms run many concurrent AI models serving thousands of students simultaneously. Without proper observability:

- Degraded models silently fail students mid-session
- Latency spikes go undetected until damage is done
- Operators have no way to pause, retry, or intervene in workflows
- Cost overruns accumulate unnoticed across multiple AI providers

**EduAI Monitor** solves this with a real-time control center.

---

## ✨ Key Features

### 📊 Live KPI Dashboard
Four top-level metric cards — each with a live sparkline chart that grows in real time as WebSocket events arrive:

| Metric | Description |
|--------|-------------|
| **Active Sessions** | Concurrent AI sessions with total students online |
| **Success Rate** | System-wide inference success % with uptime |
| **Avg Latency** | Real-time average across all pipelines + cache hit ratio |
| **Inference Calls** | Total API calls today + students helped counter |

### 🔄 AI Workflow Control Panel
A full workflow management table with:
- **8 distinct AI workflows** spanning LLM inference, RAG pipelines, ML models, embedding search, vision, speech, and fine-tuned models
- **5 status states**: `Running`, `Paused`, `Degraded`, `Warning`, `Failed` — each with color-coded animated badges
- **Provider color-coding**: OpenAI (green), Anthropic (warm), Google (blue), Custom (purple)
- **Per-row metrics**: success rate with progress bar, latency with color thresholds, daily call volume, cost/day
- **Action buttons**: Pause / Resume / Retry — each triggers a `POST` to the backend and reflects state instantly via WebSocket

### 🔔 Intelligent Alert System
Dismissable alert banners with three severity levels:
- 🔴 **Critical** — e.g., "wf-004 latency >6s for 40 mins"
- 🟡 **Warning** — e.g., "OpenAI rate limit at 87%"
- 🔵 **Info** — e.g., "Model cold start / maintenance"

### 🖥️ Live Log Terminal
A macOS-style terminal panel at the bottom of the dashboard:
- **Auto-tails** to latest log entries in real time
- **Color-coded log levels**: INFO (cyan), WARN (amber), ERROR (red), DEBUG (muted)
- **Scroll-to-top** without losing tail — a "↓ tail" button reappears when scrolled up
- Keeps last **120 entries** in memory

### 📈 System Resources Panel
Live resource gauges with color thresholds (green → amber → red):
- GPU 0 & GPU 1 utilization (NVIDIA A100)
- CPU and memory usage
- Disk usage
- Cache hit ratio

### 🌗 Dark / Light Mode
Full theme toggle that swaps all CSS custom properties in real time — no page reload required.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                               │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                  Next.js 14 (App Router)                    │   │
│   │                                                             │   │
│   │  ┌────────────┐  ┌───────────────┐  ┌──────────────────┐  │   │
│   │  │ KPI Cards  │  │ Workflow Table │  │  Log Terminal    │  │   │
│   │  │ + Sparklines│  │ + Actions     │  │  + Resources     │  │   │
│   │  └────────────┘  └───────────────┘  └──────────────────┘  │   │
│   │                         │                                   │   │
│   │              socket.io-client v4                            │   │
│   └─────────────────────────┼───────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │  WebSocket (ws://)
                              │  REST (HTTP)
┌─────────────────────────────┼───────────────────────────────────────┐
│                    BACKEND  │  (Port 8000)                          │
│                             ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │          socketio.ASGIApp  (combined ASGI mount)            │   │
│   │                                                             │   │
│   │   ┌────────────────────┐    ┌──────────────────────────┐   │   │
│   │   │   FastAPI (REST)   │    │  python-socketio Server  │   │   │
│   │   │                    │    │                          │   │   │
│   │   │  GET  /workflows   │    │  on connect → push state │   │   │
│   │   │  GET  /metrics     │    │  emit workflow_update    │   │   │
│   │   │  GET  /alerts      │    │  emit metrics_update     │   │   │
│   │   │  GET  /resources   │    │  emit alerts_update      │   │   │
│   │   │  POST /action      │    │  emit log                │   │   │
│   │   └────────────────────┘    └──────────────────────────┘   │   │
│   │                                      ▲                      │   │
│   │                          ┌───────────┴───────────┐          │   │
│   │                          │  asyncio Simulator    │          │   │
│   │                          │  (background task)    │          │   │
│   │                          │  fires every 5–10s    │          │   │
│   │                          └───────────────────────┘          │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│   ┌─────────────────────────▼───────────────────────────────────┐   │
│   │                   mock_data.py                              │   │
│   │   WORKFLOWS · METRICS · ALERTS · RESOURCES · LOG_TEMPLATES  │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Browser loads  →  REST fetch /api/workflows, /api/metrics, /api/alerts
2. Socket.IO connects  →  Server pushes current full state to client
3. Background simulator mutates in-memory state every 5–10s
4. Server broadcasts: workflow_update · metrics_update · log events
5. React state updates  →  UI re-renders with flash animations
6. Operator clicks "Pause"  →  POST /api/workflows/{id}/action
7. Backend mutates state  →  Immediately broadcasts update to all clients
```

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 14.2 | React framework, App Router, SSR |
| **React** | 18 | UI component library |
| **TypeScript** | 5 | Type safety across all components |
| **Tailwind CSS** | 3.4 | Utility-first styling with CSS variables |
| **Recharts** | 2.12 | Sparkline area charts and line charts |
| **socket.io-client** | 4.7 | WebSocket client with auto-reconnect |
| **clsx** | 2.1 | Conditional className utility |
| **IBM Plex Sans/Mono** | — | Typography via next/font |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| **FastAPI** | 0.111 | REST API framework |
| **python-socketio** | 5.11 | WebSocket/Socket.IO server |
| **uvicorn** | 0.30 | ASGI server with hot reload |
| **asyncio** | stdlib | Background simulation task |
| **Pydantic** | 2.7 | Request/response validation |

---

## 📁 Project Structure

```
eduai-monitor/
│
├── backend/
│   ├── main.py              # FastAPI app, Socket.IO server, REST endpoints,
│   │                        # WebSocket events, background simulator
│   ├── mock_data.py         # All in-memory state: workflows, metrics,
│   │                        # alerts, resources, log templates
│   └── requirements.txt     # Python dependencies (pinned versions)
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       # Root layout, font imports (IBM Plex)
│   │   ├── page.tsx         # Complete dashboard — all components in one file:
│   │   │                    #   Header, KpiCard, AlertBanner, WorkflowRow,
│   │   │                    #   LogTerminal, LatencyMiniChart, ResourceBar,
│   │   │                    #   StatusBadge, TrendIcon
│   │   └── globals.css      # CSS custom properties, animations, scrollbar,
│   │                        # terminal styles, scan-line effect
│   │
│   ├── next.config.js       # API proxy rewrite (→ localhost:8000)
│   ├── tailwind.config.js   # Extended theme: colors, fonts, shadows, keyframes
│   ├── tsconfig.json        # TypeScript compiler config
│   ├── package.json         # Node dependencies
│   └── postcss.config.js    # PostCSS + autoprefixer
│
└── README.md
```

---

## 🔌 API Reference

### REST Endpoints

#### `GET /api/workflows`
Returns all AI workflows with full metadata.

```json
[
  {
    "id": "wf-001",
    "name": "Student Quiz Personalization",
    "status": "Running",
    "type": "LLM Inference",
    "model": "gpt-4o-mini",
    "provider": "OpenAI",
    "last_run": "2024-11-01T10:23:45Z",
    "success_rate": 98.7,
    "calls_today": 18456,
    "avg_latency_ms": 980,
    "error_rate": 0.8,
    "daily_cost_usd": 12.45,
    "trend": "up"
  }
]
```

#### `GET /api/metrics`
Returns platform-wide KPI snapshot.

```json
{
  "active_sessions": 1874,
  "total_students_online": 12456,
  "overall_success_rate": 96.3,
  "avg_system_latency_ms": 1240,
  "error_rate_percent": 2.4,
  "daily_inference_calls": 87423,
  "gpu_utilization_percent": 84,
  "cache_hit_ratio": 0.91,
  "uptime_percent": 99.97,
  "students_helped_today": 9321
}
```

#### `GET /api/alerts`
Returns active system alerts.

```json
[
  {
    "id": "alert-001",
    "severity": "Critical",
    "title": "wf-004 High Latency",
    "message": "Essay grader latency >6s for last 40 mins",
    "timestamp": "2024-11-01T10:11:00Z",
    "workflow_id": "wf-004"
  }
]
```

#### `POST /api/workflows/{id}/action`
Triggers a control action on a workflow.

**Request body:**
```json
{ "action": "pause" }
```

**Valid actions:**

| Action | Valid from status | Result |
|--------|------------------|--------|
| `pause` | Running, Degraded, Warning | → Paused |
| `resume` | Paused, Failed, Degraded, Warning | → Running |
| `retry` | Failed, Degraded | → Running + heals metrics |

**Response:**
```json
{ "ok": true, "workflow": { ...updated workflow object } }
```

### WebSocket Events (Socket.IO)

| Event | Direction | Payload | Trigger |
|-------|-----------|---------|---------|
| `workflow_update` | server → client | `{ workflows: Workflow[] }` | On connect + simulator tick + action |
| `metrics_update` | server → client | Full metrics object | On connect + simulator tick |
| `alerts_update` | server → client | `Alert[]` | On connect |
| `log` | server → client | `{ message: string, ts: string }` | Simulator tick + actions |

---

## 🖼️ UI Wireframes

### Layout Overview
<img width="1919" height="830" alt="Screenshot 2026-03-24 172815" src="https://github.com/user-attachments/assets/3e99df76-330e-4fb3-bb51-69652a9c1d23" />
<img width="1916" height="726" alt="Screenshot 2026-03-24 172827" src="https://github.com/user-attachments/assets/d4f45249-107b-4f33-8fa0-6d5064d58363" />



---

## 🚀 Getting Started

### Prerequisites

| Tool | Min Version | Check |
|------|------------|-------|
| Python | 3.9+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 8+ | `npm --version` |

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/your-username/eduai-monitor.git
cd eduai-monitor
```

**2. Backend setup**
```bash
cd backend

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

**3. Frontend setup**
```bash
cd ../frontend
npm install
```

### Running Locally

Open **two terminals**:

```bash
# Terminal 1 — Backend (port 8000)
cd backend
source .venv/bin/activate
uvicorn main:combined_asgi_app --host 0.0.0.0 --port 8000 --reload
```

```bash
# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

Open **http://localhost:3000** — the green **Live** indicator confirms WebSocket connection.

### Environment Variables

Create `frontend/.env.local` if your backend runs on a different host:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```
