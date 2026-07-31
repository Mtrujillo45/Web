# Prospección Mompossina

Herramienta interna para encontrar prospectos de venta al por mayor
(distribuidores) y boutiques en Estados Unidos para las líneas de
swimwear, resortwear, blusas/moda mesh, sleepwear y accesorios de
Mompossina, usando la API oficial de Google Places para datos de
negocios y un Google Sheet como lista de seguimiento comercial.

**Fase 1 (esta versión):** categoría de negocio + Google Maps/Business
vía la API oficial. **Fase 2 (pendiente):** directorios de negocios
específicos — ver sección "Próximos pasos".

## Por qué así (y no scraping directo de Google Maps)

Scrapear el HTML de Google Maps directamente viola los Términos de
Servicio de Google y las IPs se bloquean rápido. Por eso usamos la API
oficial **Places API (New)**: es estable, documentada, tiene cuota
gratis mensual y su costo se puede topar (ver `max_api_requests_per_run`
en `config/search_config.yaml`).

Para el email de contacto, la herramienta visita el sitio web público
del negocio (no redes sociales cerradas, no LinkedIn) respetando su
`robots.txt` y con un User-Agent identificable — es el equivalente a
que alguien entre a la página de "Contacto" de una tienda.

## Cumplimiento legal — léelo antes de mandar el primer correo frío

- Estos datos son de negocios (B2B), no de personas naturales, y provienen
  de fuentes públicas (Google Business, sitios web de las tiendas). Aun así:
- **EE.UU. / CAN-SPAM:** al mandar correo frío, identifica claramente a
  Mompossina como remitente, incluye una dirección postal válida y un
  método de opt-out (algo tan simple como "responde UNSUBSCRIBE").
- No uses estos datos para spam masivo ni los compartas con terceros.
- Si en el futuro se agregan ciudades fuera de EE.UU. (ej. Europa), hay que
  revisar GDPR antes de contactar — para B2B puro suele haber más margen,
  pero conviene confirmarlo primero.

## 1. Configurar Google Cloud (una sola vez)

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) y crea
   un proyecto nuevo (ej. `mompossina-prospeccion`).
2. Activa la facturación del proyecto (Google pide una tarjeta, pero el uso
   normal de esta herramienta cae dentro de la cuota gratis mensual;
   revisa el pricing actual de "Places API" en la consola porque cambia).
3. En "APIs y servicios" → "Biblioteca", habilita:
   - **Places API (New)**
   - **Google Sheets API**
4. Crea una **API key** (APIs y servicios → Credenciales → Crear credenciales
   → Clave de API). Restríngela para que solo pueda usar "Places API (New)".
   Copia esta key, la vas a necesitar en el paso 3 de abajo.
5. Crea una **cuenta de servicio** (Credenciales → Crear credenciales →
   Cuenta de servicio). No necesita ningún rol especial a nivel de
   proyecto. Después de creada, entra a la cuenta → pestaña "Claves" →
   "Agregar clave" → JSON. Se descarga un archivo `.json`: guárdalo en
   `prospeccion/credentials/service_account.json` (esa carpeta está en
   `.gitignore`, nunca se sube al repo).

## 2. Crear el Google Sheet de seguimiento

1. Crea un Google Sheet nuevo (puede llamarse "Prospección Mompossina").
2. Crea (o renombra) una pestaña llamada `Leads` (o el nombre que prefieras,
   solo asegúrate de ponerlo en `.env` en `GOOGLE_SHEET_TAB_NAME`).
3. Comparte el Sheet como **Editor** con el email de la cuenta de servicio
   del paso anterior (algo como
   `prospeccion@mompossina-prospeccion.iam.gserviceaccount.com`, lo
   encuentras dentro del archivo JSON descargado, campo `client_email`).
4. Copia el ID del Sheet desde la URL:
   `https://docs.google.com/spreadsheets/d/ESTE_ID_AQUI/edit`.

La herramienta crea automáticamente la fila de encabezados la primera vez
que escribe en la hoja (columnas: Fecha, Categoria, Nombre Negocio,
Dirección, Ciudad Buscada, Teléfono, Sitio Web, Email, Rating Google,
Estado, Notas, Place ID). La columna **Estado** queda en "Nuevo" para que
el equipo comercial la vaya actualizando manualmente conforme contacta
cada prospecto (ej. Contactado, En negociación, Cliente, Descartado).

## 3. Configurar el proyecto localmente

```bash
cd prospeccion
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edita .env y completa:
#   GOOGLE_PLACES_API_KEY=       (paso 1.4)
#   GOOGLE_SERVICE_ACCOUNT_FILE=./credentials/service_account.json
#   GOOGLE_SHEET_ID=             (paso 2.4)
#   GOOGLE_SHEET_TAB_NAME=Leads
```

## 4. Correr la herramienta

Antes de gastar cuota de la API, valida que todo esté bien armado:

```bash
python -m pytest        # corre las pruebas locales (no necesita API key)
```

Primera corrida real, chica y sin escribir al Sheet todavía:

```bash
python -m src.main --dry-run --limit 10
```

Esto genera un CSV en `output/leads_<fecha>.csv` para que revises la
calidad de los resultados antes de conectarlo al Sheet.

Corrida completa (respeta `max_api_requests_per_run` de la config) que sí
escribe al Google Sheet:

```bash
python -m src.main
```

Otras opciones útiles:

```bash
python -m src.main --category swimwear --city "Miami, FL"  # probar una sola combinación
python -m src.main --skip-enrichment                        # más rápido, sin buscar email
```

## 5. Ajustar categorías y ciudades

Edita `config/search_config.yaml`:
- `categories`: agrega o quita frases de búsqueda por línea de producto.
- `cities`: hoy está en Florida (hub de swimwear/resortwear). Para expandir
  a otros estados, agrega ciudades (ej. `"New York, NY"`, `"Los Angeles, CA"`).
- `max_api_requests_per_run`: sube este número solo después de revisar el
  costo real en la consola de Google Cloud con un run pequeño.

## Próximos pasos (Fase 2)

- Sumar directorios de negocios específicos (ej. cámaras de comercio,
  directorios mayoristas de moda) — falta definir cuáles exactamente,
  porque cada sitio tiene su propia estructura y términos de uso.
- Explorar marketplaces B2B (Faire, etc.) si se decide más adelante.
- Automatizar la corrida en un horario fijo (hoy es manual, por decisión
  del equipo).
