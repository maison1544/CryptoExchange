import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { formatDate, formatDateTime } from "@/lib/utils/formatDate";

type ContentResource = "inquiries" | "messages" | "popups";
type InquiryAction = "reply" | "close" | "delete";
type MessageAction = "send";
type PopupAction = "create" | "update" | "delete";

type SupportTicketRow = {
  id: number;
  user_id: string;
  title: string;
  status: "waiting" | "active" | "resolved";
  created_at: string;
  updated_at: string;
};

type SupportMessageRow = {
  id: number;
  ticket_id: number;
  sender_type: "user" | "admin";
  sender_id: string;
  content: string;
  created_at: string;
};

type UserProfileRow = {
  id: string;
  name: string;
  email: string;
};

type NotificationRow = {
  id: number;
  user_id: string;
  title: string;
  body: string | null;
  type: string | null;
  created_at: string;
};

type PopupRow = {
  id: number;
  title: string;
  content: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  target: "all" | "user" | "agent";
  created_at: string;
};

type PostBody = {
  resource?: ContentResource;
  action?: InquiryAction | MessageAction | PopupAction;
  ticketId?: number;
  ticketIds?: number[];
  content?: string;
  title?: string;
  target?: string;
  id?: number;
  imageUrl?: string;
  linkUrl?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  popupTarget?: "all" | "user" | "agent";
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
      error: NextResponse.json(
        { error: "Missing auth token" },
        { status: 401 },
      ),
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
      error: NextResponse.json(
        { error: "Invalid auth token" },
        { status: 401 },
      ),
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
      error: NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 },
      ),
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

function mapInquiryStatus(status: SupportTicketRow["status"]) {
  if (status === "active") return "answered" as const;
  if (status === "resolved") return "closed" as const;
  return "waiting" as const;
}

function mapPopupRow(row: PopupRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content || "",
    imageUrl: row.image_url || "",
    linkUrl: row.link_url || "",
    startDate: row.start_date ? formatDate(row.start_date) : "",
    endDate: row.end_date ? formatDate(row.end_date) : "",
    isActive: row.is_active,
    target: row.target,
    createdAt: formatDateTime(row.created_at),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.admin) {
    return NextResponse.json(
      { error: "Admin client unavailable" },
      { status: 500 },
    );
  }

  const resource = req.nextUrl.searchParams.get(
    "resource",
  ) as ContentResource | null;

  if (resource === "inquiries") {
    const [
      { data: ticketsData, error: ticketsError },
      { data: messagesData, error: messagesError },
    ] = await Promise.all([
      auth.admin
        .from("support_tickets")
        .select("id, user_id, title, status, created_at, updated_at")
        .order("created_at", { ascending: false }),
      auth.admin
        .from("support_messages")
        .select("id, ticket_id, sender_type, sender_id, content, created_at")
        .order("created_at", { ascending: true }),
    ]);

    if (ticketsError || messagesError) {
      return NextResponse.json(
        {
          error:
            ticketsError?.message ||
            messagesError?.message ||
            "Failed to load inquiries",
        },
        { status: 500 },
      );
    }

    const tickets = (ticketsData || []) as SupportTicketRow[];
    const messages = (messagesData || []) as SupportMessageRow[];
    const userIds = [...new Set(tickets.map((ticket) => ticket.user_id))];
    const { data: userData, error: userError } = userIds.length
      ? await auth.admin
          .from("user_profiles")
          .select("id, name, email")
          .in("id", userIds)
      : { data: [], error: null };

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    const userMap = new Map(
      ((userData || []) as UserProfileRow[]).map((user) => [user.id, user]),
    );
    const repliesByTicket = new Map<number, SupportMessageRow[]>();

    messages.forEach((message) => {
      const bucket = repliesByTicket.get(message.ticket_id) || [];
      bucket.push(message);
      repliesByTicket.set(message.ticket_id, bucket);
    });

    const inquiries = tickets.map((ticket) => {
      const ticketReplies = repliesByTicket.get(ticket.id) || [];
      const firstUserMessage =
        ticketReplies.find((message) => message.sender_type === "user") ||
        ticketReplies[0];
      const user = userMap.get(ticket.user_id);

      return {
        id: ticket.id,
        category: "etc" as const,
        title: ticket.title,
        content: firstUserMessage?.content || "문의 내용이 없습니다.",
        userName: user?.name || "알 수 없음",
        userId: user?.email || ticket.user_id,
        status: mapInquiryStatus(ticket.status),
        createdAt: formatDateTime(ticket.created_at),
        replies: ticketReplies.map((message) => ({
          id: message.id,
          writer: message.sender_type,
          content: message.content,
          createdAt: formatDateTime(message.created_at),
        })),
      };
    });

    return NextResponse.json({ inquiries });
  }

  if (resource === "messages") {
    const { data: notificationData, error: notificationError } =
      await auth.admin
        .from("notifications")
        .select("id, user_id, title, body, type, created_at")
        .eq("type", "admin_message")
        .order("created_at", { ascending: false })
        .limit(100);

    if (notificationError) {
      return NextResponse.json(
        { error: notificationError.message },
        { status: 500 },
      );
    }

    const notifications = (notificationData || []) as NotificationRow[];
    const userIds = [
      ...new Set(notifications.map((item) => item.user_id).filter(Boolean)),
    ];
    const { data: userData, error: userError } = userIds.length
      ? await auth.admin
          .from("user_profiles")
          .select("id, name, email")
          .in("id", userIds)
      : { data: [], error: null };

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    const userMap = new Map(
      ((userData || []) as UserProfileRow[]).map((user) => [user.id, user]),
    );
    const messages = notifications.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.body || "",
      target: userMap.get(item.user_id)?.email || item.user_id || "알 수 없음",
      sender: "관리자",
      date: formatDateTime(item.created_at),
    }));

    return NextResponse.json({ messages });
  }

  if (resource === "popups") {
    const { data, error } = await auth.admin
      .from("popups")
      .select(
        "id, title, content, image_url, link_url, is_active, start_date, end_date, target, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      popups: ((data || []) as PopupRow[]).map(mapPopupRow),
    });
  }

  return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.admin || !auth.userId) {
    return NextResponse.json(
      { error: "Admin client unavailable" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const resource = body?.resource;
  const action = body?.action;

  if (resource === "inquiries") {
    if (action === "delete") {
      const ticketIds = (body?.ticketIds || []).filter(
        (value): value is number => Number.isFinite(Number(value)),
      );

      if (ticketIds.length === 0) {
        return NextResponse.json(
          { error: "ticketIds required" },
          { status: 400 },
        );
      }

      const { error } = await auth.admin
        .from("support_tickets")
        .delete()
        .in("id", ticketIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        deletedCount: ticketIds.length,
      });
    }

    const ticketId = Number(body?.ticketId);

    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return NextResponse.json({ error: "ticketId required" }, { status: 400 });
    }

    const { data: ticket, error: ticketError } = await auth.admin
      .from("support_tickets")
      .select("id, user_id, title")
      .eq("id", ticketId)
      .maybeSingle<{ id: number; user_id: string; title: string }>();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    }

    if (action === "reply") {
      const content = body?.content?.trim() || "";

      if (!content) {
        return NextResponse.json(
          { error: "Reply content required" },
          { status: 400 },
        );
      }

      const now = new Date().toISOString();
      const [{ error: messageError }, { error: ticketUpdateError }] =
        await Promise.all([
          auth.admin.from("support_messages").insert({
            ticket_id: ticketId,
            sender_type: "admin",
            sender_id: auth.userId,
            content,
          }),
          auth.admin
            .from("support_tickets")
            .update({ status: "active", updated_at: now })
            .eq("id", ticketId),
        ]);

      if (messageError || ticketUpdateError) {
        return NextResponse.json(
          {
            error:
              messageError?.message ||
              ticketUpdateError?.message ||
              "Failed to reply inquiry",
          },
          { status: 500 },
        );
      }

      await auth.admin.from("notifications").insert({
        user_id: ticket.user_id,
        title: "문의 답변이 등록되었습니다.",
        body: `${ticket.title} 문의에 대한 답변이 등록되었습니다.`,
        type: "support",
      });

      return NextResponse.json({ success: true });
    }

    if (action === "close") {
      const { error } = await auth.admin
        .from("support_tickets")
        .update({ status: "resolved", updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await auth.admin.from("notifications").insert({
        user_id: ticket.user_id,
        title: "문의가 종료되었습니다.",
        body: `${ticket.title} 문의가 처리 완료되었습니다.`,
        type: "support",
      });

      return NextResponse.json({ success: true });
    }
  }

  if (resource === "messages" && action === "send") {
    const target = body?.target?.trim() || "";
    const title = body?.title?.trim() || "";
    const content = body?.content?.trim() || "";

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content required" },
        { status: 400 },
      );
    }

    let userIds: string[] = [];

    if (target) {
      const { data: user, error } = await auth.admin
        .from("user_profiles")
        .select("id")
        .eq("email", target)
        .maybeSingle<{ id: string }>();

      if (error || !user) {
        return NextResponse.json(
          { error: "Target user not found" },
          { status: 404 },
        );
      }

      userIds = [user.id];
    } else {
      const { data, error } = await auth.admin
        .from("user_profiles")
        .select("id");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      userIds = (data || []).map((user) => String((user as { id: string }).id));
    }

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: "No users to notify" },
        { status: 400 },
      );
    }

    const rows = userIds.map((userId) => ({
      user_id: userId,
      title,
      body: content,
      type: "admin_message",
    }));

    const { error } = await auth.admin.from("notifications").insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sentCount: rows.length });
  }

  if (resource === "popups") {
    const popupId = Number(body?.id);
    const title = body?.title?.trim() || "";
    const content = body?.content?.trim() || "";
    const imageUrl = body?.imageUrl?.trim() || null;
    const linkUrl = body?.linkUrl?.trim() || null;
    const startDate = body?.startDate?.trim() || null;
    const endDate = body?.endDate?.trim() || null;
    const isActive = Boolean(body?.isActive);
    const target = body?.target;

    if ((action === "create" || action === "update") && !title) {
      return NextResponse.json(
        { error: "Popup title required" },
        { status: 400 },
      );
    }

    if (
      (action === "create" || action === "update") &&
      target !== "all" &&
      target !== "user" &&
      target !== "agent"
    ) {
      return NextResponse.json(
        { error: "Invalid popup target" },
        { status: 400 },
      );
    }

    if (action === "create") {
      const { data, error } = await auth.admin
        .from("popups")
        .insert({
          title,
          content,
          image_url: imageUrl,
          link_url: linkUrl,
          start_date: startDate,
          end_date: endDate,
          is_active: isActive,
          target,
        })
        .select(
          "id, title, content, image_url, link_url, is_active, start_date, end_date, target, created_at",
        )
        .single<PopupRow>();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Failed to create popup" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, popup: mapPopupRow(data) });
    }

    if (action === "update") {
      if (!Number.isFinite(popupId) || popupId <= 0) {
        return NextResponse.json(
          { error: "Popup id required" },
          { status: 400 },
        );
      }

      const { data, error } = await auth.admin
        .from("popups")
        .update({
          title,
          content,
          image_url: imageUrl,
          link_url: linkUrl,
          start_date: startDate,
          end_date: endDate,
          is_active: isActive,
          target,
        })
        .eq("id", popupId)
        .select(
          "id, title, content, image_url, link_url, is_active, start_date, end_date, target, created_at",
        )
        .maybeSingle<PopupRow>();

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Failed to update popup" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, popup: mapPopupRow(data) });
    }

    if (action === "delete") {
      if (!Number.isFinite(popupId) || popupId <= 0) {
        return NextResponse.json(
          { error: "Popup id required" },
          { status: 400 },
        );
      }

      const { error } = await auth.admin
        .from("popups")
        .delete()
        .eq("id", popupId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, deletedId: popupId });
    }
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
