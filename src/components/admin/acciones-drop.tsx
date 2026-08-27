"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alerta, Field, Input } from "@/components/ui";

export function AccionesDrop({
  dropId,
  estado,
  tieneProductos,
  cerrado,
}: {
  dropId: string;
  estado: "BORRADOR" | "ACTIVO" | "CERRADO";
  tieneProductos: boolean;
  cerrado: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarReabrir, setMostrarReabrir] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState("");

  async function cambiarEstado(nuevoEstado: "ACTIVO" | "CERRADO") {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drops/${dropId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo actualizar el drop");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function reabrir(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drops/${dropId}/reabrir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaLimite: nuevaFecha }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo reabrir el drop");
      setMostrarReabrir(false);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alerta>{error}</Alerta>}
      {!mostrarReabrir && (
        <div className="flex gap-3">
          {estado === "BORRADOR" && (
            <Button disabled={enviando || !tieneProductos} onClick={() => cambiarEstado("ACTIVO")}>
              Activar drop
            </Button>
          )}
          {estado === "ACTIVO" && !cerrado && (
            <Button variant="danger" disabled={enviando} onClick={() => cambiarEstado("CERRADO")}>
              Cerrar drop
            </Button>
          )}
          {estado !== "BORRADOR" && cerrado && (
            <Button disabled={enviando} onClick={() => setMostrarReabrir(true)}>
              Reabrir drop
            </Button>
          )}
        </div>
      )}
      {mostrarReabrir && (
        <form onSubmit={reabrir} className="flex flex-col items-end gap-3 sm:flex-row sm:items-end">
          <Field label="Nueva fecha límite (hora Bogotá)">
            <Input
              type="datetime-local"
              required
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={enviando}>
              {enviando ? "Reabriendo..." : "Confirmar reapertura"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMostrarReabrir(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
