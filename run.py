#!/usr/bin/env python3
"""
run.py -- Start the Multi-Modal Graph RAG system (backend + frontend) with one command.
Usage:  python run.py
"""
import sys, io
# Force UTF-8 output on Windows so ANSI / special chars don't crash
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import subprocess
import os
import time
import signal
import threading
import platform

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT    = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
FRONTEND = os.path.join(ROOT, "frontend")

IS_WINDOWS = platform.system() == "Windows"

# ── ANSI colours ──────────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
VIOLET = "\033[95m"
DIM    = "\033[2m"

def banner():
    print(f"""
{VIOLET}{BOLD}  ============================================================
  Multi-Modal Graph RAG
  Agentic  |  Hybrid Retrieval  |  Temporal Knowledge Graph
  ============================================================{RESET}
{CYAN}  Backend  ->  FastAPI  (Groq LLMs + Qdrant + Neo4j)
  Frontend ->  React + Vite (Graph viz, Citations, Trace)
{RESET}""")

def info(tag, msg):
    print(f"  {BOLD}{tag}{RESET}  {msg}")

def ok(msg):
    print(f"  {GREEN}[OK]{RESET}  {msg}")

def warn(msg):
    print(f"  {YELLOW}[!!]{RESET}  {msg}")

def err(msg):
    print(f"  {RED}[XX]{RESET}  {msg}")

def section(title):
    print(f"\n{DIM}{'='*60}{RESET}")
    print(f"  {BOLD}{CYAN}{title}{RESET}")
    print(f"{DIM}{'='*60}{RESET}")

# ── Pre-flight checks ─────────────────────────────────────────────────────────

def check_env():
    section("Pre-flight Checks")
    env_file = os.path.join(BACKEND, ".env")
    if not os.path.exists(env_file):
        warn(f".env not found at {env_file}")
        warn("Backend will start but LLM features may fail without GROQ_API_KEY")
    else:
        # Peek for key
        with open(env_file) as f:
            content = f.read()
        if "GROQ_API_KEY" in content and "your_key" not in content:
            ok("GROQ_API_KEY found in backend/.env")
        else:
            warn("GROQ_API_KEY may not be set in backend/.env")

    # Check node_modules
    nm = os.path.join(FRONTEND, "node_modules")
    if not os.path.exists(nm):
        warn("frontend/node_modules not found -- running npm install...")
        subprocess.run(
            ["npm", "install"],
            cwd=FRONTEND,
            shell=IS_WINDOWS,
            check=True,
        )
        ok("npm install complete")
    else:
        ok("frontend/node_modules present")

    # Check pip packages (fast check)
    try:
        import fastapi, uvicorn  # noqa: F401
        ok("Python packages (fastapi, uvicorn) available")
    except ImportError:
        warn("Some Python packages missing -- installing requirements.txt...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
            cwd=BACKEND,
            check=True,
        )
        ok("pip install complete")

# ── Stream process output with a prefix ──────────────────────────────────────

def stream(proc, prefix, color):
    """Read stdout/stderr from a process and print with coloured prefix."""
    def _read(stream_):
        for raw in iter(stream_.readline, b""):
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                print(f"  {color}{BOLD}{prefix}{RESET}  {DIM}{line}{RESET}")
    t1 = threading.Thread(target=_read, args=(proc.stdout,), daemon=True)
    t2 = threading.Thread(target=_read, args=(proc.stderr,), daemon=True)
    t1.start(); t2.start()

# ── Launch processes ──────────────────────────────────────────────────────────

def start_backend():
    section("Starting Backend  -->  FastAPI + Uvicorn")
    info("Port", "http://localhost:8000")
    info("Docs", "http://localhost:8000/docs")

    cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--port", "8000",
        "--host", "127.0.0.1",
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=BACKEND,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
    )
    stream(proc, "BACKEND", VIOLET)
    ok(f"Backend process started  (PID {proc.pid})")
    return proc


def start_frontend():
    section("Starting Frontend  -->  Vite + React")
    info("URL", "http://localhost:5173")

    npm = "npm.cmd" if IS_WINDOWS else "npm"
    proc = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=FRONTEND,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
    )
    stream(proc, "FRONTEND", CYAN)
    ok(f"Frontend process started  (PID {proc.pid})")
    return proc

# ── Graceful shutdown ─────────────────────────────────────────────────────────

def shutdown(procs):
    section("Shutting Down")
    for p in procs:
        if p and p.poll() is None:
            info("Stopping", f"PID {p.pid}")
            if IS_WINDOWS:
                subprocess.call(
                    ["taskkill", "/F", "/T", "/PID", str(p.pid)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            else:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
    ok("All processes stopped. Goodbye!")
    sys.exit(0)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    banner()
    check_env()

    procs = []

    # Register Ctrl-C handler
    def handle_interrupt(sig, frame):
        print(f"\n{YELLOW}  Interrupt received -- shutting down...{RESET}")
        shutdown(procs)

    signal.signal(signal.SIGINT, handle_interrupt)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_interrupt)

    # Start both services
    backend_proc  = start_backend()
    procs.append(backend_proc)

    time.sleep(2)  # give backend a head-start

    frontend_proc = start_frontend()
    procs.append(frontend_proc)

    section("System Ready")
    print(f"""
  {GREEN}{BOLD}Both services are running!{RESET}

  {BOLD}API:{RESET}      {CYAN}http://localhost:8000{RESET}
  {BOLD}Swagger:{RESET}  {CYAN}http://localhost:8000/docs{RESET}
  {BOLD}UI:{RESET}       {CYAN}http://localhost:5173{RESET}

  {DIM}Press Ctrl+C to stop everything{RESET}
""")

    # Wait — exit if either process dies
    while True:
        time.sleep(1)
        for p in procs:
            if p.poll() is not None:
                err(f"Process PID {p.pid} exited with code {p.returncode}")
                shutdown(procs)


if __name__ == "__main__":
    main()
