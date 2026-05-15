import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

type NotificationBody = {
  title?: string;
  body?: string;
  type?: string;
};

const ALLOWED_TYPES = new Set([
  "info",
  "staking",
  "deposit",
  "withdraw",
  "trade",
  "system",
]);

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`notifications:${ip}`, 30, 60_000);
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

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as NotificationBody | null;
  const title = String(body?.title ?? "").trim();
  const messageBody = String(body?.body ?? "").trim();
  const type = String(body?.type ?? "info").trim() || "info";

  if (!title) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: "Title too long" }, { status: 400 });
  }
  if (messageBody.length > 2000) {
    return NextResponse.json({ error: "Body too long" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: user.id,
      title,
      body: messageBody || null,
      type,
    })
    .select("id, title, body, type, is_read, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, notification: data });
}
