import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";

const esquema = z.object({
  nombre: z.string().min(2),
  fechaLimite: z.string().datetime().or(z.string().min(1)),
});

export async function POST(req: NextRequest) {
  const acceso = await requireRolApi(["COMERCIAL"]);
  if (acceso.error) return acceso.error;

  const body = await req.json().catch(() => null);
  const datos = esquema.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const fechaLimite = new Date(datos.data.fechaLimite);
  if (Number.isNaN(fechaLimite.getTime())) {
    return NextResponse.json({ error: "Fecha límite inválida" }, { status: 400 });
  }

  const drop = await prisma.drop.create({
    data: {
      nombre: datos.data.nombre,
      fechaLimite,
      estado: "BORRADOR",
      creadoPorId: acceso.sesion.sub,
    },
  });

  return NextResponse.json({ ok: true, id: drop.id });
}
