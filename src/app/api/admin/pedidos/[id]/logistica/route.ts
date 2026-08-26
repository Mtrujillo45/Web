import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";

const esquema = z.object({
  transportadora: z.string().trim().max(200).optional(),
  numeroGuia: z.string().trim().max(100).optional(),
  linkSeguimiento: z.string().trim().max(500).optional(),
});

/** Guarda la transportadora y el link de seguimiento del despacho de un pedido. */
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
      transportadora: datos.data.transportadora || null,
      numeroGuia: datos.data.numeroGuia || null,
      linkSeguimiento: datos.data.linkSeguimiento || null,
      editadoEn: new Date(),
      editadoPorId: acceso.sesion.sub,
    },
  });

  return NextResponse.json({ ok: true });
}
