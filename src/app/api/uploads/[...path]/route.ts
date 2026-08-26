import { NextRequest, NextResponse } from "next/server";
import { leerImagen } from "@/lib/storage";

const TIPOS_CONTENIDO: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segmentos } = await params;
  const nombreArchivo = segmentos[segmentos.length - 1] ?? "";
  try {
    const buffer = await leerImagen(nombreArchivo);
    const extension = nombreArchivo.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": TIPOS_CONTENIDO[extension] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }
}
