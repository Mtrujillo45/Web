import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";

const esquema = z.object({
  porcentajeDescuento: z.number().min(0).max(100),
  moqTotalPedido: z.number().int().positive().nullable().optional(),
  terminosPago: z.string().optional(),
});

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

  await prisma.condicionComercial.upsert({
    where: { empresaId: id },
    update: {
      porcentajeDescuento: datos.data.porcentajeDescuento,
      moqTotalPedido: datos.data.moqTotalPedido ?? null,
      terminosPago: datos.data.terminosPago || null,
    },
    create: {
      empresaId: id,
      porcentajeDescuento: datos.data.porcentajeDescuento,
      moqTotalPedido: datos.data.moqTotalPedido ?? null,
      terminosPago: datos.data.terminosPago || null,
    },
  });

  return NextResponse.json({ ok: true });
}
