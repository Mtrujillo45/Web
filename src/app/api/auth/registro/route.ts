import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, crearTokenSesion, establecerCookieSesion } from "@/lib/auth";

const esquemaRegistro = z.object({
  nombreComercial: z.string().min(2, "Ingresa el nombre de la empresa"),
  razonSocial: z.string().optional(),
  nitOCedula: z.string().min(3, "Ingresa el NIT o número de identificación"),
  pais: z.string().min(2, "Ingresa el país"),
  ciudad: z.string().optional(),
  telefono: z.string().optional(),
  emailContacto: z.string().email("Correo de contacto de la empresa inválido"),
  nombre: z.string().min(2, "Ingresa tu nombre"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const datos = esquemaRegistro.safeParse(body);
  if (!datos.success) {
    return NextResponse.json(
      { error: datos.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const existente = await prisma.usuario.findUnique({
    where: { email: datos.data.email },
  });
  if (existente) {
    return NextResponse.json(
      { error: "Ya existe una cuenta registrada con ese correo" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(datos.data.password);

  const { usuario, empresa } = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: {
        nombreComercial: datos.data.nombreComercial,
        razonSocial: datos.data.razonSocial || null,
        nitOCedula: datos.data.nitOCedula,
        pais: datos.data.pais,
        ciudad: datos.data.ciudad || null,
        telefono: datos.data.telefono || null,
        emailContacto: datos.data.emailContacto,
      },
    });
    const usuario = await tx.usuario.create({
      data: {
        empresaId: empresa.id,
        nombre: datos.data.nombre,
        email: datos.data.email,
        passwordHash,
        rol: "CLIENTE",
      },
    });
    return { usuario, empresa };
  });

  const token = await crearTokenSesion({
    sub: usuario.id,
    rol: usuario.rol,
    empresaId: empresa.id,
  });
  await establecerCookieSesion(token);

  return NextResponse.json({ ok: true });
}
