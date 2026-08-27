"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Alerta, Input } from "@/components/ui";
import { formatearPrecio } from "@/lib/pricing";

type Variante = {
  id: string;
  sku: string;
  talla: string;
  precioCliente: number | null;
  cantidadActual: number;
};

type Producto = {
  id: string;
  referencia: string;
  nombreReferencia: string;
  variantes: Variante[];
};

export function EditorLineasPedido({
  pedidoId,
  productos,
  moneda,
}: {
  pedidoId: string;
  productos: Producto[];
  moneda: "USD" | "COP";
}) {
  const router = useRouter();
  const [cantidades, setCantidades] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const p of productos) {
      for (const v of p.variantes) inicial[v.id] = v.cantidadActual;
    }
    return inicial;
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "error" | "exito"; texto: string } | null>(null);

  const totales = useMemo(() => {
    let unidades = 0;
    let valor = 0;
    for (const p of productos) {
      for (const v of p.variantes) {
        const cantidad = cantidades[v.id] ?? 0;
        unidades += cantidad;
        valor += cantidad * (v.precioCliente ?? 0);
      }
    }
    return { unidades, valor: Math.round(valor * 100) / 100 };
  }, [cantidades, productos]);

  function actualizarCantidad(varianteId: string, valor: string) {
    const cantidad = Math.max(0, Math.floor(Number(valor) || 0));
    setCantidades((c) => ({ ...c, [varianteId]: cantidad }));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const lineas = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
      const res = await fetch(`/api/admin/pedidos/${pedidoId}/lineas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineas }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudieron guardar los cambios" });
        return;
      }
      setMensaje({ tipo: "exito", texto: "Cantidades actualizadas." });
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-brand-700">
            <tr>
              <th className="px-4 py-2">Referencia</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Talla</th>
              <th className="px-4 py-2 text-right">Precio</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((producto) =>
              producto.variantes.map((v, i) => (
                <tr key={v.id} className="border-t border-brand-100">
                  {i === 0 && (
                    <td className="px-4 py-2 align-top" rowSpan={producto.variantes.length}>
                      <p className="font-medium text-brand-800">{producto.nombreReferencia}</p>
                      <p className="text-xs text-brand-700">Ref. {producto.referencia}</p>
                    </td>
                  )}
                  <td className="px-4 py-2">{v.sku}</td>
                  <td className="px-4 py-2">{v.talla}</td>
                  <td className="px-4 py-2 text-right">
                    {v.precioCliente != null ? formatearPrecio(v.precioCliente, moneda) : "Sin precio"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      disabled={v.precioCliente == null}
                      className="w-20 text-center"
                      value={cantidades[v.id] ?? 0}
                      onChange={(e) => actualizarCantidad(v.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Card className="flex items-center justify-between">
        <p className="text-sm text-brand-700">
          Total: <span className="font-semibold text-brand-800">{totales.unidades} unidades</span>{" "}
          &middot;{" "}
          <span className="font-semibold text-brand-800">{formatearPrecio(totales.valor, moneda)}</span>
        </p>
        <Button disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </Button>
      </Card>
    </div>
  );
}
