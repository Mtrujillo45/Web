import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";

const esquema = z.object({
  empresaId: z.string(),
  dropId: z.string(),
  bloqueado: z.boolean(),
});

/** Bloquea o desbloquea de una vez todos los pedidos enviados de un cliente en un drop. */
export async function POST(req: NextRequest) {
  const acceso = await requireRolApi(["COMERCIAL"]);
  if (acceso.error) return acceso.error;

  const body = await req.json().catch(() => null);
  const datos = esquema.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  await prisma.pedido.updateMany({
    where: { empresaId: datos.data.empresaId, dropId: datos.data.dropId, estado: "ENVIADO" },
    data: {
      bloqueado: datos.data.bloqueado,
      bloqueadoEn: datos.data.bloqueado ? new Date() : null,
      bloqueadoPorId: datos.data.bloqueado ? acceso.sesion.sub : null,
    },
  });

  return NextResponse.json({ ok: true });
}
