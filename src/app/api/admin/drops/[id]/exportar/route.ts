import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import { obtenerDatosConsolidado } from "@/lib/consolidado";
import { generarExcelConsolidado } from "@/lib/excel-export";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await requireRolApi(["COMERCIAL", "PRODUCCION"]);
  if (acceso.error) return acceso.error;
  const { id } = await params;

  const drop = await prisma.drop.findUnique({ where: { id } });
  if (!drop) return NextResponse.json({ error: "Drop no encontrado" }, { status: 404 });

  const { consolidado, porCliente, logistica } = await obtenerDatosConsolidado(id);
  const buffer = await generarExcelConsolidado({ consolidado, porCliente, logistica });

  const nombreArchivo = `consolidado-${drop.nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
