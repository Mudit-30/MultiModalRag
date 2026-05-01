#!/usr/bin/env python3
"""
run.py  --  Start Multi-Modal Graph RAG (backend + frontend) with one command.
Usage:      python run.py
"""

import os
import sys
import time
import signal
import platform
import subprocess
import socket

# ── Make sure stdout is not buffered ──────────────────────────────────────────
os.environ.setdefault("PYTHONUNBUFFERED", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

ROOT     = os.path.dirname(os.path.abspath(__file__))
BACKEND  = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")
WIN      = platform.system() == "Windows"
NPM      = "npm.cmd" if WIN else "npm"

# ── Colours (safe ASCII only) ─────────────────────────────────────────────────
R   = "\033[0m"
B   = "\033[1m"
CYN = "\033[96m"
GRN = "\033[92m"
YLW = "\033[93m"
RED = "\033[91m"
VIO = "\033[95m"
DIM = "\033[2m"

def p(msg=""):
    print(msg, flush=True)

def ok(msg):   p(f"  {GRN}[OK]{R}  {msg}")
def warn(msg): p(f"  {YLW}[!!]{R}  {msg}")
def err(msg):  p(f"  {RED}[XX]{R}  {msg}")
def info(k,v): p(f"  {B}{k}{R}  {v}")

def section(title):
    p()
    p(f"  {DIM}{'='*56}{R}")
    p(f"  {B}{CYN}{title}{R}")
    p(f"  {DIM}{'='*56}{R}")


# ── Port helpers ──────────────────────────────────────────────────────────────
def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def kill_port(port: int):
    """Kill whatever process is holding the port (Windows only)."""
    if not WIN:
        return
    try:
        result = subprocess.check_output(
            ["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL
        )
        for line in result.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                subprocess.call(
                    ["taskkill", "/F", "/PID", pid],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                p(f"  {YLW}[!!]{R}  Freed port {port} (killed PID {pid})")
                time.sleep(1)
                break
    except Exception:
        pass


# ── Pre-flight ────────────────────────────────────────────────────────────────
def preflight():
    section("Pre-flight Checks")

    # .env
    env_path = os.path.join(BACKEND, ".env")
    if not os.path.exists(env_path):
        warn(f"backend/.env not found  -->  LLM calls will fail without GROQ_API_KEY")
    else:
        txt = open(env_path).read()
        if "GROQ_API_KEY" in txt and "your_key" not in txt:
            ok("GROQ_API_KEY found in backend/.env")
        else:
            warn("GROQ_API_KEY missing or placeholder in backend/.env")

    # node_modules
    if not os.path.isdir(os.path.join(FRONTEND, "node_modules")):
        warn("frontend/node_modules missing -- running npm install ...")
        subprocess.run([NPM, "install"], cwd=FRONTEND, check=True)
        ok("npm install done")
    else:
        ok("frontend/node_modules present")

    # Python packages
    try:
        import fastapi, uvicorn  # noqa: F401
        ok("fastapi + uvicorn available")
    except ImportError:
        warn("Missing Python packages -- running pip install ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
            cwd=BACKEND, check=True,
        )
        ok("pip install done")

    # Data directory
    data_dir = os.path.join(ROOT, "data", "qdrant_local")
    os.makedirs(data_dir, exist_ok=True)
    ok(f"Data directory ready: data/")

    # Clear stale ports
    for port in [8000, 5173]:
        if is_port_in_use(port):
            warn(f"Port {port} already in use — attempting to free it...")
            kill_port(port)
            time.sleep(1)
            if is_port_in_use(port):
                warn(f"Could not free port {port}. You may need to close the occupying process manually.")
            else:
                ok(f"Port {port} is now free.")


# ── Launch ────────────────────────────────────────────────────────────────────
def start_backend():
    section("Starting Backend  -->  FastAPI + Uvicorn")
    info("API  :", "http://localhost:8000")
    info("Docs :", "http://localhost:8000/docs")

    # Build env: inherit everything, add PYTHONPATH so 'app.*' imports work
    env = os.environ.copy()
    env["PYTHONPATH"] = BACKEND

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", "8000",
         "--log-level", "warning"],
        cwd=BACKEND,
        env=env,
    )
    ok(f"Backend started  (PID {proc.pid})")
    return proc


def start_frontend():
    section("Starting Frontend  -->  Vite + React")
    info("UI   :", "http://localhost:5173")

    proc = subprocess.Popen(
        [NPM, "run", "dev"],
        cwd=FRONTEND,
    )
    ok(f"Frontend started  (PID {proc.pid})")
    return proc

# ── Shutdown ──────────────────────────────────────────────────────────────────
def kill_all(procs):
    section("Shutting Down")
    for proc in procs:
        if proc and proc.poll() is None:
            info("Stopping PID", str(proc.pid))
            if WIN:
                subprocess.call(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            else:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except Exception:
                    proc.terminate()
    ok("All processes stopped.  Goodbye!")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    p()
    p(f"  {VIO}{B}============================================================{R}")
    p(f"  {VIO}{B}  Multi-Modal Graph RAG{R}")
    p(f"  {CYN}  Agentic  |  Hybrid Retrieval  |  Temporal Knowledge Graph{R}")
    p(f"  {VIO}{B}============================================================{R}")

    preflight()

    procs = []

    def on_exit(sig, frame):
        p()
        warn("Interrupt -- shutting down ...")
        kill_all(procs)
        sys.exit(0)

    signal.signal(signal.SIGINT, on_exit)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, on_exit)

    backend = start_backend()
    procs.append(backend)

    p()
    p(f"  {DIM}Waiting 6s for backend to initialise ...{R}")
    time.sleep(6)

    # Check if backend crashed during startup
    if backend.poll() is not None:
        err(f"Backend failed to start (exit code {backend.returncode}). Check for port conflicts or import errors.")
        sys.exit(1)

    ok("Backend is healthy — starting frontend...")

    frontend = start_frontend()
    procs.append(frontend)

    section("System Ready")
    p(f"  {GRN}{B}Both services are running!{R}")
    p()
    p(f"  UI       -->  {CYN}http://localhost:5173{R}")
    p(f"  API      -->  {CYN}http://localhost:8000{R}")
    p(f"  Swagger  -->  {CYN}http://localhost:8000/docs{R}")
    p()
    p(f"  {DIM}Press Ctrl+C to stop everything{R}")
    p()

    # Keep alive -- exit if a child process dies unexpectedly
    while True:
        time.sleep(1)
        for proc in procs:
            code = proc.poll()
            if code is not None:
                err(f"Process PID {proc.pid} exited unexpectedly (code {code})")
                kill_all(procs)
                sys.exit(1)


if __name__ == "__main__":
    main()
