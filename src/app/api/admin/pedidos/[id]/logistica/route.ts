import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import { tieneInfoLogistica } from "@/lib/logistica";
import { enviarCorreo } from "@/lib/email";

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

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { empresa: true, drop: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const teniaInfoAntes = tieneInfoLogistica(pedido);

  const actualizado = await prisma.pedido.update({
    where: { id },
    data: {
      transportadora: datos.data.transportadora || null,
      numeroGuia: datos.data.numeroGuia || null,
      linkSeguimiento: datos.data.linkSeguimiento || null,
      editadoEn: new Date(),
      editadoPorId: acceso.sesion.sub,
    },
  });

  if (!teniaInfoAntes && tieneInfoLogistica(actualizado)) {
    await enviarCorreo({
      to: pedido.empresa.emailContacto,
      subject: `Tu pedido de Mompossina fue despachado — ${pedido.drop.nombre}`,
      html: `
        <p>¡Tu pedido de <strong>${pedido.drop.nombre}</strong> ya está en camino!</p>
        <ul>
          ${actualizado.transportadora ? `<li><strong>Transportadora:</strong> ${actualizado.transportadora}</li>` : ""}
          ${actualizado.numeroGuia ? `<li><strong>Número de guía:</strong> ${actualizado.numeroGuia}</li>` : ""}
        </ul>
        ${
          actualizado.linkSeguimiento
            ? `<p><a href="${actualizado.linkSeguimiento}">Seguir el envío</a></p>`
            : ""
        }
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
