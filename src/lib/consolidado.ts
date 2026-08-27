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
    include: {
      variante: { include: { producto: true } },
      pedido: { include: { empresa: true } },
    },
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

  // Detalle por pedido enviado (no solo agregado por cliente), para poder bloquear
  // pedidos individuales que ya están en producción.
  type PedidoResumen = {
    id: string;
    empresaId: string;
    empresa: string;
    moneda: Moneda;
    bloqueado: boolean;
    fechaEnvio: Date | null;
    unidades: number;
    valor: number;
    transportadora: string | null;
    numeroGuia: string | null;
    linkSeguimiento: string | null;
    guiaUrl: string | null;
  };
  const pedidosMap = new Map<string, PedidoResumen>();
  for (const l of lineas) {
    const actual = pedidosMap.get(l.pedidoId) ?? {
      id: l.pedido.id,
      empresaId: l.pedido.empresaId,
      empresa: l.pedido.empresa.nombreComercial,
      moneda: l.pedido.moneda,
      bloqueado: l.pedido.bloqueado,
      fechaEnvio: l.pedido.fechaEnvio,
      unidades: 0,
      valor: 0,
      transportadora: l.pedido.transportadora,
      numeroGuia: l.pedido.numeroGuia,
      linkSeguimiento: l.pedido.linkSeguimiento,
      guiaUrl: l.pedido.guiaUrl,
    };
    actual.unidades += l.cantidad;
    actual.valor += l.cantidad * Number(l.precioUnitarioAplicado);
    pedidosMap.set(l.pedidoId, actual);
  }
  const pedidosPorClienteMap = new Map<
    string,
    { empresaId: string; empresa: string; pedidos: PedidoResumen[] }
  >();
  for (const pedido of pedidosMap.values()) {
    const actual = pedidosPorClienteMap.get(pedido.empresaId) ?? {
      empresaId: pedido.empresaId,
      empresa: pedido.empresa,
      pedidos: [],
    };
    actual.pedidos.push(pedido);
    pedidosPorClienteMap.set(pedido.empresaId, actual);
  }
  const pedidosPorCliente = Array.from(pedidosPorClienteMap.values())
    .map((c) => ({
      ...c,
      pedidos: c.pedidos.sort((a, b) => (a.fechaEnvio?.getTime() ?? 0) - (b.fechaEnvio?.getTime() ?? 0)),
    }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa));

  const logistica = Array.from(pedidosMap.values())
    .map((p) => ({
      empresa: p.empresa,
      moneda: p.moneda,
      unidades: p.unidades,
      valor: p.valor,
      transportadora: p.transportadora ?? "",
      numeroGuia: p.numeroGuia ?? "",
      linkSeguimiento: p.linkSeguimiento ?? "",
      guiaAdjunta: p.guiaUrl ? "Sí" : "No",
    }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa));

  const empresasConEnviado = new Set(lineas.map((l) => l.pedido.empresaId));
  const aprobadas = await prisma.empresa.findMany({ where: { estado: "APROBADO" } });
  const pendientesDeEnvio = aprobadas
    .filter((e) => !empresasConEnviado.has(e.id))
    .map((e) => e.nombreComercial);

  return {
    consolidado,
    porCliente,
    resumenPorCliente,
    totalesPorMoneda,
    pendientesDeEnvio,
    pedidosPorCliente,
    logistica,
  };
}
