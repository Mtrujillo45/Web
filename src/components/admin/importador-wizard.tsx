"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select, Alerta } from "@/components/ui";

type FilaExcel = { numeroFila: number; celdas: string[] };
type HojaAnalizada = {
  nombre: string;
  filas: FilaExcel[];
  filaEncabezadoSugerida: number;
  mapeoSugerido: Partial<Record<CampoMapeo, number>>;
};
type CampoMapeo =
  | "referencia"
  | "nombreReferencia"
  | "talla"
  | "precioUsd"
  | "precioCop"
  | "sku"
  | "fotoColumna";

type ResultadoImport = {
  referenciasCreadas: number;
  variantesCreadas: number;
  invalidas: { numeroFila: number; errores: string[] }[];
};

const CAMPOS_OBLIGATORIOS: { campo: CampoMapeo; etiqueta: string }[] = [
  { campo: "referencia", etiqueta: "Referencia" },
  { campo: "nombreReferencia", etiqueta: "Nombre de la referencia" },
  { campo: "talla", etiqueta: "Talla" },
];
const CAMPOS_PRECIO: { campo: CampoMapeo; etiqueta: string }[] = [
  { campo: "precioUsd", etiqueta: "Precio USD (clientes internacionales)" },
  { campo: "precioCop", etiqueta: "Precio COP (clientes nacionales)" },
];
const CAMPOS_OPCIONALES: { campo: CampoMapeo; etiqueta: string }[] = [
  { campo: "sku", etiqueta: "SKU (si no existe, se genera automáticamente)" },
  { campo: "fotoColumna", etiqueta: "Columna donde están las fotos incrustadas" },
];

export function ImportadorWizard({ dropId }: { dropId: string }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [hojas, setHojas] = useState<HojaAnalizada[] | null>(null);
  const [hojaActiva, setHojaActiva] = useState("");
  const [filaEncabezado, setFilaEncabezado] = useState(1);
  const [columnas, setColumnas] = useState<Partial<Record<CampoMapeo, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  const hojaActual = hojas?.find((h) => h.nombre === hojaActiva);
  const filaEncActual = hojaActual?.filas.find((f) => f.numeroFila === filaEncabezado);
  const encabezados = filaEncActual?.celdas ?? [];
  const filasDatos = useMemo(
    () => hojaActual?.filas.filter((f) => f.numeroFila > filaEncabezado) ?? [],
    [hojaActual, filaEncabezado]
  );

  async function onArchivoSeleccionado(file: File) {
    setError(null);
    setResultado(null);
    setAnalizando(true);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await fetch(`/api/admin/drops/${dropId}/importar/analizar`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo analizar el archivo");
        return;
      }
      setArchivo(file);
      setHojas(data.hojas);
      const primera: HojaAnalizada = data.hojas[0];
      setHojaActiva(primera.nombre);
      setFilaEncabezado(primera.filaEncabezadoSugerida);
      setColumnas(primera.mapeoSugerido);
    } finally {
      setAnalizando(false);
    }
  }

  function cambiarHoja(nombre: string) {
    setHojaActiva(nombre);
    const hoja = hojas?.find((h) => h.nombre === nombre);
    if (hoja) {
      setFilaEncabezado(hoja.filaEncabezadoSugerida);
      setColumnas(hoja.mapeoSugerido);
    }
  }

  const listoParaImportar =
    columnas.referencia != null &&
    columnas.nombreReferencia != null &&
    columnas.talla != null &&
    (columnas.precioUsd != null || columnas.precioCop != null);

  async function importar() {
    if (!archivo || !listoParaImportar) return;
    setImportando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append(
        "mapeo",
        JSON.stringify({ hoja: hojaActiva, filaEncabezado, columnas })
      );
      const res = await fetch(`/api/admin/drops/${dropId}/importar`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo importar el catálogo");
        return;
      }
      setResultado(data);
      router.refresh();
    } finally {
      setImportando(false);
    }
  }

  if (resultado) {
    return (
      <Card>
        <h2 className="mb-3 font-medium text-brand-800">Importación completada</h2>
        <p className="mb-2 text-sm text-brand-700">
          Se crearon {resultado.referenciasCreadas} referencias con {resultado.variantesCreadas}{" "}
          variantes (SKU + talla).
        </p>
        {resultado.invalidas.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-medium text-brand-800">
              {resultado.invalidas.length} filas se ignoraron por errores:
            </p>
            <ul className="max-h-40 overflow-y-auto rounded-md bg-brand-50 p-3 text-xs text-brand-700">
              {resultado.invalidas.map((inv, i) => (
                <li key={i}>
                  Fila {inv.numeroFila}: {inv.errores.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-3">
          <Button onClick={() => router.push(`/admin/drops/${dropId}`)}>Ver drop</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setResultado(null);
              setArchivo(null);
              setHojas(null);
            }}
          >
            Importar otro archivo
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alerta>{error}</Alerta>}

      <Card>
        <Field label="Archivo Excel (.xlsx) del ordersheet">
          <input
            type="file"
            accept=".xlsx"
            disabled={analizando}
            onChange={(e) => e.target.files?.[0] && onArchivoSeleccionado(e.target.files[0])}
            className="block w-full text-sm text-brand-700 file:mr-4 file:rounded-md file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </Field>
        {analizando && <p className="mt-2 text-sm text-brand-700">Analizando archivo...</p>}
      </Card>

      {hojas && hojaActual && (
        <>
          <Card>
            <p className="mb-2 text-sm font-medium text-brand-800">Hoja del archivo</p>
            <div className="flex gap-2">
              {hojas.map((h) => (
                <button
                  key={h.nombre}
                  onClick={() => cambiarHoja(h.nombre)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    h.nombre === hojaActiva
                      ? "bg-brand-700 text-white"
                      : "bg-brand-100 text-brand-800 hover:bg-brand-100/70"
                  }`}
                >
                  {h.nombre.trim() || "(sin nombre)"}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <Field label="Número de fila donde están los encabezados (Referencia, Talla, Precio...)">
              <Input
                type="number"
                min={1}
                value={filaEncabezado}
                onChange={(e) => setFilaEncabezado(Number(e.target.value) || 1)}
                className="w-32"
              />
            </Field>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-medium text-brand-800">
              ¿Qué columna corresponde a cada dato?
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[...CAMPOS_OBLIGATORIOS, ...CAMPOS_OPCIONALES].map(({ campo, etiqueta }) => (
                <Field key={campo} label={etiqueta}>
                  <Select
                    value={columnas[campo] ?? ""}
                    onChange={(e) =>
                      setColumnas((c) => ({
                        ...c,
                        [campo]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">
                      {CAMPOS_OBLIGATORIOS.some((c) => c.campo === campo)
                        ? "-- selecciona una columna --"
                        : "-- ninguna --"}
                    </option>
                    {encabezados.map((texto, idx) => (
                      <option key={idx} value={idx}>
                        Col {idx + 1}: {texto || "(vacío)"}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>

            <p className="mb-3 mt-6 text-sm font-medium text-brand-800">
              Precio — mapea al menos una moneda (puedes mapear ambas si el archivo las trae)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CAMPOS_PRECIO.map(({ campo, etiqueta }) => (
                <Field key={campo} label={etiqueta}>
                  <Select
                    value={columnas[campo] ?? ""}
                    onChange={(e) =>
                      setColumnas((c) => ({
                        ...c,
                        [campo]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">-- ninguna --</option>
                    {encabezados.map((texto, idx) => (
                      <option key={idx} value={idx}>
                        Col {idx + 1}: {texto || "(vacío)"}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-medium text-brand-800">
              Vista previa ({filasDatos.length} filas de datos detectadas)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-brand-700">
                    <th className="px-2 py-1">Fila</th>
                    <th className="px-2 py-1">Referencia</th>
                    <th className="px-2 py-1">Nombre</th>
                    <th className="px-2 py-1">Talla</th>
                    <th className="px-2 py-1">Precio USD</th>
                    <th className="px-2 py-1">Precio COP</th>
                  </tr>
                </thead>
                <tbody>
                  {filasDatos.slice(0, 8).map((fila) => (
                    <tr key={fila.numeroFila} className="border-t border-brand-100">
                      <td className="px-2 py-1">{fila.numeroFila}</td>
                      <td className="px-2 py-1">
                        {columnas.referencia != null ? fila.celdas[columnas.referencia] : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {columnas.nombreReferencia != null
                          ? fila.celdas[columnas.nombreReferencia]
                          : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {columnas.talla != null ? fila.celdas[columnas.talla] : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {columnas.precioUsd != null ? fila.celdas[columnas.precioUsd] : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {columnas.precioCop != null ? fila.celdas[columnas.precioCop] : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Button disabled={!listoParaImportar || importando} onClick={importar} className="self-start">
            {importando ? "Importando..." : "Importar catálogo"}
          </Button>
        </>
      )}
    </div>
  );
}
