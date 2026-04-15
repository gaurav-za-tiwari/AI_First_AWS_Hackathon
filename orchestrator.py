"""
orchestrator.py
===============
Google A2A protocol primitives and the BaseAgent class.

Contains:
  Task             — minimal A2A task envelope (input / output / status)
  Message          — inter-agent routing envelope
  A2AOrchestrator  — registers agents, dispatches tasks, holds shared knowledge base
  BaseAgent        — base class with embed_text() and call_llm() helpers
"""

import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import requests

import config as cfg

log = logging.getLogger("AML-A2A")


# ══════════════════════════════════════════════════════════════════════════════
# A2A PROTOCOL PRIMITIVES
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Task:
    """Minimal A2A Task envelope."""
    id:         str  = field(default_factory=lambda: str(uuid.uuid4()))
    name:       str  = ""
    input:      dict = field(default_factory=dict)
    output:     dict = field(default_factory=dict)
    status:     str  = "pending"   # pending | running | done | error
    created_at: str  = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Message:
    """A2A inter-agent message."""
    sender:    str
    recipient: str
    task_id:   str
    payload:   dict = field(default_factory=dict)


# ══════════════════════════════════════════════════════════════════════════════
# ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════════════════

class A2AOrchestrator:
    """
    Lightweight Google A2A-style orchestrator.
    Routes tasks between registered agents and maintains a shared
    knowledge_base dict that agents can read and write across the pipeline.
    """

    def __init__(self):
        self._agents:       dict[str, "BaseAgent"] = {}
        self.knowledge_base: dict[str, Any]        = {}
        self.task_log:       list[Task]             = []

    def register(self, agent: "BaseAgent"):
        self._agents[agent.name] = agent
        agent.orchestrator = self
        log.info("Registered agent: %s", agent.name)

    async def send(self, msg: Message) -> Task:
        agent = self._agents.get(msg.recipient)
        if not agent:
            raise ValueError(f"Unknown agent: {msg.recipient}")

        task = Task(id=msg.task_id, name=msg.recipient, input=msg.payload)
        self.task_log.append(task)
        task.status = "running"
        log.info("→ Dispatching task %s to %s", task.id[:8], msg.recipient)

        try:
            task.output = await agent.handle(task)
            task.status = "done"
        except Exception as exc:
            task.status = "error"
            task.output = {"error": str(exc)}
            log.error("Task %s failed: %s", task.id[:8], exc)
            raise

        return task

    async def run_pipeline(self):
        """Execute the four-agent pipeline sequentially."""
        await self.send(Message("orchestrator", "EmbeddingAgent", str(uuid.uuid4()),
                                {"file": cfg.HISTORICAL_FILE}))

        await self.send(Message("orchestrator", "AnalysisAgent", str(uuid.uuid4()),
                                {"file": cfg.OPEN_ALERTS_FILE}))

        await self.send(Message("orchestrator", "ReportAgent", str(uuid.uuid4()),
                                {"open_alerts_file": cfg.OPEN_ALERTS_FILE,
                                 "output_file":      cfg.OUTPUT_FILE}))

        result = await self.send(Message("orchestrator", "ArchiveAgent", str(uuid.uuid4()),
                                         {"historical_file":  cfg.HISTORICAL_FILE,
                                          "report_file":      cfg.OUTPUT_FILE,
                                          "kb_processed_dir": str(cfg.KB_PROCESSED_DIR)}))
        return result


# ══════════════════════════════════════════════════════════════════════════════
# BASE AGENT
# ══════════════════════════════════════════════════════════════════════════════

class BaseAgent:
    """
    Base class for all pipeline agents.

    Provides two shared helpers used across multiple agents:
      embed_text()  — local sentence-transformers embedding (no HTTP endpoint)
      call_llm()    — POST to the vLLM /v1/completions endpoint with retry logic
    """
    name: str = "BaseAgent"

    def __init__(self):
        self.orchestrator: A2AOrchestrator | None = None

    async def handle(self, task: Task) -> dict:
        raise NotImplementedError

    # ── Embedding ──────────────────────────────────────────────────────────────
    def embed_text(self, text: str) -> list[float]:
        """
        Embeds `text` using a local sentence-transformers model.

        Runs entirely inside this Python process on CPU — no daemon, no HTTP call.
        The SentenceTransformer singleton (cfg._EMBED_MODEL) is loaded once on the
        first call and reused for all subsequent calls in the same process.

        On the very first run, the model weights (~22 MB) are downloaded from
        Hugging Face and cached in ~/.cache/huggingface/. All later runs are offline.

        Returns list[float] compatible with ChromaDB.
        Returns [] on any failure so the caller can skip the alert gracefully.
        """
        if not cfg.RAG_AVAILABLE:
            return []
        try:
            if cfg._EMBED_MODEL is None:
                log.info("[embed] Loading '%s' (first call — "
                         "downloads ~22 MB if not cached)…", cfg.EMBED_MODEL_NAME)
                from sentence_transformers import SentenceTransformer
                cfg._EMBED_MODEL = SentenceTransformer(cfg.EMBED_MODEL_NAME)
                log.info("[embed] Model ready.")
            vector = cfg._EMBED_MODEL.encode(text, show_progress_bar=False)
            return vector.tolist()
        except Exception as exc:
            log.warning("embed_text failed (%s) — skipping this alert", exc)
            return []

    # ── LLM ────────────────────────────────────────────────────────────────────
    def call_llm(self, prompt: str, max_tokens: int = cfg.MAX_TOKENS) -> str:
        """
        POST to the vLLM /v1/chat/completions endpoint (Qwen3 chat format).

        Payload shape:   {"model": ..., "messages": [{"role": "user", "content": ...}]}
        Response shape:  choices[0]["message"]["content"]   ← chat completions
                         choices[0]["text"]                 ← legacy completions (fallback)

        Both formats are handled transparently so a single endpoint change in
        config.py is all that's needed if the model is swapped.

        Also strips markdown code fences so callers always receive raw text/JSON.
        Retries on timeout or 5xx with exponential backoff.
        """
        payload = {
            "model":      cfg.LLM_MODEL,
            "messages":   [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": cfg.TEMPERATURE,
        }
        timeout  = (cfg.LLM_TIMEOUT_CONNECT, cfg.LLM_TIMEOUT_READ)
        last_exc = None

        for attempt in range(1, cfg.LLM_RETRIES + 2):
            try:
                log.debug("LLM call attempt %d/%d (connect=%ss read=%ss)",
                          attempt, cfg.LLM_RETRIES + 1,
                          cfg.LLM_TIMEOUT_CONNECT, cfg.LLM_TIMEOUT_READ)
                resp = requests.post(cfg.LLM_ENDPOINT, json=payload, timeout=timeout)
                resp.raise_for_status()
                data   = resp.json()
                choice = data["choices"][0]

                # ── Handle both response formats transparently ─────────────────
                # /v1/chat/completions → choices[0]["message"]["content"]
                # /v1/completions      → choices[0]["text"]
                # Qwen3 thinking mode  → content may be None when reasoning_content
                #                        is present; fall through to empty-check below
                log.debug("LLM choice keys: %s", list(choice.keys()))
                if "message" in choice:
                    raw_text = (choice["message"].get("content") or "").strip()
                elif "text" in choice:
                    raw_text = choice["text"].strip()
                else:
                    log.error(
                        "Unexpected LLM response shape.\n"
                        "  choice keys : %s\n"
                        "  full response (truncated): %s",
                        list(choice.keys()),
                        str(data)[:500],
                    )
                    raise KeyError(
                        f"Neither 'text' nor 'message' found in LLM response. "
                        f"Keys present: {list(choice.keys())}. "
                        f"Verify LLM_ENDPOINT in config.py points to the correct "
                        f"endpoint (/v1/completions vs /v1/chat/completions)."
                    )

                # Strip markdown code fences some models wrap around JSON
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("```")[1]
                    if raw_text.lower().startswith("json"):
                        raw_text = raw_text[4:]
                    raw_text = raw_text.strip()

                if not raw_text:
                    log.warning("LLM returned empty response (attempt %d) — "
                                "finish_reason=%s, usage=%s",
                                attempt,
                                choice.get("finish_reason", "?"),
                                data.get("usage", {}))
                    raise ValueError("Empty LLM response")

                log.debug("LLM raw response (first 200 chars): %s", raw_text[:200])
                return raw_text

            except requests.exceptions.ConnectTimeout as exc:
                last_exc = exc
                log.warning("LLM attempt %d: connect timeout after %ss",
                            attempt, cfg.LLM_TIMEOUT_CONNECT)
            except requests.exceptions.ReadTimeout as exc:
                last_exc = exc
                log.warning("LLM attempt %d: read timeout after %ss — "
                            "consider raising LLM_TIMEOUT_READ in config.py",
                            attempt, cfg.LLM_TIMEOUT_READ)
            except requests.exceptions.HTTPError as exc:
                last_exc = exc
                if exc.response is not None and exc.response.status_code < 500:
                    log.error("LLM call failed (client error, no retry): %s", exc)
                    raise
                log.warning("LLM attempt %d: server error %s", attempt, exc)
            except Exception as exc:
                last_exc = exc
                log.error("LLM call failed (non-retryable): %s", exc)
                raise

            if attempt <= cfg.LLM_RETRIES:
                wait = attempt * 3
                log.info("Retrying in %ss…", wait)
                time.sleep(wait)

        log.error("LLM call failed after %d attempts: %s",
                  cfg.LLM_RETRIES + 1, last_exc)
        raise last_exc

    # ── JSON extraction helper (shared by AnalysisAgent) ──────────────────────
    @staticmethod
    def extract_json(raw: str, alert_id: str) -> dict | None:
        """
        Robustly extract a JSON object from an LLM response string.
        Handles: leading/trailing prose, markdown fences, single-quoted keys.
        Returns None if no valid JSON object can be found.
        """
        if not raw:
            raise ValueError("Empty response from LLM")

        # 1. Try the whole string
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        # 2. Slice the first '{' … last '}'
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = raw[start:end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

            # 3. Fix single-quoted keys (some models output {'key':'val'})
            fixed = re.sub(r"(?<![\\])'", '"', candidate)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError:
                pass

        log.warning("[extract_json] Could not parse JSON for %s. Raw: %s",
                    alert_id, raw[:200])
        return None
