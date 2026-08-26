import type { Moneda, Prisma, PrismaClient } from "@prisma/client";

type Decimalish = Prisma.Decimal | number | string;

function aNumero(valor: Decimalish): number {
  return typeof valor === "object" ? Number(valor.toString()) : Number(valor);
}

/** Precio base de una variante en la moneda pedida (null si no se cargó precio en esa moneda). */
export function precioBasePorMoneda(
  variante: { precioBaseUsd: Decimalish | null; precioBaseCop: Decimalish | null },
  moneda: Moneda
): number | null {
  const valor = moneda === "USD" ? variante.precioBaseUsd : variante.precioBaseCop;
  return valor == null ? null : aNumero(valor);
}

/**
 * Precio final que ve un cliente: precio base (en su moneda) menos su % de descuento propio.
 * Devuelve null si no hay precio cargado en esa moneda para la variante.
 */
export function calcularPrecioCliente(
  precioBase: Decimalish | null,
  porcentajeDescuento: Decimalish
): number | null {
  if (precioBase == null) return null;
  const base = aNumero(precioBase);
  const descuento = aNumero(porcentajeDescuento);
  const precio = base * (1 - descuento / 100);
  return Math.round(precio * 100) / 100;
}

/** Formatea un monto con su moneda de forma inequívoca para clientes internacionales (nada de "c/u"). */
export function formatearPrecio(monto: number, moneda: Moneda): string {
  if (moneda === "COP") {
    return `$${Math.round(monto).toLocaleString("es-CO")} COP`;
  }
  return `$${monto.toFixed(2)} USD`;
}

export type LineaCantidad = {
  varianteId: string;
  productoId: string;
  cantidad: number;
};

export type ErrorValidacionPedido = {
  tipo: "MOQ_TOTAL" | "MOQ_REFERENCIA" | "DISPONIBILIDAD" | "DEADLINE";
  mensaje: string;
};

/**
 * Valida MOQ total del pedido y MOQ por referencia (ambos en unidades).
 * Solo se corre al enviar el pedido, no al guardar borrador.
 */
export function validarMoq(params: {
  lineas: LineaCantidad[];
  moqTotalPedido: number | null;
  productos: Map<string, { referencia: string; moqReferencia: number | null }>;
}): ErrorValidacionPedido[] {
  const errores: ErrorValidacionPedido[] = [];
  const lineasConCantidad = params.lineas.filter((l) => l.cantidad > 0);

  const totalUnidades = lineasConCantidad.reduce((acc, l) => acc + l.cantidad, 0);
  if (params.moqTotalPedido && totalUnidades < params.moqTotalPedido) {
    errores.push({
      tipo: "MOQ_TOTAL",
      mensaje: `El pedido tiene ${totalUnidades} unidades en total, pero el mínimo requerido es ${params.moqTotalPedido}.`,
    });
  }

  const porProducto = new Map<string, number>();
  for (const linea of lineasConCantidad) {
    porProducto.set(linea.productoId, (porProducto.get(linea.productoId) ?? 0) + linea.cantidad);
  }
  for (const [productoId, cantidad] of porProducto) {
    const producto = params.productos.get(productoId);
    if (producto?.moqReferencia && cantidad < producto.moqReferencia) {
      errores.push({
        tipo: "MOQ_REFERENCIA",
        mensaje: `La referencia ${producto.referencia} tiene ${cantidad} unidades pedidas, pero el mínimo es ${producto.moqReferencia}.`,
      });
    }
  }

  return errores;
}

/**
 * Valida disponibilidad opcional por variante (SKU+talla): si no tiene tope definido,
 * es venta anticipada sin bloqueo. Si tiene tope, no debe superarse sumando lo ya
 * enviado en TODOS los demás pedidos (de esta u otras empresas) más lo que este
 * pedido envía ahora (su propio envío anterior, si lo hay, queda reemplazado, no sumado).
 */
export async function validarDisponibilidad(
  tx: Prisma.TransactionClient | PrismaClient,
  params: {
    pedidoId: string;
    lineas: LineaCantidad[];
    variantes: Map<string, { sku: string; talla: string; disponibilidadLimite: number | null }>;
  }
): Promise<ErrorValidacionPedido[]> {
  const errores: ErrorValidacionPedido[] = [];
  const lineasConTope = params.lineas.filter((l) => {
    const v = params.variantes.get(l.varianteId);
    return l.cantidad > 0 && v?.disponibilidadLimite != null;
  });
  if (lineasConTope.length === 0) return errores;

  for (const linea of lineasConTope) {
    const variante = params.variantes.get(linea.varianteId)!;
    const otras = await tx.lineaPedido.aggregate({
      _sum: { cantidad: true },
      where: {
        varianteId: linea.varianteId,
        pedido: {
          estado: "ENVIADO",
          id: { not: params.pedidoId },
        },
      },
    });
    const totalOtras = otras._sum.cantidad ?? 0;
    const totalConEsta = totalOtras + linea.cantidad;
    if (totalConEsta > variante.disponibilidadLimite!) {
      const disponibleReal = Math.max(variante.disponibilidadLimite! - totalOtras, 0);
      errores.push({
        tipo: "DISPONIBILIDAD",
        mensaje: `${variante.sku} (talla ${variante.talla}) ya no tiene suficiente disponibilidad: quedan ${disponibleReal} unidades y se están pidiendo ${linea.cantidad}.`,
      });
    }
  }

  return errores;
}
