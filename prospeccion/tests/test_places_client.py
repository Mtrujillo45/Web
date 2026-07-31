"""Valida el parseo de respuestas de la Places API sin llamar a la red real,
usando un fixture JSON de ejemplo. Esto permite probar la lógica antes de
tener una API key real de Google Cloud."""

import json
from pathlib import Path

from src.places_client import PlacesClient

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "places_search_response.json"


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, payload):
        self._payload = payload
        self.last_request = None

    def post(self, url, headers=None, json=None, timeout=None):
        self.last_request = {"url": url, "headers": headers, "json": json}
        return FakeResponse(self._payload)


def test_text_search_parses_places_into_leads():
    payload = json.loads(FIXTURE_PATH.read_text())
    session = FakeSession(payload)
    client = PlacesClient(api_key="fake-key", session=session)

    results = client.text_search(
        text_query="swimwear boutique in Miami Beach, FL",
        category="swimwear",
        source_query="swimwear boutique",
        source_city="Miami Beach, FL",
    )

    assert len(results) == 2

    first = results[0]
    assert first.place_id == "ChIJ_test_place_id_1"
    assert first.name == "Sample Swim Boutique"
    assert first.website == "https://example-swim-boutique.test"
    assert first.phone == "+1 305-555-0100"
    assert first.category == "swimwear"

    second = results[1]
    assert second.website is None
    assert second.phone is None

    assert client.requests_made == 1
    assert "X-Goog-Api-Key" in session.last_request["headers"]


def test_request_budget_stops_extra_calls():
    payload = {"places": []}
    session = FakeSession(payload)
    client = PlacesClient(api_key="fake-key", session=session)
    client.requests_made = 5

    results = client.text_search(
        text_query="anything",
        category="swimwear",
        source_query="q",
        source_city="Miami, FL",
        request_budget=5,
    )

    assert results == []
