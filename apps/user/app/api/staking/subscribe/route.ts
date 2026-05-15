import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

type SubscribeBody = {
  productId?: number;
  amount?: number;
};

const STAKING_ERROR_MESSAGES: Record<string, string> = {
  "Product not found or inactive": "판매중인 스테이킹 상품을 찾을 수 없습니다.",
  "Amount below minimum": "최소 스테이킹 금액보다 작습니다.",
  "Amount above maximum": "최대 스테이킹 금액을 초과했습니다.",
  "User not found": "사용자 정보를 찾을 수 없습니다.",
  "Insufficient staking balance": "스테이킹 잔액이 부족합니다.",
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`staking:${ip}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const jwt = getBearer(req);

  if (!jwt) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as SubscribeBody | null;
  const productId = Number(body?.productId);
  const amount = Number(body?.amount);

  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json(
      { error: "유효하지 않은 스테이킹 상품입니다." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "스테이킹 금액을 올바르게 입력해주세요." },
      { status: 400 },
    );
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(jwt);

  if (authError || !user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: result, error } = await admin.rpc("create_staking", {
    p_user_id: user.id,
    p_product_id: productId,
    p_amount: amount,
  });

  if (error) {
    return NextResponse.json(
      { error: "스테이킹 신청 처리 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  if (!result?.success) {
    const errorMessage =
      STAKING_ERROR_MESSAGES[String(result?.error)] ||
      result?.error ||
      "스테이킹 신청에 실패했습니다.";
    return NextResponse.json(
      { error: errorMessage },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, message: result.message });
}
