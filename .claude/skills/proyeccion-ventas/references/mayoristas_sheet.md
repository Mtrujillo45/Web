# Hoja de registro de ventas mayoristas (Google Sheets)

Vive en Google Sheets, conectada vía el conector **Composio** (herramientas
`mcp__Composio__*` — requieren que el conector esté habilitado en la
conversación; si no aparecen, avisa al usuario que lo active en la
configuración de conectores de esa sesión antes de continuar).

- **Spreadsheet ID:** `1XU83Z83FWH-ch3W-siU6suDUDZjfJuqP-Z1arvGX6QQ`
- **URL:** https://docs.google.com/spreadsheets/d/1XU83Z83FWH-ch3W-siU6suDUDZjfJuqP-Z1arvGX6QQ/edit
- **Pestaña:** `Hoja 1`
- Compartida con `operaciones@mompossina.com` (escritura). El dueño en Drive
  es la cuenta Composio conectada al correo que corrió el skill la primera vez.

Una fila por **línea de producto**, no por factura, para que sea directo sumar
por referencia, talla, cliente o campaña sin tener que desanidar nada.

## Columnas

| Columna | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `fecha` | fecha ISO | `2026-07-27` | Fecha de la factura |
| `cliente` | texto | `CASA VIVA (18 Razones S.A.S.)` | Razón social |
| `nit` | texto | `901898267` | |
| `ciudad` | texto | `Medellín` | |
| `numero_factura` | texto | `RFEL 8186` | Identificador único de la factura |
| `forma_pago` | texto | `Crédito` \| `Contado` | |
| `sku` | texto | `30CA36/MED-S` | SKU exacto de Shopify si existe |
| `referencia` | texto | `Medellín Mi Amor Mesh Shirt` | Nombre legible del producto |
| `talla` | texto | `S` | `UN` si no aplica talla |
| `cantidad` | entero | `23` | |
| `precio_unitario` | número | `82294` | COP, sin IVA |
| `subtotal` | número | `1892765` | `cantidad × precio_unitario` |
| `iva` | número | `359625` | |
| `total` | número | `2252390` | `subtotal + iva` |
| `campana` | texto | `Medellín Mi Amor` | Vacío si es venta mayorista normal sin campaña asociada |

## Cómo la usa el skill

- **Ya facturado** (`--wholesale-known`): suma de `total` de todas las filas
  cuya `fecha` cae dentro de la ventana que se está proyectando (o de toda la
  hoja, si se está proyectando la tienda completa sin filtro de fecha).
- **Pipeline** (`--wholesale-pipeline`): esta hoja NO registra pedidos futuros
  todavía no facturados — esos se documentan aparte, a mano, en el momento de
  correr el skill (el usuario dice "Casa Viva probablemente reponga ~$8M en
  agosto, certeza media" y eso se pasa como `pipeline.json`). Si más adelante
  se agrega una hoja de "pedidos en proceso", el skill puede leerla igual.
- **Filtro por campaña**: si se está proyectando una campaña específica
  (ej. Medellín Mi Amor), filtrar filas donde `campana` coincida; si se está
  proyectando la tienda completa, usar todas las filas del período sin filtrar
  por `campana`.

## Si la hoja está vacía o no existe todavía

No es un error — simplemente pasar `--wholesale-known 0` y omitir
`--wholesale-pipeline`. El dashboard mostrará el mayorista en cero y lo dirá
explícitamente, no lo oculta.

## Quién escribe en la hoja

`monitor-medellin` es el que **registra** facturas nuevas ahí (una fila por
línea de producto) cada vez que el usuario comparte una factura de mayorista
— ver su SKILL.md, sección "Anexo mayorista". Este skill (`proyeccion-ventas`)
solo **lee** la hoja, nunca escribe. Al agregar filas, usar
`GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND` (no `_UPDATE`, para no pisar filas
existentes) y mantener el orden exacto de columnas de la tabla de arriba.
