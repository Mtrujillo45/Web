"""Carga la configuración de búsqueda (YAML) y las credenciales (.env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class SearchConfig:
    categories: dict
    cities: list
    max_api_requests_per_run: int
    max_results_per_query: int
    enrichment_delay_seconds: float
    enrichment_user_agent: str

    def all_queries(self):
        """Genera (categoria, query, ciudad) para cada combinación configurada."""
        for category, data in self.categories.items():
            for query in data.get("queries", []):
                for city in self.cities:
                    yield category, query, city


@dataclass
class Credentials:
    places_api_key: str | None
    oauth_client_secret_file: str | None
    oauth_token_file: str
    sheet_id: str | None
    sheet_tab_name: str


def load_search_config(path: Path | None = None) -> SearchConfig:
    path = path or PROJECT_ROOT / "config" / "search_config.yaml"
    with open(path, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return SearchConfig(
        categories=raw["categories"],
        cities=raw["cities"],
        max_api_requests_per_run=raw.get("max_api_requests_per_run", 50),
        max_results_per_query=raw.get("max_results_per_query", 20),
        enrichment_delay_seconds=raw.get("enrichment_delay_seconds", 2),
        enrichment_user_agent=raw.get(
            "enrichment_user_agent", "MompossinaProspectingBot/1.0"
        ),
    )


def load_credentials(env_file: Path | None = None) -> Credentials:
    load_dotenv(env_file or PROJECT_ROOT / ".env")
    return Credentials(
        places_api_key=os.getenv("GOOGLE_PLACES_API_KEY") or None,
        oauth_client_secret_file=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET_FILE") or None,
        oauth_token_file=os.getenv(
            "GOOGLE_OAUTH_TOKEN_FILE", str(PROJECT_ROOT / "credentials" / "token.json")
        ),
        sheet_id=os.getenv("GOOGLE_SHEET_ID") or None,
        sheet_tab_name=os.getenv("GOOGLE_SHEET_TAB_NAME", "Leads"),
    )
