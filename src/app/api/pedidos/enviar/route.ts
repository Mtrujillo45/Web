import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { calcularPrecioCliente, validarMoq, validarDisponibilidad } from "@/lib/pricing";
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
  const { sesion, empresa, drop } = contexto;

  if (dropCerrado(drop)) {
    return NextResponse.json(
      { error: "Este drop ya cerró", errores: ["La fecha límite de este drop ya pasó."] },
      { status: 403 }
    );
  }

  const variantes = await prisma.variante.findMany({
    where: { producto: { dropId } },
    include: { producto: true },
  });
  const variantesPorId = new Map(variantes.map((v) => [v.id, v]));

  const varianteIds = lineas.map((l) => l.varianteId);
  if (varianteIds.some((id) => !variantesPorId.has(id))) {
    return NextResponse.json({ error: "Alguna referencia no pertenece a este drop" }, { status: 400 });
  }

  const porcentaje = empresa.condicion?.porcentajeDescuento ?? 0;

  // Guarda siempre lo que el cliente intentó enviar, aunque falle la validación,
  // para que no pierda lo que escribió.
  const pedido = await prisma.$transaction(async (tx) => {
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
    return pedido;
  });

  const lineaCantidades = lineas
    .filter((l) => l.cantidad > 0)
    .map((l) => ({
      varianteId: l.varianteId,
      productoId: variantesPorId.get(l.varianteId)!.productoId,
      cantidad: l.cantidad,
    }));

  const productosMap = new Map(
    variantes.map((v) => [
      v.producto.id,
      { referencia: v.producto.referencia, moqReferencia: v.producto.moqReferencia },
    ])
  );

  const erroresMoq = validarMoq({
    lineas: lineaCantidades,
    moqTotalPedido: empresa.condicion?.moqTotalPedido ?? null,
    productos: productosMap,
  });

  const variantesMap = new Map(
    variantes.map((v) => [
      v.id,
      { sku: v.sku, talla: v.talla, disponibilidadLimite: v.disponibilidadLimite },
    ])
  );
  const erroresDisponibilidad = await validarDisponibilidad(prisma, {
    empresaId: empresa.id,
    lineas: lineaCantidades,
    variantes: variantesMap,
  });

  const errores = [...erroresMoq, ...erroresDisponibilidad].map((e) => e.mensaje);

  if (lineaCantidades.length === 0) {
    errores.push("Agrega al menos una unidad antes de enviar el pedido.");
  }

  if (errores.length > 0) {
    return NextResponse.json(
      { error: "El pedido no cumple las condiciones para enviarse", errores },
      { status: 400 }
    );
  }

  await prisma.pedido.update({
    where: { id: pedido.id },
    data: { estado: "ENVIADO", fechaEnvio: new Date(), enviadoPorId: sesion.sub },
  });

  return NextResponse.json({ ok: true });
}
