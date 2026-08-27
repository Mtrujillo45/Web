import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";

const esquema = z.object({ estado: z.enum(["ACTIVO", "CERRADO"]) });

const TRANSICIONES_VALIDAS: Record<string, string[]> = {
  BORRADOR: ["ACTIVO"],
  ACTIVO: ["CERRADO"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await requireRolApi(["COMERCIAL"]);
  if (acceso.error) return acceso.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const datos = esquema.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const drop = await prisma.drop.findUnique({ where: { id }, include: { _count: { select: { productos: true } } } });
  if (!drop) return NextResponse.json({ error: "Drop no encontrado" }, { status: 404 });

  if (!TRANSICIONES_VALIDAS[drop.estado]?.includes(datos.data.estado)) {
    return NextResponse.json(
      { error: `No se puede pasar de ${drop.estado} a ${datos.data.estado}` },
      { status: 400 }
    );
  }
  if (datos.data.estado === "ACTIVO" && drop._count.productos === 0) {
    return NextResponse.json(
      { error: "Este drop no tiene catálogo importado todavía" },
      { status: 400 }
    );
  }

  await prisma.drop.update({ where: { id }, data: { estado: datos.data.estado } });
  return NextResponse.json({ ok: true });
}
