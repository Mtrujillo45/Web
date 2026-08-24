import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import {
  leerTodasLasHojas,
  mapearYValidarFilas,
  extraerImagenesDeHoja,
  crearCatalogoDesdeFilas,
} from "@/lib/excel-import";

const esquemaMapeo = z.object({
  hoja: z.string(),
  filaEncabezado: z.number().int().positive(),
  columnas: z.object({
    referencia: z.number().int().min(0),
    nombreReferencia: z.number().int().min(0),
    talla: z.number().int().min(0),
    precioUsd: z.number().int().min(0),
    sku: z.number().int().min(0).optional(),
    fotoColumna: z.number().int().min(0).optional(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await requireRolApi(["COMERCIAL"]);
  if (acceso.error) return acceso.error;
  const { id: dropId } = await params;

  const drop = await prisma.drop.findUnique({ where: { id: dropId } });
  if (!drop) return NextResponse.json({ error: "Drop no encontrado" }, { status: 404 });
  if (drop.estado === "CERRADO") {
    return NextResponse.json({ error: "Este drop ya cerró" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const mapeoTexto = form?.get("mapeo");
  if (!(archivo instanceof File) || typeof mapeoTexto !== "string") {
    return NextResponse.json({ error: "Faltan datos del formulario" }, { status: 400 });
  }

  let mapeoJson: unknown;
  try {
    mapeoJson = JSON.parse(mapeoTexto);
  } catch {
    return NextResponse.json({ error: "Mapeo inválido" }, { status: 400 });
  }
  const datosMapeo = esquemaMapeo.safeParse(mapeoJson);
  if (!datosMapeo.success) {
    return NextResponse.json({ error: "Selecciona todas las columnas obligatorias" }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const hojas = await leerTodasLasHojas(buffer);
  const hoja = hojas.find((h) => h.nombre === datosMapeo.data.hoja);
  if (!hoja) return NextResponse.json({ error: "Hoja no encontrada en el archivo" }, { status: 400 });

  const filasDatos = hoja.filas.filter((f) => f.numeroFila > datosMapeo.data.filaEncabezado);
  const { validas, invalidas } = mapearYValidarFilas(filasDatos, datosMapeo.data.columnas);

  if (validas.length === 0) {
    return NextResponse.json(
      { error: "No se encontró ninguna fila válida para importar", invalidas },
      { status: 400 }
    );
  }

  const imagenes = await extraerImagenesDeHoja(buffer, datosMapeo.data.hoja);
  await crearCatalogoDesdeFilas(
    prisma,
    dropId,
    validas,
    imagenes,
    datosMapeo.data.columnas.fotoColumna
  );

  return NextResponse.json({
    ok: true,
    referenciasCreadas: new Set(validas.map((v) => v.referencia)).size,
    variantesCreadas: validas.length,
    invalidas,
  });
}
