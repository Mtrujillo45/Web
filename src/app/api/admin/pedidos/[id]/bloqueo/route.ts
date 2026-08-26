import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";

const esquema = z.object({ bloqueado: z.boolean() });

/** Bloquea o desbloquea un pedido individual para que el cliente no pueda seguir editándolo. */
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

  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  await prisma.pedido.update({
    where: { id },
    data: {
      bloqueado: datos.data.bloqueado,
      bloqueadoEn: datos.data.bloqueado ? new Date() : null,
      bloqueadoPorId: datos.data.bloqueado ? acceso.sesion.sub : null,
    },
  });

  return NextResponse.json({ ok: true });
}
