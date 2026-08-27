import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obtenerSesion } from "@/lib/auth";

/** Valida sesión de cliente + empresa aprobada + drop abierto. Devuelve error listo para responder, o el contexto. */
export async function obtenerContextoPedido(dropId: string) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "CLIENTE" || !sesion.empresaId) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) } as const;
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: sesion.empresaId },
    include: { condicion: true },
  });
  if (!empresa || empresa.estado !== "APROBADO") {
    return {
      error: NextResponse.json({ error: "Tu empresa no está aprobada todavía" }, { status: 403 }),
    } as const;
  }

  const drop = await prisma.drop.findUnique({ where: { id: dropId } });
  if (!drop) {
    return { error: NextResponse.json({ error: "Drop no encontrado" }, { status: 404 }) } as const;
  }

  return { sesion, empresa, drop } as const;
}

/** Igual que obtenerContextoPedido, pero validando además un pedido puntual del cliente. */
export async function obtenerContextoDePedido(pedidoId: string) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "CLIENTE" || !sesion.empresaId) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) } as const;
  }

  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.empresaId !== sesion.empresaId) {
    return { error: NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 }) } as const;
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: sesion.empresaId },
    include: { condicion: true },
  });
  if (!empresa || empresa.estado !== "APROBADO") {
    return {
      error: NextResponse.json({ error: "Tu empresa no está aprobada todavía" }, { status: 403 }),
    } as const;
  }

  const drop = await prisma.drop.findUnique({ where: { id: pedido.dropId } });
  if (!drop) {
    return { error: NextResponse.json({ error: "Drop no encontrado" }, { status: 404 }) } as const;
  }

  if (pedido.bloqueado) {
    return {
      error: NextResponse.json(
        { error: "Este pedido está bloqueado por producción y no se puede modificar" },
        { status: 403 }
      ),
    } as const;
  }

  return { sesion, empresa, drop, pedido } as const;
}

export function dropCerrado(drop: { estado: string; fechaLimite: Date }) {
  return drop.estado === "CERRADO" || new Date() > drop.fechaLimite;
}
