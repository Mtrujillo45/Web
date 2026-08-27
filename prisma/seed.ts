import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const esProduccion = process.env.NODE_ENV === "production";

function passwordDesdeEnv(nombreVar: string): string {
  const valor = process.env[nombreVar];
  if (valor) return valor;
  if (esProduccion) {
    throw new Error(
      `Falta la variable de entorno ${nombreVar}. En producción debes definirla con una contraseña ` +
        `segura (en Railway: Variables del servicio) antes de correr el seed.`
    );
  }
  return "cambiar123";
}

async function main() {
  const passwordComercial = await bcrypt.hash(passwordDesdeEnv("SEED_COMERCIAL_PASSWORD"), 10);
  const passwordProduccion = await bcrypt.hash(passwordDesdeEnv("SEED_PRODUCCION_PASSWORD"), 10);

  await prisma.usuario.upsert({
    where: { email: "comercial@mompossina.com" },
    update: {},
    create: {
      nombre: "Equipo Comercial",
      email: "comercial@mompossina.com",
      passwordHash: passwordComercial,
      rol: "COMERCIAL",
    },
  });

  await prisma.usuario.upsert({
    where: { email: "produccion@mompossina.com" },
    update: {},
    create: {
      nombre: "Equipo Producción",
      email: "produccion@mompossina.com",
      passwordHash: passwordProduccion,
      rol: "PRODUCCION",
    },
  });

  console.log("Seed completado:");
  console.log("  comercial@mompossina.com (rol COMERCIAL)");
  console.log("  produccion@mompossina.com (rol PRODUCCION)");

  if (process.env.SEED_DEMO_CLIENT === "true") {
    const passwordCliente = await bcrypt.hash(
      process.env.SEED_CLIENTE_PASSWORD ?? "cambiar123",
      10
    );
    const comercial = await prisma.usuario.findUniqueOrThrow({
      where: { email: "comercial@mompossina.com" },
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
        passwordHash: passwordCliente,
        rol: "CLIENTE",
      },
    });
    console.log("  cliente@boutiquedemo.com (rol CLIENTE, empresa demo aprobada con 10% descuento)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
