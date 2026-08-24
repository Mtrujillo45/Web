"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Badge, Field, Input, Alerta } from "@/components/ui";

type Empresa = {
  id: string;
  nombreComercial: string;
  razonSocial: string | null;
  nitOCedula: string;
  pais: string;
  ciudad: string | null;
  telefono: string | null;
  emailContacto: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO" | "SUSPENDIDO";
  condicion: { porcentajeDescuento: number; moqTotalPedido: number | null; terminosPago: string | null } | null;
};

const TONO_ESTADO = {
  PENDIENTE: "advertencia",
  APROBADO: "exito",
  RECHAZADO: "peligro",
  SUSPENDIDO: "peligro",
} as const;

export function TarjetaEmpresa({ empresa }: { empresa: Empresa }) {
  const router = useRouter();
  const [porcentajeDescuento, setPorcentajeDescuento] = useState(
    empresa.condicion?.porcentajeDescuento?.toString() ?? "0"
  );
  const [moqTotalPedido, setMoqTotalPedido] = useState(
    empresa.condicion?.moqTotalPedido?.toString() ?? ""
  );
  const [terminosPago, setTerminosPago] = useState(empresa.condicion?.terminosPago ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function payloadCondicion() {
    return {
      porcentajeDescuento: Number(porcentajeDescuento) || 0,
      moqTotalPedido: moqTotalPedido ? Number(moqTotalPedido) : null,
      terminosPago: terminosPago || undefined,
    };
  }

  async function aprobar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/empresas/${empresa.id}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadCondicion()),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo aprobar");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function guardarCondicion() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/empresas/${empresa.id}/condicion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadCondicion()),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo guardar");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(estado: "RECHAZADO" | "SUSPENDIDO" | "APROBADO") {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/empresas/${empresa.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo actualizar");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-medium text-brand-800">{empresa.nombreComercial}</p>
          <p className="text-sm text-brand-700">
            {empresa.pais} &middot; NIT/CC {empresa.nitOCedula} &middot; {empresa.emailContacto}
          </p>
        </div>
        <Badge tono={TONO_ESTADO[empresa.estado]}>{empresa.estado}</Badge>
      </div>

      {error && (
        <div className="mb-3">
          <Alerta>{error}</Alerta>
        </div>
      )}

      {(empresa.estado === "PENDIENTE" || empresa.estado === "APROBADO") && (
        <div className="grid grid-cols-1 gap-3 border-t border-brand-100 pt-3 sm:grid-cols-3">
          <Field label="% de descuento">
            <Input
              type="number"
              min={0}
              max={100}
              value={porcentajeDescuento}
              onChange={(e) => setPorcentajeDescuento(e.target.value)}
            />
          </Field>
          <Field label="Mínimo total del pedido (unidades, opcional)">
            <Input
              type="number"
              min={0}
              value={moqTotalPedido}
              onChange={(e) => setMoqTotalPedido(e.target.value)}
            />
          </Field>
          <Field label="Términos de pago (opcional)">
            <Input value={terminosPago} onChange={(e) => setTerminosPago(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        {empresa.estado === "PENDIENTE" && (
          <>
            <Button disabled={enviando} onClick={aprobar}>
              Aprobar
            </Button>
            <Button variant="danger" disabled={enviando} onClick={() => cambiarEstado("RECHAZADO")}>
              Rechazar
            </Button>
          </>
        )}
        {empresa.estado === "APROBADO" && (
          <>
            <Button disabled={enviando} onClick={guardarCondicion}>
              Guardar condición
            </Button>
            <Button variant="secondary" disabled={enviando} onClick={() => cambiarEstado("SUSPENDIDO")}>
              Suspender
            </Button>
          </>
        )}
        {empresa.estado === "SUSPENDIDO" && (
          <Button disabled={enviando} onClick={() => cambiarEstado("APROBADO")}>
            Reactivar
          </Button>
        )}
      </div>
    </Card>
  );
}
