import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import { dropCerrado } from "@/lib/pedido-contexto";
import { datetimeLocalABogota } from "@/lib/tiempo";

const esquema = z.object({ fechaLimite: z.string().min(1) });

/** Reabre un drop cerrado (por cierre manual o por vencimiento) exigiendo una nueva fecha límite futura. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await requireRolApi(["COMERCIAL"]);
  if (acceso.error) return acceso.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const datos = esquema.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Debes indicar una nueva fecha límite" }, { status: 400 });
  }

  const drop = await prisma.drop.findUnique({ where: { id }, include: { _count: { select: { productos: true } } } });
  if (!drop) return NextResponse.json({ error: "Drop no encontrado" }, { status: 404 });
  if (drop.estado === "BORRADOR") {
    return NextResponse.json({ error: "Este drop nunca se ha activado, actívalo primero" }, { status: 400 });
  }
  if (!dropCerrado(drop)) {
    return NextResponse.json({ error: "Este drop no está cerrado" }, { status: 400 });
  }
  if (drop._count.productos === 0) {
    return NextResponse.json({ error: "Este drop no tiene catálogo importado todavía" }, { status: 400 });
  }

  const nuevaFechaLimite = datetimeLocalABogota(datos.data.fechaLimite);
  if (Number.isNaN(nuevaFechaLimite.getTime())) {
    return NextResponse.json({ error: "Fecha límite inválida" }, { status: 400 });
  }
  if (nuevaFechaLimite <= new Date()) {
    return NextResponse.json({ error: "La nueva fecha límite debe ser en el futuro" }, { status: 400 });
  }

  await prisma.drop.update({
    where: { id },
    data: { estado: "ACTIVO", fechaLimite: nuevaFechaLimite },
  });
  return NextResponse.json({ ok: true });
}
