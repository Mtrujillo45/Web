import ExcelJS from "exceljs";
import type { Moneda } from "@prisma/client";

export type FilaConsolidado = {
  referencia: string;
  nombreReferencia: string;
  sku: string;
  talla: string;
  totalUnidades: number;
  valorUsd: number;
  valorCop: number;
};

export type FilaPorCliente = {
  empresa: string;
  moneda: Moneda;
  referencia: string;
  sku: string;
  talla: string;
  cantidad: number;
  precioUnitario: number;
};

export type FilaLogistica = {
  empresa: string;
  moneda: Moneda;
  unidades: number;
  valor: number;
  transportadora: string;
  numeroGuia: string;
  linkSeguimiento: string;
  guiaAdjunta: string;
};

/** Genera el Excel de consolidado de un drop: totales por SKU/talla + detalle por cliente. */
export async function generarExcelConsolidado(params: {
  consolidado: FilaConsolidado[];
  porCliente: FilaPorCliente[];
  logistica: FilaLogistica[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const hojaConsolidado = workbook.addWorksheet("Consolidado");
  hojaConsolidado.columns = [
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "Nombre referencia", key: "nombreReferencia", width: 28 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Talla", key: "talla", width: 10 },
    { header: "Total unidades", key: "totalUnidades", width: 16 },
    { header: "Valor total USD", key: "valorUsd", width: 16 },
    { header: "Valor total COP", key: "valorCop", width: 18 },
  ];
  for (const fila of params.consolidado) {
    hojaConsolidado.addRow(fila);
  }
  hojaConsolidado.getRow(1).font = { bold: true };

  const hojaPorCliente = workbook.addWorksheet("Por cliente");
  hojaPorCliente.columns = [
    { header: "Cliente", key: "empresa", width: 28 },
    { header: "Moneda", key: "moneda", width: 10 },
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Talla", key: "talla", width: 10 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Precio unitario", key: "precioUnitario", width: 16 },
    { header: "Valor", key: "valor", width: 14 },
  ];
  for (const fila of params.porCliente) {
    hojaPorCliente.addRow({
      ...fila,
      valor: Math.round(fila.cantidad * fila.precioUnitario * 100) / 100,
    });
  }
  hojaPorCliente.getRow(1).font = { bold: true };

  const hojaLogistica = workbook.addWorksheet("Logística");
  hojaLogistica.columns = [
    { header: "Cliente", key: "empresa", width: 28 },
    { header: "Moneda", key: "moneda", width: 10 },
    { header: "Unidades", key: "unidades", width: 12 },
    { header: "Valor", key: "valor", width: 14 },
    { header: "Transportadora", key: "transportadora", width: 22 },
    { header: "Número de guía", key: "numeroGuia", width: 20 },
    { header: "Link de seguimiento", key: "linkSeguimiento", width: 40 },
    { header: "Guía adjunta", key: "guiaAdjunta", width: 14 },
  ];
  for (const fila of params.logistica) {
    hojaLogistica.addRow(fila);
  }
  hojaLogistica.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export type FilaResumenPedidoCliente = {
  drop: string;
  numeroPedido: number;
  estado: string;
  fechaEnvio: Date | null;
  unidades: number;
  valor: number;
  moneda: Moneda;
  transportadora: string;
  numeroGuia: string;
  linkSeguimiento: string;
};

export type FilaDetallePedidoCliente = {
  drop: string;
  numeroPedido: number;
  referencia: string;
  sku: string;
  talla: string;
  cantidad: number;
  precioUnitario: number;
  moneda: Moneda;
};

/** Genera el Excel del histórico de pedidos de UN cliente: resumen por pedido + detalle por línea. */
export async function generarExcelHistoricoCliente(params: {
  resumen: FilaResumenPedidoCliente[];
  detalle: FilaDetallePedidoCliente[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const hojaResumen = workbook.addWorksheet("Mis pedidos");
  hojaResumen.columns = [
    { header: "Drop", key: "drop", width: 24 },
    { header: "Pedido #", key: "numeroPedido", width: 10 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Fecha de envío", key: "fechaEnvio", width: 20 },
    { header: "Unidades", key: "unidades", width: 12 },
    { header: "Valor", key: "valor", width: 14 },
    { header: "Moneda", key: "moneda", width: 10 },
    { header: "Transportadora", key: "transportadora", width: 22 },
    { header: "Número de guía", key: "numeroGuia", width: 20 },
    { header: "Link de seguimiento", key: "linkSeguimiento", width: 40 },
  ];
  for (const fila of params.resumen) {
    hojaResumen.addRow({ ...fila, fechaEnvio: fila.fechaEnvio ?? "" });
  }
  hojaResumen.getRow(1).font = { bold: true };

  const hojaDetalle = workbook.addWorksheet("Detalle");
  hojaDetalle.columns = [
    { header: "Drop", key: "drop", width: 24 },
    { header: "Pedido #", key: "numeroPedido", width: 10 },
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Talla", key: "talla", width: 10 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Precio unitario", key: "precioUnitario", width: 16 },
    { header: "Moneda", key: "moneda", width: 10 },
  ];
  for (const fila of params.detalle) {
    hojaDetalle.addRow(fila);
  }
  hojaDetalle.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
