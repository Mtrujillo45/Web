"""Escribe los leads encontrados en un Google Sheet, y evita duplicados
comparando contra los place_id ya existentes en la hoja.

Requiere:
  - Un proyecto de Google Cloud con la "Google Sheets API" habilitada.
  - Una cuenta de servicio (service account) con su JSON de credenciales.
  - Compartir el Google Sheet como Editor con el email de esa cuenta de servicio
    (algo como nombre@proyecto.iam.gserviceaccount.com).
"""

from __future__ import annotations

from datetime import date

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Orden de columnas en la hoja. Si cambias esto, actualiza también el header
# real de la primera fila de tu Google Sheet para que coincida.
HEADERS = [
    "Fecha",
    "Categoria",
    "Nombre Negocio",
    "Direccion",
    "Ciudad Buscada",
    "Telefono",
    "Sitio Web",
    "Email",
    "Rating Google",
    "Estado",
    "Notas",
    "Place ID",
]


def get_sheets_service(service_account_file: str):
    credentials = service_account.Credentials.from_service_account_file(
        service_account_file, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=credentials)


def get_existing_place_ids(service, sheet_id: str, tab_name: str) -> set[str]:
    """Lee la columna Place ID (última columna, ver HEADERS) para no duplicar leads
    en corridas futuras."""
    place_id_col_letter = chr(ord("A") + len(HEADERS) - 1)  # ej. "L" si hay 12 columnas
    range_ = f"{tab_name}!{place_id_col_letter}2:{place_id_col_letter}"
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=range_)
        .execute()
    )
    values = result.get("values", [])
    return {row[0] for row in values if row}


def ensure_header_row(service, sheet_id: str, tab_name: str) -> None:
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=f"{tab_name}!A1:{chr(ord('A') + len(HEADERS) - 1)}1")
        .execute()
    )
    if not result.get("values"):
        service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=f"{tab_name}!A1",
            valueInputOption="RAW",
            body={"values": [HEADERS]},
        ).execute()


def lead_to_row(lead: dict) -> list:
    return [
        date.today().isoformat(),
        lead.get("category", ""),
        lead.get("name", ""),
        lead.get("address", ""),
        lead.get("source_city", ""),
        lead.get("phone", "") or "",
        lead.get("website", "") or "",
        lead.get("email", "") or "",
        lead.get("rating", "") if lead.get("rating") is not None else "",
        "Nuevo",
        "",
        lead.get("place_id", ""),
    ]


def append_leads(service, sheet_id: str, tab_name: str, leads: list[dict]) -> int:
    """Agrega los leads nuevos (que no estén ya por Place ID) al final de la hoja.
    Devuelve cuántas filas nuevas se agregaron."""
    if not leads:
        return 0

    ensure_header_row(service, sheet_id, tab_name)
    existing_ids = get_existing_place_ids(service, sheet_id, tab_name)

    rows = [
        lead_to_row(lead)
        for lead in leads
        if lead.get("place_id") and lead["place_id"] not in existing_ids
    ]

    if not rows:
        return 0

    service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=f"{tab_name}!A1",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()

    return len(rows)
