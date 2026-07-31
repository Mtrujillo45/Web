#!/usr/bin/env python3
"""
aggregate_daily.py — Convierte pedidos crudos de Shopify (paginados) en la
serie diaria {date, units, revenue} que necesita forecast.py.

Toda la aritmética vive aquí, no en el modelo. Reutiliza el mismo criterio que
monitor-medellin/compute.py: solo cuentan pedidos PAID (se excluyen REFUNDED y
cualquier otro estado).

IMPORTANTE — deduplicación de kits (Mompossina): en campañas con el mecanismo
de kit de Mompossina (prenda + abanico + aguardiente/botella como líneas
separadas de un mismo pedido, el aguardiente siempre a $0 como marcador), sumar
`quantity` línea por línea INFLA las unidades reales casi 2x — un kit vendido
aporta 1 unidad real pero 2-3 líneas. Pasa `--kit-aware` para deduplicar con el
MISMO criterio que compute.py (prenda a precio de kit + abanico/aguardiente
agrupados = 1 kit), en vez de sumar líneas sueltas. Sin este flag, `units`
cuenta líneas crudas — el `revenue` no se ve afectado (el aguardiente es
$0 y el resto de precios no se duplican), pero `units` sí, y con eso también
el `avg_ticket` que usa forecast.py para traducir ingresos proyectados a
unidades. Si el dashboard online ya reporta unidades deduplicadas (kit=1) y
esta serie no, los dos números de "unidades" del mismo período no van a
cuadrar entre sí.

Uso:
  # Modo campaña (solo ciertas referencias, ej. Medellín Mi Amor) — con kits:
  python3 aggregate_daily.py \
      --orders pedidos_*.json \
      --product-ids 9481810510063,9481804185839,9481816473839 \
      --kit-aware \
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
    """Conteo simple: suma quantity por línea. Infla unidades si hay kits con
    accesorios/marcadores como líneas separadas — ver --kit-aware."""
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


# ---------------------------------------------------------------------------
# Mecanismo de kit de Mompossina (mismas constantes/umbrales que
# monitor-medellin/compute.py): prenda a precio de kit + abanico "caro" +
# aguardiente ($0, marcador) en líneas separadas del mismo pedido = 1 kit, no
# 3 unidades sueltas. Ver --kit-aware arriba.
# ---------------------------------------------------------------------------

AGUA_SKU = "30AGDT21/MEDSKU"
KIT_PRICE = 229900
KIT_NEW_PRICE = 179900
GUARITO, MESH, ABANICO = "9481810510063", "9481804185839", "9481816473839"
HK, CHARM, BLOOM = "9481815949551", "9481826009327", "9481812279535"
ETMESH, ETT = "9483555438831", "9481813098735"
KIT_GARMENT_PRODUCTS = {GUARITO, MESH}


def aggregate_kit_aware(orders, product_ids, tz_offset):
    """Mismo criterio de deduplicación de kits que compute.py, bucketado por
    día en vez de acumulado. 1 kit (prenda + abanico + aguardiente) = 1
    unidad; el resto de líneas cuentan por su propia quantity."""
    by_day = {}
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
        day = by_day.setdefault(date, {"units": 0, "revenue": 0.0})
        seg = []      # [ [product_id, size, qty, unit], ... ] prendas a precio de kit
        seg_aba = 0
        for le in o["lineItems"]["edges"]:
            n = le["node"]
            sku = n.get("sku") or ""
            qty = n.get("quantity", 0)
            prod = pid((n.get("product") or {}).get("id"))
            total = float(n["originalTotalSet"]["shopMoney"]["amount"])
            unit = total / qty if qty else 0.0

            if sku == AGUA_SKU:
                A = qty
                old_left = min(seg_aba, A)
                need = A
                for gp in seg:
                    if need <= 0: break
                    take = min(gp[2], need); need -= take; gp[2] -= take
                    o_take = min(old_left, take); old_left -= o_take
                    n_take = take - o_take
                    day["units"] += o_take + n_take
                    day["revenue"] += o_take * KIT_PRICE + n_take * gp[3]
                seg = []; seg_aba = 0
                continue

            if product_ids and prod not in product_ids:
                continue

            if prod in KIT_GARMENT_PRODUCTS:
                thresh = 143000 if prod == GUARITO else 150000
                if unit >= thresh:
                    seg.append([prod, n.get("variantTitle"), qty, unit])
                    continue
            elif prod == ABANICO and unit > 63000:
                seg_aba += qty
                continue
            day["units"] += qty
            day["revenue"] += total

    days = sorted(by_day.keys())
    daily = [{"date": d, "units": by_day[d]["units"], "revenue": round(by_day[d]["revenue"])} for d in days]
    return daily, refunds, pending


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orders", nargs="+", required=True)
    ap.add_argument("--product-ids", default=None,
                     help="IDs de producto separados por coma (modo campaña). Si se omite, cuenta TODAS las líneas (modo tienda completa).")
    ap.add_argument("--tz-offset", default="-05:00")
    ap.add_argument("--kit-aware", action="store_true",
                     help="Dedupica kits con el mismo criterio que compute.py (prenda+abanico+aguardiente = 1 unidad). "
                          "Úsalo siempre en campañas de Mompossina que vendan kits (ej. Medellín Mi Amor).")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    order_files = []
    for pat in args.orders:
        order_files.extend(sorted(glob.glob(pat)))
    orders = load_orders(order_files)
    product_ids = set(args.product_ids.split(",")) if args.product_ids else None

    if args.kit_aware:
        daily, refunds, pending = aggregate_kit_aware(orders, product_ids, args.tz_offset)
    else:
        daily, refunds, pending = aggregate(orders, product_ids, args.tz_offset)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(daily, f, ensure_ascii=False, indent=2)

    print(f"Pedidos leídos: {len(orders)}  (reembolsos excluidos: {refunds}, pendientes: {pending})")
    print(f"Días agregados: {len(daily)}  ->  {args.output}")
    for d in daily:
        print(f"  {d['date']}: {d['units']:>4} unidades  ${d['revenue']:,.0f}".replace(",", "."))


if __name__ == "__main__":
    main()
