import "server-only";
import { NextResponse } from "next/server";
import type { Rol } from "@prisma/client";
import { obtenerSesion, type SesionPayload } from "@/lib/auth";

export async function requireRolApi(
  roles: Rol[]
): Promise<{ sesion: SesionPayload; error?: undefined } | { error: NextResponse; sesion?: undefined }> {
  const sesion = await obtenerSesion();
  if (!sesion) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (!roles.includes(sesion.rol)) {
    return { error: NextResponse.json({ error: "No tienes permisos para esta acción" }, { status: 403 }) };
  }
  return { sesion };
}
