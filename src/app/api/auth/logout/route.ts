import { NextResponse } from "next/server";
import { borrarCookieSesion } from "@/lib/auth";

export async function POST() {
  await borrarCookieSesion();
  return NextResponse.json({ ok: true });
}
