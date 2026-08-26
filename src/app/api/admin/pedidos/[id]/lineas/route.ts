import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import { calcularPrecioCliente, precioBasePorMoneda } from "@/lib/pricing";

const esquema = z.object({
  lineas: z.array(z.object({ varianteId: z.string(), cantidad: z.number().int().min(0) })),
});

/**
 * Permite a comercial corregir directamente las cantidades de un pedido (p. ej. tras
 * hablar con el cliente por otro medio), sin las restricciones de MOQ/disponibilidad
 * que sí aplican en el flujo de autoservicio del cliente, y sin importar si el drop
 * ya cerró o el pedido está bloqueado.
 */
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

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { empresa: { include: { condicion: true } } },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const varianteIds = datos.data.lineas.map((l) => l.varianteId);
  const variantes = await prisma.variante.findMany({
    where: { id: { in: varianteIds }, producto: { dropId: pedido.dropId } },
  });
  const variantesPorId = new Map(variantes.map((v) => [v.id, v]));
  if (variantes.length !== new Set(varianteIds).size) {
    return NextResponse.json({ error: "Alguna referencia no pertenece a este drop" }, { status: 400 });
  }

  const porcentaje = pedido.empresa.condicion?.porcentajeDescuento ?? 0;
  const lineasConCantidad = datos.data.lineas.filter((l) => l.cantidad > 0);

  const sinPrecio = lineasConCantidad.filter(
    (l) => precioBasePorMoneda(variantesPorId.get(l.varianteId)!, pedido.moneda) == null
  );
  if (sinPrecio.length > 0) {
    const skus = sinPrecio.map((l) => variantesPorId.get(l.varianteId)!.sku).join(", ");
    return NextResponse.json(
      { error: `Estas referencias no tienen precio cargado en ${pedido.moneda}: ${skus}` },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.lineaPedido.deleteMany({ where: { pedidoId: pedido.id } });
    if (lineasConCantidad.length > 0) {
      await tx.lineaPedido.createMany({
        data: lineasConCantidad.map((l) => ({
          pedidoId: pedido.id,
          varianteId: l.varianteId,
          cantidad: l.cantidad,
          precioUnitarioAplicado: calcularPrecioCliente(
            precioBasePorMoneda(variantesPorId.get(l.varianteId)!, pedido.moneda),
            porcentaje
          )!,
        })),
      });
    }
    await tx.pedido.update({
      where: { id: pedido.id },
      data: { editadoEn: new Date(), editadoPorId: acceso.sesion.sub },
    });
  });

  return NextResponse.json({ ok: true });
}
