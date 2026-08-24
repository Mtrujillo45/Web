"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alerta } from "@/components/ui";

export function AccionesDrop({
  dropId,
  estado,
  tieneProductos,
}: {
  dropId: string;
  estado: "BORRADOR" | "ACTIVO" | "CERRADO";
  tieneProductos: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alerta>{error}</Alerta>}
      <div className="flex gap-3">
        {estado === "BORRADOR" && (
          <Button disabled={enviando || !tieneProductos} onClick={() => cambiarEstado("ACTIVO")}>
            Activar drop
          </Button>
        )}
        {estado === "ACTIVO" && (
          <Button variant="danger" disabled={enviando} onClick={() => cambiarEstado("CERRADO")}>
            Cerrar drop
          </Button>
        )}
      </div>
    </div>
  );
}
