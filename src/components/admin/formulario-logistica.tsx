"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Alerta } from "@/components/ui";

export function FormularioLogistica({
  pedidoId,
  transportadora: transportadoraInicial,
  numeroGuia: numeroGuiaInicial,
  linkSeguimiento: linkSeguimientoInicial,
  guiaUrl,
}: {
  pedidoId: string;
  transportadora: string | null;
  numeroGuia: string | null;
  linkSeguimiento: string | null;
  guiaUrl: string | null;
}) {
  const router = useRouter();
  const [transportadora, setTransportadora] = useState(transportadoraInicial ?? "");
  const [numeroGuia, setNumeroGuia] = useState(numeroGuiaInicial ?? "");
  const [linkSeguimiento, setLinkSeguimiento] = useState(linkSeguimientoInicial ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "error" | "exito"; texto: string } | null>(null);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/admin/pedidos/${pedidoId}/logistica`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora, numeroGuia, linkSeguimiento }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error ?? "No se pudo guardar la información logística" });
        return;
      }

      if (archivo) {
        const fd = new FormData();
        fd.append("archivo", archivo);
        const resArchivo = await fetch(`/api/admin/pedidos/${pedidoId}/guia`, {
          method: "POST",
          body: fd,
        });
        const dataArchivo = await resArchivo.json();
        if (!resArchivo.ok) {
          setMensaje({ tipo: "error", texto: dataArchivo.error ?? "No se pudo subir la guía" });
          return;
        }
      }

      setMensaje({ tipo: "exito", texto: "Información logística guardada." });
      setArchivo(null);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
        Información logística
      </h2>
      {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Transportadora">
          <Input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} />
        </Field>
        <Field label="Número de guía">
          <Input value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} />
        </Field>
        <Field label="Link de seguimiento">
          <Input
            type="url"
            placeholder="https://..."
            value={linkSeguimiento}
            onChange={(e) => setLinkSeguimiento(e.target.value)}
          />
        </Field>
        <Field label="Guía de despacho (PDF o foto)">
          <input
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-brand-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800"
          />
        </Field>
      </div>
      {guiaUrl && (
        <a
          href={guiaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-brand-700 underline"
        >
          Ver guía adjunta actual
        </a>
      )}
      <div>
        <Button disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar información logística"}
        </Button>
      </div>
    </Card>
  );
}
