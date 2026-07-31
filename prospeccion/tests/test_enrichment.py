"""Prueba la extracción de email desde HTML estático, sin hacer requests reales."""

from src.enrichment import _extract_email_from_html


def test_extracts_mailto_link_first():
    html = """
    <html><body>
      <p>Contact us at info@example-boutique.test</p>
      <a href="mailto:sales@example-boutique.test">Email us</a>
    </body></html>
    """
    assert _extract_email_from_html(html) == "sales@example-boutique.test"


def test_falls_back_to_text_scan_when_no_mailto():
    html = "<html><body><p>Reach us: hello@example-boutique.test</p></body></html>"
    assert _extract_email_from_html(html) == "hello@example-boutique.test"


def test_ignores_junk_domains():
    html = """
    <html><body>
      <a href="mailto:noreply@sentry.io">error tracking</a>
      <p>Real contact: real.contact@example-boutique.test</p>
    </body></html>
    """
    assert _extract_email_from_html(html) == "real.contact@example-boutique.test"


def test_returns_none_when_no_email_present():
    html = "<html><body><p>No contact info here.</p></body></html>"
    assert _extract_email_from_html(html) is None
