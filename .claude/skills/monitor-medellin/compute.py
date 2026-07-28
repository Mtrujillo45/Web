#!/usr/bin/env python3
"""
compute.py — Motor de cálculo del monitor "Medellín Mi Amor" (Mompossina).

Toda la aritmética vive AQUÍ, no en el modelo. Lee los pedidos y el inventario
(JSON crudo del Shopify Admin API), separa KITS de ventas SUELTAS usando el SKU
del aguardiente y el precio de línea, agrega por producto y talla, calcula
ingresos y alertas de inventario, y PARCHEA el dashboard (PRODUCTS + GENERATED_AT)
entre marcadores.

Uso:
  python3 compute.py \
      --orders pedidos_*.json \
      --inventory inventario.json \
      --html /ruta/al/medellin-dashboard.html \
      --now "2026-07-26T07:52:40-05:00"

- --orders acepta uno o varios archivos JSON (cada uno es la respuesta de una
  página de la query de orders). Los pedidos repetidos (por paginación) se
  deduplican por 'name'.
- Imprime un resumen (totales, kits, alertas) en stdout.
- Si no se pasa --html, solo imprime el resumen y el bloque PRODUCTS.
"""
import json, re, sys, argparse, glob

AGUA_SKU   = "30AGDT21/MEDSKU"          # aguardiente = marcador de kit (1 x kit)
KIT_PRICE  = 229900
ALERT_CRIT = 15

# id de producto -> metadatos. 'kitprice_min' es el umbral de precio unitario
# por encima del cual una línea de esa prenda se considera parte de un KIT
# (el precio del kit se reparte y sube el precio unitario de la prenda).
GUARITO = "9481810510063"
MESH    = "9481804185839"
ABANICO = "9481816473839"
HK      = "9481815949551"
CHARM   = "9481826009327"
BLOOM   = "9481812279535"
ETMESH  = "9483555438831"
ETT     = "9481813098735"

SIZES = ["XS", "S", "M", "L", "XL"]

def pid(gid):
    return gid.split("/")[-1] if gid else ""

def new_sizemap():
    return {s: 0 for s in SIZES}

def load_orders(paths):
    seen = {}
    for p in paths:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        edges = data["data"]["orders"]["edges"]
        for e in edges:
            n = e["node"]
            seen[n["name"]] = n   # dedupe por número de pedido
    return list(seen.values())

def load_inventory(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    inv = {}
    for node in data["data"]["nodes"]:
        if not node:
            continue
        pidv = pid(node["id"])
        by = {}
        for ve in node["variants"]["edges"]:
            by[ve["node"]["title"]] = ve["node"]["inventoryQuantity"]
        inv[pidv] = {"total": node.get("totalInventory", 0), "by": by}
    return inv

def compute(orders, inv):
    # acumuladores de UNIDADES vendidas (netas, solo pedidos PAID)
    # KITS: se separan VIEJOS (prenda + abanico + botella) de NUEVOS (prenda +
    # botella + cosmetiquera, SIN abanico). La botella (aguardiente) cierra cada
    # kit; si el bloque trae abanico -> viejo, si no -> nuevo.
    kitT_old = new_sizemap(); kitT_new = new_sizemap()   # kit t-shirt (Un Guarito)
    kitM_old = new_sizemap(); kitM_new = new_sizemap()   # kit mesh
    rev_new_T = 0.0; rev_new_M = 0.0                      # ingreso real de kits nuevos
    ugStd  = new_sizemap()   # un guarito suelta
    meshStd= new_sizemap()   # mesh shirt suelta
    bloom  = new_sizemap()
    etm    = new_sizemap()
    ett    = new_sizemap()
    abanico = 0
    hk = 0
    charm = 0
    agua_units = 0
    refunds = 0
    pend = 0

    for o in orders:
        st = o.get("displayFinancialStatus")
        if st == "REFUNDED":
            refunds += 1
            continue
        if st != "PAID":     # PENDING u otros no cuentan como venta
            pend += 1
            continue

        # buffers del bloque de kit en curso (se resuelven al llegar la botella)
        seg = []       # [ ['T'/'M', size, qty, unit], ... ] prendas a precio de kit
        seg_aba = 0    # abanicos a precio de kit acumulados en el bloque

        for le in o["lineItems"]["edges"]:
            n = le["node"]
            sku = n.get("sku") or ""
            qty = n.get("quantity", 0)
            size = n.get("variantTitle")
            prod = pid((n.get("product") or {}).get("id"))
            total = float(n["originalTotalSet"]["shopMoney"]["amount"])
            unit = total / qty if qty else 0.0

            if sku == AGUA_SKU:
                # La botella cierra 'qty' kits. Con abanico = viejos; sin = nuevos.
                A = qty
                agua_units += A
                old_left = min(seg_aba, A)   # nº de kits viejos en el bloque
                need = A
                for gp in seg:               # gp = [type, size, qty, unit]
                    if need <= 0: break
                    take = min(gp[2], need); need -= take; gp[2] -= take
                    o_take = min(old_left, take); old_left -= o_take
                    n_take = take - o_take
                    sz = gp[1] if gp[1] in SIZES else None
                    if not sz: continue
                    if gp[0] == 'T':
                        kitT_old[sz] += o_take; kitT_new[sz] += n_take
                        rev_new_T += gp[3] * n_take
                    else:
                        kitM_old[sz] += o_take; kitM_new[sz] += n_take
                        rev_new_M += gp[3] * n_take
                seg = []; seg_aba = 0
                continue

            if prod == GUARITO:
                if unit >= 143000: seg.append(['T', size, qty, unit])
                elif size in ugStd: ugStd[size] += qty
            elif prod == MESH:
                if unit >= 150000: seg.append(['M', size, qty, unit])
                elif size in meshStd: meshStd[size] += qty
            elif prod == ABANICO:
                if unit <= 63000: abanico += qty     # suelto (59.900)
                else: seg_aba += qty                 # dentro de un kit viejo
            elif prod == HK:
                hk += qty
            elif prod == CHARM:
                charm += qty
            elif prod == BLOOM:
                if size in bloom: bloom[size] += qty
            elif prod == ETMESH:
                if size in etm: etm[size] += qty
            elif prod == ETT:
                if size in ett: ett[size] += qty

    kits_old = sum(kitT_old.values()) + sum(kitM_old.values())
    kits_new = sum(kitT_new.values()) + sum(kitM_new.values())
    kits_total = kits_old + kits_new
    validation = {"kits_por_prenda": kits_total, "aguardientes": agua_units,
                  "cuadra": kits_total == agua_units, "kits_nuevos": kits_new}

    return {
        "kitT_old": kitT_old, "kitT_new": kitT_new,
        "kitM_old": kitM_old, "kitM_new": kitM_new,
        "rev_new_T": rev_new_T, "rev_new_M": rev_new_M,
        "kits_old": kits_old, "kits_new": kits_new,
        "ugStd": ugStd, "meshStd": meshStd,
        "bloom": bloom, "etm": etm, "ett": ett,
        "abanico": abanico, "hk": hk, "charm": charm,
        "refunds": refunds, "pending": pend, "validation": validation,
    }

def sized_entry(sold_map, inv_prod):
    """Devuelve lista de dicts {z, stock, sold} en orden de tallas."""
    by = inv_prod["by"] if inv_prod else {}
    out = []
    for s in SIZES:
        out.append({"z": s, "stock": int(by.get(s, 0)), "sold": int(sold_map.get(s, 0))})
    return out

def single_entry(sold, inv_prod):
    total = inv_prod["total"] if inv_prod else 0
    return [{"z": "Única", "stock": int(total), "sold": int(sold)}]

def build_products(c, inv):
    g = lambda k: inv.get(k, {"total": 0, "by": {}})
    P = []
    # Kits (comparten inventario con su prenda componente).
    # VIEJOS = prenda + abanico + botella.  NUEVOS = prenda + botella + cosmetiquera (sin abanico).
    P.append({"name": "Kit · T‑Shirt", "full": "Kit Medellín Mi Amor · T‑Shirt", "mono": "🎀", "kind": "kit", "gar": "T",
              "price": KIT_PRICE, "revenue": sum(c["kitT_old"].values()) * KIT_PRICE, "buildable": g(GUARITO)["total"],
              "note": "Un Guarito + Abanico + Aguardiente. Inventario compartido con «Un Guarito».",
              "sizes": sized_entry(c["kitT_old"], g(GUARITO))})
    P.append({"name": "Kit · Mesh", "full": "Kit Medellín Mi Amor · Mesh", "mono": "🎀", "kind": "kit", "gar": "M",
              "price": KIT_PRICE, "revenue": sum(c["kitM_old"].values()) * KIT_PRICE, "buildable": g(MESH)["total"],
              "note": "Mesh Shirt + Abanico + Aguardiente. Inventario compartido con «Mesh Shirt».",
              "sizes": sized_entry(c["kitM_old"], g(MESH))})
    P.append({"name": "Kit Nuevo · T‑Shirt", "full": "Kit Nuevo Medellín Mi Amor · T‑Shirt", "mono": "🍾", "kind": "kit", "gar": "T",
              "price": KIT_PRICE, "revenue": round(c["rev_new_T"]), "buildable": g(GUARITO)["total"],
              "note": "Un Guarito + Botella + Cosmetiquera (sin abanico). Inventario compartido con «Un Guarito».",
              "sizes": sized_entry(c["kitT_new"], g(GUARITO))})
    P.append({"name": "Kit Nuevo · Mesh", "full": "Kit Nuevo Medellín Mi Amor · Mesh", "mono": "🍾", "kind": "kit", "gar": "M",
              "price": KIT_PRICE, "revenue": round(c["rev_new_M"]), "buildable": g(MESH)["total"],
              "note": "Mesh Shirt + Botella + Cosmetiquera (sin abanico). Inventario compartido con «Mesh Shirt».",
              "sizes": sized_entry(c["kitM_new"], g(MESH))})
    # Prendas / accesorios individuales
    P.append({"name": "Un Guarito T‑Shirt", "mono": "UG", "kind": "garment", "price": 129900,
              "revenue": sum(c["ugStd"].values()) * 129900,
              "note": "Inventario compartido con Kit T‑Shirt. El stock XL bajo es parcial: hay producción en camino.",
              "sizes": sized_entry(c["ugStd"], g(GUARITO))})
    P.append({"name": "Medellín Mi Amor Mesh Shirt", "mono": "MM", "kind": "garment", "price": 139900,
              "revenue": sum(c["meshStd"].values()) * 139900,
              "note": "Inventario compartido con Kit Mesh. Reposición en producción.",
              "sizes": sized_entry(c["meshStd"], g(MESH))})
    P.append({"name": "Abanico Medellín Mi Amor", "mono": "AB", "kind": "accessory", "price": 59900,
              "revenue": c["abanico"] * 59900,
              "note": "También se incluye 1 abanico dentro de cada kit (no contado aquí).",
              "sizes": single_entry(c["abanico"], g(ABANICO))})
    P.append({"name": "Bloom Mesh Shirt", "mono": "BL", "kind": "garment", "price": 139900,
              "revenue": sum(c["bloom"].values()) * 139900, "sizes": sized_entry(c["bloom"], g(BLOOM))})
    P.append({"name": "Eterna Primavera Mesh Shirt", "mono": "EM", "kind": "garment", "price": 139900,
              "revenue": sum(c["etm"].values()) * 139900, "sizes": sized_entry(c["etm"], g(ETMESH))})
    P.append({"name": "Eterna Primavera T‑Shirt", "mono": "ET", "kind": "garment", "price": 129900,
              "revenue": sum(c["ett"].values()) * 129900, "sizes": sized_entry(c["ett"], g(ETT))})
    P.append({"name": "Medellín Mi Amor Headkerchief", "mono": "HK", "kind": "accessory", "price": 64900,
              "revenue": c["hk"] * 64900, "sizes": single_entry(c["hk"], g(HK))})
    P.append({"name": "Primavera Charm", "mono": "PC", "kind": "accessory", "price": 143900,
              "revenue": c["charm"] * 143900, "sizes": single_entry(c["charm"], g(CHARM))})
    return P

def js_sizes(sizes):
    parts = [f'{{z:"{s["z"]}",stock:{s["stock"]},sold:{s["sold"]}}}' for s in sizes]
    return "[" + ",".join(parts) + "]"

def js_block(P):
    lines = ["  // <<<PRODUCTS_START>>> (auto-generado por compute.py — no editar a mano)",
             "  const PRODUCTS = ["]
    for p in P:
        head = f'    {{ name:"{p["name"]}",'
        if "full" in p:
            head += f' full:"{p["full"]}",'
        head += f' mono:"{p["mono"]}", kind:"{p["kind"]}",'
        lines.append(head)
        second = f'      price:{p["price"]}, revenue:{p["revenue"]},'
        if "buildable" in p:
            second += f' buildable:{p["buildable"]},'
        lines.append(second)
        if "note" in p:
            lines.append(f'      note:"{p["note"]}",')
        lines.append(f'      sizes:{js_sizes(p["sizes"])} }},')
    lines.append("  ];")
    lines.append("  // <<<PRODUCTS_END>>>")
    return "\n".join(lines)

def totals(P):
    units = sum(sum(s["sold"] for s in p["sizes"]) for p in P)
    rev = sum(p["revenue"] for p in P)
    kits = sum(sum(s["sold"] for s in p["sizes"]) for p in P if p["kind"] == "kit")
    return {"units": units, "revenue": rev, "kits": kits}

def alerts(P):
    out = []
    for p in P:
        if p["kind"] == "kit":
            continue
        for s in p["sizes"]:
            if s["stock"] <= 0:
                out.append((p["name"], s["z"], s["stock"], s["sold"], "AGOTADO"))
            elif s["stock"] <= ALERT_CRIT:
                out.append((p["name"], s["z"], s["stock"], s["sold"], "CRITICO"))
    out.sort(key=lambda a: (a[4] != "AGOTADO", a[3] == 0, a[2]))
    return out

def patch_html(path, block, now):
    with open(path, encoding="utf-8") as f:
        html = f.read()
    html2 = re.sub(r'const GENERATED_AT = "[^"]*";',
                   f'const GENERATED_AT = "{now}";', html, count=1)
    html2 = re.sub(r'  // <<<PRODUCTS_START>>>.*?  // <<<PRODUCTS_END>>>',
                   block, html2, count=1, flags=re.S)
    if html2 == html:
        raise SystemExit("ERROR: no se encontraron los marcadores PRODUCTS o GENERATED_AT en el HTML.")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orders", nargs="+", required=True)
    ap.add_argument("--inventory", required=True)
    ap.add_argument("--html")
    ap.add_argument("--now", required=True)
    args = ap.parse_args()

    order_files = []
    for pat in args.orders:
        order_files.extend(sorted(glob.glob(pat)))
    orders = load_orders(order_files)
    inv = load_inventory(args.inventory)
    c = compute(orders, inv)
    P = build_products(c, inv)
    block = js_block(P)
    T = totals(P)

    print(f"Pedidos leídos: {len(orders)}  (reembolsos excluidos: {c['refunds']}, pendientes: {c['pending']})")
    v = c["validation"]
    flag = "OK" if v["cuadra"] else "⚠️ REVISAR"
    print(f"Validación kits: prenda={v['kits_por_prenda']} vs aguardientes={v['aguardientes']} -> {flag}")
    print(f"  Kits viejos (con abanico): {c['kits_old']}  |  Kits NUEVOS (sin abanico): {c['kits_new']}")
    print(f"TOTALES -> unidades: {T['units']}  |  kits: {T['kits']}  |  ingresos brutos: ${T['revenue']:,.0f} COP")
    a = alerts(P)
    if a:
        print("ALERTAS de inventario (individuales):")
        for name, z, stock, sold, lvl in a:
            fire = " 🔥 vendiendo" if sold > 0 else ""
            talla = "" if z == "Única" else f" talla {z}"
            print(f"  - {lvl}: {name}{talla} · quedan {stock}{fire}")
    else:
        print("Sin agotados ni referencias en riesgo.")

    if args.html:
        patch_html(args.html, block, args.now)
        print(f"HTML actualizado: {args.html}")
    else:
        print("\n--- Bloque PRODUCTS ---\n" + block)

if __name__ == "__main__":
    main()
