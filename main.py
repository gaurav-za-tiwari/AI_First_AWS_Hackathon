"""
main.py
=======
Entry point for the AML Alert Auto-Closure System.

Registers the four agents with the A2A orchestrator and runs the pipeline.
All logic lives in the agent and config modules — this file is intentionally
kept thin so the pipeline is easy to read at a glance.

Usage:
    python main.py

Pipeline order:
    EmbeddingAgent  →  AnalysisAgent  →  ReportAgent  →  ArchiveAgent
"""

import asyncio
import json

from orchestrator import A2AOrchestrator
from agent_embedding import EmbeddingAgent
from agent_analysis  import AnalysisAgent
from agent_report    import ReportAgent
from agent_archive   import ArchiveAgent
import config as cfg


async def main():
    print("\n" + "═" * 70)
    print("  AML Alert Auto-Closure System — A2A Agent Pipeline")
    print("═" * 70 + "\n")

    # ── Show resolved folder paths ────────────────────────────────────────────
    print("  Folders")
    print(f"    Input  (historical) : {cfg.DIR_HISTORICAL}")
    print(f"    Input  (open alerts): {cfg.DIR_OPEN_ALERTS}")
    print(f"    Output (report)     : {cfg.DIR_CLOSURE}")
    print(f"    Archive (historical): {cfg.KB_PROCESSED_DIR}")
    print(f"    Archive (open)      : {cfg.DIR_PROCESSED_ALERT}")
    print()

    # ── Probe the LLM endpoint ────────────────────────────────────────────────
    probe = cfg.probe_llm_endpoint()
    if not probe["reachable"]:
        print(f"  ⚠  LLM endpoint unreachable: {probe['raw_snippet']}")
        print("     Check LLM_ENDPOINT in config.py and ensure the server is running.")
    else:
        print(f"  ✓ LLM endpoint OK  [format={probe['format']}  "
              f"keys={probe['choice_keys']}]")
    print()

    orchestrator = A2AOrchestrator()
    orchestrator.register(EmbeddingAgent())
    orchestrator.register(AnalysisAgent())
    orchestrator.register(ReportAgent())
    orchestrator.register(ArchiveAgent())

    result = await orchestrator.run_pipeline()
    rag_on = orchestrator.knowledge_base.get("rag_available", False)

    print("\n" + "═" * 70)
    print(f"  Pipeline Complete!  [RAG={'ON' if rag_on else 'OFF (fallback)'}]")
    print(f"  ✓ Auto-Closed  : {result.output.get('auto_closed', 0)}")
    print(f"  ✗ Escalated    : {result.output.get('escalated', 0)}")
    print(f"  ? Needs Review : {result.output.get('review', 0)}")
    print(f"  Report saved   : {result.output.get('output_file', '—')}")
    print(f"  Archived hist  : {result.output.get('archived_historical', '—')}")
    print(f"  Archived open  : {result.output.get('archived_open_alerts', '—')}")
    print(f"  Master KB rows : {result.output.get('master_total_rows', '—')}")
    print(f"  Master KB runs : {result.output.get('master_run_count', '—')}")
    print("═" * 70 + "\n")

    print("Full task log:")
    for t in orchestrator.task_log:
        print(f"  [{t.status.upper():7s}] {t.name:20s} — {json.dumps(t.output)}")


if __name__ == "__main__":
    asyncio.run(main())
