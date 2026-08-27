"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Alerta } from "@/components/ui";
import { datetimeLocalABogota } from "@/lib/tiempo";

export function FormularioCrearDrop() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, fechaLimite: datetimeLocalABogota(fechaLimite).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "No se pudo crear el drop");
      router.push(`/admin/drops/${data.id}`);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <Button onClick={() => setAbierto(true)} className="self-start">
        + Crear nuevo drop
      </Button>
    );
  }

  return (
    <Card>
      <form onSubmit={crear} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        {error && (
          <div className="sm:basis-full">
            <Alerta>{error}</Alerta>
          </div>
        )}
        <div className="flex-1">
          <Field label="Nombre del drop">
            <Input required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Fecha límite de pedidos (hora Bogotá)">
            <Input
              type="datetime-local"
              required
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Creando..." : "Crear drop"}
        </Button>
      </form>
    </Card>
  );
}
