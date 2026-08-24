import "server-only";
import type { Moneda } from "@prisma/client";
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

  // Unidades por variante: siempre unificadas (no importa la moneda) porque a producción
  // le interesa cuánto fabricar, no en qué moneda se vendió cada unidad.
  const unidadesPorVariante = new Map<string, number>();
  // Valor por variante Y moneda: USD y COP nunca se suman entre sí.
  const valorPorVarianteYMoneda = new Map<string, Partial<Record<Moneda, number>>>();

  for (const linea of lineas) {
    unidadesPorVariante.set(
      linea.varianteId,
      (unidadesPorVariante.get(linea.varianteId) ?? 0) + linea.cantidad
    );
    const moneda = linea.pedido.moneda;
    const valores = valorPorVarianteYMoneda.get(linea.varianteId) ?? {};
    valores[moneda] = (valores[moneda] ?? 0) + linea.cantidad * Number(linea.precioUnitarioAplicado);
    valorPorVarianteYMoneda.set(linea.varianteId, valores);
  }

  const consolidado = variantes
    .filter((v) => (unidadesPorVariante.get(v.id) ?? 0) > 0)
    .map((v) => {
      const valores = valorPorVarianteYMoneda.get(v.id) ?? {};
      return {
        referencia: v.producto.referencia,
        nombreReferencia: v.producto.nombreReferencia,
        sku: v.sku,
        talla: v.talla,
        totalUnidades: unidadesPorVariante.get(v.id) ?? 0,
        valorUsd: valores.USD ?? 0,
        valorCop: valores.COP ?? 0,
      };
    });

  const porCliente = lineas.map((l) => ({
    empresa: l.pedido.empresa.nombreComercial,
    moneda: l.pedido.moneda,
    referencia: l.variante.producto.referencia,
    sku: l.variante.sku,
    talla: l.variante.talla,
    cantidad: l.cantidad,
    precioUnitario: Number(l.precioUnitarioAplicado),
  }));

  const resumenPorClienteMap = new Map<
    string,
    { empresa: string; moneda: Moneda; unidades: number; valor: number }
  >();
  for (const l of lineas) {
    const key = l.pedido.empresaId;
    const actual = resumenPorClienteMap.get(key) ?? {
      empresa: l.pedido.empresa.nombreComercial,
      moneda: l.pedido.moneda,
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

  const totalesPorMoneda: Record<Moneda, number> = { USD: 0, COP: 0 };
  for (const r of resumenPorCliente) totalesPorMoneda[r.moneda] += r.valor;

  const empresasConEnviado = new Set(lineas.map((l) => l.pedido.empresaId));
  const aprobadas = await prisma.empresa.findMany({ where: { estado: "APROBADO" } });
  const pendientesDeEnvio = aprobadas
    .filter((e) => !empresasConEnviado.has(e.id))
    .map((e) => e.nombreComercial);

  return { consolidado, porCliente, resumenPorCliente, totalesPorMoneda, pendientesDeEnvio };
}
