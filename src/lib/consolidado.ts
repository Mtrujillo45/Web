import "server-only";
import { prisma } from "@/lib/db";

export async function obtenerDatosConsolidado(dropId: string) {
  const variantes = await prisma.variante.findMany({
    where: { producto: { dropId } },
    include: { producto: true },
    orderBy: [{ producto: { referencia: "asc" } }, { talla: "asc" }],
  });

  const lineas = await prisma.lineaPedido.findMany({
    where: { pedido: { dropId, estado: "ENVIADO" } },
    include: { variante: { include: { producto: true } }, pedido: { include: { empresa: true } } },
  });

  const totalesPorVariante = new Map<string, number>();
  for (const linea of lineas) {
    totalesPorVariante.set(
      linea.varianteId,
      (totalesPorVariante.get(linea.varianteId) ?? 0) + linea.cantidad
    );
  }

  const consolidado = variantes
    .filter((v) => (totalesPorVariante.get(v.id) ?? 0) > 0)
    .map((v) => ({
      referencia: v.producto.referencia,
      nombreReferencia: v.producto.nombreReferencia,
      sku: v.sku,
      talla: v.talla,
      totalUnidades: totalesPorVariante.get(v.id) ?? 0,
      precioBaseUsd: Number(v.precioBaseUsd),
    }));

  const porCliente = lineas.map((l) => ({
    empresa: l.pedido.empresa.nombreComercial,
    referencia: l.variante.producto.referencia,
    sku: l.variante.sku,
    talla: l.variante.talla,
    cantidad: l.cantidad,
    precioUnitarioUsd: Number(l.precioUnitarioAplicado),
  }));

  const resumenPorClienteMap = new Map<
    string,
    { empresa: string; unidades: number; valor: number }
  >();
  for (const l of lineas) {
    const key = l.pedido.empresaId;
    const actual = resumenPorClienteMap.get(key) ?? {
      empresa: l.pedido.empresa.nombreComercial,
      unidades: 0,
      valor: 0,
    };
    actual.unidades += l.cantidad;
    actual.valor += l.cantidad * Number(l.precioUnitarioAplicado);
    resumenPorClienteMap.set(key, actual);
  }
  const resumenPorCliente = Array.from(resumenPorClienteMap.values()).sort(
    (a, b) => b.valor - a.valor
  );

  const empresasConEnviado = new Set(lineas.map((l) => l.pedido.empresaId));
  const aprobadas = await prisma.empresa.findMany({ where: { estado: "APROBADO" } });
  const pendientesDeEnvio = aprobadas
    .filter((e) => !empresasConEnviado.has(e.id))
    .map((e) => e.nombreComercial);

  return { consolidado, porCliente, resumenPorCliente, pendientesDeEnvio };
}
