#!/usr/bin/env python3
"""
forecast.py — Motor de proyección de ventas (Mompossina).

Toda la aritmética vive AQUÍ, no en el modelo. Ajusta una curva de decaimiento
exponencial hacia un piso (floor) a partir de la venta diaria REAL observada del
canal en línea, genera 3 escenarios (conservador/base/optimista) variando el
ritmo de decaimiento y los multiplicadores de eventos, suma el mayorista aparte
(no se le aplica curva: son pedidos puntuales, no un goteo continuo), y arma un
dashboard HTML autocontenido.

Uso:
  python3 forecast.py \
      --label "Medellín Mi Amor" \
      --daily daily.json \
      --horizon-days 20 \
      --now "2026-07-29T16:04:00-05:00" \
      --output-html proyeccion.html \
      [--events events.json] \
      [--products products.json] \
      [--wholesale-known 11635890] \
      [--wholesale-pipeline pipeline.json]

Formato de --daily (JSON, cronológico, un punto por día real observado):
  [{"date": "2026-07-24", "units": 102, "revenue": 15904200}, ...]

Formato de --events (opcional, multiplicadores por rango de fechas):
  [{"label": "Feria de las Flores", "start": "2026-08-01", "end": "2026-08-10",
    "mult_conservador": 1.15, "mult_base": 1.35, "mult_optimista": 1.55}]

Formato de --products (opcional, para desglosar el total proyectado por referencia;
si se omite, el dashboard solo muestra totales):
  [{"name": "Kit · Mesh", "share_revenue": 0.36, "stock_cap": 446}]
  'share_revenue' es la participación histórica (0-1) de esa referencia en el
  ingreso a la fecha; 'stock_cap' (opcional) topa las unidades proyectadas al
  inventario disponible.

Formato de --wholesale-pipeline (opcional, pedidos B2B esperados no facturados aún):
  [{"label": "Casa Viva — segunda reposición", "amount": 10000000, "certainty": "media"}]
"""
import json
import math
import argparse
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# 1. Ajuste de la curva a partir de la venta diaria real
# ---------------------------------------------------------------------------

def fit_decay(daily):
    """
    Estima un piso (floor) y una constante de decaimiento (tau) a partir de la
    serie diaria real. Modelo: rate(t) = floor + (peak - floor) * exp(-t/tau),
    con t = días transcurridos desde el día pico.

    tau se ajusta por REGRESIÓN sobre TODOS los días desde el pico en adelante
    (no solo el primero y el último): se linealiza el modelo tomando
    log(rate - floor) y se ajusta una recta por mínimos cuadrados. Esto es
    importante porque significa que la proyección mejora sola con el tiempo —
    cada día real adicional después del pico se suma al ajuste y promedia el
    ruido día a día, en vez de quedar a merced de un solo día bueno o malo.

    Si la venta del último día sigue en o por encima del pico (campaña todavía
    acelerando), no hay decaimiento que estimar: se devuelve tau=None y el
    llamador debe tratarlo como "sin señal de caída aún" (se usa una meseta
    plana en vez de decaimiento para el escenario base).
    """
    rates = [d["units"] for d in daily]
    peak_idx = max(range(len(rates)), key=lambda i: rates[i])
    peak = rates[peak_idx]
    last = rates[-1]
    recent_n = min(7, len(rates))  # promedio de hasta 7 días: se estabiliza solo a medida que hay más historia
    recent_avg = sum(rates[-recent_n:]) / recent_n

    floor = recent_avg * 0.55  # supuesto: la meseta de régimen permanente ronda 55% del ritmo reciente
    dt = len(rates) - 1 - peak_idx

    # Puntos (t, log(rate - floor)) para cada día desde el pico en adelante donde
    # la venta todavía está por encima del piso (si toca el piso o lo cruza, ese
    # punto no aporta información al ajuste log-lineal).
    pts = [(i - peak_idx, math.log(rates[i] - floor))
           for i in range(peak_idx, len(rates)) if rates[i] > floor]

    if dt <= 0 or last >= peak or len(pts) < 2:
        return {"floor": floor, "tau": None, "peak": peak, "peak_idx": peak_idx,
                "recent_avg": recent_avg, "last": last, "n_decay_points": len(pts)}

    n = len(pts)
    sum_t = sum(p[0] for p in pts)
    sum_y = sum(p[1] for p in pts)
    sum_tt = sum(p[0] ** 2 for p in pts)
    sum_ty = sum(p[0] * p[1] for p in pts)
    denom = n * sum_tt - sum_t ** 2

    if denom == 0:
        # Todos los puntos caen en el mismo día (no debería pasar con dt>0), usar
        # el ajuste de 2 puntos como respaldo.
        ratio = (last - floor) / (peak - floor)
        tau = dt / 3 if ratio <= 0 else max(-dt / math.log(ratio), 1.0)
    else:
        slope = (n * sum_ty - sum_t * sum_y) / denom  # pendiente de log(rate-floor) vs t
        tau = max(-1 / slope, 1.0) if slope < 0 else dt / 3

    return {"floor": floor, "tau": tau, "peak": peak, "peak_idx": peak_idx,
             "recent_avg": recent_avg, "last": last, "n_decay_points": len(pts)}


def confidence_label(n_decay_points):
    """Qué tan confiable es el tau ajustado, en función de cuántos días de caída hay."""
    if n_decay_points is None or n_decay_points < 2:
        return None
    if n_decay_points < 4:
        return "baja"
    if n_decay_points < 8:
        return "media"
    return "alta"


def project_daily_rate(fit, day_offset, tau_scale):
    """Tasa proyectada (unidades/día) 'day_offset' días después del último día real."""
    floor = fit["floor"]
    if fit["tau"] is None:
        # Sin señal de caída todavía: mantener el ritmo reciente (meseta plana).
        return fit["recent_avg"]
    tau = fit["tau"] * tau_scale
    # Ancla en el último día real observado (no en el pico) para que el día 0 de la
    # proyección empate exactamente con el último dato real.
    decayed_from_last = floor + (fit["last"] - floor) * math.exp(-day_offset / tau)
    return max(decayed_from_last, floor * 0.5)


# ---------------------------------------------------------------------------
# 2. Escenarios
# ---------------------------------------------------------------------------

SCENARIOS = [
    {"key": "conservador", "label": "Conservador", "tau_scale": 0.7, "mult_key": "mult_conservador"},
    {"key": "base",        "label": "Base (esperado)", "tau_scale": 1.0, "mult_key": "mult_base", "is_base": True},
    {"key": "optimista",   "label": "Optimista", "tau_scale": 1.3, "mult_key": "mult_optimista"},
]


def event_multiplier(events, date, mult_key):
    mult = 1.0
    label = None
    for ev in events:
        if ev["start"] <= date <= ev["end"]:
            mult *= ev.get(mult_key, 1.0)
            label = ev["label"]
    return mult, label


def build_scenario(fit, last_date, horizon_days, events, scenario):
    rows = []  # por día: {date, units, revenue, event_label}
    avg_ticket = fit["avg_ticket"]
    for offset in range(1, horizon_days + 1):
        date = (last_date + timedelta(days=offset)).strftime("%Y-%m-%d")
        base_rate = project_daily_rate(fit, offset, scenario["tau_scale"])
        mult, label = event_multiplier(events, date, scenario["mult_key"])
        units = base_rate * mult
        rows.append({"date": date, "units": units, "revenue": units * avg_ticket, "event": label})
    total_units = sum(r["units"] for r in rows)
    total_revenue = sum(r["revenue"] for r in rows)
    return {"rows": rows, "total_units": total_units, "total_revenue": total_revenue}


def weekly_buckets(rows, n_weeks=None):
    """Agrupa las filas diarias en semanas de 7 días desde el inicio de la proyección."""
    weeks = []
    for i in range(0, len(rows), 7):
        chunk = rows[i:i + 7]
        weeks.append({
            "label": f"{chunk[0]['date']} → {chunk[-1]['date']}",
            "units": sum(r["units"] for r in chunk),
            "revenue": sum(r["revenue"] for r in chunk),
        })
        if n_weeks and len(weeks) >= n_weeks:
            break
    return weeks


# ---------------------------------------------------------------------------
# 3. Mayorista (no se proyecta con curva: son pedidos puntuales conocidos)
# ---------------------------------------------------------------------------

def wholesale_summary(known_amount, pipeline):
    pipeline_total = sum(p["amount"] for p in pipeline)
    return {
        "known": known_amount,
        "pipeline": pipeline,
        "pipeline_total": pipeline_total,
        "total": known_amount + pipeline_total,
    }


# ---------------------------------------------------------------------------
# 4. Desglose por producto (proporcional a la participación histórica, topado a stock)
# ---------------------------------------------------------------------------

def build_product_breakdown(products, scenario_total_revenue, scenario_total_units, avg_ticket):
    if not products:
        return None
    out = []
    for p in products:
        share = p.get("share_revenue", 0.0)
        rev = scenario_total_revenue * share
        units = rev / avg_ticket if avg_ticket else 0
        capped_note = None
        cap = p.get("stock_cap")
        if cap is not None and units > cap:
            capped_note = f"demanda proyectada > stock ({int(cap)})"
            units = cap
            rev = units * avg_ticket
        out.append({"name": p["name"], "units": units, "revenue": rev, "cap_note": capped_note})
    return out


# ---------------------------------------------------------------------------
# 5. HTML
# ---------------------------------------------------------------------------

def cop(n):
    return "$" + f"{round(n):,}".replace(",", ".")


def num(n):
    return f"{round(n):,}".replace(",", ".")


TEMPLATE = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{
    --bg:#F5F7F2; --surface:#FFFFFF; --surface-2:#FBFCFA; --ink:#14231A; --ink-muted:#5B6B60;
    --border:#E4EAE1; --border-strong:#D3DDCF; --accent:#1F9E63; --accent-deep:#0F5C3A;
    --accent-soft:#E4F3EA; --accent-ink:#0F5C3A; --bloom:#E6417F; --bloom-deep:#B8285F;
    --bloom-soft:#FBE3EC; --bloom-ink:#A21F52; --warn:#C98A00; --track:#EDF1EA;
    --shadow:0 1px 2px rgba(20,35,26,.04),0 8px 24px rgba(20,35,26,.05); --radius:14px;
    --serif:Georgia,'Iowan Old Style','Times New Roman',serif;
    --sans:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#0E1712; --surface:#15221B; --surface-2:#182620; --ink:#EAF2EC; --ink-muted:#9DB2A5;
      --border:#24352B; --border-strong:#2E4436; --accent:#37CB82; --accent-deep:#34C77E;
      --accent-soft:#16301F; --accent-ink:#8FE7B7; --bloom:#FF6EA0; --bloom-deep:#E6417F;
      --bloom-soft:#34141F; --bloom-ink:#FF9CBF; --warn:#E8B44A; --track:#1E2E24;
      --shadow:0 1px 2px rgba(0,0,0,.25),0 10px 30px rgba(0,0,0,.30); }}
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); line-height:1.5; }}
  .wrap {{ max-width:1100px; margin:0 auto; padding:28px 20px 64px; }}
  .eyebrow {{ font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--accent-ink); font-weight:700; }}
  h1 {{ font-family:var(--serif); font-style:italic; font-size:clamp(24px,4vw,36px); margin:6px 0 2px; }}
  .sub {{ color:var(--ink-muted); font-size:13.5px; }}
  section {{ margin-top:30px; }}
  h2 {{ font-family:var(--serif); font-size:19px; margin:0 0 12px; }}
  .fc-scen {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }}
  .fc-card {{ border:1px solid var(--border); border-radius:var(--radius); padding:16px 18px; background:var(--surface);
    box-shadow:var(--shadow); position:relative; overflow:hidden; }}
  .fc-card::before {{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--ink-muted); }}
  .fc-card.base::before {{ background:var(--bloom); }}
  .fc-card.base {{ border-color:color-mix(in srgb, var(--bloom) 38%, var(--border));
    background:linear-gradient(180deg, var(--bloom-soft) 0%, var(--surface) 42%); }}
  .fc-tag {{ font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-muted); }}
  .fc-card.base .fc-tag {{ color:var(--bloom-ink); }}
  .fc-u {{ font-family:var(--serif); font-size:26px; font-weight:700; margin-top:6px; }}
  .fc-u small {{ font-family:var(--sans); font-size:12px; color:var(--ink-muted); font-weight:600; }}
  .fc-r {{ font-size:14px; font-weight:600; margin-top:2px; }}
  .tbl-wrap {{ overflow-x:auto; border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); }}
  table {{ border-collapse:collapse; width:100%; font-size:13px; background:var(--surface); }}
  th,td {{ padding:9px 13px; text-align:right; white-space:nowrap; }}
  th:first-child,td:first-child {{ text-align:left; }}
  thead th {{ background:var(--surface-2); border-bottom:1px solid var(--border-strong); font-size:11px;
    text-transform:uppercase; letter-spacing:.05em; color:var(--ink-muted); }}
  tbody tr+tr td {{ border-top:1px solid var(--border); }}
  tfoot td {{ border-top:2px solid var(--border-strong); font-weight:700; }}
  .assume {{ background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius);
    padding:15px 18px; font-size:12.5px; color:var(--ink-muted); }}
  .assume h4 {{ margin:0 0 9px; font-family:var(--serif); font-size:14.5px; color:var(--ink); }}
  .assume ul {{ margin:0; padding-left:18px; display:flex; flex-direction:column; gap:5px; }}
  .assume b {{ color:var(--ink); }}
  .pill {{ font-size:10.5px; font-weight:700; text-transform:uppercase; padding:2px 7px; border-radius:6px; }}
  .pill.alta {{ background:var(--accent-soft); color:var(--accent-ink); }}
  .pill.media {{ background:color-mix(in srgb, var(--warn) 18%, var(--surface)); color:var(--ink); }}
  .pill.baja {{ background:var(--bloom-soft); color:var(--bloom-ink); }}
  .grand {{ display:flex; gap:20px; flex-wrap:wrap; margin-top:6px; }}
  .grand .g {{ flex:1; min-width:180px; border:1px solid var(--border); border-radius:var(--radius);
    padding:14px 16px; background:var(--surface); box-shadow:var(--shadow); }}
  .grand .glabel {{ font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-muted); font-weight:700; }}
  .grand .gval {{ font-family:var(--serif); font-size:22px; font-weight:700; margin-top:4px; }}
  footer {{ margin-top:38px; padding-top:18px; border-top:1px solid var(--border); color:var(--ink-muted); font-size:12px; }}
</style></head>
<body><div class="wrap">
  <div class="eyebrow">📈 Proyección de ventas · Mompossina</div>
  <h1>{title}</h1>
  <div class="sub">{subtitle} · generado {generated}</div>

  <section>
    <h2>Ingresos totales proyectados (en línea + mayorista)</h2>
    <div class="grand">
      <div class="g"><div class="glabel">En línea (escenario base)</div><div class="gval">{online_base_rev}</div></div>
      <div class="g"><div class="glabel">Mayorista (facturado + pipeline)</div><div class="gval">{wholesale_total}</div></div>
      <div class="g"><div class="glabel">Total combinado (base)</div><div class="gval">{grand_total}</div></div>
    </div>
  </section>

  <section>
    <h2>Escenarios — venta en línea</h2>
    <div class="fc-scen">{scenario_cards}</div>
  </section>

  <section>
    <h2>Desglose semanal (escenario base, en línea)</h2>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Semana</th><th>Unidades</th><th>Ingresos</th></tr></thead>
      <tbody>{weekly_rows}</tbody>
      <tfoot><tr><td>Total proyección</td><td>{weekly_total_units}</td><td>{weekly_total_rev}</td></tr></tfoot>
    </table></div>
  </section>

  {product_section}

  <section>
    <h2>Mayorista — conocido + pipeline</h2>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Concepto</th><th>Certeza</th><th>Monto</th></tr></thead>
      <tbody>
        <tr><td>Ya facturado en el período</td><td>—</td><td>{wholesale_known}</td></tr>
        {wholesale_rows}
      </tbody>
      <tfoot><tr><td>Total mayorista</td><td>—</td><td>{wholesale_total}</td></tr></tfoot>
    </table></div>
  </section>

  <section>
    <div class="assume">
      <h4>Cómo se calculó esto</h4>
      <ul>
        <li><b>Curva ajustada a datos reales:</b> se toma la venta diaria real observada y se ajusta un decaimiento
        exponencial hacia un piso de régimen permanente (≈55% del ritmo de los últimos días) — no es una curva
        supuesta a ojo, se deriva de cómo cayó (o no) la venta real desde su pico.</li>
        <li><b>Tres escenarios</b> varían qué tan rápido se acerca ese piso (conservador decae más rápido, optimista
        sostiene el ritmo más tiempo) y qué tanto rinden los eventos/campañas marcados (si los hay).</li>
        <li><b>El mayorista NO se proyecta con curva:</b> son pedidos puntuales por cliente, no un goteo diario. Se
        suma lo ya facturado más un pipeline que tú mismo registras con su nivel de certeza (alta/media/baja).</li>
        <li><b>Esto es un modelo, no una promesa:</b> es sensible a la calidad de los datos de entrada y a la
        ejecución real (pauta, eventos, disponibilidad de inventario). Recalíbralo con más días de venta real.</li>
        {assume_extra}
      </ul>
    </div>
  </section>

  <footer>Motor: forecast.py (skill proyeccion-ventas) · Mompossina</footer>
</div></body></html>"""


def scenario_card_html(sc, result):
    base_cls = " base" if sc.get("is_base") else ""
    star = "★ " if sc.get("is_base") else ""
    return f"""<div class="fc-card{base_cls}">
      <div class="fc-tag">{star}{sc['label']}</div>
      <div class="fc-u">{num(result['total_units'])} <small>unidades</small></div>
      <div class="fc-r">{cop(result['total_revenue'])}</div>
    </div>"""


def build_html(args, fit, scenario_results, weeks_base, wholesale, product_breakdown, events):
    scenario_cards = "".join(scenario_card_html(sc, scenario_results[sc["key"]]) for sc in SCENARIOS)
    weekly_rows = "".join(
        f"<tr><td>{w['label']}</td><td>{num(w['units'])}</td><td>{cop(w['revenue'])}</td></tr>"
        for w in weeks_base
    )
    weekly_total_units = num(sum(w["units"] for w in weeks_base))
    weekly_total_rev = cop(sum(w["revenue"] for w in weeks_base))

    wholesale_rows = "".join(
        f"<tr><td>{p['label']}</td><td><span class='pill {p['certainty']}'>{p['certainty']}</span></td>"
        f"<td>{cop(p['amount'])}</td></tr>"
        for p in wholesale["pipeline"]
    )

    if product_breakdown:
        cap_span = '<br><span style="font-size:11px;color:var(--warn)">⚠ {}</span>'
        prod_rows = "".join(
            "<tr><td>{name}{cap}</td><td>{units}</td><td>{revenue}</td></tr>".format(
                name=p["name"],
                cap=cap_span.format(p["cap_note"]) if p["cap_note"] else "",
                units=num(p["units"]),
                revenue=cop(p["revenue"]),
            )
            for p in product_breakdown
        )
        product_section = f"""<section>
    <h2>Desglose por referencia (escenario base, en línea)</h2>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Referencia</th><th>Unidades</th><th>Ingresos</th></tr></thead>
      <tbody>{prod_rows}</tbody>
    </table></div>
  </section>"""
    else:
        product_section = ""

    assume_extra = ""
    if fit["tau"] is None:
        assume_extra = ("<li><b>Sin señal de caída todavía:</b> al último día real la venta seguía igual o por "
                         "encima del pico, así que el escenario base asume una meseta plana en vez de decaimiento "
                         "hasta que haya más días para medir la tendencia real.</li>")
    else:
        conf = confidence_label(fit["n_decay_points"])
        assume_extra += (f"<li><b>Confianza del ajuste:</b> <span class='pill {conf}'>{conf}</span> — basado en "
                          f"{fit['n_decay_points']} días reales desde el pico. Esta estimación se afina sola cada "
                          f"vez que corras el skill con un día más de venta real; con pocos días es normal (y más "
                          f"honesto) que el modelo sea conservador.</li>")
    if events:
        ev_txt = "; ".join(f"{e['label']} ({e['start']}→{e['end']})" for e in events)
        assume_extra += f"<li><b>Eventos marcados:</b> {ev_txt}.</li>"

    online_base_rev = scenario_results["base"]["total_revenue"]
    grand_total = online_base_rev + wholesale["total"]

    html = TEMPLATE.format(
        title=args.title,
        subtitle=args.subtitle,
        generated=args.now,
        online_base_rev=cop(online_base_rev),
        wholesale_total=cop(wholesale["total"]),
        grand_total=cop(grand_total),
        scenario_cards=scenario_cards,
        weekly_rows=weekly_rows,
        weekly_total_units=weekly_total_units,
        weekly_total_rev=weekly_total_rev,
        product_section=product_section,
        wholesale_known=cop(wholesale["known"]),
        wholesale_rows=wholesale_rows,
        assume_extra=assume_extra,
    )
    return html


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--daily", required=True, help="Ruta a JSON con la serie diaria real")
    ap.add_argument("--horizon-days", type=int, required=True)
    ap.add_argument("--now", required=True)
    ap.add_argument("--output-html", required=True)
    ap.add_argument("--events", help="Ruta a JSON de eventos/multiplicadores")
    ap.add_argument("--products", help="Ruta a JSON de referencias para desglose")
    ap.add_argument("--wholesale-known", type=float, default=0.0)
    ap.add_argument("--wholesale-pipeline", help="Ruta a JSON de pipeline mayorista esperado")
    ap.add_argument("--title", default=None)
    ap.add_argument("--subtitle", default=None)
    args = ap.parse_args()

    with open(args.daily, encoding="utf-8") as f:
        daily = json.load(f)
    events = json.load(open(args.events, encoding="utf-8")) if args.events else []
    products = json.load(open(args.products, encoding="utf-8")) if args.products else None
    pipeline = json.load(open(args.wholesale_pipeline, encoding="utf-8")) if args.wholesale_pipeline else []

    if args.title is None:
        args.title = f"Proyección — {args.label}"
    if args.subtitle is None:
        args.subtitle = f"{len(daily)} días reales · proyectando {args.horizon_days} días adelante"

    fit = fit_decay(daily)
    total_units_to_date = sum(d["units"] for d in daily)
    total_revenue_to_date = sum(d["revenue"] for d in daily)
    fit["avg_ticket"] = total_revenue_to_date / total_units_to_date if total_units_to_date else 0

    last_date = datetime.strptime(daily[-1]["date"], "%Y-%m-%d")

    scenario_results = {}
    for sc in SCENARIOS:
        scenario_results[sc["key"]] = build_scenario(fit, last_date, args.horizon_days, events, sc)

    weeks_base = weekly_buckets(scenario_results["base"]["rows"])
    wholesale = wholesale_summary(args.wholesale_known, pipeline)
    product_breakdown = build_product_breakdown(
        products, scenario_results["base"]["total_revenue"],
        scenario_results["base"]["total_units"], fit["avg_ticket"]
    ) if products else None

    conf = confidence_label(fit.get("n_decay_points"))
    print(f"Ajuste de curva -> pico: {fit['peak']:.1f} u/día (día {fit['peak_idx']+1})  "
          f"|  último real: {fit['last']:.1f} u/día  |  piso estimado: {fit['floor']:.1f} u/día  "
          f"|  tau: {fit['tau'] if fit['tau'] is None else round(fit['tau'],1)}"
          f"  |  confianza: {conf} ({fit.get('n_decay_points',0)} días desde el pico)")
    for sc in SCENARIOS:
        r = scenario_results[sc["key"]]
        print(f"  {sc['label']:18s} -> {r['total_units']:.0f} unidades  |  {cop(r['total_revenue'])} (en línea)")
    print(f"Mayorista -> facturado: {cop(wholesale['known'])}  |  pipeline: {cop(wholesale['pipeline_total'])}  "
          f"|  total: {cop(wholesale['total'])}")
    grand = scenario_results["base"]["total_revenue"] + wholesale["total"]
    print(f"TOTAL COMBINADO (base, en línea + mayorista): {cop(grand)}")

    html = build_html(args, fit, scenario_results, weeks_base, wholesale, product_breakdown, events)
    with open(args.output_html, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML escrito: {args.output_html}")


if __name__ == "__main__":
    main()
