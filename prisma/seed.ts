import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("cambiar123", 10);

  const comercial = await prisma.usuario.upsert({
    where: { email: "comercial@mompossina.com" },
    update: {},
    create: {
      nombre: "Equipo Comercial",
      email: "comercial@mompossina.com",
      passwordHash,
      rol: "COMERCIAL",
    },
  });

  await prisma.usuario.upsert({
    where: { email: "produccion@mompossina.com" },
    update: {},
    create: {
      nombre: "Equipo Producción",
      email: "produccion@mompossina.com",
      passwordHash,
      rol: "PRODUCCION",
    },
  });

  const empresaExistente = await prisma.empresa.findFirst({
    where: { nitOCedula: "DEMO-0001" },
  });
  const empresa =
    empresaExistente ??
    (await prisma.empresa.create({
      data: {
        nombreComercial: "Boutique Demo USA",
        nitOCedula: "DEMO-0001",
        pais: "Estados Unidos",
        emailContacto: "compras@boutiquedemo.com",
        estado: "APROBADO",
        aprobadoEn: new Date(),
        aprobadoPorId: comercial.id,
        condicion: {
          create: {
            porcentajeDescuento: 10,
            moqTotalPedido: 20,
            terminosPago: "50% anticipo, 50% contra entrega",
          },
        },
      },
    }));

  await prisma.usuario.upsert({
    where: { email: "cliente@boutiquedemo.com" },
    update: {},
    create: {
      empresaId: empresa.id,
      nombre: "Ana Cliente",
      email: "cliente@boutiquedemo.com",
      passwordHash,
      rol: "CLIENTE",
    },
  });

  console.log("Seed completado. Usuarios de prueba (contraseña: cambiar123):");
  console.log("  comercial@mompossina.com (rol COMERCIAL)");
  console.log("  produccion@mompossina.com (rol PRODUCCION)");
  console.log("  cliente@boutiquedemo.com (rol CLIENTE, empresa aprobada con 10% descuento)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
