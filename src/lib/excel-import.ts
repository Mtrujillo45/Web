import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { guardarImagen } from "@/lib/storage";

export type FilaExcel = { numeroFila: number; celdas: string[] };
export type HojaExcel = { nombre: string; filas: FilaExcel[] };

export type ImagenIncrustada = {
  filaAncla: number; // 1-based, fila donde empieza la imagen
  columnaAncla: number; // 1-based
  buffer: Buffer;
  extension: string;
};

function celdaATexto(valor: ExcelJS.CellValue): string {
  if (valor == null) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    if ("result" in valor) return celdaATexto((valor as { result?: ExcelJS.CellValue }).result ?? "");
    if ("richText" in valor) {
      return (valor as { richText: { text: string }[] }).richText.map((p) => p.text).join("");
    }
    if ("text" in valor) return String((valor as { text?: unknown }).text ?? "");
    if ("hyperlink" in valor) {
      const v = valor as { text?: unknown; hyperlink?: unknown };
      return String(v.text ?? v.hyperlink ?? "");
    }
    return "";
  }
  return String(valor);
}

async function cargarWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

/** Lee TODAS las hojas del archivo como texto plano, sin asumir dónde está el encabezado. */
export async function leerTodasLasHojas(buffer: Buffer): Promise<HojaExcel[]> {
  const workbook = await cargarWorkbook(buffer);
  return workbook.worksheets.map((hoja) => {
    const filas: FilaExcel[] = [];
    hoja.eachRow({ includeEmpty: false }, (row, numeroFila) => {
      const celdas: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => celdas.push(celdaATexto(cell.value)));
      if (celdas.some((c) => c.trim())) filas.push({ numeroFila, celdas });
    });
    return { nombre: hoja.name, filas };
  });
}

// El tipado de exceljs no declara `index` en Media ni alinea el tipo de `imageId`
// con el de Media.index, aunque ambos existen en tiempo de ejecución.
type MediaConIndice = ExcelJS.Media & { index: number | string };

/** Extrae las imágenes incrustadas de una hoja, con su fila/columna de anclaje (1-based). */
export async function extraerImagenesDeHoja(
  buffer: Buffer,
  nombreHoja: string
): Promise<ImagenIncrustada[]> {
  const workbook = await cargarWorkbook(buffer);
  const hoja = workbook.getWorksheet(nombreHoja);
  if (!hoja) return [];

  const media = (workbook as unknown as { media: MediaConIndice[] }).media;
  const imagenes: ImagenIncrustada[] = [];
  for (const img of hoja.getImages()) {
    const m = media.find((mm) => String(mm.index) === String(img.imageId));
    if (!m?.buffer) continue;
    imagenes.push({
      filaAncla: img.range.tl.nativeRow + 1,
      columnaAncla: img.range.tl.nativeCol + 1,
      buffer: Buffer.from(m.buffer),
      extension: m.extension || "png",
    });
  }
  return imagenes;
}

/** Intenta adivinar a qué campo corresponde cada columna, a partir del texto del encabezado. */
const SINONIMOS: Record<string, string[]> = {
  referencia: ["reference", "referencia", "ref", "codigo", "código"],
  nombreReferencia: ["description", "descripcion", "descripción", "nombre", "producto", "style name"],
  sku: ["sku"],
  talla: ["size", "talla", "tamaño"],
  precioUsd: ["whls", "wholesale", "usd", "fob", "fca"],
  precioCop: ["cop", "pesos"],
  fotoColumna: ["photo", "foto", "imagen", "picture", "image"],
};

export function sugerirMapeo(encabezados: string[]): Partial<Record<string, number>> {
  const sugerido: Partial<Record<string, number>> = {};
  encabezados.forEach((texto, idx) => {
    const normalizado = texto.trim().toLowerCase();
    if (!normalizado) return;
    for (const [campo, sinonimos] of Object.entries(SINONIMOS)) {
      if (sugerido[campo] != null) continue;
      if (sinonimos.some((s) => normalizado.includes(s))) {
        sugerido[campo] = idx;
      }
    }
  });
  return sugerido;
}

/** Adivina cuál fila es la de encabezados: la primera con varias celdas de texto no vacías. */
export function sugerirFilaEncabezado(filas: FilaExcel[]): number {
  for (const fila of filas) {
    const noVacias = fila.celdas.filter((c) => c.trim()).length;
    if (noVacias >= 4) return fila.numeroFila;
  }
  return filas[0]?.numeroFila ?? 1;
}

export type MapeoColumnas = {
  referencia: number;
  nombreReferencia: number;
  talla: number;
  precioUsd?: number;
  precioCop?: number;
  sku?: number;
  fotoColumna?: number;
};

export type FilaCatalogo = {
  numeroFila: number;
  referencia: string;
  nombreReferencia: string;
  sku: string;
  talla: string;
  precioUsd: number | null;
  precioCop: number | null;
};

export type FilaInvalida = { numeroFila: number; errores: string[] };

function slug(texto: string): string {
  return texto
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsearPrecio(texto: string): number | null {
  if (!texto) return null;
  const normalizado = texto.replace(/[^0-9.,-]/g, "").replace(",", ".");
  const valor = Number(normalizado);
  return !normalizado || Number.isNaN(valor) || valor <= 0 ? null : valor;
}

/**
 * Aplica el mapeo de columnas a las filas de datos (después del encabezado) y valida cada una.
 * El precio USD y el precio COP son independientes y ambos opcionales: basta con que al menos
 * uno de los dos se haya podido leer en una fila para que sea válida (así un mismo drop puede
 * servir catálogo a clientes internacionales y nacionales con un solo import).
 */
export function mapearYValidarFilas(
  filas: FilaExcel[],
  mapeo: MapeoColumnas
): { validas: FilaCatalogo[]; invalidas: FilaInvalida[] } {
  const validas: FilaCatalogo[] = [];
  const invalidas: FilaInvalida[] = [];
  const skusVistos = new Set<string>();

  for (const fila of filas) {
    const errores: string[] = [];
    const obtener = (idx?: number) =>
      idx == null ? "" : (fila.celdas[idx] ?? "").toString().trim();

    const referencia = obtener(mapeo.referencia);
    const nombreReferencia = obtener(mapeo.nombreReferencia);
    const talla = obtener(mapeo.talla);
    const skuExplicito = mapeo.sku != null ? obtener(mapeo.sku) : "";

    if (!referencia) errores.push("Referencia vacía");
    if (!talla) errores.push("Talla vacía");

    const precioUsd = mapeo.precioUsd != null ? parsearPrecio(obtener(mapeo.precioUsd)) : null;
    const precioCop = mapeo.precioCop != null ? parsearPrecio(obtener(mapeo.precioCop)) : null;
    if (precioUsd == null && precioCop == null) {
      errores.push("No se encontró un precio válido (USD o COP) para esta fila");
    }

    if (errores.length > 0) {
      invalidas.push({ numeroFila: fila.numeroFila, errores });
      continue;
    }

    const sku = skuExplicito || `${slug(referencia)}-${slug(talla)}`;
    if (skusVistos.has(sku)) {
      invalidas.push({ numeroFila: fila.numeroFila, errores: [`SKU duplicado: ${sku}`] });
      continue;
    }
    skusVistos.add(sku);

    validas.push({
      numeroFila: fila.numeroFila,
      referencia,
      nombreReferencia: nombreReferencia || referencia,
      sku,
      talla,
      precioUsd,
      precioCop,
    });
  }

  return { validas, invalidas };
}

/**
 * Crea Producto (por referencia) y Variante (por SKU/talla) para un drop a partir de filas
 * ya validadas. Si se pasan imágenes incrustadas, asocia a cada referencia la primera imagen
 * anclada dentro del rango de filas de esa referencia (prefiriendo la columna de fotos, si se indicó).
 */
export async function crearCatalogoDesdeFilas(
  prisma: PrismaClient,
  dropId: string,
  filas: FilaCatalogo[],
  imagenes: ImagenIncrustada[] = [],
  fotoColumna?: number
) {
  const porReferencia = new Map<string, FilaCatalogo[]>();
  for (const fila of filas) {
    if (!porReferencia.has(fila.referencia)) porReferencia.set(fila.referencia, []);
    porReferencia.get(fila.referencia)!.push(fila);
  }

  await prisma.$transaction(async (tx) => {
    for (const [referencia, filasRef] of porReferencia) {
      const filasNumeros = filasRef.map((f) => f.numeroFila);
      const minFila = Math.min(...filasNumeros);
      const maxFila = Math.max(...filasNumeros);

      const candidatas = imagenes.filter(
        (img) => img.filaAncla >= minFila && img.filaAncla <= maxFila
      );
      const imagen =
        candidatas.find((img) => fotoColumna != null && img.columnaAncla === fotoColumna) ??
        candidatas[0];

      let fotoUrl: string | null = null;
      if (imagen) {
        fotoUrl = await guardarImagen(imagen.buffer, imagen.extension);
      }

      const producto = await tx.producto.create({
        data: {
          dropId,
          referencia,
          nombreReferencia: filasRef[0].nombreReferencia,
          fotoUrl,
        },
      });
      await tx.variante.createMany({
        data: filasRef.map((f) => ({
          productoId: producto.id,
          sku: f.sku,
          talla: f.talla,
          precioBaseUsd: f.precioUsd,
          precioBaseCop: f.precioCop,
        })),
      });
    }
  });
}
