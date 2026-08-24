import ExcelJS from "exceljs";

export type FilaConsolidado = {
  referencia: string;
  nombreReferencia: string;
  sku: string;
  talla: string;
  totalUnidades: number;
  precioBaseUsd: number;
};

export type FilaPorCliente = {
  empresa: string;
  referencia: string;
  sku: string;
  talla: string;
  cantidad: number;
  precioUnitarioUsd: number;
};

/** Genera el Excel de consolidado de un drop: totales por SKU/talla + detalle por cliente. */
export async function generarExcelConsolidado(params: {
  consolidado: FilaConsolidado[];
  porCliente: FilaPorCliente[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const hojaConsolidado = workbook.addWorksheet("Consolidado");
  hojaConsolidado.columns = [
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "Nombre referencia", key: "nombreReferencia", width: 28 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Talla", key: "talla", width: 10 },
    { header: "Total unidades", key: "totalUnidades", width: 16 },
    { header: "Precio base USD", key: "precioBaseUsd", width: 16 },
    { header: "Valor total USD", key: "valorTotalUsd", width: 16 },
  ];
  for (const fila of params.consolidado) {
    hojaConsolidado.addRow({
      ...fila,
      valorTotalUsd: Math.round(fila.totalUnidades * fila.precioBaseUsd * 100) / 100,
    });
  }
  hojaConsolidado.getRow(1).font = { bold: true };

  const hojaPorCliente = workbook.addWorksheet("Por cliente");
  hojaPorCliente.columns = [
    { header: "Cliente", key: "empresa", width: 28 },
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Talla", key: "talla", width: 10 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Precio unitario USD", key: "precioUnitarioUsd", width: 18 },
    { header: "Valor USD", key: "valorUsd", width: 14 },
  ];
  for (const fila of params.porCliente) {
    hojaPorCliente.addRow({
      ...fila,
      valorUsd: Math.round(fila.cantidad * fila.precioUnitarioUsd * 100) / 100,
    });
  }
  hojaPorCliente.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
