"""
AML Alert Auto-Closure System — Google A2A Agent Architecture
=============================================================
Agent 1 (TrainingAgent)  : Reads alerts_data.xlsx and builds a knowledge base
                           by sending historical alerts to the LLM for pattern learning.
Agent 2 (AnalysisAgent)  : Reads open_alerts_data.xlsx and analyses each open alert
                           using the trained knowledge base.
Agent 3 (ReportAgent)    : Produces an auto-closure report and writes decisions +
                           comments back into open_alerts_data.xlsx.
Agent 4 (ArchiveAgent)   : Archives alerts_data.xlsx into KB_Processed/ (merging
                           every run into one cumulative master file), then promotes
                           auto_closure_report.xlsx → alerts_data.xlsx so the next
                           pipeline run trains on fresh, enriched data.
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  [%(name)s]  %(message)s",
)
log = logging.getLogger("AML-A2A")

# ── Config ─────────────────────────────────────────────────────────────────────
LLM_ENDPOINT = "http://wiphackq0vcsii.cloudloka.com:8000/v1/completions"
LLM_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"
MAX_TOKENS = 512
TEMPERATURE = 0.3          # lower = more deterministic / consistent

# Timeout tuple: (connect_timeout_seconds, read_timeout_seconds)
# connect — how long to wait for the TCP handshake to complete
# read    — how long to wait for the model to stream back the full response;
#           large prompts with 500+ tokens can take 90-120 s on small GPUs
LLM_TIMEOUT_CONNECT = 15    # seconds to establish connection
LLM_TIMEOUT_READ    = 180   # seconds to receive the full completion
LLM_RETRIES         = 2     # number of retry attempts on timeout / 5xx

# All paths resolve relative to THIS script's directory.
# server.py lives in the same folder and serves open_alerts_data.xlsx
# automatically — Agent 3 writes here so the browser picks it up instantly.
_HERE            = Path(__file__).parent.resolve()
HISTORICAL_FILE  = str(_HERE / "alerts_data.xlsx")
OPEN_ALERTS_FILE = str(_HERE / "open_alerts_data.xlsx")
OUTPUT_FILE      = str(_HERE / "auto_closure_report.xlsx")
KB_PROCESSED_DIR = _HERE / "KB_Processed"   # archive folder — created on first run


# ══════════════════════════════════════════════════════════════════════════════
# A2A PROTOCOL PRIMITIVES
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Task:
    """Minimal A2A Task envelope."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    input: dict = field(default_factory=dict)
    output: dict = field(default_factory=dict)
    status: str = "pending"   # pending | running | done | error
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Message:
    """A2A inter-agent message."""
    sender: str
    recipient: str
    task_id: str
    payload: dict = field(default_factory=dict)


class A2AOrchestrator:
    """
    Lightweight Google A2A-style orchestrator.
    Routes tasks between registered agents and maintains a shared
    artifact store (knowledge_base) that agents can read/write.
    """

    def __init__(self):
        self._agents: dict[str, "BaseAgent"] = {}
        self.knowledge_base: dict[str, Any] = {}
        self.task_log: list[Task] = []

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
        tid1 = str(uuid.uuid4())
        await self.send(Message("orchestrator", "TrainingAgent", tid1,
                                {"file": HISTORICAL_FILE}))

        tid2 = str(uuid.uuid4())
        await self.send(Message("orchestrator", "AnalysisAgent", tid2,
                                {"file": OPEN_ALERTS_FILE}))

        tid3 = str(uuid.uuid4())
        await self.send(Message("orchestrator", "ReportAgent", tid3,
                                {"open_alerts_file": OPEN_ALERTS_FILE,
                                 "output_file": OUTPUT_FILE}))

        tid4 = str(uuid.uuid4())
        result = await self.send(Message("orchestrator", "ArchiveAgent", tid4,
                                         {"historical_file":  HISTORICAL_FILE,
                                          "report_file":      OUTPUT_FILE,
                                          "kb_processed_dir": str(KB_PROCESSED_DIR)}))
        return result


# ══════════════════════════════════════════════════════════════════════════════
# BASE AGENT
# ══════════════════════════════════════════════════════════════════════════════

class BaseAgent:
    name: str = "BaseAgent"

    def __init__(self):
        self.orchestrator: A2AOrchestrator | None = None

    async def handle(self, task: Task) -> dict:
        raise NotImplementedError

    # ── LLM helper ─────────────────────────────────────────────────────────────
    def call_llm(self, prompt: str, max_tokens: int = MAX_TOKENS) -> str:
        payload = {
            "model": LLM_MODEL,
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": TEMPERATURE,
        }
        # Split timeout: (connect, read)
        # A large prompt can take a long time to generate — read timeout is
        # intentionally generous so we don't abort mid-generation.
        timeout = (LLM_TIMEOUT_CONNECT, LLM_TIMEOUT_READ)
        last_exc = None
        for attempt in range(1, LLM_RETRIES + 2):  # 1 original + LLM_RETRIES
            try:
                log.debug("LLM call attempt %d/%d (connect=%ss read=%ss)",
                          attempt, LLM_RETRIES + 1,
                          LLM_TIMEOUT_CONNECT, LLM_TIMEOUT_READ)
                resp = requests.post(LLM_ENDPOINT, json=payload, timeout=timeout)
                resp.raise_for_status()
                data = resp.json()
                # OpenAI-compatible /v1/completions response
                return data["choices"][0]["text"].strip()
            except requests.exceptions.ConnectTimeout as exc:
                last_exc = exc
                log.warning("LLM attempt %d: connect timeout after %ss — %s",
                            attempt, LLM_TIMEOUT_CONNECT, exc)
            except requests.exceptions.ReadTimeout as exc:
                last_exc = exc
                log.warning("LLM attempt %d: read timeout after %ss — "
                            "model is still generating; consider raising "
                            "LLM_TIMEOUT_READ or reducing prompt size", attempt,
                            LLM_TIMEOUT_READ)
            except requests.exceptions.HTTPError as exc:
                last_exc = exc
                # Only retry on 5xx server errors, not 4xx client errors
                if exc.response is not None and exc.response.status_code < 500:
                    log.error("LLM call failed (client error, no retry): %s", exc)
                    raise
                log.warning("LLM attempt %d: server error %s", attempt, exc)
            except Exception as exc:
                last_exc = exc
                log.error("LLM call failed (non-retryable): %s", exc)
                raise

            if attempt <= LLM_RETRIES:
                wait = attempt * 3  # 3 s, 6 s, …
                log.info("Retrying in %ss…", wait)
                import time; time.sleep(wait)

        log.error("LLM call failed after %d attempts: %s", LLM_RETRIES + 1, last_exc)
        raise last_exc


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 1 — TRAINING AGENT
# ══════════════════════════════════════════════════════════════════════════════

class TrainingAgent(BaseAgent):
    """
    Reads alerts_data.xlsx (all sheets), extracts closed / resolved alerts
    and asks the LLM to summarise patterns and closure criteria.
    Stores the resulting knowledge base in the orchestrator's shared store.
    """
    name = "TrainingAgent"

    async def handle(self, task: Task) -> dict:
        file_path = task.input["file"]
        log.info("[TrainingAgent] Loading historical data from %s", file_path)

        all_sheets = pd.read_excel(file_path, sheet_name=None)
        patterns: list[dict] = []

        for sheet_name, df in all_sheets.items():
            df.columns = [c.strip() for c in df.columns]
            # We learn from ALL alerts (open ones teach what NOT to auto-close)
            for _, row in df.iterrows():
                patterns.append({
                    "sheet": sheet_name,
                    "alert_id": str(row.get("Alert ID", "")),
                    "alert_type": str(row.get("Alert Type", "")),
                    "alert_type_id": str(row.get("Alert Type ID", "")),
                    "score": row.get("Score", 0),
                    "status": str(row.get("Status", "")),
                    "priority": str(row.get("Priority", "")),
                    "description": str(row.get("Description", "")),
                    "amount": row.get("Amount", 0),
                    "currency": str(row.get("Currency", "")),
                    "country": str(row.get("Country", "")),
                })

        closed = [p for p in patterns if p["status"].lower() == "closed"]
        open_  = [p for p in patterns if p["status"].lower() == "open"]
        escalated = [p for p in patterns if p["status"].lower() == "escalated"]

        log.info("[TrainingAgent] %d total | %d closed | %d open | %d escalated",
                 len(patterns), len(closed), len(open_), len(escalated))

        # Build a compact training summary to send to the LLM
        training_text = self._build_training_text(closed, open_, escalated)
        prompt = (
            "You are an expert AML (Anti-Money Laundering) compliance analyst.\n"
            "Below are historical AML alerts with their statuses.\n"
            "Analyse the patterns and extract CLEAR, NUMBERED closure criteria "
            "that can be applied to future open alerts.\n"
            "Focus on: risk score thresholds, priority levels, alert types, "
            "transaction amounts, and country risk.\n\n"
            f"{training_text}\n\n"
            "Provide a structured JSON response with keys:\n"
            "  'closure_criteria': list of rule strings\n"
            "  'high_risk_indicators': list of red-flag strings\n"
            "  'auto_close_score_threshold': integer (max score to auto-close)\n"
            "  'never_auto_close_priorities': list of priority strings\n"
            "Return ONLY valid JSON, no markdown fences."
        )

        log.info("[TrainingAgent] Sending training prompt to LLM …")
        raw = self.call_llm(prompt, max_tokens=600)

        try:
            kb = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("[TrainingAgent] LLM returned non-JSON; using defaults")
            kb = self._default_knowledge_base()

        kb["all_historical_patterns"] = patterns
        self.orchestrator.knowledge_base.update(kb)
        log.info("[TrainingAgent] Knowledge base stored. Criteria: %s",
                 kb.get("closure_criteria", []))
        return {"status": "trained", "patterns_count": len(patterns),
                "knowledge_base_keys": list(kb.keys())}

    def _build_training_text(self, closed, open_, escalated) -> str:
        lines = ["=== CLOSED ALERTS (model for auto-closure) ==="]
        for a in closed:
            lines.append(
                f"  [{a['alert_id']}] Type={a['alert_type']} Score={a['score']} "
                f"Priority={a['priority']} Desc={a['description'][:80]}"
            )
        lines.append("\n=== OPEN / IN-REVIEW ALERTS (not yet resolved) ===")
        for a in open_[:5]:   # sample
            lines.append(
                f"  [{a['alert_id']}] Type={a['alert_type']} Score={a['score']} "
                f"Priority={a['priority']} Desc={a['description'][:80]}"
            )
        lines.append("\n=== ESCALATED ALERTS (high-risk, do NOT auto-close) ===")
        for a in escalated:
            lines.append(
                f"  [{a['alert_id']}] Type={a['alert_type']} Score={a['score']} "
                f"Priority={a['priority']} Desc={a['description'][:80]}"
            )
        return "\n".join(lines)

    def _default_knowledge_base(self) -> dict:
        return {
            "closure_criteria": [
                "Score < 75 with Low priority → auto-close",
                "Score < 80 with Medium priority and no PEP/high-risk country → auto-close",
                "No cross-border component and score < 70 → auto-close",
            ],
            "high_risk_indicators": [
                "PEP network", "shell company", "high-risk jurisdiction",
                "phantom shipment", "circular transactions",
            ],
            "auto_close_score_threshold": 75,
            "never_auto_close_priorities": ["Critical", "Escalated"],
        }


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 2 — ANALYSIS AGENT
# ══════════════════════════════════════════════════════════════════════════════

class AnalysisAgent(BaseAgent):
    """
    Reads open_alerts_data.xlsx and for each open alert calls the LLM
    (with the knowledge base as context) to decide: auto-close or escalate,
    and generates a closure comment.
    Stores results in the shared knowledge base.
    """
    name = "AnalysisAgent"

    async def handle(self, task: Task) -> dict:
        file_path = task.input["file"]
        kb = self.orchestrator.knowledge_base

        if not Path(file_path).exists():
            raise FileNotFoundError(
                f"{file_path} not found. Please place it in the working directory."
            )

        log.info("[AnalysisAgent] Loading open alerts from %s", file_path)
        all_sheets = pd.read_excel(file_path, sheet_name=None)

        criteria_text = "\n".join(
            f"  {i+1}. {c}" for i, c in enumerate(kb.get("closure_criteria", []))
        )
        high_risk_text = ", ".join(kb.get("high_risk_indicators", []))
        threshold = kb.get("auto_close_score_threshold", 75)
        never_close = kb.get("never_auto_close_priorities", ["Critical"])

        decisions: list[dict] = []

        for sheet_name, df in all_sheets.items():
            df.columns = [c.strip() for c in df.columns]
            open_alerts = df[df["Status"].str.strip().str.lower() == "open"]
            log.info("[AnalysisAgent] Sheet '%s': %d open alerts", sheet_name, len(open_alerts))

            for _, row in open_alerts.iterrows():
                alert = {
                    "sheet": sheet_name,
                    "alert_id": str(row.get("Alert ID", "")),
                    "customer_id": str(row.get("Customer ID", "")),
                    "customer_name": str(row.get("Customer Name", "")),
                    "alert_type": str(row.get("Alert Type", "")),
                    "alert_type_id": str(row.get("Alert Type ID", "")),
                    "score": float(row.get("Score", 0)),
                    "priority": str(row.get("Priority", "")),
                    "description": str(row.get("Description", "")),
                    "amount": float(row.get("Amount", 0)),
                    "currency": str(row.get("Currency", "")),
                    "country": str(row.get("Country", "")),
                    "created_date": str(row.get("Created Date", "")),
                }

                decision = self._analyse_alert(alert, criteria_text,
                                               high_risk_text, threshold, never_close)
                decisions.append(decision)
                log.info("[AnalysisAgent] %s → %s (confidence=%s)",
                         alert["alert_id"], decision["action"], decision["confidence"])

        self.orchestrator.knowledge_base["decisions"] = decisions
        log.info("[AnalysisAgent] Analysis complete. %d decisions made.", len(decisions))
        return {"status": "analysed", "decisions_count": len(decisions)}

    def _analyse_alert(self, alert: dict, criteria_text: str,
                       high_risk_text: str, threshold: int,
                       never_close: list) -> dict:
        prompt = (
            "You are a senior AML compliance officer making auto-closure decisions.\n\n"
            f"KNOWLEDGE BASE — Closure Criteria:\n{criteria_text}\n\n"
            f"High-Risk Indicators (never auto-close if present): {high_risk_text}\n"
            f"Score threshold for auto-closure: {threshold}\n"
            f"Priorities that must NEVER be auto-closed: {', '.join(never_close)}\n\n"
            "ALERT TO ANALYSE:\n"
            f"  Alert ID   : {alert['alert_id']}\n"
            f"  Customer   : {alert['customer_name']} ({alert['customer_id']})\n"
            f"  Type       : {alert['alert_type']}\n"
            f"  Score      : {alert['score']}\n"
            f"  Priority   : {alert['priority']}\n"
            f"  Amount     : {alert['amount']} {alert['currency']}\n"
            f"  Country    : {alert['country']}\n"
            f"  Description: {alert['description']}\n\n"
            "Respond ONLY with a JSON object containing:\n"
            "  'action'     : 'AUTO_CLOSE' or 'ESCALATE' or 'REVIEW'\n"
            "  'confidence' : 'HIGH' or 'MEDIUM' or 'LOW'\n"
            "  'comment'    : closure/escalation comment (2-3 sentences, professional tone)\n"
            "  'risk_flags' : list of risk flag strings found (empty list if none)\n"
            "Return ONLY valid JSON, no markdown fences."
        )

        try:
            raw = self.call_llm(prompt, max_tokens=300)
            result = json.loads(raw)
        except (json.JSONDecodeError, Exception) as exc:
            log.warning("[AnalysisAgent] LLM parse error for %s: %s — using rule-based fallback",
                        alert["alert_id"], exc)
            result = self._rule_based_decision(alert, threshold, never_close, high_risk_text)

        result["alert"] = alert
        return result

    def _rule_based_decision(self, alert: dict, threshold: int,
                              never_close: list, high_risk_text: str) -> dict:
        """Deterministic fallback if LLM call fails."""
        score = alert["score"]
        priority = alert["priority"]
        desc = alert["description"].lower()
        risk_flags = [kw for kw in high_risk_text.split(", ") if kw.lower() in desc]

        if priority in never_close or risk_flags:
            return {
                "action": "ESCALATE",
                "confidence": "HIGH",
                "comment": (
                    f"Alert {alert['alert_id']} has been flagged for escalation due to "
                    f"{'high priority level' if priority in never_close else 'presence of high-risk indicators'}. "
                    "Manual review by a senior analyst is required before any closure decision."
                ),
                "risk_flags": risk_flags,
            }
        elif score <= threshold:
            return {
                "action": "AUTO_CLOSE",
                "confidence": "MEDIUM",
                "comment": (
                    f"Alert {alert['alert_id']} meets the auto-closure criteria with a risk score "
                    f"of {score} (below threshold of {threshold}) and {priority} priority. "
                    "No high-risk indicators detected in the transaction description."
                ),
                "risk_flags": [],
            }
        else:
            return {
                "action": "REVIEW",
                "confidence": "LOW",
                "comment": (
                    f"Alert {alert['alert_id']} (score {score}) requires further review. "
                    "Risk score exceeds auto-closure threshold but no immediate escalation triggers found. "
                    "Assign to analyst for manual assessment."
                ),
                "risk_flags": [],
            }


# ══════════════════════════════════════════════════════════════════════════════
# AGENT 3 — REPORT AGENT
# ══════════════════════════════════════════════════════════════════════════════

class ReportAgent(BaseAgent):
    """
    Generates the auto-closure report Excel and writes decisions + comments
    back into the open_alerts_data.xlsx file.
    """
    name = "ReportAgent"

    # colour palette
    COLOURS = {
        "AUTO_CLOSE": "C6EFCE",   # green
        "ESCALATE":   "FFCCCC",   # red
        "REVIEW":     "FFEB9C",   # amber
        "header_bg":  "1F4E79",   # dark blue
        "header_fg":  "FFFFFF",
        "sub_bg":     "D6E4F0",
    }

    async def handle(self, task: Task) -> dict:
        open_file  = task.input["open_alerts_file"]
        output     = task.input["output_file"]
        decisions  = self.orchestrator.knowledge_base.get("decisions", [])
        kb         = self.orchestrator.knowledge_base

        log.info("[ReportAgent] Building auto-closure report for %d decisions", len(decisions))

        # 1. Write decisions back into open_alerts_data.xlsx
        self._annotate_source_file(open_file, decisions)

        # 2. Build standalone report workbook
        self._build_report_workbook(output, decisions, kb)

        auto_closed = sum(1 for d in decisions if d["action"] == "AUTO_CLOSE")
        escalated   = sum(1 for d in decisions if d["action"] == "ESCALATE")
        review      = sum(1 for d in decisions if d["action"] == "REVIEW")

        log.info("[ReportAgent] Report saved to %s — AUTO_CLOSE=%d ESCALATE=%d REVIEW=%d",
                 output, auto_closed, escalated, review)
        return {"output_file": output, "auto_closed": auto_closed,
                "escalated": escalated, "review": review}

    # ── annotate source file ────────────────────────────────────────────────────

    def _annotate_source_file(self, file_path: str, decisions: list[dict]):
        """Add Action, Comment, Risk Flags, Processed At columns to open_alerts_data.xlsx."""
        if not Path(file_path).exists():
            log.warning("[ReportAgent] %s not found; skipping annotation.", file_path)
            return

        wb = load_workbook(file_path)
        decision_map = {d["alert"]["alert_id"]: d for d in decisions}

        for ws in wb.worksheets:
            headers = [cell.value for cell in ws[1]]
            if "Alert ID" not in headers:
                continue

            id_col = headers.index("Alert ID") + 1   # 1-based

            # Add new columns if not present
            new_cols = ["Action", "Closure Comment", "Risk Flags", "Processed At"]
            for col_name in new_cols:
                if col_name not in headers:
                    ws.cell(row=1, column=len(headers) + 1,
                            value=col_name).font = Font(bold=True)
                    headers.append(col_name)

            action_col  = headers.index("Action") + 1
            comment_col = headers.index("Closure Comment") + 1
            flags_col   = headers.index("Risk Flags") + 1
            ts_col      = headers.index("Processed At") + 1
            status_col  = headers.index("Status") + 1 if "Status" in headers else None

            for row_idx in range(2, ws.max_row + 1):
                alert_id = str(ws.cell(row=row_idx, column=id_col).value or "")
                if alert_id not in decision_map:
                    continue
                dec = decision_map[alert_id]
                action = dec.get("action", "")
                fill = PatternFill("solid",
                                   start_color=self.COLOURS.get(action, "FFFFFF"))

                ws.cell(row=row_idx, column=action_col, value=action).fill = fill
                ws.cell(row=row_idx, column=comment_col,
                        value=dec.get("comment", "")).alignment = Alignment(wrap_text=True)
                ws.cell(row=row_idx, column=flags_col,
                        value=", ".join(dec.get("risk_flags", [])))
                ws.cell(row=row_idx, column=ts_col,
                        value=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))

                if status_col and action == "AUTO_CLOSE":
                    ws.cell(row=row_idx, column=status_col, value="Closed")

        wb.save(file_path)
        log.info("[ReportAgent] Annotated %s", file_path)

    # ── standalone report workbook ──────────────────────────────────────────────

    def _build_report_workbook(self, output: str, decisions: list[dict], kb: dict):
        from openpyxl import Workbook

        wb = Workbook()
        self._write_summary_sheet(wb.active, decisions, kb)
        self._write_detail_sheet(wb.create_sheet("Alert Decisions"), decisions)
        self._write_kb_sheet(wb.create_sheet("Knowledge Base"), kb)
        wb.save(output)

    def _hdr(self, cell, text: str, bold=True, bg=None, fg=None):
        cell.value = text
        cell.font = Font(bold=bold,
                         color=fg or self.COLOURS["header_fg"],
                         name="Arial", size=11)
        if bg:
            cell.fill = PatternFill("solid", start_color=bg)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    def _write_summary_sheet(self, ws, decisions, kb):
        ws.title = "Summary"
        ws.column_dimensions["A"].width = 28
        ws.column_dimensions["B"].width = 18

        auto   = [d for d in decisions if d["action"] == "AUTO_CLOSE"]
        esc    = [d for d in decisions if d["action"] == "ESCALATE"]
        review = [d for d in decisions if d["action"] == "REVIEW"]

        ws.row_dimensions[1].height = 36
        self._hdr(ws["A1"], "AML ALERT AUTO-CLOSURE REPORT", bg=self.COLOURS["header_bg"])
        ws.merge_cells("A1:B1")

        rows = [
            ("Generated At",    datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")),
            ("Total Open Alerts Analysed", len(decisions)),
            ("Auto-Closed",     len(auto)),
            ("Escalated",       len(esc)),
            ("Needs Review",    len(review)),
            ("Score Threshold", kb.get("auto_close_score_threshold", "N/A")),
        ]
        for r, (k, v) in enumerate(rows, start=2):
            ws.cell(row=r, column=1, value=k).font = Font(bold=True, name="Arial")
            ws.cell(row=r, column=2, value=v).alignment = Alignment(horizontal="center")

        # Mini table: action breakdown by sheet
        row = len(rows) + 3
        self._hdr(ws.cell(row=row, column=1), "Sheet", bg=self.COLOURS["sub_bg"],
                  fg="000000")
        self._hdr(ws.cell(row=row, column=2), "# Alerts", bg=self.COLOURS["sub_bg"],
                  fg="000000")
        row += 1
        sheets_seen = {}
        for d in decisions:
            s = d["alert"].get("sheet", "Unknown")
            sheets_seen[s] = sheets_seen.get(s, 0) + 1
        for sheet_name, cnt in sheets_seen.items():
            ws.cell(row=row, column=1, value=sheet_name)
            ws.cell(row=row, column=2, value=cnt)
            row += 1

    def _write_detail_sheet(self, ws, decisions):
        ws.column_dimensions["A"].width = 12
        ws.column_dimensions["B"].width = 14
        ws.column_dimensions["C"].width = 20
        ws.column_dimensions["D"].width = 24
        ws.column_dimensions["E"].width = 10
        ws.column_dimensions["F"].width = 12
        ws.column_dimensions["G"].width = 12
        ws.column_dimensions["H"].width = 14
        ws.column_dimensions["I"].width = 50
        ws.column_dimensions["J"].width = 30

        headers = ["Alert ID", "Sheet", "Customer Name", "Alert Type",
                   "Score", "Priority", "Action", "Confidence",
                   "Closure Comment", "Risk Flags"]
        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = Font(bold=True, color=self.COLOURS["header_fg"],
                             name="Arial", size=10)
            cell.fill = PatternFill("solid", start_color=self.COLOURS["header_bg"])
            cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws.row_dimensions[1].height = 22

        for r, d in enumerate(decisions, start=2):
            a = d["alert"]
            action = d.get("action", "")
            fill = PatternFill("solid",
                               start_color=self.COLOURS.get(action, "FFFFFF"))
            row_data = [
                a.get("alert_id", ""),
                a.get("sheet", ""),
                a.get("customer_name", ""),
                a.get("alert_type", ""),
                a.get("score", ""),
                a.get("priority", ""),
                action,
                d.get("confidence", ""),
                d.get("comment", ""),
                ", ".join(d.get("risk_flags", [])),
            ]
            for col, val in enumerate(row_data, 1):
                cell = ws.cell(row=r, column=col, value=val)
                cell.font = Font(name="Arial", size=10)
                if col in (7, 8):   # Action, Confidence columns get colour
                    cell.fill = fill
                cell.alignment = Alignment(wrap_text=True, vertical="top")
            ws.row_dimensions[r].height = 48

    def _write_kb_sheet(self, ws, kb):
        ws.column_dimensions["A"].width = 10
        ws.column_dimensions["B"].width = 80

        self._hdr(ws.cell(row=1, column=1), "#",
                  bg=self.COLOURS["header_bg"])
        self._hdr(ws.cell(row=1, column=2), "Closure Criteria (learned from historical data)",
                  bg=self.COLOURS["header_bg"])

        for i, rule in enumerate(kb.get("closure_criteria", []), start=2):
            ws.cell(row=i, column=1, value=i - 1)
            cell = ws.cell(row=i, column=2, value=rule)
            cell.alignment = Alignment(wrap_text=True)

        row = len(kb.get("closure_criteria", [])) + 3
        ws.cell(row=row, column=1,
                value="High-Risk Indicators").font = Font(bold=True)
        ws.cell(row=row, column=2,
                value=", ".join(kb.get("high_risk_indicators", [])))



# ══════════════════════════════════════════════════════════════════════════════
# AGENT 4 — ARCHIVE AGENT
# ══════════════════════════════════════════════════════════════════════════════

class ArchiveAgent(BaseAgent):
    """
    Runs after ReportAgent. Responsibilities in order:

    1. ARCHIVE  — copy alerts_data.xlsx into KB_Processed/ with a timestamped
                  name, then merge it into a single cumulative master file
                  (KB_Processed/master_kb.xlsx).  Every run appends; the master
                  file is created on the first run automatically.

    2. PROMOTE  — rename auto_closure_report.xlsx → alerts_data.xlsx so the
                  next pipeline run trains on the freshly decided data.
    """
    name = "ArchiveAgent"

    # ── Column sets we expect across sheets ────────────────────────────────────
    # The master KB inherits whatever columns exist; new columns from later runs
    # are appended with NaN for older rows — pandas handles this automatically.

    async def handle(self, task: Task) -> dict:
        historical  = Path(task.input["historical_file"])
        report      = Path(task.input["report_file"])
        kb_dir      = Path(task.input["kb_processed_dir"])
        run_ts      = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        # ── Validate prerequisites ──────────────────────────────────────────────
        if not historical.exists():
            raise FileNotFoundError(f"[ArchiveAgent] Historical file missing: {historical}")
        if not report.exists():
            raise FileNotFoundError(f"[ArchiveAgent] Report file missing: {report}")

        # ── Step 1: Create KB_Processed/ if it doesn't exist ───────────────────
        kb_dir.mkdir(parents=True, exist_ok=True)
        log.info("[ArchiveAgent] KB_Processed dir: %s", kb_dir)

        # ── Step 2: Copy alerts_data.xlsx → KB_Processed/<timestamp>_alerts_data.xlsx
        archived_name = f"{run_ts}_alerts_data.xlsx"
        archived_path = kb_dir / archived_name
        import shutil
        shutil.copy2(historical, archived_path)
        log.info("[ArchiveAgent] Archived → %s", archived_path)

        # ── Step 3: Merge archived file into master_kb.xlsx ────────────────────
        master_path   = kb_dir / "master_kb.xlsx"
        merge_result  = self._merge_into_master(archived_path, master_path, run_ts)

        # ── Step 4: Promote report → alerts_data.xlsx ──────────────────────────
        # Remove the old historical file first, then move the report into its place.
        historical.unlink()
        shutil.move(str(report), str(historical))
        log.info("[ArchiveAgent] Promoted %s → %s", report.name, historical.name)

        return {
            "archived_as":       archived_name,
            "master_kb":         str(master_path),
            "master_total_rows": merge_result["total_rows"],
            "master_run_count":  merge_result["run_count"],
            "new_alerts_data":   str(historical),
        }

    # ── Merge helper ────────────────────────────────────────────────────────────

    def _merge_into_master(self, source: Path, master: Path, run_ts: str) -> dict:
        """
        Reads `source` (the just-archived snapshot) and appends every sheet's
        rows into the matching sheet of `master`.  A '_run_timestamp' column is
        added to every row so you can trace which pipeline run produced it.

        Sheet names are matched by name; if a sheet appears in `source` but not
        yet in `master`, it is created.  If `master` does not exist yet (first
        run), it is created from scratch.
        """
        # Read incoming snapshot
        source_sheets: dict[str, pd.DataFrame] = pd.read_excel(source, sheet_name=None)

        # Stamp every row with the run timestamp
        for sheet_name, df in source_sheets.items():
            df["_run_timestamp"] = run_ts
            source_sheets[sheet_name] = df

        if not master.exists():
            # ── First run: just write the source as-is ─────────────────────────
            log.info("[ArchiveAgent] master_kb.xlsx does not exist — creating fresh.")
            with pd.ExcelWriter(str(master), engine="openpyxl") as writer:
                for sheet_name, df in source_sheets.items():
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
            total_rows = sum(len(df) for df in source_sheets.values())
            self._apply_master_formatting(master)
            log.info("[ArchiveAgent] master_kb.xlsx created with %d rows.", total_rows)
            return {"total_rows": total_rows, "run_count": 1}

        # ── Subsequent runs: load existing master and append ───────────────────
        existing_sheets: dict[str, pd.DataFrame] = pd.read_excel(master, sheet_name=None)

        # Detect run count from existing data
        sample_df = next(iter(existing_sheets.values()), pd.DataFrame())
        if "_run_timestamp" in sample_df.columns:
            run_count = sample_df["_run_timestamp"].nunique() + 1
        else:
            run_count = 2   # master existed but had no timestamp column

        merged_sheets: dict[str, pd.DataFrame] = {}

        all_sheet_names = set(existing_sheets) | set(source_sheets)
        for sheet_name in all_sheet_names:
            existing_df = existing_sheets.get(sheet_name, pd.DataFrame())
            incoming_df = source_sheets.get(sheet_name, pd.DataFrame())
            merged = pd.concat([existing_df, incoming_df], ignore_index=True, sort=False)
            merged_sheets[sheet_name] = merged

        total_rows = sum(len(df) for df in merged_sheets.values())

        # Write merged master (overwrite in place)
        with pd.ExcelWriter(str(master), engine="openpyxl") as writer:
            for sheet_name, df in merged_sheets.items():
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        self._apply_master_formatting(master)
        log.info("[ArchiveAgent] master_kb.xlsx updated — run #%d, %d total rows.",
                 run_count, total_rows)
        return {"total_rows": total_rows, "run_count": run_count}

    # ── Light formatting for the master file ────────────────────────────────────

    def _apply_master_formatting(self, master: Path):
        """Freeze header row, bold headers, auto-filter on every sheet."""
        from openpyxl.utils import get_column_letter
        wb = load_workbook(str(master))
        for ws in wb.worksheets:
            if ws.max_row < 1:
                continue
            ws.freeze_panes = "A2"
            last_col = get_column_letter(ws.max_column)
            ws.auto_filter.ref = f"A1:{last_col}{ws.max_row}"
            for cell in ws[1]:
                cell.font = Font(bold=True, name="Calibri", size=10,
                                 color="FFFFFF")
                cell.fill = PatternFill("solid", start_color="1F4E79")
                cell.alignment = Alignment(horizontal="center", vertical="center")
            # Highlight the _run_timestamp column in a muted teal so it stands out
            for col_idx, cell in enumerate(ws[1], 1):
                if str(cell.value) == "_run_timestamp":
                    for row_idx in range(1, ws.max_row + 1):
                        rc = ws.cell(row=row_idx, column=col_idx)
                        rc.fill = PatternFill("solid", start_color="D6E4F0")
        wb.save(str(master))


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

async def main():
    print("\n" + "═" * 70)
    print("  AML Alert Auto-Closure System — A2A Agent Pipeline")
    print("═" * 70 + "\n")

    orchestrator = A2AOrchestrator()
    orchestrator.register(TrainingAgent())
    orchestrator.register(AnalysisAgent())
    orchestrator.register(ReportAgent())
    orchestrator.register(ArchiveAgent())

    result = await orchestrator.run_pipeline()
    print("\n" + "═" * 70)
    print("  Pipeline Complete!")
    print(f"  ✓ Auto-Closed  : {result.output.get('auto_closed', 0)}")
    print(f"  ✗ Escalated    : {result.output.get('escalated', 0)}")
    print(f"  ? Needs Review : {result.output.get('review', 0)}")
    print(f"  Archived as    : {result.output.get('archived_as', '—')}")
    print(f"  Master KB rows : {result.output.get('master_total_rows', '—')}")
    print(f"  Master KB runs : {result.output.get('master_run_count', '—')}")
    print(f"  New training   : {result.output.get('new_alerts_data', '—')}")
    print("═" * 70 + "\n")

    print("\nFull task log:")
    for t in orchestrator.task_log:
        print(f"  [{t.status.upper():7s}] {t.name:20s} — {json.dumps(t.output)}")


if __name__ == "__main__":
    asyncio.run(main())
