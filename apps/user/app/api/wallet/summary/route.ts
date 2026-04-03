import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/server/siteSettings";
import {
  getUsdtKrwRate,
  getWithdrawalSettings,
} from "@/lib/utils/siteSettings";

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [depositResult, withdrawalResult, profileResult, settingsMap] =
      await Promise.all([
        supabaseAdmin
          .from("deposits")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("withdrawals")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("user_profiles")
          .select(
            "wallet_balance, available_balance, bank_name, bank_account, bank_account_holder",
          )
          .eq("id", user.id)
          .maybeSingle(),
        getSiteSettings(supabaseAdmin, [
          "usdt_krw_rate",
          "withdraw_fee",
          "min_withdraw",
          "daily_max_withdraw",
          "single_max_withdraw",
        ]),
      ]);

    if (depositResult.error) {
      return NextResponse.json(
        { error: depositResult.error.message },
        { status: 500 },
      );
    }

    if (withdrawalResult.error) {
      return NextResponse.json(
        { error: withdrawalResult.error.message },
        { status: 500 },
      );
    }

    if (profileResult.error) {
      return NextResponse.json(
        { error: profileResult.error.message },
        { status: 500 },
      );
    }

    const profile = profileResult.data;

    return NextResponse.json({
      success: true,
      deposits: depositResult.data ?? [],
      withdrawals: withdrawalResult.data ?? [],
      userPoints: Number(profile?.wallet_balance ?? 0),
      availablePoints: Number(
        profile?.available_balance ?? profile?.wallet_balance ?? 0,
      ),
      bankProfile: {
        bank: profile?.bank_name || "",
        accountNumber: profile?.bank_account || "",
        accountHolder: profile?.bank_account_holder || "",
      },
      usdtKrwRate: getUsdtKrwRate(settingsMap),
      withdrawalSettings: getWithdrawalSettings(settingsMap),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
