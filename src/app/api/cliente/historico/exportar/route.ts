import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obtenerSesion } from "@/lib/auth";
import { inicioDiaBogota, finDiaBogota } from "@/lib/tiempo";
import { generarExcelHistoricoCliente } from "@/lib/excel-export";
import type { Prisma } from "@prisma/client";

/** Exporta el histórico de pedidos de la empresa del cliente en sesión (solo los suyos). */
export async function GET(req: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "CLIENTE" || !sesion.empresaId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const empresa = await prisma.empresa.findUnique({ where: { id: sesion.empresaId } });
  if (!empresa || empresa.estado !== "APROBADO") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const desde = searchParams.get("desde") || undefined;
  const hasta = searchParams.get("hasta") || undefined;
  const dropId = searchParams.get("dropId") || undefined;
  const estado = searchParams.get("estado");

  const where: Prisma.PedidoWhereInput = {
    empresaId: empresa.id,
    ...(dropId ? { dropId } : {}),
    ...(estado === "BORRADOR" || estado === "ENVIADO" ? { estado } : {}),
    ...(desde || hasta
      ? {
          fechaEnvio: {
            ...(desde ? { gte: inicioDiaBogota(desde) } : {}),
            ...(hasta ? { lte: finDiaBogota(hasta) } : {}),
          },
        }
      : {}),
  };

  const pedidos = await prisma.pedido.findMany({
    where,
    include: {
      drop: true,
      lineas: { include: { variante: { include: { producto: true } } } },
    },
    orderBy: { creadoEn: "asc" },
  });

  // Numeración "Pedido #N" estable dentro de cada drop.
  const numeroPorDrop = new Map<string, number>();
  const conNumero = pedidos.map((pedido) => {
    const n = (numeroPorDrop.get(pedido.dropId) ?? 0) + 1;
    numeroPorDrop.set(pedido.dropId, n);
    return { pedido, numero: n };
  });

  const resumen = conNumero.map(({ pedido, numero }) => ({
    drop: pedido.drop.nombre,
    numeroPedido: numero,
    estado: pedido.estado === "ENVIADO" ? "Enviado" : "Borrador",
    fechaEnvio: pedido.fechaEnvio,
    unidades: pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0),
    valor: pedido.lineas.reduce((acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado), 0),
    moneda: pedido.moneda,
    transportadora: pedido.transportadora ?? "",
    numeroGuia: pedido.numeroGuia ?? "",
    linkSeguimiento: pedido.linkSeguimiento ?? "",
  }));

  const detalle = conNumero.flatMap(({ pedido, numero }) =>
    pedido.lineas.map((l) => ({
      drop: pedido.drop.nombre,
      numeroPedido: numero,
      referencia: l.variante.producto.referencia,
      sku: l.variante.sku,
      talla: l.variante.talla,
      cantidad: l.cantidad,
      precioUnitario: Number(l.precioUnitarioAplicado),
      moneda: pedido.moneda,
    }))
  );

  const buffer = await generarExcelHistoricoCliente({ resumen, detalle });
  const nombreArchivo = `mis-pedidos-${empresa.nombreComercial.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
