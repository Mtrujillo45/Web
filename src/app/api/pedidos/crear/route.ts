import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { obtenerContextoPedido, dropCerrado } from "@/lib/pedido-contexto";

const esquema = z.object({ dropId: z.string() });

/** Crea un pedido vacío (borrador) para que el cliente lo arme: el primero de un drop, o uno adicional (restock). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const datos = esquema.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const contexto = await obtenerContextoPedido(datos.data.dropId);
  if ("error" in contexto) return contexto.error;
  const { empresa, drop } = contexto;

  if (dropCerrado(drop)) {
    return NextResponse.json({ error: "Este drop ya cerró" }, { status: 403 });
  }

  const pedido = await prisma.pedido.create({
    data: {
      empresaId: empresa.id,
      dropId: drop.id,
      estado: "BORRADOR",
      moneda: empresa.condicion?.moneda ?? "USD",
    },
  });

  return NextResponse.json({ ok: true, pedidoId: pedido.id });
}
