#!/usr/bin/env python3
"""
aggregate_daily.py — Convierte pedidos crudos de Shopify (paginados) en la
serie diaria {date, units, revenue} que necesita forecast.py.

Toda la aritmética vive aquí, no en el modelo. Reutiliza el mismo criterio que
monitor-medellin/compute.py: solo cuentan pedidos PAID (se excluyen REFUNDED y
cualquier otro estado).

Uso:
  # Modo campaña (solo ciertas referencias, ej. Medellín Mi Amor):
  python3 aggregate_daily.py \
      --orders pedidos_*.json \
      --product-ids 9481810510063,9481804185839,9481816473839 \
      --tz-offset "-05:00" \
      --output daily.json

  # Modo tienda completa (todas las líneas de todos los pedidos):
  python3 aggregate_daily.py \
      --orders pedidos_*.json \
      --tz-offset "-05:00" \
      --output daily.json

La query GraphQL que produce los archivos --orders (paginar mientras
hasNextPage sea true, guardar cada página cruda con Write):

  query($after:String){
    orders(first:50, after:$after, query:"created_at:>=<INICIO> created_at:<=<FIN>",
           sortKey:CREATED_AT){
      edges{ node{ name createdAt displayFinancialStatus
        lineItems(first:25){ edges{ node{
          quantity variantTitle sku product{ id }
          originalTotalSet{ shopMoney{ amount } }
        } } } } }
      pageInfo{ hasNextPage endCursor } } }

Nota: a diferencia de compute.py (que solo necesita totales acumulados a la
fecha), este script SÍ necesita 'createdAt' en cada pedido para poder agrupar
por día.
"""
import json
import glob
import argparse
from datetime import datetime, timedelta


def pid(gid):
    return gid.split("/")[-1] if gid else ""


def local_date(created_at_iso, tz_offset):
    """
    Trunca un timestamp UTC (Shopify siempre devuelve createdAt en UTC, con
    'Z') a la fecha en la zona horaria de la tienda, aplicando el offset dado
    (ej. '-05:00' para Bogotá). Evita que pedidos de última hora del día se
    cuenten en el día siguiente (o viceversa).
    """
    dt = datetime.strptime(created_at_iso.replace("Z", "+00:00").split("+")[0], "%Y-%m-%dT%H:%M:%S")
    sign = -1 if tz_offset.startswith("-") else 1
    hh, mm = tz_offset.lstrip("+-").split(":")
    delta = timedelta(hours=int(hh), minutes=int(mm)) * sign
    local_dt = dt + delta
    return local_dt.strftime("%Y-%m-%d")


def load_orders(paths):
    seen = {}
    for p in paths:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        edges = data["data"]["orders"]["edges"]
        for e in edges:
            n = e["node"]
            seen[n["name"]] = n
    return list(seen.values())


def aggregate(orders, product_ids, tz_offset):
    by_day = {}  # date -> {"units": n, "revenue": n}
    refunds = 0
    pending = 0
    for o in orders:
        st = o.get("displayFinancialStatus")
        if st == "REFUNDED":
            refunds += 1
            continue
        if st != "PAID":
            pending += 1
            continue
        date = local_date(o["createdAt"], tz_offset)
        for le in o["lineItems"]["edges"]:
            n = le["node"]
            prod = pid((n.get("product") or {}).get("id"))
            if product_ids and prod not in product_ids:
                continue
            qty = n.get("quantity", 0)
            revenue = float(n["originalTotalSet"]["shopMoney"]["amount"])
            bucket = by_day.setdefault(date, {"units": 0, "revenue": 0.0})
            bucket["units"] += qty
            bucket["revenue"] += revenue

    days = sorted(by_day.keys())
    daily = [{"date": d, "units": by_day[d]["units"], "revenue": round(by_day[d]["revenue"])} for d in days]
    return daily, refunds, pending


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orders", nargs="+", required=True)
    ap.add_argument("--product-ids", default=None,
                     help="IDs de producto separados por coma (modo campaña). Si se omite, cuenta TODAS las líneas (modo tienda completa).")
    ap.add_argument("--tz-offset", default="-05:00")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    order_files = []
    for pat in args.orders:
        order_files.extend(sorted(glob.glob(pat)))
    orders = load_orders(order_files)
    product_ids = set(args.product_ids.split(",")) if args.product_ids else None

    daily, refunds, pending = aggregate(orders, product_ids, args.tz_offset)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(daily, f, ensure_ascii=False, indent=2)

    print(f"Pedidos leídos: {len(orders)}  (reembolsos excluidos: {refunds}, pendientes: {pending})")
    print(f"Días agregados: {len(daily)}  ->  {args.output}")
    for d in daily:
        print(f"  {d['date']}: {d['units']:>4} unidades  ${d['revenue']:,.0f}".replace(",", "."))


if __name__ == "__main__":
    main()
