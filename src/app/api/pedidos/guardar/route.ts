import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { calcularPrecioCliente } from "@/lib/pricing";
import { obtenerContextoPedido, dropCerrado } from "@/lib/pedido-contexto";

const esquema = z.object({
  dropId: z.string(),
  lineas: z.array(z.object({ varianteId: z.string(), cantidad: z.number().int().min(0) })),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const datos = esquema.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { dropId, lineas } = datos.data;

  const contexto = await obtenerContextoPedido(dropId);
  if ("error" in contexto) return contexto.error;
  const { empresa, drop } = contexto;

  if (dropCerrado(drop)) {
    return NextResponse.json({ error: "Este drop ya cerró, no se puede editar" }, { status: 403 });
  }

  const varianteIds = lineas.map((l) => l.varianteId);
  const variantes = await prisma.variante.findMany({
    where: { id: { in: varianteIds }, producto: { dropId } },
  });
  const variantesPorId = new Map(variantes.map((v) => [v.id, v]));
  if (variantes.length !== new Set(varianteIds).size) {
    return NextResponse.json({ error: "Alguna referencia no pertenece a este drop" }, { status: 400 });
  }

  const porcentaje = empresa.condicion?.porcentajeDescuento ?? 0;

  await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.upsert({
      where: { empresaId_dropId: { empresaId: empresa.id, dropId } },
      update: { estado: "BORRADOR" },
      create: { empresaId: empresa.id, dropId, estado: "BORRADOR" },
    });
    await tx.lineaPedido.deleteMany({ where: { pedidoId: pedido.id } });
    const lineasConCantidad = lineas.filter((l) => l.cantidad > 0);
    if (lineasConCantidad.length > 0) {
      await tx.lineaPedido.createMany({
        data: lineasConCantidad.map((l) => ({
          pedidoId: pedido.id,
          varianteId: l.varianteId,
          cantidad: l.cantidad,
          precioUnitarioAplicado: calcularPrecioCliente(
            variantesPorId.get(l.varianteId)!.precioBaseUsd,
            porcentaje
          ),
        })),
      });
    }
  });

  return NextResponse.json({ ok: true });
}
