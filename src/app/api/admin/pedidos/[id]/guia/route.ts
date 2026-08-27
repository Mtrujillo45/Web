import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRolApi } from "@/lib/api-guards";
import { guardarImagen } from "@/lib/storage";
import { tieneInfoLogistica } from "@/lib/logistica";
import { enviarCorreo } from "@/lib/email";

const EXTENSIONES_PERMITIDAS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const TAMANO_MAXIMO = 8 * 1024 * 1024; // 8 MB

/** Sube el documento de la guía de despacho (PDF o foto) de un pedido. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await requireRolApi(["COMERCIAL", "PRODUCCION"]);
  if (acceso.error) return acceso.error;
  const { id } = await params;

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { empresa: true, drop: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  const extension = EXTENSIONES_PERMITIDAS[archivo.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Formato no soportado. Sube un PDF o una foto (PNG/JPG/WEBP)." },
      { status: 400 }
    );
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return NextResponse.json({ error: "El archivo supera el límite de 8 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const guiaUrl = await guardarImagen(buffer, extension);

  const teniaInfoAntes = tieneInfoLogistica(pedido);

  await prisma.pedido.update({
    where: { id },
    data: { guiaUrl, editadoEn: new Date(), editadoPorId: acceso.sesion.sub },
  });

  if (!teniaInfoAntes) {
    await enviarCorreo({
      to: pedido.empresa.emailContacto,
      subject: `Tu pedido de Mompossina fue despachado — ${pedido.drop.nombre}`,
      html: `
        <p>¡Tu pedido de <strong>${pedido.drop.nombre}</strong> ya está en camino!</p>
        <p><a href="${req.nextUrl.origin}${guiaUrl}">Ver la guía de despacho</a></p>
      `,
    });
  }

  return NextResponse.json({ ok: true, guiaUrl });
}
