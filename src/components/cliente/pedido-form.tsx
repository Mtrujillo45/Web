"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Alerta, Badge, Input } from "@/components/ui";

type Variante = {
  id: string;
  sku: string;
  talla: string;
  precioCliente: number;
  cantidadActual: number;
};

type Producto = {
  id: string;
  referencia: string;
  nombreReferencia: string;
  fotoUrl: string | null;
  moqReferencia: number | null;
  variantes: Variante[];
};

export function PedidoForm({
  dropId,
  productos,
  moqTotalPedido,
  soloLectura,
  estadoPedido,
}: {
  dropId: string;
  productos: Producto[];
  moqTotalPedido: number | null;
  soloLectura: boolean;
  estadoPedido: "BORRADOR" | "ENVIADO";
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
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "error" | "exito"; texto: string } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const totales = useMemo(() => {
    let unidades = 0;
    let valor = 0;
    for (const p of productos) {
      for (const v of p.variantes) {
        const cantidad = cantidades[v.id] ?? 0;
        unidades += cantidad;
        valor += cantidad * v.precioCliente;
      }
    }
    return { unidades, valor: Math.round(valor * 100) / 100 };
  }, [cantidades, productos]);

  function actualizarCantidad(varianteId: string, valor: string) {
    const cantidad = Math.max(0, Math.floor(Number(valor) || 0));
    setCantidades((c) => ({ ...c, [varianteId]: cantidad }));
  }

  function construirLineas() {
    return Object.entries(cantidades)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    setErrores([]);
    try {
      const res = await fetch("/api/pedidos/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId, lineas: construirLineas() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudo guardar el pedido" });
        return;
      }
      setMensaje({ tipo: "exito", texto: "Pedido guardado como borrador." });
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function enviar() {
    setEnviando(true);
    setMensaje(null);
    setErrores([]);
    try {
      const res = await fetch("/api/pedidos/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId, lineas: construirLineas() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudo enviar el pedido" });
        setErrores(data.errores ?? []);
        return;
      }
      setMensaje({ tipo: "exito", texto: "¡Pedido enviado! Puedes seguir editándolo hasta el cierre del drop." });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {soloLectura && (
        <Alerta tipo="error">Este drop ya cerró. El pedido quedó en modo solo lectura.</Alerta>
      )}
      {!soloLectura && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-brand-700">Estado actual:</span>
          <Badge tono={estadoPedido === "ENVIADO" ? "exito" : "advertencia"}>
            {estadoPedido === "ENVIADO" ? "Enviado" : "Borrador"}
          </Badge>
        </div>
      )}
      {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
      {errores.length > 0 && (
        <Alerta>
          <ul className="list-disc pl-4">
            {errores.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alerta>
      )}

      <div className="flex flex-col gap-4">
        {productos.map((producto) => (
          <Card key={producto.id} className="flex gap-4">
            {producto.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={producto.fotoUrl}
                alt={producto.nombreReferencia}
                className="h-24 w-24 flex-none rounded-md object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 flex-none items-center justify-center rounded-md bg-brand-100 text-xs text-brand-700">
                Sin foto
              </div>
            )}
            <div className="flex-1">
              <div className="mb-2 flex items-baseline justify-between">
                <div>
                  <p className="font-medium text-brand-800">{producto.nombreReferencia}</p>
                  <p className="text-xs text-brand-700">Ref. {producto.referencia}</p>
                </div>
                {producto.moqReferencia && (
                  <span className="text-xs text-brand-700">
                    Mínimo por referencia: {producto.moqReferencia} u.
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {producto.variantes.map((v) => (
                  <div key={v.id} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-brand-700">{v.talla}</span>
                    <span className="text-xs text-brand-700">${v.precioCliente.toFixed(2)}</span>
                    <Input
                      type="number"
                      min={0}
                      disabled={soloLectura}
                      className="w-16 text-center"
                      value={cantidades[v.id] ?? 0}
                      onChange={(e) => actualizarCantidad(v.id, e.target.value)}
                    />
                    <span className="text-[10px] text-brand-700">{v.sku}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm text-brand-700">
            Total: <span className="font-semibold text-brand-800">{totales.unidades} unidades</span>{" "}
            &middot; <span className="font-semibold text-brand-800">${totales.valor.toFixed(2)} USD</span>
          </p>
          {moqTotalPedido && (
            <p className="text-xs text-brand-700">Mínimo total del pedido: {moqTotalPedido} unidades</p>
          )}
        </div>
        {!soloLectura && (
          <div className="flex gap-3">
            <Button variant="secondary" disabled={guardando || enviando} onClick={guardar}>
              {guardando ? "Guardando..." : "Guardar borrador"}
            </Button>
            <Button disabled={guardando || enviando} onClick={enviar}>
              {enviando ? "Enviando..." : "Enviar pedido"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
