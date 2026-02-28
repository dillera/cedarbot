import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(req: NextRequest) {
  const session_id = req.nextUrl.searchParams.get("session_id") ?? "default";
  const res = await fetch(`${BACKEND}/api/chat/history?session_id=${encodeURIComponent(session_id)}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
