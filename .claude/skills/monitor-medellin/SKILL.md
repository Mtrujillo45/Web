---
name: monitor-medellin
description: "Actualiza el dashboard en vivo de ventas de la campaña Medellín Mi Amor (Mompossina) con datos reales de Shopify. Consulta todos los pedidos desde el lanzamiento, separa kits de ventas sueltas, calcula unidades/ingresos por producto y talla, sell-through y alertas de agotados/quiebre, republica el Artifact y empuja la web pública (GitHub Pages). Usar siempre que el usuario pida: actualiza/refresca el dashboard, monitor Medellín Mi Amor, cómo van las ventas de Medellín Mi Amor, actualiza el panel/artefacto de la campaña, corre la consulta de ventas, o cuántos kits llevamos vendidos."
---

## Qué hace

Recalcula y republica el dashboard de la campaña **Medellín Mi Amor**. Toda la
aritmética la hace **`compute.py`** (no el modelo): así se procesan cientos de
pedidos sin errores de suma manual.

Salidas que mantiene sincronizadas:
- **Artifact privado** (link del dueño): `https://claude.ai/code/artifact/cfa21005-cee5-43a5-b72e-8c1cb2326875`
- **Web pública** (GitHub Pages): `index.html` en la rama `claude/shopify-sales-dashboard-realtime-f7vcvu` → `https://mtrujillo45.github.io/Web/`

## Principio de diseño (leer antes de modificar)

**`compute.py` clasifica y suma; el modelo orquesta y narra.** El modelo NO cuenta
pedidos a mano. Si algo no cuadra, se arregla el script, no el resultado.

La regla de negocio clave — **separar KITS de ventas SUELTAS** — vive en el script:
- Un **kit** se detecta por la línea de **botella/aguardiente** (SKU `30AGDT21/MEDSKU`):
  cada botella = 1 kit. La prenda y el abanico dentro del kit NO se cuentan como
  ventas sueltas.
- **Kit clásico 🎀 vs kit nuevo 🍾:** dentro de cada bloque de kit (la botella lo
  cierra), si trae **abanico** es **clásico** (prenda + abanico + botella); si **no
  trae abanico** es **nuevo** (prenda + botella + cosmetiquera, la cosmetiquera no
  está creada como producto). `compute.py` agrupa las líneas por bloque y separa
  `kitT_old/kitM_old` (con abanico) de `kitT_new/kitM_new` (sin abanico).
- Se clasifica la prenda por **precio unitario**: la prenda a precio de kit (Guarito
  ≥143.000; Mesh ≥150.000) es parte de un kit; a precio completo (129.900 / 139.900)
  es suelta. El abanico a >63.000 es de kit clásico; a 59.900 es suelto.
- **Precios:** kit clásico 229.900; **kit nuevo 179.900** (la prenda del kit nuevo
  se factura a 179.900 y la cosmetiquera va de obsequio $0). El ingreso del kit
  nuevo se toma del monto real de la línea (coincide con 179.900 × unidades).
- Solo cuentan pedidos **PAID**; se excluyen **REFUNDED** (se reportan aparte) y los
  **PENDING** no cuentan como venta.
- **IVA (importante):** la tienda vende con **IVA INCLUIDO** (`shop.taxesIncluded =
  true`). El campo `originalTotalSet` que suma el script ya trae el 19% adentro, así
  que los **ingresos mostrados son precio de venta al público (CON IVA)** — NO son
  "antes de impuestos". El dashboard muestra el desglose: base gravable = ingresos /
  1,19; IVA contenido = ingresos − base (`IVA_RATE = 0.19` en `compute.py` y en el
  JS). No rotular los ingresos como "brutos/antes de impuestos".

## Datos de referencia

| Concepto | Valor |
|---|---|
| Lanzamiento (inicio ventana) | `2026-07-24T00:00:00-05:00` |
| SKU aguardiente (marcador de kit) | `30AGDT21/MEDSKU` |
| Precio kit | 229.900 |
| Umbral crítico de inventario | ≤ 15 unidades (0 = agotado) |
| Artifact URL | `https://claude.ai/code/artifact/cfa21005-cee5-43a5-b72e-8c1cb2326875` |
| Rama | `claude/shopify-sales-dashboard-realtime-f7vcvu` |
| Dashboard fuente (body-only) | `dashboard/medellin-dashboard.html` |
| Web pública (full doc) | `index.html` |
| Hoja mayoristas (Google Sheets) | `1XU83Z83FWH-ch3W-siU6suDUDZjfJuqP-Z1arvGX6QQ` — ver `references/mayoristas_sheet.md` |

**IDs de producto** (los usa `compute.py`): Un Guarito `9481810510063` · Mesh Shirt
`9481804185839` · Abanico `9481816473839` · Headkerchief `9481815949551` · Charm
`9481826009327` · Bloom `9481812279535` · Eterna Mesh `9483555438831` · Eterna
T‑Shirt `9481813098735`.

## Procedimiento

Trabaja en un directorio temporal del scratchpad para los JSON crudos (p.ej.
`$SCRATCH/medellin`).

**1. Hora de Bogotá** (sello del dashboard):
```
TZ="America/Bogota" date "+%Y-%m-%dT%H:%M:%S-05:00"
```

**2. Traer TODOS los pedidos** desde el lanzamiento, paginando. Usa la herramienta
Shopify `graphql_query` con esta query (campos mínimos que necesita el script):
```graphql
query($after:String){
  orders(first:50, after:$after, query:"created_at:>=2026-07-24T00:00:00-05:00", sortKey:CREATED_AT){
    edges{ node{ name displayFinancialStatus
      lineItems(first:25){ edges{ node{
        quantity variantTitle sku product{ id }
        originalTotalSet{ shopMoney{ amount } }
      } } } } }
    pageInfo{ hasNextPage endCursor } } }
```
Repite pasando `after: <endCursor>` mientras `hasNextPage` sea `true`. Guarda la
respuesta CRUDA de cada página en `pedidos_1.json`, `pedidos_2.json`, … (con la
herramienta Write, el JSON exacto que devolvió la query, sin recortar).

**3. Traer inventario actual** de las 10 referencias y guardarlo en `inventario.json`:
```graphql
query{ nodes(ids:[
  "gid://shopify/Product/9481810510063","gid://shopify/Product/9481804185839",
  "gid://shopify/Product/9481812279535","gid://shopify/Product/9483555438831",
  "gid://shopify/Product/9481813098735","gid://shopify/Product/9481826009327",
  "gid://shopify/Product/9481816473839","gid://shopify/Product/9481815949551",
  "gid://shopify/Product/9481840689391","gid://shopify/Product/9481838231791"
]){ ... on Product { id title totalInventory
  variants(first:10){ edges{ node{ title inventoryQuantity } } } } } }
```

**4. Calcular y parchear** el dashboard fuente:
```
python3 .claude/skills/monitor-medellin/compute.py \
  --orders $SCRATCH/medellin/pedidos_*.json \
  --inventory $SCRATCH/medellin/inventario.json \
  --html dashboard/medellin-dashboard.html \
  --now "<hora ISO del paso 1>"
```
Revisa el resumen que imprime: **la validación de kits debe decir OK** (kits por
prenda = # aguardientes). Si dice ⚠️ REVISAR, hay un caso de precio/SKU no
contemplado — corrige `compute.py` antes de publicar. Anota totales y alertas.

**5. Republicar el Artifact** con la herramienta Artifact:
- `file_path`: `dashboard/medellin-dashboard.html`
- `url`: `https://claude.ai/code/artifact/cfa21005-cee5-43a5-b72e-8c1cb2326875`
- `favicon`: 🌸 · `title`: `Medellín Mi Amor — Monitor de ventas en vivo`

**6. Regenerar la web pública y hacer push.** Envuelve el body-only en un doc
completo y súbelo a la rama:
```
cat > index.html <<'HEAD'
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Medellín Mi Amor — Monitor de ventas en vivo</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌸</text></svg>">
<style>*{box-sizing:border-box}html,body{margin:0;padding:0}</style>
</head>
<body>
HEAD
cat dashboard/medellin-dashboard.html >> index.html
printf '\n</body>\n</html>\n' >> index.html
git add index.html dashboard/medellin-dashboard.html
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "Update Medellin Mi Amor dashboard (<hora>)"
git push origin claude/shopify-sales-dashboard-realtime-f7vcvu   # reintenta con backoff si falla
```

**7. Reportar** en el chat: unidades, kits (T‑Shirt/Mesh), ingresos brutos, top de
la campaña, y las alertas 🔥 (tallas que se venden y están en riesgo).

## Anexo mayorista (facturas B2B)

Cuando el usuario comparta una factura de un mayorista (Casa Viva, Wanita,
etc.), ver `references/mayoristas_sheet.md` para el procedimiento completo:
en resumen, registra cada línea en la hoja de Google Sheets compartida (el
ledger histórico, con su columna `estado`) y además actualiza el
**consolidado** en `dashboard/medellin-dashboard.html` (sección "Anexo ·
Canal mayorista": `WHOLESALE_INVOICES` + `WHOLESALE_PRODUCTS` + `CONSIGNMENT`)
— NO como tarjeta de factura individual; el dashboard muestra ranking +
tarjetas de kits/individuales igual que el online (sin talla en el ranking,
sin stock/sell-through en las tarjetas), y el detalle línea por línea vive
solo en la hoja. No mezcles esto con las ventas online de los pasos
anteriores. Los SKU de estas facturas vienen del sistema de facturación del
mayorista (ej. World Office), no de Shopify — mapea por nombre de producto,
no por SKU literal. Los kits suelen listarse al final de la factura.

## Notas

- **Reembolsos:** el script los excluye del neto y los reporta aparte.
- **Aguardiente renombrado:** el producto puede aparecer como "AGUARDIENTE Y
  COSMETIQUERA OBSEQUIO"; no importa, se detecta por SKU.
- **Un Guarito XL bajo** es producción parcial (más en camino), no demanda tope.
- **Proyección / forecast:** la sección final del dashboard es un modelo con
  supuestos fijos; `compute.py` NO la toca. Recalíbrala a mano cuando el usuario lo
  pida (con más días de curva real).
- **Refresco automático:** actualmente desactivado (el usuario lo pidió). Para
  reactivarlo, crear un cron/routine que invoque este skill.
