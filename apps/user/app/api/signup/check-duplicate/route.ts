import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`check-dup:${ip}`, 20, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { type, value } = body as { type?: string; value?: string };
  const trimmed = String(value || "").trim();

  if (!type || !trimmed) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (type === "email") {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("email", trimmed.toLowerCase())
      .maybeSingle();

    if (profile) {
      return NextResponse.json({
        duplicate: true,
        message: "이미 가입된 이메일입니다.",
      });
    }

    return NextResponse.json({
      duplicate: false,
      message: "사용 가능한 이메일입니다.",
    });
  }

  if (type === "phone") {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("phone", trimmed)
      .maybeSingle();

    if (profile) {
      return NextResponse.json({
        duplicate: true,
        message: "이미 가입된 전화번호입니다.",
      });
    }

    return NextResponse.json({
      duplicate: false,
      message: "사용 가능한 전화번호입니다.",
    });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
