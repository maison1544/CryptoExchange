import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type DepositBody = {
  amount?: number;
  depositorName?: string;
};

type IdempotencyRecord = {
  request_hash: string;
  response_code: number | null;
  response_body: Record<string, unknown> | null;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function getIdempotencyKey(req: NextRequest) {
  return req.headers.get("idempotency-key")?.trim() || "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function createRequestHash(payload: Record<string, unknown>) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function responseFromStored(record: IdempotencyRecord) {
  return NextResponse.json(record.response_body || {}, {
    status: record.response_code ?? 200,
  });
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as DepositBody | null;
  const amount = Number(body?.amount ?? 0);
  const depositorName = String(body?.depositorName ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid deposit amount" }, { status: 400 });
  }

  if (!depositorName) {
    return NextResponse.json({ error: "Depositor name required" }, { status: 400 });
  }

  const idempotencyKey = getIdempotencyKey(req);
  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      { error: "Valid Idempotency-Key header required" },
      { status: 400 },
    );
  }

  const requestHash = createRequestHash({ amount, depositorName });
  const routeKey = "wallet:deposit";
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingResult = await supabaseAdmin
      .from("api_idempotency_keys")
      .select("request_hash, response_code, response_body")
      .eq("user_id", user.id)
      .eq("route_key", routeKey)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle<IdempotencyRecord>();

    if (existingResult.data) {
      if (existingResult.data.request_hash !== requestHash) {
        return NextResponse.json(
          { error: "Idempotency key already used with different payload" },
          { status: 409 },
        );
      }

      if (existingResult.data.response_body) {
        return responseFromStored(existingResult.data);
      }

      return NextResponse.json(
        { error: "Duplicate request is still processing" },
        { status: 409 },
      );
    }

    const insertResult = await supabaseAdmin.from("api_idempotency_keys").insert({
      user_id: user.id,
      route_key: routeKey,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
    });

    if (insertResult.error) {
      const duplicateResult = await supabaseAdmin
        .from("api_idempotency_keys")
        .select("request_hash, response_code, response_body")
        .eq("user_id", user.id)
        .eq("route_key", routeKey)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle<IdempotencyRecord>();

      if (duplicateResult.data) {
        if (duplicateResult.data.request_hash !== requestHash) {
          return NextResponse.json(
            { error: "Idempotency key already used with different payload" },
            { status: 409 },
          );
        }

        if (duplicateResult.data.response_body) {
          return responseFromStored(duplicateResult.data);
        }

        return NextResponse.json(
          { error: "Duplicate request is still processing" },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
    }

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "request_deposit",
      {
        p_user_id: user.id,
        p_amount: amount,
        p_depositor_name: depositorName,
      },
    );

    const responseBody = rpcError
      ? { success: false, error: rpcError.message }
      : ((rpcResult as Record<string, unknown> | null) ?? { success: true });
    const responseCode = rpcError
      ? 500
      : responseBody.success === false
        ? 400
        : 200;

    await supabaseAdmin
      .from("api_idempotency_keys")
      .update({
        response_code: responseCode,
        response_body: responseBody,
      })
      .eq("user_id", user.id)
      .eq("route_key", routeKey)
      .eq("idempotency_key", idempotencyKey);

    return NextResponse.json(responseBody, { status: responseCode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
