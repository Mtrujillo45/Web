import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "session";

async function leerRol(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return (payload.rol as string) ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rol = await leerRol(req);

  const esRutaCliente = pathname.startsWith("/cliente");
  const esRutaAdmin = pathname.startsWith("/admin");

  if ((esRutaCliente || esRutaAdmin) && !rol) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (esRutaCliente && rol !== "CLIENTE") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  if (esRutaAdmin && rol !== "COMERCIAL" && rol !== "PRODUCCION") {
    const url = req.nextUrl.clone();
    url.pathname = "/cliente";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cliente/:path*", "/admin/:path*"],
};
