import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import { leerTodasLasHojas, sugerirFilaEncabezado, sugerirMapeo } from "@/lib/excel-import";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await requireRolApi(["COMERCIAL"]);
  if (acceso.error) return acceso.error;
  const { id: dropId } = await params;

  const drop = await prisma.drop.findUnique({ where: { id: dropId } });
  if (!drop) return NextResponse.json({ error: "Drop no encontrado" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());

  let hojas;
  try {
    hojas = await leerTodasLasHojas(buffer);
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo. Verifica que sea un .xlsx válido." },
      { status: 400 }
    );
  }

  if (hojas.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene datos" }, { status: 400 });
  }

  const resultado = hojas.map((hoja) => {
    const filaEncabezadoSugerida = sugerirFilaEncabezado(hoja.filas);
    const filaEnc = hoja.filas.find((f) => f.numeroFila === filaEncabezadoSugerida);
    const mapeoSugerido = filaEnc ? sugerirMapeo(filaEnc.celdas) : {};
    return { nombre: hoja.nombre, filas: hoja.filas, filaEncabezadoSugerida, mapeoSugerido };
  });

  return NextResponse.json({ hojas: resultado });
}
