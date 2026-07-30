# Hoja de registro de ventas mayoristas (Google Sheets)

Ledger compartido con el skill `proyeccion-ventas` — mismo archivo, mismo
esquema de columnas. Ver `.claude/skills/proyeccion-ventas/references/mayoristas_sheet.md`
para el detalle completo de columnas y cómo la consume ese skill. Este archivo
solo documenta el lado de **escritura**, que le corresponde a monitor-medellin.

- **Spreadsheet ID:** `1XU83Z83FWH-ch3W-siU6suDUDZjfJuqP-Z1arvGX6QQ`
- **URL:** https://docs.google.com/spreadsheets/d/1XU83Z83FWH-ch3W-siU6suDUDZjfJuqP-Z1arvGX6QQ/edit
- **Pestaña:** `Hoja 1`
- Conector: **Composio** (`mcp__Composio__*`). Si las herramientas no aparecen
  disponibles en la conversación, avisa al usuario que active el conector en
  la configuración de esa sesión — no lo puedes activar tú.

## Columnas (una fila por línea de producto, no por factura)

`fecha, cliente, nit, ciudad, numero_factura, forma_pago, sku, referencia, talla, cantidad, precio_unitario, subtotal, iva, total, campana, estado`

- `subtotal` = `cantidad × precio_unitario` (antes de IVA).
- `iva` = `round(subtotal × 0.19)`, `total` = `subtotal + iva`.
- `campana` = `"Medellín Mi Amor"` si la línea es de esa campaña; vacío si es
  otra colección (ej. "Colombia Mesh Shirt").
- `sku` es el de la factura del mayorista (World Office u otro sistema
  distinto a Shopify) — **puede no coincidir con el SKU de Shopify**. No lo
  fuerces a calzar; usa el nombre de `referencia` para mapear al producto real
  de la campaña.
- `estado` — uno de tres valores:
  - `Facturada`: tiene RFEL emitido.
  - `Confirmada (pendiente factura)`: el mayorista ya recibió/pagó el pedido
    pero administración todavía no le puso número de factura electrónica —
    poner el número de la proforma en `numero_factura` (ej. `Proforma
    280726MEDM`) como referencia hasta que llegue el RFEL real.
  - `Consignación`: mercancía enviada sin venderse todavía — **no es venta**,
    no se cuenta como ingreso hasta que el mayorista reporte que la vendió.
    Solo cuando el usuario lo indique explícitamente (como con la proforma de
    consignación de Wanita).
- Si un proforma tiene los mismos valores línea por línea que otro ya
  cargado (mismo cliente, mismas cantidades y totales) y el usuario confirma
  que es un duplicado sin actualizar, **no lo cargues** — pregúntale primero
  si no es obvio por contexto.

## Qué hacer cuando llega una factura nueva de mayorista

1. Extrae cada línea (SKU, referencia, talla, cantidad, precio unitario,
   total) del PDF/factura. Los kits suelen aparecer al final de la factura,
   con SKU propio del sistema de facturación (ej. `30KMMA21/MEDS` = Kit Mesh
   talla S) — mapea por nombre/descripción, no asumas que el SKU calza con
   Shopify.
2. Agrega las filas a esta hoja con `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
   (nunca `_UPDATE` sobre rangos existentes, para no pisar facturas ya
   cargadas). Una fila por línea, mismo orden de columnas de arriba.
3. Refleja la misma factura en `dashboard/medellin-dashboard.html`, arreglo
   `WHOLESALE` (sección "Anexo · Canal mayorista"): un objeto por factura con
   sus `lines[]`, marcando `camp:true` solo en las líneas de Medellín Mi Amor.
   Este arreglo es lo que compute.py NO toca — se edita a mano, en paralelo a
   la hoja (la hoja es el ledger histórico completo; el arreglo del dashboard
   es la vista visual de las facturas de la campaña vigente).
4. No mezcles esto con las ventas online del Paso 2 del SKILL.md principal —
   el mayorista es un canal aparte, con sus propios KPIs en la sección Anexo.
