"""
config.py
=========
Central configuration for the AML Alert Auto-Closure System.
All constants, file paths, LLM settings, and RAG settings live here.
Import this module in every agent — never hard-code values elsewhere.
"""

import logging
from pathlib import Path

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [%(name)s]  %(message)s",
)
log = logging.getLogger("AML-A2A")

# ── LLM ───────────────────────────────────────────────────────────────────────
# Qwen3 is a chat model served by vLLM — it uses /v1/chat/completions, not
# /v1/completions. The payload format is {"messages": [...]} and the response
# is at choices[0]["message"]["content"], not choices[0]["text"].
LLM_ENDPOINT        = "http://wiphackq0vcsii.cloudloka.com:8000/v1/chat/completions"
LLM_MODEL           = "Qwen/Qwen3-8B"
MAX_TOKENS          = 512
TEMPERATURE         = 0.3   # lower = more deterministic

# Timeout tuple: (connect_seconds, read_seconds).
# Read timeout is generous because large prompts can take 90-120 s on small GPUs.
LLM_TIMEOUT_CONNECT = 15
LLM_TIMEOUT_READ    = 180
LLM_RETRIES         = 2     # retry attempts on timeout / 5xx

# ── Folder layout ──────────────────────────────────────────────────────────────
# All paths resolve relative to THIS file's directory so the system works
# regardless of the working directory when main.py is invoked.
#
#  <root>/
#  ├── Historical Alerts/          ← place alerts_data.xlsx here
#  │     └── alerts_data.xlsx
#  ├── Open Alerts/                ← place open_alerts_data.xlsx here
#  │     └── open_alerts_data.xlsx
#  ├── Closure Report/             ← auto_closure_report.xlsx written here
#  ├── KB_Processed/               ← timestamped snapshots + master_kb.xlsx
#  └── vector_db/                  ← ChromaDB vector store
#
_HERE = Path(__file__).parent.resolve()

DIR_HISTORICAL   = _HERE / "Historical Alerts"
DIR_OPEN_ALERTS  = _HERE / "Open Alerts"
DIR_CLOSURE      = _HERE / "Closure Report"
KB_PROCESSED_DIR = _HERE / "KB_Processed"

HISTORICAL_FILE  = str(DIR_HISTORICAL  / "alerts_data.xlsx")
OPEN_ALERTS_FILE = str(DIR_OPEN_ALERTS / "open_alerts_data.xlsx")
OUTPUT_FILE      = str(DIR_CLOSURE     / "auto_closure_report.xlsx")

# Create output directories on import so agents never have to worry about it.
# Input directories are NOT auto-created — if they are missing, the agents
# raise a clear FileNotFoundError so the user knows what to fix.
DIR_CLOSURE.mkdir(parents=True, exist_ok=True)
KB_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# ── RAG / Vector DB ────────────────────────────────────────────────────────────
VECTOR_DB_DIR   = str(_HERE / "vector_db")  # ChromaDB persists here
COLLECTION_NAME = "aml_alerts"              # one collection, all sheets

# sentence-transformers embedding model — runs in-process on CPU, no server needed.
# The model weights (~22 MB) are downloaded once on first use and cached in
# ~/.cache/huggingface/. All subsequent runs are fully offline.
#
# Model comparison (all local after first download):
#   all-MiniLM-L6-v2        → 384-dim, ~22 MB,  ~50 ms/alert  ← default
#   all-mpnet-base-v2        → 768-dim, ~420 MB, ~120 ms/alert (higher accuracy)
#   paraphrase-MiniLM-L3-v2 → 384-dim, ~17 MB,  ~25 ms/alert  (fastest)
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"

RAG_TOP_K       = 5    # similar historical alerts retrieved per open alert
RAG_FALLBACK_KB = True # fall back to rule-based decisions if RAG unavailable

# ── RAG optional dependencies ──────────────────────────────────────────────────
# Install with:  pip install chromadb sentence-transformers
try:
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer
    RAG_AVAILABLE = True
except ImportError as _rag_err:
    RAG_AVAILABLE = False
    _rag_import_err = str(_rag_err)
    log.warning("RAG packages not available (%s). "
                "Run: pip install chromadb sentence-transformers", _rag_err)

# Module-level singleton for the embedding model — loaded once per process,
# reused across all embed_text() calls so we pay the load cost only once.
# Declared here and mutated by BaseAgent.embed_text().
_EMBED_MODEL = None


def probe_llm_endpoint() -> dict:
    """
    Fire a minimal test request to LLM_ENDPOINT and return a summary of the
    response shape.  Call this once at startup to confirm the endpoint is
    reachable and to identify which response format it uses.

    Returns a dict with keys:
      reachable  : bool
      format     : "chat" | "completions" | "unknown" | "error"
      choice_keys: list of keys in choices[0]
      raw_snippet: first 200 chars of extracted text (or error message)

    Usage (optional — add to main.py if you want startup diagnostics):
        from config import probe_llm_endpoint
        probe_llm_endpoint()
    """
    import requests as _req
    try:
        # Try chat/completions format first (works for Qwen3 and most modern models)
        payload = {
            "model":      LLM_MODEL,
            "messages":   [{"role": "user", "content": "Reply with the word OK only."}],
            "max_tokens": 10,
            "temperature": 0.0,
        }
        resp   = _req.post(LLM_ENDPOINT, json=payload,
                           timeout=(LLM_TIMEOUT_CONNECT, 30))
        resp.raise_for_status()
        data   = resp.json()
        choice = data.get("choices", [{}])[0]
        keys   = list(choice.keys())

        if "message" in choice:
            fmt  = "chat"
            text = (choice["message"].get("content") or "").strip()
        elif "text" in choice:
            fmt  = "completions"
            text = choice["text"].strip()
        else:
            fmt  = "unknown"
            text = f"choice keys: {keys}"

        log.info("LLM endpoint probe OK — format=%s  choice_keys=%s  reply=%r",
                 fmt, keys, text[:80])
        return {"reachable": True, "format": fmt,
                "choice_keys": keys, "raw_snippet": text[:200]}

    except Exception as exc:
        log.warning("LLM endpoint probe failed: %s", exc)
        return {"reachable": False, "format": "error",
                "choice_keys": [], "raw_snippet": str(exc)}