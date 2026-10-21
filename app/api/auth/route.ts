import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  TOKEN_TTL_SECONDS,
  isAuthConfigured,
  signToken,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    console.error("AUTH_PASSWORD and AUTH_SECRET must both be set");
    return NextResponse.json(
      { error: "Autenticação não configurada" },
      { status: 503 },
    );
  }

  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  if (!(await verifyPassword(password))) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  const token = await signToken();
  const response = NextResponse.json({ ok: true });

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
