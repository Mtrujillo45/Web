import "server-only";
import { redirect } from "next/navigation";
import type { Rol } from "@prisma/client";
import { obtenerSesion, type SesionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Para usar en Server Components/páginas: exige sesión, si no existe redirige a /login. */
export async function requireSesion(): Promise<SesionPayload> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  return sesion;
}

/** Exige sesión con alguno de los roles dados; si no cumple, redirige a la home correspondiente. */
export async function requireRolPagina(roles: Rol[]): Promise<SesionPayload> {
  const sesion = await requireSesion();
  if (!roles.includes(sesion.rol)) {
    redirect(sesion.rol === "CLIENTE" ? "/cliente" : "/admin");
  }
  return sesion;
}

/** Para el portal cliente: exige rol CLIENTE y empresa con estado APROBADO. */
export async function requireEmpresaAprobada() {
  const sesion = await requireRolPagina(["CLIENTE"]);
  if (!sesion.empresaId) redirect("/login");
  const empresa = await prisma.empresa.findUnique({
    where: { id: sesion.empresaId },
    include: { condicion: true },
  });
  if (!empresa) redirect("/login");
  if (empresa.estado !== "APROBADO") redirect("/cliente/pendiente");
  return { sesion, empresa };
}
