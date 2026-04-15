"""
agent_analysis.py
=================
Agent 2 — AnalysisAgent

For each open alert in open_alerts_data.xlsx:
  1. Embed the alert with the local sentence-transformers model.
  2. Query ChromaDB for the top-K most similar historical alerts (RAG retrieval).
  3. Send only those K examples to the LLM as context — not the entire file.
  4. Parse the LLM's JSON response into a structured decision dict.
  5. Fall back to a deterministic rule-based decision if the LLM call fails.

All decisions are stored in the shared knowledge base for ReportAgent to consume.
"""

import logging
from pathlib import Path

import pandas as pd

import config as cfg
from orchestrator import BaseAgent, Task

log = logging.getLogger("AML-A2A")


class AnalysisAgent(BaseAgent):
    name = "AnalysisAgent"

    # ── Prompt templates ───────────────────────────────────────────────────────

    # Used when RAG retrieval succeeds — LLM learns by example
    _RAG_PROMPT = (
        "You are an AML compliance officer. Use the similar historical cases below "
        "to decide how to handle the new alert. Respond with ONLY a JSON object — "
        "no explanation, no markdown, no extra text.\n\n"
        "Historical similar cases (learn the pattern from the Status field):\n"
        "{similar_cases}\n\n"
        "Rules:\n"
        "  Score threshold for auto-closure: {threshold}\n"
        "  Never auto-close priorities: {never_close}\n"
        "  High-risk indicators (escalate if present): {high_risk}\n\n"
        "New alert to decide:\n"
        "  ID={alert_id} Type={alert_type} Score={score} "
        "Priority={priority} Country={country}\n"
        "  Amount={amount} {currency}\n"
        "  Description: {description}\n\n"
        'Required JSON: {{"action":"AUTO_CLOSE|ESCALATE|REVIEW",'
        '"confidence":"HIGH|MEDIUM|LOW",'
        '"comment":"<2 sentence professional comment>",'
        '"risk_flags":["flag1"]}}'
    )

    # Used when RAG is unavailable — rule-based prompt
    _FALLBACK_PROMPT = (
        "You are an AML compliance officer. Analyse this alert and respond with "
        "ONLY a JSON object — no explanation, no markdown, no extra text.\n\n"
        "Rules:\n"
        "  Score threshold for auto-closure: {threshold}\n"
        "  Never auto-close priorities: {never_close}\n"
        "  High-risk indicators (escalate if present): {high_risk}\n\n"
        "Alert:\n"
        "  ID={alert_id} Type={alert_type} Score={score} "
        "Priority={priority} Country={country}\n"
        "  Amount={amount} {currency}\n"
        "  Description: {description}\n\n"
        "Required JSON keys (respond with NOTHING else):\n"
        '  {{"action":"AUTO_CLOSE|ESCALATE|REVIEW",'
        '"confidence":"HIGH|MEDIUM|LOW",'
        '"comment":"<2 sentence professional closure comment>",'
        '"risk_flags":["flag1","flag2"]}}'
    )

    # ── Public entry point ─────────────────────────────────────────────────────

    async def handle(self, task: Task) -> dict:
        file_path = task.input["file"]
        if not Path(file_path).exists():
            raise FileNotFoundError(
                f"Open alerts file not found: {file_path}\n"
                f"  Place open_alerts_data.xlsx inside the 'Open Alerts' folder."
            )

        log.info("[AnalysisAgent] Loading open alerts from %s", file_path)
        all_sheets = pd.read_excel(file_path, sheet_name=None)
        kb         = self.orchestrator.knowledge_base

        high_risk_text = ", ".join(kb.get("high_risk_indicators", []))
        threshold      = kb.get("auto_close_score_threshold", 75)
        never_close    = kb.get("never_auto_close_priorities", ["Critical"])

        decisions: list[dict] = []

        for sheet_name, df in all_sheets.items():
            df.columns  = [c.strip() for c in df.columns]
            open_alerts = df[df["Status"].str.strip().str.lower() == "open"]
            log.info("[AnalysisAgent] Sheet '%s': %d open alerts",
                     sheet_name, len(open_alerts))

            for _, row in open_alerts.iterrows():
                alert    = self._normalise_row(row, sheet_name)
                decision = self._analyse_alert(alert, high_risk_text,
                                               threshold, never_close)
                decisions.append(decision)
                log.info("[AnalysisAgent] %s → %s (confidence=%s, rag=%s)",
                         alert["alert_id"], decision["action"],
                         decision["confidence"], decision["rag_used"])

        kb["decisions"] = decisions
        log.info("[AnalysisAgent] Analysis complete. %d decisions made.", len(decisions))
        return {"status": "analysed", "decisions_count": len(decisions)}

    # ── RAG retrieval ──────────────────────────────────────────────────────────

    def _retrieve_similar(self, alert: dict) -> str:
        """
        Embed the open alert and query ChromaDB for RAG_TOP_K most similar
        historical alerts. Returns a formatted context block for the LLM prompt,
        or an empty string if RAG is unavailable.
        """
        collection = self.orchestrator.knowledge_base.get("chroma_collection")
        if collection is None:
            return ""

        query_text = (
            f"AlertType={alert.get('alert_type','')} "
            f"Score={alert.get('score','')} Status=Open "
            f"Priority={alert.get('priority','')} "
            f"Country={alert.get('country','')} "
            f"Currency={alert.get('currency','')} "
            f"Amount={alert.get('amount','')} "
            f"Description={str(alert.get('description',''))[:120]}"
        )

        embedding = self.embed_text(query_text)
        if not embedding:
            log.warning("[AnalysisAgent] Could not embed %s — skipping RAG",
                        alert["alert_id"])
            return ""

        try:
            results = collection.query(
                query_embeddings=[embedding],
                n_results=min(cfg.RAG_TOP_K, collection.count()),
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:
            log.warning("[AnalysisAgent] ChromaDB query failed for %s: %s",
                        alert["alert_id"], exc)
            return ""

        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        if not metadatas:
            return ""

        lines = [f"Top-{len(metadatas)} similar historical alerts (cosine distance):"]
        for i, (meta, dist) in enumerate(zip(metadatas, distances), 1):
            similarity = round((1 - dist) * 100, 1)
            lines.append(
                f"  {i}. [{meta.get('alert_id','')}] "
                f"Type={meta.get('alert_type','')} "
                f"Score={meta.get('score','')} "
                f"Status={meta.get('status','')} "
                f"Priority={meta.get('priority','')} "
                f"Country={meta.get('country','')} "
                f"Desc={meta.get('description','')[:80]} "
                f"(similarity={similarity}%)"
            )

        log.debug("[AnalysisAgent] RAG retrieved %d examples for %s",
                  len(metadatas), alert["alert_id"])
        return "\n".join(lines)

    # ── Decision logic ─────────────────────────────────────────────────────────

    def _analyse_alert(self, alert: dict, high_risk_text: str,
                       threshold: int, never_close: list) -> dict:
        similar_cases = self._retrieve_similar(alert)
        rag_used      = bool(similar_cases)

        prompt_kwargs = dict(
            threshold   = threshold,
            never_close = ", ".join(never_close),
            high_risk   = high_risk_text[:200],
            alert_id    = alert["alert_id"],
            alert_type  = alert["alert_type"],
            score       = alert["score"],
            priority    = alert["priority"],
            country     = alert["country"],
            amount      = alert["amount"],
            currency    = alert["currency"],
            description = alert["description"][:120],
        )

        if rag_used:
            prompt = self._RAG_PROMPT.format(similar_cases=similar_cases,
                                             **prompt_kwargs)
        else:
            prompt = self._FALLBACK_PROMPT.format(**prompt_kwargs)

        result = None
        try:
            raw    = self.call_llm(prompt, max_tokens=200)
            result = self.extract_json(raw, alert["alert_id"])
        except Exception as exc:
            log.warning("[AnalysisAgent] LLM error for %s: %s — using rule-based fallback",
                        alert["alert_id"], exc)

        if result is None:
            result = self._rule_based_decision(alert, threshold,
                                               never_close, high_risk_text)

        result.setdefault("action",     "REVIEW")
        result.setdefault("confidence", "LOW")
        result.setdefault("comment",    "Decision made via fallback rule engine.")
        result.setdefault("risk_flags", [])
        result["action"]   = str(result["action"]).upper()
        result["rag_used"] = rag_used
        result["alert"]    = alert
        return result

    def _rule_based_decision(self, alert: dict, threshold: int,
                             never_close: list, high_risk_text: str) -> dict:
        """Deterministic fallback when the LLM call fails."""
        score      = alert["score"]
        priority   = alert["priority"]
        desc       = alert["description"].lower()
        risk_flags = [kw for kw in high_risk_text.split(", ") if kw.lower() in desc]

        if priority in never_close or risk_flags:
            reason = ("high priority level" if priority in never_close
                      else "presence of high-risk indicators")
            return {
                "action":     "ESCALATE",
                "confidence": "HIGH",
                "comment":    (f"Alert {alert['alert_id']} flagged for escalation "
                               f"due to {reason}. Manual review required."),
                "risk_flags": risk_flags,
            }
        if score <= threshold:
            return {
                "action":     "AUTO_CLOSE",
                "confidence": "MEDIUM",
                "comment":    (f"Alert {alert['alert_id']} meets auto-closure criteria "
                               f"(score {score} ≤ threshold {threshold}, {priority} priority). "
                               "No high-risk indicators detected."),
                "risk_flags": [],
            }
        return {
            "action":     "REVIEW",
            "confidence": "LOW",
            "comment":    (f"Alert {alert['alert_id']} (score {score}) requires review. "
                           "Score exceeds threshold but no immediate escalation triggers found."),
            "risk_flags": [],
        }

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _normalise_row(row, sheet_name: str) -> dict:
        return {
            "sheet":         sheet_name,
            "alert_id":      str(row.get("Alert ID", "")),
            "customer_id":   str(row.get("Customer ID", "")),
            "customer_name": str(row.get("Customer Name", "")),
            "alert_type":    str(row.get("Alert Type", "")),
            "alert_type_id": str(row.get("Alert Type ID", "")),
            "score":         float(row.get("Score", 0) or 0),
            "priority":      str(row.get("Priority", "")),
            "description":   str(row.get("Description", "")),
            "amount":        float(row.get("Amount", 0) or 0),
            "currency":      str(row.get("Currency", "")),
            "country":       str(row.get("Country", "")),
            "created_date":  str(row.get("Created Date", "")),
        }
