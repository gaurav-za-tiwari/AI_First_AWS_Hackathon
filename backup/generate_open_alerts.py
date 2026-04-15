"""
generate_open_alerts.py
-----------------------
Creates a sample open_alerts_data.xlsx for testing the A2A pipeline.
In production, replace this file with your real open alerts export.
"""

import pandas as pd
from pathlib import Path

IB_OPEN = [
    {
        "Alert ID": "ALT-01001", "Customer ID": "C10088",
        "Customer Name": "Mark Sullivan", "Alert Type": "AML IB Americas",
        "Alert Type ID": 1, "Score": 68, "Status": "Open",
        "Assigned To": "analyst1", "Created Date": "2024-03-01",
        "Amount": 45000, "Currency": "USD", "Country": "US",
        "Description": "Unusual cash deposit pattern below reporting threshold",
        "Priority": "Low",
    },
    {
        "Alert ID": "ALT-01002", "Customer ID": "C10091",
        "Customer Name": "Priya Nair", "Alert Type": "AML IB APAC",
        "Alert Type ID": 2, "Score": 92, "Status": "Open",
        "Assigned To": "analyst2", "Created Date": "2024-03-02",
        "Amount": 780000, "Currency": "SGD", "Country": "SG",
        "Description": "Wire transfers to high-risk jurisdiction with shell company involvement",
        "Priority": "Critical",
    },
    {
        "Alert ID": "ALT-01003", "Customer ID": "C10095",
        "Customer Name": "Thomas Braun", "Alert Type": "AML IB EMEA",
        "Alert Type ID": 3, "Score": 71, "Status": "Open",
        "Assigned To": "analyst1", "Created Date": "2024-03-03",
        "Amount": 62000, "Currency": "EUR", "Country": "DE",
        "Description": "Frequent small euro transfers with no apparent business purpose",
        "Priority": "Medium",
    },
]

WMA_OPEN = [
    {
        "Alert ID": "ALT-01101", "Customer ID": "W20055",
        "Customer Name": "Helen Frost", "Alert Type": "AML WMA Americas",
        "Alert Type ID": 4, "Score": 65, "Status": "Open",
        "Assigned To": "analyst3", "Created Date": "2024-03-01",
        "Amount": 320000, "Currency": "USD", "Country": "US",
        "Description": "Minor portfolio rebalancing with no unusual counterparty",
        "Priority": "Low",
    },
    {
        "Alert ID": "ALT-01102", "Customer ID": "W20067",
        "Customer Name": "Liang Wei", "Alert Type": "AML WMA APAC",
        "Alert Type ID": 5, "Score": 88, "Status": "Open",
        "Assigned To": "analyst2", "Created Date": "2024-03-02",
        "Amount": 1500000, "Currency": "HKD", "Country": "HK",
        "Description": "Transfer of wealth inconsistent with declared income and PEP network link",
        "Priority": "High",
    },
]

CB_OPEN = [
    {
        "Alert ID": "ALT-01201", "Customer ID": "B30045",
        "Customer Name": "Crestline Corp", "Alert Type": "AML CB Corporate",
        "Alert Type ID": 8, "Score": 72, "Status": "Open",
        "Assigned To": "analyst1", "Created Date": "2024-03-01",
        "Amount": 210000, "Currency": "USD", "Country": "MX",
        "Description": "Moderate-volume correspondent banking flow, no prior flags",
        "Priority": "Medium",
    },
    {
        "Alert ID": "ALT-01202", "Customer ID": "B30052",
        "Customer Name": "Nexus Trade Ltd", "Alert Type": "AML CB Trade Finance",
        "Alert Type ID": 9, "Score": 85, "Status": "Open",
        "Assigned To": "analyst3", "Created Date": "2024-03-02",
        "Amount": 950000, "Currency": "USD", "Country": "AE",
        "Description": "Invoice discrepancy and phantom shipment documentation detected",
        "Priority": "High",
    },
]


def main():
    out = Path("open_alerts_data.xlsx")
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        pd.DataFrame(IB_OPEN).to_excel(writer, sheet_name="Party IB", index=False)
        pd.DataFrame(WMA_OPEN).to_excel(writer, sheet_name="Party WMA", index=False)
        pd.DataFrame(CB_OPEN).to_excel(writer, sheet_name="Party CB", index=False)
    print(f"Created {out} with {len(IB_OPEN)+len(WMA_OPEN)+len(CB_OPEN)} open alerts.")


if __name__ == "__main__":
    main()
