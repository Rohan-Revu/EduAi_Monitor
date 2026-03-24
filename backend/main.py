"""
main.py — Cerevyn Solutions · EduAI Monitor
FastAPI + Socket.IO backend. Mock state is imported from mock_data.py.
"""

import asyncio
import random
from datetime import datetime, timezone

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from mock_data import WORKFLOWS, METRICS, LOG_TEMPLATES, ALERTS, RESOURCES

# ─── Socket.IO + FastAPI Setup ────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

app = FastAPI(title="EduAI Monitor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

combined_asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class ActionRequest(BaseModel):
    action: str  # "pause" | "resume" | "retry"


# ─── REST Endpoints ───────────────────────────────────────────────────────────

@app.get("/api/workflows")
async def get_workflows():
    return list(WORKFLOWS.values())


@app.get("/api/metrics")
async def get_metrics():
    return METRICS


@app.get("/api/alerts")
async def get_alerts():
    return ALERTS


@app.get("/api/resources")
async def get_resources():
    return RESOURCES


@app.post("/api/workflows/{workflow_id}/action")
async def workflow_action(workflow_id: str, body: ActionRequest):
    if workflow_id not in WORKFLOWS:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf = WORKFLOWS[workflow_id]
    action = body.action.lower()
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if action == "pause":
        if wf["status"] not in ("Running", "Degraded", "Warning"):
            raise HTTPException(status_code=400, detail="Workflow cannot be paused in its current state")
        wf["status"] = "Paused"
        log = f"[INFO]  {workflow_id} · Workflow paused by operator"

    elif action == "resume":
        if wf["status"] not in ("Paused", "Failed", "Degraded", "Warning"):
            raise HTTPException(status_code=400, detail="Workflow cannot be resumed in its current state")
        wf["status"] = "Running"
        log = f"[INFO]  {workflow_id} · Workflow resumed by operator"

    elif action == "retry":
        if wf["status"] not in ("Failed", "Degraded"):
            raise HTTPException(status_code=400, detail="Only failed/degraded workflows can be retried")
        wf["status"] = "Running"
        wf["success_rate"] = min(round(wf["success_rate"] + random.uniform(2, 6), 1), 99.9)
        wf["error_rate"] = max(round(wf["error_rate"] - random.uniform(1, 4), 1), 0.1)
        wf["avg_latency_ms"] = max(int(wf["avg_latency_ms"] * 0.7), 300)
        log = f"[INFO]  {workflow_id} · Retry triggered by operator · recovering"

    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use pause | resume | retry")

    wf["last_run"] = now

    await sio.emit("workflow_update", {"workflows": list(WORKFLOWS.values())})
    await sio.emit("log", {"message": log, "ts": now})

    return {"ok": True, "workflow": wf}


# ─── Socket.IO Events ─────────────────────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    print(f"[WS] Client connected: {sid}")
    await sio.emit("workflow_update", {"workflows": list(WORKFLOWS.values())}, to=sid)
    await sio.emit("metrics_update", METRICS, to=sid)
    await sio.emit("alerts_update", ALERTS, to=sid)
    await sio.emit("log", {
        "message": f"[INFO]  monitor · New dashboard session · sid={sid[:8]}",
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }, to=sid)


@sio.event
async def disconnect(sid):
    print(f"[WS] Client disconnected: {sid}")


# ─── Background Simulator ─────────────────────────────────────────────────────

async def simulator():
    """Mutates WORKFLOWS and METRICS every 5-10s and broadcasts delta updates."""
    await asyncio.sleep(3)

    while True:
        await asyncio.sleep(random.uniform(5, 10))
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # ── Mutate metrics ──────────────────────────────────────────────────
        METRICS["active_sessions"] = max(800, min(3000, METRICS["active_sessions"] + random.randint(-40, 60)))
        METRICS["total_students_online"] = max(5000, min(20000, METRICS["total_students_online"] + random.randint(-80, 120)))
        METRICS["overall_success_rate"] = round(max(88.0, min(99.9, METRICS["overall_success_rate"] + random.uniform(-0.3, 0.3))), 1)
        METRICS["avg_system_latency_ms"] = max(400, min(5000, METRICS["avg_system_latency_ms"] + random.randint(-80, 120)))
        METRICS["error_rate_percent"] = round(max(0.1, min(15.0, METRICS["error_rate_percent"] + random.uniform(-0.2, 0.3))), 1)
        METRICS["daily_inference_calls"] += random.randint(100, 800)
        METRICS["gpu_utilization_percent"] = max(30, min(99, METRICS["gpu_utilization_percent"] + random.randint(-3, 4)))
        METRICS["cache_hit_ratio"] = round(max(0.6, min(0.99, METRICS["cache_hit_ratio"] + random.uniform(-0.01, 0.01))), 2)
        METRICS["students_helped_today"] += random.randint(5, 30)
        METRICS["error_count"] = max(0, METRICS["error_count"] + random.randint(-1, 2))
        # Keep legacy aliases in sync
        METRICS["success_rate"] = METRICS["overall_success_rate"]
        METRICS["avg_latency_ms"] = METRICS["avg_system_latency_ms"]

        await sio.emit("metrics_update", METRICS)

        # ── Mutate 1-3 random workflows ─────────────────────────────────────
        targets = random.sample(list(WORKFLOWS.keys()), k=random.randint(1, 3))
        for wf_id in targets:
            wf = WORKFLOWS[wf_id]

            wf["success_rate"] = round(max(60.0, min(99.9, wf["success_rate"] + random.uniform(-1.2, 1.2))), 1)
            wf["error_rate"] = round(max(0.1, min(20.0, wf["error_rate"] + random.uniform(-0.5, 0.6))), 1)
            wf["calls_today"] += random.randint(0, 80)
            wf["avg_latency_ms"] = max(200, min(8000, wf["avg_latency_ms"] + random.randint(-100, 150)))
            wf["last_run"] = now

            # Rare status flip (~7% chance per workflow per cycle)
            if random.random() < 0.07:
                current = wf["status"]
                if current == "Running":
                    wf["status"] = random.choice(["Degraded", "Warning", "Paused"])
                elif current in ("Degraded", "Warning"):
                    wf["status"] = random.choice(["Running", "Failed"])
                elif current in ("Paused", "Failed"):
                    wf["status"] = "Running"

        await sio.emit("workflow_update", {"workflows": list(WORKFLOWS.values())})

        # ── Emit a random log line ───────────────────────────────────────────
        await sio.emit("log", {
            "message": random.choice(LOG_TEMPLATES),
            "ts": now,
        })


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(simulator())


# ─── Entry Point ──────────────────────────────────────────────────────────────
# uvicorn main:combined_asgi_app --host 0.0.0.0 --port 8000 --reload