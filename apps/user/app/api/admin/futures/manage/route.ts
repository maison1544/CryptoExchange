import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizeCommissionRate } from "@/lib/utils/commission";
import {
  getSiteSettings,
  resolveFuturesFeeRate,
} from "@/lib/server/siteSettings";
import { rateLimit } from "@/lib/rateLimit";
import { recalculateCrossLiquidationPrices } from "@/lib/server/recalcCrossLiq";

async function getCurrentPrice(symbol: string) {
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Failed to fetch market price");
  const payload = (await response.json()) as { price?: string };
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price <= 0)
    throw new Error("Invalid market price");
  return price;
}

type ManageAction = "force-liquidate" | "refund-trade";

type ManageBody = {
  positionId?: string | number;
  action?: ManageAction;
  note?: string | null;
  userId?: string;
  symbol?: string;
  openedAt?: string;
  direction?: string;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function normalizeTimestampValue(value?: string | null) {
  if (!value) return null;

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;

  return Math.floor(ms / 1000);
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`admin-futures:${ip}`, 20, 60_000);
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

  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  // Parse body before auth (no DB needed)
  const body = (await req.json().catch(() => null)) as ManageBody | null;
  const positionId = String(body?.positionId ?? "").trim();
  const action = body?.action;
  const note = body?.note?.trim() || null;
  const fallbackUserId = String(body?.userId ?? "").trim();
  const fallbackSymbol = String(body?.symbol ?? "")
    .trim()
    .toUpperCase();
  const fallbackOpenedAt = String(body?.openedAt ?? "").trim();
  const fallbackDirection = String(body?.direction ?? "")
    .trim()
    .toLowerCase();

  if (!/^\d+$/.test(positionId)) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  if (action !== "force-liquidate" && action !== "refund-trade") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Stage 1: auth ──
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid auth token" },
        { status: 401 },
      );
    }

    // ── Stage 2: admin check + position fetch in parallel (1 RTT) ──
    const positionSelect =
      "id, user_id, symbol, direction, margin_mode, leverage, size, entry_price, exit_price, liquidation_price, margin, pnl, fee, status, opened_at, closed_at, refund_processed_at, refunded_amount, refunded_fee, admin_action_note";
    const [adminResult, positionResult] = await Promise.all([
      supabaseAdmin.from("admins").select("id").eq("id", user.id).maybeSingle(),
      supabaseAdmin
        .from("futures_positions")
        .select(positionSelect)
        .eq("id", positionId)
        .maybeSingle(),
    ]);

    if (!adminResult.data) {
      return NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 },
      );
    }

    let position = positionResult.data;

    if (!position && fallbackUserId && fallbackSymbol) {
      let fallbackQuery = supabaseAdmin
        .from("futures_positions")
        .select(positionSelect)
        .eq("user_id", fallbackUserId)
        .eq("symbol", fallbackSymbol)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(10);

      if (fallbackDirection === "long" || fallbackDirection === "short") {
        fallbackQuery = fallbackQuery.eq("direction", fallbackDirection);
      }

      const fallbackResult = await fallbackQuery;

      if (!fallbackResult.error && Array.isArray(fallbackResult.data)) {
        const fallbackRows = fallbackResult.data;
        const targetOpenedAt = normalizeTimestampValue(fallbackOpenedAt);

        position =
          fallbackRows.find((row) => String(row.id) === positionId) ||
          fallbackRows.find(
            (row) =>
              targetOpenedAt !== null &&
              normalizeTimestampValue(row.opened_at) === targetOpenedAt,
          ) ||
          fallbackRows[0] ||
          null;
      }

      if (!position && (positionResult.error || fallbackResult.error)) {
        console.error("[admin/futures/manage] position lookup failed", {
          positionId,
          fallbackUserId,
          fallbackSymbol,
          fallbackOpenedAt,
          fallbackDirection,
          positionLookupError: positionResult.error?.message || null,
          fallbackLookupError: fallbackResult.error?.message || null,
        });
      }
    }

    if (!position) {
      console.error("[admin/futures/manage] Position not found", {
        positionId,
        action,
        fallbackUserId,
        fallbackSymbol,
        fallbackOpenedAt,
        fallbackDirection,
        positionLookupError: positionResult.error?.message || null,
      });

      return NextResponse.json(
        {
          error: "Position not found",
          debug: {
            positionId,
            action,
            fallbackUserId,
            fallbackSymbol,
            fallbackOpenedAt,
            fallbackDirection,
            positionLookupError: positionResult.error?.message || null,
          },
        },
        { status: 404 },
      );
    }

    const resolvedPositionId = String(position.id);

    const now = new Date().toISOString();
    const margin = Number(position.margin || 0);
    const fee = Number(position.fee || 0);

    if (action === "force-liquidate") {
      let commissionWarning: string | undefined;

      if (position.status !== "open") {
        return NextResponse.json(
          { error: "이미 종료된 포지션은 강제청산할 수 없습니다." },
          { status: 400 },
        );
      }

      // ── 수익률 기반 청산 (사용자 종료와 동일 로직) ──
      const settings = await getSiteSettings(supabaseAdmin, [
        "taker_fee",
        "futures_fee",
      ]);
      const feeRate = resolveFuturesFeeRate(settings);
      const exitPrice = await getCurrentPrice(position.symbol);
      const size = Number(position.size);
      const entryPrice = Number(position.entry_price);
      const closeFee = Number((exitPrice * size * feeRate).toFixed(4));
      const pnl = Number(
        (position.direction === "long"
          ? (exitPrice - entryPrice) * size
          : (entryPrice - exitPrice) * size
        ).toFixed(4),
      );
      const cappedPnl = Math.max(pnl, -margin);
      const returnedAmount = Math.max(
        0,
        Number((margin + cappedPnl - closeFee).toFixed(4)),
      );

      const { data: closedRow, error: updateError } = await supabaseAdmin
        .from("futures_positions")
        .update({
          status: "closed",
          exit_price: exitPrice,
          pnl,
          fee: fee + closeFee,
          closed_at: now,
          forced_liquidated_at: now,
          admin_action_note: note,
        })
        .eq("id", resolvedPositionId)
        .eq("status", "open")
        .select("id")
        .maybeSingle();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }

      if (!closedRow) {
        return NextResponse.json(
          { error: "포지션이 이미 종료되었습니다." },
          { status: 409 },
        );
      }

      // 잔고 반환
      if (returnedAmount > 0) {
        const { data: balanceResult, error: balanceError } =
          await supabaseAdmin.rpc("adjust_futures_balance", {
            p_user_id: position.user_id,
            p_amount: returnedAmount,
            p_reason: `admin_force_close_${resolvedPositionId}`,
          });

        if (balanceError || !balanceResult?.success) {
          commissionWarning = `잔고 반환 실패: ${balanceError?.message || balanceResult?.error}`;
        }
      }

      // 커미션 처리
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("agent_id")
        .eq("id", position.user_id)
        .maybeSingle();

      if (profile?.agent_id) {
        try {
          const { data: agent } = await supabaseAdmin
            .from("agents")
            .select("id, loss_commission_rate, fee_commission_rate")
            .eq("id", profile.agent_id)
            .maybeSingle();

          if (agent) {
            const commissionRows = [];
            const feeCommissionAmount = Number(
              (
                closeFee * normalizeCommissionRate(agent.fee_commission_rate, 0)
              ).toFixed(4),
            );
            const lossCommissionBase = Math.max(0, -pnl);
            const lossCommissionAmount = Number(
              (
                lossCommissionBase *
                normalizeCommissionRate(agent.loss_commission_rate, 0)
              ).toFixed(4),
            );

            if (feeCommissionAmount > 0) {
              commissionRows.push({
                agent_id: agent.id,
                user_id: position.user_id,
                source_type: "trade_fee",
                source_id: position.id,
                amount: feeCommissionAmount,
              });
            }
            if (lossCommissionAmount > 0) {
              commissionRows.push({
                agent_id: agent.id,
                user_id: position.user_id,
                source_type: "loss",
                source_id: position.id,
                amount: lossCommissionAmount,
              });
            }

            if (commissionRows.length > 0) {
              const { error: commissionError } = await supabaseAdmin
                .from("agent_commissions")
                .insert(commissionRows);
              if (commissionError) commissionWarning = commissionError.message;
            }
          }
        } catch {
          commissionWarning = "Commission recording failed";
        }
      }

      // Recalculate cross liquidation prices for remaining positions
      if (position.margin_mode !== "isolated") {
        const { data: updatedProfile } = await supabaseAdmin
          .from("user_profiles")
          .select("futures_balance")
          .eq("id", position.user_id)
          .maybeSingle();
        if (updatedProfile) {
          await recalculateCrossLiquidationPrices(
            supabaseAdmin,
            position.user_id,
            Number(updatedProfile.futures_balance ?? 0),
          ).catch(() => {});
        }
      }

      return NextResponse.json({
        success: true,
        action,
        exitPrice,
        pnl,
        fee: closeFee,
        returnedAmount,
        message: "포지션을 청산했습니다.",
        commissionWarning,
      });
    }

    if (position.refund_processed_at) {
      return NextResponse.json(
        { error: "이미 환급 처리된 거래입니다." },
        { status: 400 },
      );
    }

    const refundTotal = Number((margin + fee).toFixed(4));
    const nextStatus = position.status === "open" ? "closed" : position.status;
    const { data: lockedRefund, error: lockError } = await supabaseAdmin
      .from("futures_positions")
      .update({
        status: nextStatus,
        exit_price:
          position.status === "open"
            ? position.entry_price
            : position.exit_price,
        pnl: position.status === "open" ? 0 : position.pnl,
        closed_at: position.closed_at || now,
        refund_processed_at: now,
        refunded_amount: margin,
        refunded_fee: fee,
        admin_action_note: note,
      })
      .eq("id", resolvedPositionId)
      .is("refund_processed_at", null)
      .select("id")
      .maybeSingle();

    if (lockError) {
      return NextResponse.json({ error: lockError.message }, { status: 500 });
    }

    if (!lockedRefund) {
      return NextResponse.json(
        { error: "이미 환급 처리된 거래입니다." },
        { status: 400 },
      );
    }

    const { data: balanceResult, error: balanceError } =
      await supabaseAdmin.rpc("adjust_futures_balance", {
        p_user_id: position.user_id,
        p_amount: refundTotal,
        p_reason: `admin_trade_refund_${resolvedPositionId}`,
      });

    if (balanceError || !balanceResult?.success) {
      await supabaseAdmin
        .from("futures_positions")
        .update({
          refund_processed_at: null,
          refunded_amount: null,
          refunded_fee: null,
          admin_action_note: position.admin_action_note || null,
          status: position.status,
          exit_price: position.exit_price,
          pnl: position.pnl,
          closed_at: position.closed_at,
        })
        .eq("id", resolvedPositionId);

      return NextResponse.json(
        {
          error:
            balanceError?.message ||
            balanceResult?.error ||
            "Failed to refund balance",
        },
        { status: 500 },
      );
    }

    // Recalculate cross liquidation prices after refund
    if (position.margin_mode !== "isolated") {
      const { data: updatedProfile } = await supabaseAdmin
        .from("user_profiles")
        .select("futures_balance")
        .eq("id", position.user_id)
        .maybeSingle();
      if (updatedProfile) {
        await recalculateCrossLiquidationPrices(
          supabaseAdmin,
          position.user_id,
          Number(updatedProfile.futures_balance ?? 0),
        ).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      action,
      refundedAmount: refundTotal,
      message: "거래 담보금과 수수료를 전액 환급했습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
