"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alerta } from "@/components/ui";

export function BotonNuevoPedido({
  dropId,
  texto = "+ Crear nuevo pedido",
  variant = "primary",
}: {
  dropId: string;
  texto?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/pedidos/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el pedido");
        return;
      }
      router.push(`/cliente/pedido/${dropId}/${data.pedidoId}`);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error && <Alerta>{error}</Alerta>}
      <Button variant={variant} onClick={crear} disabled={cargando}>
        {cargando ? "Creando..." : texto}
      </Button>
    </div>
  );
}
