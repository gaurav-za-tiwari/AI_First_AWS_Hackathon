"""
agent_embedding.py
==================
Agent 1 — EmbeddingAgent

Reads alerts_data.xlsx, converts every alert row into a dense text
representation, embeds it with a local sentence-transformers model, and
upserts the result into a ChromaDB collection persisted on disk.

Key behaviours:
  - Incremental: alert IDs already in the collection are skipped, so
    re-running on the same file costs almost nothing.
  - Graceful degradation: if chromadb / sentence-transformers are not
    installed, falls back to building a lightweight in-memory rule dict
    so the rest of the pipeline still runs.
  - Seeds fallback rules into the shared knowledge base regardless of
    whether RAG is available, giving AnalysisAgent a safety net.
"""

import logging

import pandas as pd

import config as cfg
from orchestrator import BaseAgent, Task

log = logging.getLogger("AML-A2A")


class EmbeddingAgent(BaseAgent):
    name = "EmbeddingAgent"

    # ── Public entry point ─────────────────────────────────────────────────────

    async def handle(self, task: Task) -> dict:
        file_path = task.input["file"]

        if not cfg.RAG_AVAILABLE:
            log.warning("[EmbeddingAgent] RAG packages not available — "
                        "falling back to rule-based KB. "
                        "Run: pip install chromadb sentence-transformers")
            return self._build_fallback_kb(file_path)

        if not __import__("pathlib").Path(file_path).exists():
            raise FileNotFoundError(
                f"Historical alerts file not found: {file_path}\n"
                f"  Place alerts_data.xlsx inside the 'Historical Alerts' folder."
            )
        log.info("[EmbeddingAgent] Loading historical data from %s", file_path)
        all_sheets  = pd.read_excel(file_path, sheet_name=None)
        collection  = self._get_collection()
        existing_ids = set(collection.get(include=[])["ids"])
        log.info("[EmbeddingAgent] Collection '%s' has %d existing vectors",
                 cfg.COLLECTION_NAME, len(existing_ids))

        embedded = skipped = failed = 0

        for sheet_name, df in all_sheets.items():
            df.columns = [c.strip() for c in df.columns]
            for _, row in df.iterrows():
                alert_id = str(row.get("Alert ID", "")).strip()
                if not alert_id:
                    continue

                if alert_id in existing_ids:
                    skipped += 1
                    continue

                row_dict  = self._normalise_row(row, sheet_name)
                text      = self._row_to_text(row_dict)
                embedding = self.embed_text(text)

                if not embedding:
                    log.warning("[EmbeddingAgent] Skipping %s — empty embedding", alert_id)
                    failed += 1
                    continue

                collection.upsert(
                    ids=[alert_id],
                    embeddings=[embedding],
                    documents=[text],
                    metadatas=[self._row_to_metadata(row_dict)],
                )
                embedded += 1

        total = collection.count()
        log.info("[EmbeddingAgent] Done — embedded=%d skipped=%d failed=%d "
                 "| collection total=%d", embedded, skipped, failed, total)

        self.orchestrator.knowledge_base["chroma_collection"] = collection
        self.orchestrator.knowledge_base["rag_available"]     = True
        self._seed_fallback_rules()

        return {
            "status":        "embedded",
            "embedded":      embedded,
            "skipped":       skipped,
            "failed":        failed,
            "total_vectors": total,
        }

    # ── ChromaDB ───────────────────────────────────────────────────────────────

    def _get_collection(self):
        from chromadb.config import Settings
        import chromadb
        client = chromadb.PersistentClient(
            path=cfg.VECTOR_DB_DIR,
            settings=Settings(anonymized_telemetry=False),
        )
        return client.get_or_create_collection(
            name=cfg.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    # ── Row serialisation ──────────────────────────────────────────────────────

    @staticmethod
    def _normalise_row(row, sheet_name: str) -> dict:
        return {
            "sheet":         sheet_name,
            "alert_id":      str(row.get("Alert ID", "")).strip(),
            "alert_type":    str(row.get("Alert Type", "")),
            "alert_type_id": str(row.get("Alert Type ID", "")),
            "score":         float(row.get("Score", 0) or 0),
            "status":        str(row.get("Status", "")),
            "priority":      str(row.get("Priority", "")),
            "description":   str(row.get("Description", "")),
            "amount":        float(row.get("Amount", 0) or 0),
            "currency":      str(row.get("Currency", "")),
            "country":       str(row.get("Country", "")),
        }

    @staticmethod
    def _row_to_text(row: dict) -> str:
        """Compact, embedding-friendly string representation of one alert."""
        return (
            f"AlertType={row.get('alert_type','')} "
            f"Score={row.get('score','')} "
            f"Status={row.get('status','')} "
            f"Priority={row.get('priority','')} "
            f"Country={row.get('country','')} "
            f"Currency={row.get('currency','')} "
            f"Amount={row.get('amount','')} "
            f"Description={str(row.get('description',''))[:120]}"
        )

    @staticmethod
    def _row_to_metadata(row: dict) -> dict:
        """ChromaDB metadata — only str / int / float values allowed."""
        return {
            "sheet":       str(row.get("sheet", "")),
            "alert_id":    str(row.get("alert_id", "")),
            "alert_type":  str(row.get("alert_type", "")),
            "score":       float(row.get("score", 0)),
            "status":      str(row.get("status", "")),
            "priority":    str(row.get("priority", "")),
            "description": str(row.get("description", ""))[:200],
            "country":     str(row.get("country", "")),
            "currency":    str(row.get("currency", "")),
            "amount":      float(row.get("amount", 0)),
        }

    # ── Fallback (no RAG) ──────────────────────────────────────────────────────

    def _seed_fallback_rules(self):
        """Always store lightweight rules so AnalysisAgent has a safety net."""
        kb = self.orchestrator.knowledge_base
        kb.setdefault("closure_criteria", [
            "Score < 75 with Low priority → auto-close",
            "Score < 80 with Medium priority and no high-risk country → auto-close",
            "No cross-border component and score < 70 → auto-close",
        ])
        kb.setdefault("high_risk_indicators", [
            "PEP network", "shell company", "high-risk jurisdiction",
            "phantom shipment", "circular transactions",
        ])
        kb.setdefault("auto_close_score_threshold", 75)
        kb.setdefault("never_auto_close_priorities", ["Critical", "Escalated"])

    def _build_fallback_kb(self, file_path: str) -> dict:
        """
        Used when chromadb / sentence-transformers are not installed.
        Populates in-memory rules so the pipeline degrades gracefully.
        """
        all_sheets = pd.read_excel(file_path, sheet_name=None)
        patterns: list[dict] = []
        for sheet_name, df in all_sheets.items():
            df.columns = [c.strip() for c in df.columns]
            for _, row in df.iterrows():
                patterns.append(self._normalise_row(row, sheet_name))

        kb = {
            "closure_criteria": [
                "Score < 75 with Low priority → auto-close",
                "Score < 80 with Medium priority and no high-risk country → auto-close",
            ],
            "high_risk_indicators": [
                "PEP network", "shell company",
                "high-risk jurisdiction", "phantom shipment",
            ],
            "auto_close_score_threshold":    75,
            "never_auto_close_priorities":   ["Critical", "Escalated"],
            "all_historical_patterns":       patterns,
            "rag_available":                 False,
        }
        self.orchestrator.knowledge_base.update(kb)
        log.info("[EmbeddingAgent] Fallback KB built with %d patterns.", len(patterns))
        return {"status": "fallback_kb", "patterns_count": len(patterns)}
