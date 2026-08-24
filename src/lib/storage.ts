import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

/**
 * Guarda una imagen y devuelve la URL con la que se sirve dentro de la app.
 * STORAGE_DRIVER=local (por defecto) escribe a disco; útil para Docker/VPS con
 * el volumen "uploads" montado. Un driver S3-compatible (para hosting sin disco
 * persistente) queda para cuando se confirme el proveedor final de hosting.
 */
export async function guardarImagen(buffer: Buffer, extension: string): Promise<string> {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    throw new Error(
      `STORAGE_DRIVER="${driver}" aún no está implementado en este MVP; usa STORAGE_DRIVER=local.`
    );
  }
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const nombreArchivo = `${randomUUID()}.${extension}`;
  await fs.writeFile(path.join(UPLOADS_DIR, nombreArchivo), buffer);
  return `/api/uploads/${nombreArchivo}`;
}

export async function leerImagen(nombreArchivo: string): Promise<Buffer> {
  const nombreSeguro = path.basename(nombreArchivo);
  return fs.readFile(path.join(UPLOADS_DIR, nombreSeguro));
}
