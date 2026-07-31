"""Orquestador de la herramienta de prospección de Mompossina.

Flujo:
  1. Lee config/search_config.yaml (categorías, ciudades, límites).
  2. Busca negocios con la API de Google Places (New) para cada
     combinación categoría x ciudad, respetando el tope de requests.
  3. Deduplica por place_id.
  4. Para cada negocio con sitio web, intenta encontrar un email de contacto.
  5. Guarda todo en un CSV local (siempre) y, si no es --dry-run y hay
     credenciales de Sheets configuradas, agrega los leads nuevos al
     Google Sheet de seguimiento.

Uso:
    python -m src.main --dry-run
    python -m src.main --limit 20
    python -m src.main --category swimwear --city "Miami, FL"
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path

from src import config as config_module
from src import sheets_client
from src.enrichment import find_contact_email
from src.places_client import PlacesApiError, PlacesClient

OUTPUT_DIR = config_module.PROJECT_ROOT / "output"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Prospección de clientes para Mompossina")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="No escribe al Google Sheet, solo genera el CSV local.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Máximo de leads únicos a recolectar en esta corrida (para pruebas rápidas/baratas).",
    )
    parser.add_argument(
        "--category",
        type=str,
        default=None,
        help="Correr solo una categoría de config/search_config.yaml (ej. swimwear).",
    )
    parser.add_argument(
        "--city",
        type=str,
        default=None,
        help='Correr solo una ciudad (ej. "Miami, FL").',
    )
    parser.add_argument(
        "--skip-enrichment",
        action="store_true",
        help="No visitar los sitios web de los negocios para buscar email (más rápido).",
    )
    return parser.parse_args(argv)


def run(argv=None) -> int:
    args = parse_args(argv)

    search_config = config_module.load_search_config()
    creds = config_module.load_credentials()

    if not creds.places_api_key:
        print(
            "ERROR: no está configurado GOOGLE_PLACES_API_KEY en .env.\n"
            "Copia .env.example a .env y sigue los pasos del README para crear "
            "el proyecto de Google Cloud y la API key de Places API (New).",
            file=sys.stderr,
        )
        return 1

    client = PlacesClient(api_key=creds.places_api_key)

    leads_by_place_id: dict[str, dict] = {}

    for category, query, city in search_config.all_queries():
        if args.category and category != args.category:
            continue
        if args.city and city != args.city:
            continue
        if args.limit and len(leads_by_place_id) >= args.limit:
            break
        if client.requests_made >= search_config.max_api_requests_per_run:
            print(
                f"Tope de {search_config.max_api_requests_per_run} requests a Places API "
                "alcanzado para esta corrida. Sube 'max_api_requests_per_run' en la config "
                "si necesitas más resultados."
            )
            break

        text_query = f"{query} in {city}"
        try:
            results = client.text_search(
                text_query=text_query,
                category=category,
                source_query=query,
                source_city=city,
                max_results=search_config.max_results_per_query,
                request_budget=search_config.max_api_requests_per_run,
            )
        except PlacesApiError as exc:
            print(f"Aviso: falló la búsqueda '{text_query}': {exc}", file=sys.stderr)
            continue

        print(f"'{text_query}' -> {len(results)} resultados")

        for place in results:
            if place.place_id and place.place_id not in leads_by_place_id:
                leads_by_place_id[place.place_id] = place.__dict__

    leads = list(leads_by_place_id.values())
    if args.limit:
        leads = leads[: args.limit]

    print(f"\nTotal de negocios únicos encontrados: {len(leads)}")

    if not args.skip_enrichment:
        print("Buscando emails de contacto en los sitios web (esto toma un rato)...")
        for lead in leads:
            lead["email"] = find_contact_email(
                website_url=lead.get("website"),
                user_agent=search_config.enrichment_user_agent,
                delay_seconds=search_config.enrichment_delay_seconds,
            )
    else:
        for lead in leads:
            lead["email"] = None

    csv_path = _write_csv(leads)
    print(f"CSV local guardado en: {csv_path}")

    if args.dry_run:
        print("Modo --dry-run: no se escribió en Google Sheets.")
        return 0

    if not (creds.oauth_client_secret_file and creds.sheet_id):
        print(
            "Aviso: faltan GOOGLE_OAUTH_CLIENT_SECRET_FILE o GOOGLE_SHEET_ID en .env, "
            "así que no se pudo escribir en Google Sheets (los datos igual quedaron en el CSV)."
        )
        return 0

    service = sheets_client.get_sheets_service(creds.oauth_client_secret_file, creds.oauth_token_file)
    added = sheets_client.append_leads(service, creds.sheet_id, creds.sheet_tab_name, leads)
    print(f"Google Sheets: {added} leads nuevos agregados (se saltaron los duplicados por Place ID).")

    return 0


def _write_csv(leads: list[dict]) -> Path:
    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"leads_{timestamp}.csv"

    fieldnames = [
        "category",
        "name",
        "address",
        "source_city",
        "phone",
        "website",
        "email",
        "rating",
        "business_status",
        "place_id",
        "source_query",
    ]

    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for lead in leads:
            writer.writerow({key: lead.get(key, "") for key in fieldnames})

    return path


if __name__ == "__main__":
    sys.exit(run())
