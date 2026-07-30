# Hoja de registro de ventas mayoristas (Google Sheets)

Vive en Google Sheets, en la cuenta de Mompossina, conectada vía el conector
**Composio** (herramientas `mcp__Composio__*` — requieren que el conector esté
habilitado en la conversación; si no aparecen, avisa al usuario que lo active
en la configuración de conectores de esa sesión antes de continuar).

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
