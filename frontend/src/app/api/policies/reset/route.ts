import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST() {
  const res = await fetch(`${BACKEND}/api/policies/reset`, { method: "POST" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
