"""Enriquecimiento: visita el sitio web de un negocio y trata de encontrar
un email de contacto público.

Reglas de buen comportamiento:
  - Respeta robots.txt del sitio.
  - Usa un User-Agent identificable con datos de contacto reales.
  - Espera `enrichment_delay_seconds` entre requests (ver config) para no
    sobrecargar servidores de terceros.
  - Solo lee páginas públicas normales (home, contacto, about); no intenta
    saltarse ningún tipo de control de acceso.
"""

from __future__ import annotations

import re
import time
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")

# Rutas comunes de página de contacto a probar si el email no aparece en el home.
CONTACT_PATHS = ["/contact", "/contact-us", "/pages/contact", "/pages/contact-us", "/about"]

# Dominios/patrones que casi nunca son un email de contacto real (falsos positivos comunes).
JUNK_DOMAIN_HINTS = ("sentry.io", "wixpress.com", "example.com", "godaddy.com", "schema.org")


def _is_scraping_allowed(url: str, user_agent: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
    except Exception:
        # Si no se puede leer robots.txt, asumimos permitido (comportamiento estándar de bots).
        return True
    return parser.can_fetch(user_agent, url)


def _extract_email_from_html(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")

    for link in soup.select('a[href^="mailto:"]'):
        email = link["href"].split("mailto:", 1)[1].split("?")[0].strip()
        if email and not any(hint in email for hint in JUNK_DOMAIN_HINTS):
            return email

    text = soup.get_text(" ")
    for match in EMAIL_REGEX.findall(text):
        if not any(hint in match for hint in JUNK_DOMAIN_HINTS):
            return match

    return None


def find_contact_email(
    website_url: str,
    user_agent: str,
    delay_seconds: float = 2.0,
    timeout: int = 10,
) -> str | None:
    """Intenta encontrar un email de contacto en el sitio web dado. Devuelve None si no encuentra
    nada o si robots.txt no lo permite."""
    if not website_url:
        return None

    if not _is_scraping_allowed(website_url, user_agent):
        return None

    headers = {"User-Agent": user_agent}
    urls_to_try = [website_url] + [urljoin(website_url, path) for path in CONTACT_PATHS]

    for url in urls_to_try:
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
        except requests.RequestException:
            time.sleep(delay_seconds)
            continue

        time.sleep(delay_seconds)

        if response.status_code != 200:
            continue

        email = _extract_email_from_html(response.text)
        if email:
            return email

    return None
