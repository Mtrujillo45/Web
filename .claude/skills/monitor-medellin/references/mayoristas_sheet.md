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
   Shopify. El `total` que registres (aquí y en el dashboard) debe ser
   **siempre con IVA incluido** — si el PDF trae precio y total sin IVA,
   súmaselo (`subtotal + round(subtotal*0.19)`) antes de guardarlo. No mezcles
   convenciones entre facturas (ver nota de bug más abajo).
2. Agrega las filas a esta hoja con `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
   (nunca `_UPDATE` sobre rangos existentes, para no pisar facturas ya
   cargadas). Una fila por línea, mismo orden de columnas de arriba.
3. Actualiza el consolidado en `dashboard/medellin-dashboard.html` (ver
   convención de renderizado abajo) — no agregues la factura como una tarjeta
   individual nueva.
4. No mezcles esto con las ventas online del Paso 2 del SKILL.md principal —
   el mayorista es un canal aparte, con sus propios KPIs en la sección Anexo.

## Convención de renderizado del bloque mayorista en el dashboard (fijada 30 jul 2026)

El bloque "Anexo · Canal mayorista" del dashboard es un **consolidado**, no un
desglose factura por factura — eso vive en esta hoja. El detalle línea por
línea de cada factura **no se guarda en el dashboard**, solo el agregado.
Usa el mismo esquema visual que la sección online (KPIs, ranking sin talla,
tarjetas de kits/individuales), con estas variables JS:

- **`WHOLESALE_INVOICES`**: un objeto liviano por factura/proforma confirmada
  — `{client, number, date, pay, campUnits, campTotal}` — solo para la tabla
  resumen de trazabilidad al final del bloque (sin líneas). `campUnits` /
  `campTotal` son SOLO las líneas de Medellín Mi Amor (excluye "Colombia" u
  otra colección) y SOLO facturas con `estado` `Facturada` o `Confirmada
  (pendiente factura)` — nunca consignación.
- **`WHOLESALE_PRODUCTS`**: el consolidado por referencia (agregando TODAS
  las facturas confirmadas de la campaña) — `{name, mono, kind, sold,
  revenue, sizes:[{z,sold}]}`. `kind` es `"kit"`, `"garment"` o `"accessory"`,
  igual que `PRODUCTS` (online), pero **sin `stock` ni `sellThrough`** — el
  mayorista no tiene un pool de inventario propio que mostrar ahí. El
  "precio" que se muestra en la tarjeta es un **promedio** (`revenue/sold`),
  nunca un precio fijo — cada cliente mayorista negocia su propio precio
  unitario (ej. Casa Viva paga más por Mesh Shirt que Wanita), así que no hay
  un único "precio de lista" que mostrar.
- **`CONSIGNMENT`**: igual que antes, aparte, con nota visual de advertencia
  — nunca entra a `WHOLESALE_INVOICES`/`WHOLESALE_PRODUCTS` ni a sus KPIs.
- Recalcula estos tres arreglos a mano cada vez que se agregue/actualice una
  factura (súmalos con Python/una calculadora, no de cabeza — son sumas por
  referencia cruzando varias facturas). compute.py NO los toca (son 100%
  mayorista, fuera del alcance de la consulta a Shopify).

**Bug histórico a tener en cuenta:** las dos primeras facturas cargadas
(RFEL8186 Casa Viva, RFEL8193 Wanita) originalmente guardaban el `total` de
cada línea **sin IVA** mientras que las proformas agregadas después lo
guardaban **con IVA** — mezclar ambas al sumar por referencia da un total
incorrecto. Ya se corrigió (30 jul 2026): todo quedó normalizado a **con
IVA**. Si vuelves a auditar cifras viejas y no cuadran con la factura real,
sospecha primero de esta inconsistencia antes de asumir que el dato de origen
está mal.
