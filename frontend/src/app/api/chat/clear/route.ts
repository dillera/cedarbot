import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function DELETE(req: NextRequest) {
  const session_id = req.nextUrl.searchParams.get("session_id") ?? "default";
  const res = await fetch(`${BACKEND}/api/chat/clear?session_id=${encodeURIComponent(session_id)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
