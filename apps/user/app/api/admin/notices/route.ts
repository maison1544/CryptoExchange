import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { NoticeCategory } from "@/lib/types/entities";
import { formatDate } from "@/lib/utils/formatDate";
import { formatDateTime } from "@/lib/utils/formatDate";

type NoticeAction = "create" | "update" | "delete" | "toggle-publish" | "toggle-pin";

type NoticeRow = {
  id: number;
  category: NoticeCategory;
  title: string;
  content: string;
  is_pinned: boolean;
  is_published: boolean;
  views: number | null;
  created_at: string;
  event_end_date: string | null;
};

type NoticeBody = {
  action?: NoticeAction;
  id?: number;
  ids?: number[];
  category?: NoticeCategory;
  title?: string;
  content?: string;
  isPinned?: boolean;
  eventEndDate?: string;
};

function getBearer(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length);
  }

  return authHeader;
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server config error");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

async function requireAdmin(req: NextRequest) {
  const jwt = getBearer(req);

  if (!jwt) {
    return {
      error: NextResponse.json({ error: "Missing auth token" }, { status: 401 }),
      admin: null,
      userId: null,
    } as const;
  }

  const admin = getAdminClient();
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: "Invalid auth token" }, { status: 401 }),
      admin: null,
      userId: null,
    } as const;
  }

  const { data: adminUser } = await admin
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminUser) {
    return {
      error: NextResponse.json({ error: "Admin privileges required" }, { status: 403 }),
      admin: null,
      userId: null,
    } as const;
  }

  return {
    error: null,
    admin,
    userId: user.id,
  } as const;
}

function mapNoticeRow(row: NoticeRow) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    author: "admin",
    isPinned: row.is_pinned,
    isPublished: row.is_published,
    views: row.views || 0,
    createdAt: formatDateTime(row.created_at),
    eventEndDate: row.event_end_date ? formatDate(row.event_end_date) : undefined,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.admin) {
    return NextResponse.json({ error: "Admin client unavailable" }, { status: 500 });
  }

  const { data, error } = await auth.admin
    .from("notices")
    .select("id, category, title, content, is_pinned, is_published, views, created_at, event_end_date")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notices: ((data || []) as NoticeRow[]).map(mapNoticeRow) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.admin) {
    return NextResponse.json({ error: "Admin client unavailable" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as NoticeBody | null;
  const action = body?.action;
  const noticeId = Number(body?.id);
  const category = body?.category;
  const title = body?.title?.trim() || "";
  const content = body?.content?.trim() || "";
  const isPinned = Boolean(body?.isPinned);
  const eventEndDate = body?.eventEndDate?.trim() || null;

  if (action === "delete") {
    const ids = (body?.ids || []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const { error } = await auth.admin.from("notices").delete().in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedCount: ids.length });
  }

  if (action === "toggle-publish" || action === "toggle-pin" || action === "update") {
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      return NextResponse.json({ error: "Notice id required" }, { status: 400 });
    }
  }

  if (action === "create" || action === "update") {
    if (
      category !== "announcement" &&
      category !== "event" &&
      category !== "maintenance" &&
      category !== "alert"
    ) {
      return NextResponse.json({ error: "Invalid notice category" }, { status: 400 });
    }

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content required" }, { status: 400 });
    }
  }

  if (action === "create") {
    const { data, error } = await auth.admin
      .from("notices")
      .insert({
        category,
        title,
        content,
        is_pinned: isPinned,
        is_published: true,
        views: 0,
        event_end_date: eventEndDate,
      })
      .select("id, category, title, content, is_pinned, is_published, views, created_at, event_end_date")
      .single<NoticeRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to create notice" }, { status: 500 });
    }

    return NextResponse.json({ success: true, notice: mapNoticeRow(data) });
  }

  if (action === "update") {
    const { data, error } = await auth.admin
      .from("notices")
      .update({
        category,
        title,
        content,
        is_pinned: isPinned,
        event_end_date: eventEndDate,
      })
      .eq("id", noticeId)
      .select("id, category, title, content, is_pinned, is_published, views, created_at, event_end_date")
      .maybeSingle<NoticeRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to update notice" }, { status: 500 });
    }

    return NextResponse.json({ success: true, notice: mapNoticeRow(data) });
  }

  if (action === "toggle-publish" || action === "toggle-pin") {
    const { data: current, error: currentError } = await auth.admin
      .from("notices")
      .select("id, category, title, content, is_pinned, is_published, views, created_at, event_end_date")
      .eq("id", noticeId)
      .maybeSingle<NoticeRow>();

    if (currentError || !current) {
      return NextResponse.json({ error: currentError?.message || "Notice not found" }, { status: 404 });
    }

    const patch =
      action === "toggle-publish"
        ? { is_published: !current.is_published }
        : { is_pinned: !current.is_pinned };

    const { data, error } = await auth.admin
      .from("notices")
      .update(patch)
      .eq("id", noticeId)
      .select("id, category, title, content, is_pinned, is_published, views, created_at, event_end_date")
      .maybeSingle<NoticeRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to update notice" }, { status: 500 });
    }

    return NextResponse.json({ success: true, notice: mapNoticeRow(data) });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
