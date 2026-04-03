import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const from = body?.from;
  const to = body?.to;
  const amount = Number(body?.amount);

  if (!from || !to || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Invalid transfer parameters" },
      { status: 400 },
    );
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: result, error: rpcError } = await admin.rpc(
    "transfer_balance",
    {
      p_user_id: user.id,
      p_from: from,
      p_to: to,
      p_amount: amount,
    },
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!result?.success) {
    return NextResponse.json(
      { error: result?.error || "Transfer failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, message: result.message });
}
