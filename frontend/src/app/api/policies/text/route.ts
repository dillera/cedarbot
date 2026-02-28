import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${BACKEND}/api/policies/text`);
  const data = await res.json();
  return NextResponse.json(data);
}
