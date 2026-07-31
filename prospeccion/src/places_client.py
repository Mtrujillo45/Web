"""Cliente para la API oficial "Places API (New)" de Google.

Usamos la API oficial (no scraping directo de google.com/maps) porque:
  - Scrapear el HTML de Google Maps viola sus Términos de Servicio y
    es fácil que bloqueen la IP.
  - La API oficial es estable, documentada, y tiene un tope de costo
    que podemos controlar (ver max_api_requests_per_run en la config).

Documentación: https://developers.google.com/maps/documentation/places/web-service/text-search
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

# Solo pedimos los campos que necesitamos: pedir menos campos cuesta menos.
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.businessStatus",
        "places.rating",
        "places.types",
    ]
)


@dataclass
class PlaceResult:
    place_id: str
    name: str
    address: str
    phone: str | None
    website: str | None
    business_status: str | None
    rating: float | None
    category: str
    source_query: str
    source_city: str


class PlacesApiError(RuntimeError):
    pass


class PlacesClient:
    def __init__(self, api_key: str, session: requests.Session | None = None):
        if not api_key:
            raise ValueError(
                "Falta la API key de Google Places. Configúrala en .env "
                "(GOOGLE_PLACES_API_KEY) una vez tengas el proyecto de Google Cloud listo."
            )
        self.api_key = api_key
        self.session = session or requests.Session()
        self.requests_made = 0

    def text_search(
        self,
        text_query: str,
        category: str,
        source_query: str,
        source_city: str,
        max_results: int = 20,
        request_budget: int | None = None,
    ) -> list[PlaceResult]:
        """Busca negocios que coincidan con `text_query` (ej. "swimwear boutique in Miami, FL")."""
        if request_budget is not None and self.requests_made >= request_budget:
            return []

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        }
        body = {
            "textQuery": text_query,
            "maxResultCount": min(max_results, 20),
            "languageCode": "en",
        }

        response = self.session.post(SEARCH_URL, headers=headers, json=body, timeout=15)
        self.requests_made += 1

        if response.status_code != 200:
            raise PlacesApiError(
                f"Places API respondió {response.status_code} para '{text_query}': {response.text}"
            )

        data = response.json()
        return [
            self._parse_place(place, category, source_query, source_city)
            for place in data.get("places", [])
        ]

    @staticmethod
    def _parse_place(place: dict, category: str, source_query: str, source_city: str) -> PlaceResult:
        return PlaceResult(
            place_id=place.get("id", ""),
            name=place.get("displayName", {}).get("text", ""),
            address=place.get("formattedAddress", ""),
            phone=place.get("internationalPhoneNumber"),
            website=place.get("websiteUri"),
            business_status=place.get("businessStatus"),
            rating=place.get("rating"),
            category=category,
            source_query=source_query,
            source_city=source_city,
        )
