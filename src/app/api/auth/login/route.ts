import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, crearTokenSesion, establecerCookieSesion } from "@/lib/auth";

const esquemaLogin = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const datos = esquemaLogin.safeParse(body);
  if (!datos.success) {
    return NextResponse.json({ error: "Correo o contraseña inválidos" }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email: datos.data.email },
  });
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Correo o contraseña inválidos" }, { status: 401 });
  }

  const passwordOk = await verifyPassword(datos.data.password, usuario.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Correo o contraseña inválidos" }, { status: 401 });
  }

  const token = await crearTokenSesion({
    sub: usuario.id,
    rol: usuario.rol,
    empresaId: usuario.empresaId,
  });
  await establecerCookieSesion(token);

  return NextResponse.json({
    ok: true,
    destino: usuario.rol === "CLIENTE" ? "/cliente" : "/admin",
  });
}
