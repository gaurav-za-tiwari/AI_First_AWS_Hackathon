"""
agent_archive.py
================
Agent 4 — ArchiveAgent

Runs after ReportAgent. Two responsibilities:

1. ARCHIVE — copy alerts_data.xlsx into KB_Processed/ with a UTC timestamp
             in the filename, then merge it into a single cumulative master
             file (KB_Processed/master_kb.xlsx).  Every run appends new rows;
             the master file is created on the first run automatically.
             A _run_timestamp column is added to every row so you can trace
             which pipeline run produced each record.

2. PROMOTE — delete "Historical Alerts/alerts_data.xlsx" and move
             "Closure Report/auto_closure_report.xlsx" into its place so the
             next pipeline run trains Agent 1 on freshly decided data,
             creating a self-improving loop.
"""

import logging
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

import config as cfg
from orchestrator import BaseAgent, Task

log = logging.getLogger("AML-A2A")


class ArchiveAgent(BaseAgent):
    name = "ArchiveAgent"

    # ── Public entry point ─────────────────────────────────────────────────────

    async def handle(self, task: Task) -> dict:
        historical = Path(task.input["historical_file"])
        report     = Path(task.input["report_file"])
        kb_dir     = Path(task.input["kb_processed_dir"])
        run_ts     = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        if not historical.exists():
            raise FileNotFoundError(f"[ArchiveAgent] Missing: {historical}")
        if not report.exists():
            raise FileNotFoundError(f"[ArchiveAgent] Missing: {report}")

        # Step 1 — ensure KB_Processed/ exists
        kb_dir.mkdir(parents=True, exist_ok=True)
        log.info("[ArchiveAgent] KB_Processed dir: %s", kb_dir)

        # Step 2 — archive Historical Alerts/alerts_data.xlsx with timestamp
        archived_name = f"{run_ts}_alerts_data.xlsx"
        archived_path = kb_dir / archived_name
        shutil.copy2(historical, archived_path)
        log.info("[ArchiveAgent] Archived %s → %s", historical.name, archived_path)

        # Step 3 — merge into master_kb.xlsx
        master_path  = kb_dir / "master_kb.xlsx"
        merge_result = self._merge_into_master(archived_path, master_path, run_ts)

        # Step 4 — promote Closure Report → Historical Alerts/alerts_data.xlsx
        # Remove the old historical file first, then move the report into its place.
        historical.unlink()
        shutil.move(str(report), str(historical))
        log.info("[ArchiveAgent] Promoted  %s  →  Historical Alerts/%s",
                 report.name, historical.name)

        return {
            "archived_as":       archived_name,
            "master_kb":         str(master_path),
            "master_total_rows": merge_result["total_rows"],
            "master_run_count":  merge_result["run_count"],
            "new_alerts_data":   str(historical),
        }

    # ── Merge logic ────────────────────────────────────────────────────────────

    def _merge_into_master(self, source: Path, master: Path,
                           run_ts: str) -> dict:
        """
        Reads the just-archived snapshot and appends every sheet's rows into
        the matching sheet of master_kb.xlsx.

        - First run: creates master_kb.xlsx from scratch.
        - Subsequent runs: loads existing master and concatenates new rows.
        - Sheet names are matched by name; new sheets are created if needed.
        - A _run_timestamp column is stamped on every incoming row.
        """
        source_sheets: dict[str, pd.DataFrame] = pd.read_excel(
            source, sheet_name=None
        )
        for sheet_name, df in source_sheets.items():
            df["_run_timestamp"] = run_ts
            source_sheets[sheet_name] = df

        if not master.exists():
            log.info("[ArchiveAgent] master_kb.xlsx not found — creating fresh.")
            with pd.ExcelWriter(str(master), engine="openpyxl") as writer:
                for sheet_name, df in source_sheets.items():
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
            total_rows = sum(len(df) for df in source_sheets.values())
            self._apply_master_formatting(master)
            log.info("[ArchiveAgent] master_kb.xlsx created with %d rows.", total_rows)
            return {"total_rows": total_rows, "run_count": 1}

        # Subsequent runs — load and concatenate
        existing_sheets: dict[str, pd.DataFrame] = pd.read_excel(
            master, sheet_name=None
        )
        sample_df = next(iter(existing_sheets.values()), pd.DataFrame())
        run_count = (sample_df["_run_timestamp"].nunique() + 1
                     if "_run_timestamp" in sample_df.columns else 2)

        merged_sheets: dict[str, pd.DataFrame] = {}
        for sheet_name in set(existing_sheets) | set(source_sheets):
            merged_sheets[sheet_name] = pd.concat(
                [existing_sheets.get(sheet_name, pd.DataFrame()),
                 source_sheets.get(sheet_name, pd.DataFrame())],
                ignore_index=True, sort=False,
            )

        total_rows = sum(len(df) for df in merged_sheets.values())
        with pd.ExcelWriter(str(master), engine="openpyxl") as writer:
            for sheet_name, df in merged_sheets.items():
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        self._apply_master_formatting(master)
        log.info("[ArchiveAgent] master_kb.xlsx updated — run #%d, %d rows.",
                 run_count, total_rows)
        return {"total_rows": total_rows, "run_count": run_count}

    # ── Formatting ─────────────────────────────────────────────────────────────

    def _apply_master_formatting(self, master: Path):
        """Freeze header row, bold navy headers, highlight _run_timestamp column."""
        wb = load_workbook(str(master))
        for ws in wb.worksheets:
            if ws.max_row < 1:
                continue
            ws.freeze_panes = "A2"
            last_col = get_column_letter(ws.max_column)
            ws.auto_filter.ref = f"A1:{last_col}{ws.max_row}"

            for cell in ws[1]:
                cell.font      = Font(bold=True, name="Calibri", size=10,
                                      color="FFFFFF")
                cell.fill      = PatternFill("solid", start_color="1F4E79")
                cell.alignment = Alignment(horizontal="center", vertical="center")

            # Highlight _run_timestamp column in muted teal for easy identification
            for col_idx, cell in enumerate(ws[1], 1):
                if str(cell.value) == "_run_timestamp":
                    for row_idx in range(1, ws.max_row + 1):
                        ws.cell(row=row_idx, column=col_idx).fill = PatternFill(
                            "solid", start_color="D6E4F0"
                        )
        wb.save(str(master))
