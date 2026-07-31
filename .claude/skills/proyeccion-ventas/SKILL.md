---
name: proyeccion-ventas
description: "Proyecta ventas futuras de Mompossina — de una campaña/lanzamiento específico (como Medellín Mi Amor) o de la tienda completa en un horizonte (mes, trimestre) — ajustando una curva de decaimiento a la venta diaria REAL de Shopify y generando 3 escenarios (conservador/base/optimista) en un dashboard HTML. Incluye el canal mayorista (facturado + pipeline) aparte, sin mezclarlo con la curva en línea. Usar siempre que el usuario pida: proyecta/proyección de ventas, cuánto vamos a vender, forecast, cuánto vamos a facturar este mes/trimestre, cómo va a cerrar la campaña/colección X, estimado de ventas, o cuando quiera saber si un lanzamiento va a llegar a cierta meta. También úsalo para recalibrar una proyección anterior con más días de venta real."
---

## Objetivo

Responder, con números ajustados a datos reales (no a ojo): **¿cuánto vamos a
vender de aquí a X días, y cuánto de eso ya es mayorista conocido vs. lo que
falta por generarse online?**

Este skill generaliza la proyección que se hizo manualmente para Medellín Mi
Amor: en vez de que el modelo invente una curva de decaimiento a ojo cada vez,
`scripts/forecast.py` la ajusta a partir de la venta diaria real, y mejora sola
cada vez que se corre con más días de historia.

---

## Principio de diseño (leer antes de modificar)

**`forecast.py` ajusta la curva y hace toda la aritmética; el modelo orquesta,
consulta y narra.** No inventes multiplicadores ni sumes escenarios a mano —
si un número no cuadra, se corrige el script, no el resultado.

La curva se ajusta por **regresión sobre todos los días reales desde el pico
en adelante**, no solo el primero y el último. Esto importa: significa que la
proyección **mejora con el tiempo** — cada día adicional de venta real que se
agrega promedia el ruido día a día y sube la confianza del ajuste (baja →
media → alta, según cuántos días de caída hay). Con pocos días es normal y
correcto que el modelo sea conservador; no hay que forzarlo a coincidir con
una intuición previa.

El **mayorista NO se proyecta con curva**. Son pedidos puntuales por cliente
(facturas), no un goteo diario — mezclarlo con la curva online distorsionaría
ambas cosas. Se muestra aparte: lo ya facturado (dato duro) + un pipeline de
próximos pedidos esperados que el usuario documenta con su nivel de certeza
(alta/media/baja).

---

## Dos modos de uso

**Modo campaña** — proyectar un lanzamiento o colección específica con fecha
de inicio conocida (ej. "¿cómo va a cerrar Medellín Mi Amor?", "proyecta la
nueva colección de diciembre"). Se restringe la venta diaria a los IDs de
producto de esa campaña.

**Modo tienda completa** — proyectar el total de Mompossina en un horizonte
(ej. "¿cuánto vamos a facturar este mes?", "proyección del trimestre"). Se usa
toda la venta diaria de la tienda, sin filtrar por producto.

El motor (`forecast.py`) es el mismo en ambos casos; lo único que cambia es
qué serie diaria se le pasa como `--daily`.

---

## Procedimiento

Trabaja en un directorio temporal del scratchpad (p.ej. `$SCRATCH/proyeccion`).

### Paso 1 — Definir el período

- **Modo campaña:** fecha de inicio de la campaña (dato conocido) hasta hoy
  (venta real), y el horizonte a proyectar (fecha de cierre de la campaña o
  la que pida el usuario).
- **Modo tienda completa:** normalmente los últimos 14-21 días reales como
  base del ajuste, proyectando hasta el fin del mes/trimestre en cuestión.

```bash
TZ="America/Bogota" date "+%Y-%m-%dT%H:%M:%S-05:00"
```

### Paso 2 — Traer la venta diaria real de Shopify

Usa la herramienta Shopify `graphql_query` (o, si el servidor nativo está
desconectado, la ruta por Composio que se usó en monitor-medellin: escribir
un sandbox remoto que pagine y filtre, para no inflar el contexto con cientos
de pedidos — ver ese skill como referencia del patrón).

```graphql
query($after:String){
  orders(first:50, after:$after, query:"created_at:>=<INICIO> created_at:<=<FIN>",
         sortKey:CREATED_AT){
    edges{ node{ name createdAt displayFinancialStatus
      lineItems(first:25){ edges{ node{
        quantity variantTitle sku product{ id }
        originalTotalSet{ shopMoney{ amount } }
      } } } } }
    pageInfo{ hasNextPage endCursor } } }
```

Paginar hasta `hasNextPage: false`, guardando cada página cruda con Write
(`pedidos_1.json`, `pedidos_2.json`, …). **Importante:** a diferencia de
monitor-medellin, aquí SÍ hace falta `createdAt` en la query (se necesita para
agrupar por día).

Luego agregar a serie diaria:

```bash
# Modo campaña (reemplaza los IDs por los de la campaña en cuestión):
# --kit-aware es OBLIGATORIO si la campaña vende kits con el mecanismo de
# Mompossina (prenda + abanico + aguardiente como líneas separadas del mismo
# pedido) — sin él, cada kit se cuenta como 2-3 "unidades" en vez de 1, e
# infla ~2x las unidades reales (el ingreso no se ve afectado, pero las
# unidades sí, y con ellas el ticket promedio y todo lo que dependa de él).
python3 .claude/skills/proyeccion-ventas/scripts/aggregate_daily.py \
  --orders $SCRATCH/proyeccion/pedidos_*.json \
  --product-ids 9481810510063,9481804185839,9481816473839,... \
  --kit-aware \
  --tz-offset="-05:00" \
  --output $SCRATCH/proyeccion/daily.json

# Modo tienda completa (sin --product-ids, sin kits o mezcla no separable):
python3 .claude/skills/proyeccion-ventas/scripts/aggregate_daily.py \
  --orders $SCRATCH/proyeccion/pedidos_*.json \
  --tz-offset="-05:00" \
  --output $SCRATCH/proyeccion/daily.json
```

Revisa el resumen impreso (pedidos leídos, reembolsos excluidos, días
agregados) antes de continuar — si un día sale en cero cuando claramente hubo
venta, algo está mal filtrado. Si el dashboard de monitor-medellin ya reporta
unidades para el mismo período, cuadra el total de `daily.json` contra ese
número — si no coincide y la campaña vende kits, seguramente falta
`--kit-aware`.

### Paso 3 — Mayorista (Google Sheets vía Composio)

Lee la hoja de registro mayorista (ver `references/mayoristas_sheet.md` para
el esquema de columnas). Si las herramientas `mcp__Composio__*` no aparecen
disponibles, es porque el conector no está habilitado en esta conversación —
avísale al usuario que lo active en la configuración de conectores de la
sesión (no puedes activarlo tú) y continúa con `--wholesale-known 0` mientras
tanto, dejándolo explícito en el resumen que le des al usuario.

- Suma `total` de las filas dentro del período (y, en modo campaña, filtradas
  por `campana`) → `--wholesale-known`.
- Si el usuario menciona pedidos mayoristas esperados pero no facturados aún
  ("Casa Viva probablemente reponga ~$8M en agosto"), arma
  `pipeline.json` con esa información y su nivel de certeza — no lo inventes,
  pregúntale al usuario si no lo ha mencionado.
- Si el usuario NO tiene pedidos concretos pero pide proyectar el mayorista
  "con base en el ritmo de esta semana" (cadencia), puedes derivar el
  pipeline tú mismo: por cliente, `monto_promedio_por_pedido` (de los pedidos
  confirmados en la ventana) × cuántos pedidos más caben antes del horizonte
  que te dio el usuario. Si la cadencia observada es muy apretada (ej. 3
  pedidos en 3 días seguidos), NO extrapoles eso literalmente — probablemente
  es una ráfaga de lanzamiento, no un ritmo sostenible — usa un supuesto más
  moderado (ej. "al menos 1 pedido más por cliente") y dilo explícitamente.
  Marca esta entrada con certeza `"baja"` siempre, muestra la aritmética
  completa (pedidos, fechas, promedio) en el resumen al usuario, e invita a
  que la ajuste — esto no reemplaza que te confirme pedidos reales conocidos.

### Paso 4 — Eventos/campañas de marketing (opcional)

Si hay fechas con multiplicador esperado (feria, lanzamiento de pauta, fechas
comerciales como Amor y Amistad o Black Friday), arma `events.json`:

```json
[{"label": "Feria de las Flores", "start": "2026-08-01", "end": "2026-08-10",
  "mult_conservador": 1.15, "mult_base": 1.35, "mult_optimista": 1.55}]
```

Si el usuario no da multiplicadores, pregúntale en vez de inventarlos — son
supuestos de negocio, no un cálculo.

### Paso 5 — Desglose por producto (opcional, principalmente modo campaña)

Si tiene sentido mostrar el total proyectado repartido por referencia (como
en el forecast de Medellín Mi Amor), arma `products.json` con la participación
histórica de ingreso de cada una a la fecha (súmalo tú de los pedidos ya
traídos, no lo estimes) y, si aplica, el inventario disponible como tope:

```json
[{"name": "Kit · Mesh", "share_revenue": 0.36, "stock_cap": 446}]
```

### Paso 6 — Correr el motor

```bash
python3 .claude/skills/proyeccion-ventas/scripts/forecast.py \
  --label "Medellín Mi Amor" \
  --daily $SCRATCH/proyeccion/daily.json \
  --horizon-days <N> \
  --now "<hora ISO del paso 1>" \
  --output-html <ruta/al/archivo.html> \
  --title "Proyección · <nombre>" \
  --subtitle "<descripción del período>" \
  [--events $SCRATCH/proyeccion/events.json] \
  [--products $SCRATCH/proyeccion/products.json] \
  [--wholesale-known <monto>] \
  [--wholesale-pipeline $SCRATCH/proyeccion/pipeline.json]
```

Revisa el resumen impreso: **confianza del ajuste** (baja/media/alta según
días desde el pico) y los 3 totales de escenario. Si `tau: None` aparece,
significa que la venta todavía no muestra señal de caída (campaña acelerando)
— es información legítima, no un error.

### Paso 7 — Presentar

1. Envía el HTML al usuario (`SendUserFile` o adjuntando el archivo).
2. Si el usuario pide dejarlo como referencia pública o recurrente (no es el
   caso por defecto), pregúntale antes de publicarlo como Artifact — este
   skill, a diferencia de monitor-medellin, no tiene un Artifact ni una página
   pública fijos: cada proyección es un análisis puntual.
3. Resumen en el chat, máximo 5 líneas:
   - 📈 Total proyectado (escenario base): en línea + mayorista, y el
     combinado.
   - 🎯 Confianza del ajuste y por qué (cuántos días de caída hay).
   - 🏭 Cuánto del total es mayorista (facturado vs. pipeline).
   - ⚠️ Cualquier referencia topada a stock, si aplica.
   - Qué cambiaría si se corre de nuevo con más días de venta real.

---

## Manejo de errores

- **Sin señal de caída (`tau: None`):** normal en campañas muy recientes o
  todavía acelerando. El escenario base usa una meseta plana; explícaselo al
  usuario en vez de forzar un decaimiento inventado.
- **Composio (mayorista) no disponible:** ver Paso 3. Continuar con
  `--wholesale-known 0`, dejándolo explícito.
- **ShopifyQL/GraphQL con rate limit:** reintentar hasta 3 veces con 2s de
  espera.
- **Un día sale en cero inesperadamente:** revisar el filtro de `--product-ids`
  o el rango de fechas de la query antes de confiar en el resultado.

## Notas

- **No confundir con `reposicion-estrellas`:** ese skill mira semanas de
  cobertura de inventario para decidir qué producir; este mira ingresos/
  unidades futuras. Son preguntas distintas y no se debe mezclar la lógica.
- **No confundir con `shopify-daily-report`/`shopify-weekly-report`:** esos
  reportan lo que YA pasó; este proyecta lo que va a pasar.
- **Recalibrar:** cuando el usuario pida "actualiza la proyección de X", vuelve
  a correr desde el Paso 2 con la venta real hasta hoy — no reuses un
  `daily.json` viejo.
