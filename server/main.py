"""
FastAPI application — REST API + WebSocket signaling + static file serving.
Zero JS frameworks. Pure HTML + vanilla JS.
"""
import asyncio
import json
import os
import time
from pathlib import Path
from typing import Set

import structlog
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from livekit import api as lk_api
from prometheus_client import generate_latest
from starlette.responses import Response

from server.config import settings
from server.sip_bridge import router as sip_router

log = structlog.get_logger("server")
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

WEB_DIR = Path(__file__).parent.parent / "web"

app = FastAPI(title="VoxPilot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount SIP routes
app.include_router(sip_router)

# Static files
app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")

# Dashboard WebSocket state
_dashboard_sockets: Set[WebSocket] = set()
_call_log: list[dict] = []


def create_participant_token(room: str, identity: str) -> str:
    token = (
        lk_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(identity)
        .with_grants(
            lk_api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
            )
        )
    )
    return token.to_jwt()


# ---- HTML Routes ----

@app.get("/", response_class=HTMLResponse)
async def index():
    return FileResponse(str(WEB_DIR / "index.html"))


@app.get("/call", response_class=HTMLResponse)
async def call_page():
    return FileResponse(str(WEB_DIR / "call.html"))


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page():
    return FileResponse(str(WEB_DIR / "dashboard.html"))


@app.get("/traces", response_class=HTMLResponse)
async def traces_page():
    return FileResponse(str(WEB_DIR / "traces.html"))


# ---- API Endpoints ----

@app.post("/api/token")
async def api_token(body: dict):
    room = body.get("room", f"vox-{int(time.time())}")
    identity = body.get("identity", f"user-{int(time.time()) % 10000}")
    jwt = create_participant_token(room, identity)
    return JSONResponse({
        "token": jwt,
        "room": room,
        "identity": identity,
        "livekit_url": settings.livekit_url,
    })


@app.get("/api/rooms")
async def list_rooms():
    try:
        lk = lk_api.LiveKitAPI(
            settings.livekit_url.replace("wss://", "https://"),
            settings.livekit_api_key,
            settings.livekit_api_secret,
        )
        req = lk_api.ListRoomsRequest()
        resp = await lk.room.list_rooms(req)
        await lk.aclose()
        return JSONResponse({
            "rooms": [
                {
                    "name": r.name,
                    "sid": r.sid,
                    "num_participants": r.num_participants,
                    "creation_time": r.creation_time,
                }
                for r in resp.rooms
            ]
        })
    except Exception as e:
        return JSONResponse({"rooms": [], "error": str(e)})


@app.get("/api/config")
async def get_config():
    return JSONResponse({
        "livekit_url": settings.livekit_url,
        "groq_model": settings.groq_model,
        "stt": "deepgram-nova-3",
        "tts": "cartesia-sonic-2",
        "vad": "silero-v5",
        "twilio_number": settings.twilio_phone_number or "not configured",
    })


@app.get("/api/calls")
async def get_calls():
    return JSONResponse({"calls": _call_log[-100:]})


@app.get("/metrics")
async def prometheus_metrics():
    return Response(content=generate_latest(), media_type="text/plain; charset=utf-8")


# ---- Real-time WebSocket Dashboard ----

@app.websocket("/ws/dashboard")
async def ws_dashboard(ws: WebSocket):
    await ws.accept()
    _dashboard_sockets.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        _dashboard_sockets.discard(ws)


async def broadcast_metric(event: dict):
    dead: Set[WebSocket] = set()
    for ws in list(_dashboard_sockets):
        try:
            await ws.send_json(event)
        except Exception:
            dead.add(ws)
    _dashboard_sockets.difference_update(dead)


# ---- Startup ----

@app.on_event("startup")
async def startup():
    log.info("server_starting", port=settings.port, livekit=settings.livekit_url)
    from server.sip_bridge import ensure_sip_trunk
    asyncio.create_task(ensure_sip_trunk())


def run_server():
    uvicorn.run(
        "server.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )


if __name__ == "__main__":
    run_server()