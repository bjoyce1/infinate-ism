import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------- Command Overview ----------------

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);

    const [tasks, projects, clients, alerts, activity, followups, comms, events, finance] = await Promise.all([
      sb.from("tasks").select("id,title,status,priority,due_date,project_id").eq("user_id", context.userId).neq("status", "done").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
      sb.from("projects").select("id,name,status,priority,deadline,next_action,revenue_potential_cents,client_id,ai_summary").eq("user_id", context.userId).order("updated_at", { ascending: false }).limit(50),
      sb.from("clients").select("id,name,company,follow_up_date,payment_status,budget_cents,is_archived").eq("user_id", context.userId).eq("is_archived", false).order("follow_up_date", { ascending: true, nullsFirst: false }).limit(50),
      sb.from("cc_alerts").select("*").eq("user_id", context.userId).eq("is_read", false).order("created_at", { ascending: false }).limit(20),
      sb.from("cc_activity").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(15),
      sb.from("cc_followups").select("*").eq("user_id", context.userId).eq("is_resolved", false).order("due_date", { ascending: true, nullsFirst: false }).limit(20),
      sb.from("cc_communications").select("id,source,sender,subject,snippet,category,urgency,client_id,project_id,received_at,is_demo").eq("user_id", context.userId).eq("is_handled", false).order("urgency", { ascending: false }).limit(20),
      sb.from("capism_events").select("id,kind,node_label,created_at").order("created_at", { ascending: false }).limit(10),
      sb.from("cc_finance_alerts").select("*").eq("user_id", context.userId).eq("is_resolved", false).order("due_date", { ascending: true, nullsFirst: false }).limit(15),
    ]);

    const tasksList = tasks.data ?? [];
    const dueToday = tasksList.filter((t) => t.due_date === todayISO);
    const overdue = tasksList.filter((t) => t.due_date && t.due_date < todayISO);
    const projectsList = projects.data ?? [];

    return {
      today: todayISO,
      metrics: {
        urgent: alerts.data?.filter((a) => a.severity === "critical").length ?? 0,
        dueToday: dueToday.length,
        clientsWaiting: (clients.data ?? []).filter((c) => c.follow_up_date && c.follow_up_date <= todayISO).length,
        activeProjects: projectsList.filter((p) => p.status === "active").length,
        overdue: overdue.length,
        pipelineCents: projectsList.reduce((n, p) => n + (Number(p.revenue_potential_cents) || 0), 0),
        upcomingMeetings: 0,
        actionableComms: (comms.data ?? []).length,
      },
      tasks: tasksList,
      dueToday,
      overdue,
      projects: projectsList,
      clients: clients.data ?? [],
      alerts: alerts.data ?? [],
      activity: activity.data ?? [],
      followups: followups.data ?? [],
      comms: comms.data ?? [],
      events: events.data ?? [],
      finance: finance.data ?? [],
    };
  });

// ---------------- Generic list fetchers ----------------

export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cc_communications")
      .select("*")
      .eq("user_id", context.userId)
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*, client:clients(id,name,company)")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*, project:projects(id,name)")
      .eq("user_id", context.userId)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  });

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notes")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const listEvents = createServerFn({ method: "GET" })
  .handler(async () => {
    // capism_events are shared/global — public read via admin policy
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("capism_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const listContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cc_content_items")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cc_finance_alerts")
      .select("*")
      .eq("user_id", context.userId)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  });

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cc_automation_rules")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listConnectors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cc_connectors")
      .select("*")
      .eq("user_id", context.userId);
    if (error) throw error;
    return data ?? [];
  });

// ---------------- Mutations ----------------

export const upsertAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(200),
      description: z.string().optional().nullable(),
      trigger: z.record(z.string(), z.any()).default({}),
      conditions: z.array(z.any()).default([]),
      actions: z.array(z.any()).default([]),
      status: z.enum(["active", "paused", "error"]).default("paused"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = { ...data, user_id: context.userId };
    const { data: out, error } = await context.supabase
      .from("cc_automation_rules")
      .upsert(row)
      .select()
      .single();
    if (error) throw error;
    return out;
  });

export const toggleAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cc_automation_rules")
      .update({ status: data.enabled ? "active" : "paused" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("cc_alerts").update({ is_read: true }).eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const updateInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      category: z.enum(["urgent","needs_reply","needs_decision","waiting","finance_security","fyi","noise"]).optional(),
      is_handled: z.boolean().optional(),
      draft: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    await context.supabase.from("cc_communications").update(patch).eq("id", id).eq("user_id", context.userId);
    return { ok: true };
  });

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const uid = context.userId;

    // Only seed if not already present
    const existing = await sb.from("cc_communications").select("id").eq("user_id", uid).eq("is_demo", true).limit(1);
    if ((existing.data ?? []).length > 0) return { seeded: false };

    const now = new Date();
    const iso = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3600_000).toISOString();

    await sb.from("cc_communications").insert([
      { user_id: uid, source: "gmail", sender: "atlantic.records@example.com", subject: "Sync licensing terms — need signature", snippet: "Attaching redlined SOW. Can you sign and return by Friday?", category: "needs_decision", urgency: 90, is_demo: true, received_at: iso(-2), suggested_action: "Review redlines and countersign" },
      { user_id: uid, source: "gmail", sender: "cap@houston.com", subject: "Feature verse — deadline tomorrow", snippet: "We're locked in for tomorrow 6pm at Screwed Up Studios. Track attached.", category: "urgent", urgency: 95, is_demo: true, received_at: iso(-4), suggested_action: "Confirm arrival + preview track" },
      { user_id: uid, source: "slack", sender: "#business-ops", subject: "Q4 marketing budget request", snippet: "Draft budget ready for your review — $18.4k proposed.", category: "needs_reply", urgency: 60, is_demo: true, received_at: iso(-6) },
      { user_id: uid, source: "gmail", sender: "billing@vercel.com", subject: "Payment failed on Pro plan", snippet: "Your card ending 4242 was declined. Please update.", category: "finance_security", urgency: 80, is_demo: true, received_at: iso(-24) },
      { user_id: uid, source: "gmail", sender: "press@rollingstone.com", subject: "Interview request", snippet: "We'd like to feature C.A.P.I.S.M. in an upcoming issue.", category: "needs_decision", urgency: 70, is_demo: true, received_at: iso(-30) },
    ]);

    await sb.from("cc_alerts").insert([
      { user_id: uid, severity: "critical", title: "Payment declined on Vercel Pro", body: "Update the card on file to avoid deployment suspension.", source: "finance" },
      { user_id: uid, severity: "warning", title: "3 clients waiting > 5 days", body: "Draft follow-ups from the Clients module.", source: "clients" },
      { user_id: uid, severity: "info", title: "New content opportunity detected", body: "Recent meeting notes contain 4 quotable takeaways.", source: "content" },
    ]);

    await sb.from("cc_finance_alerts").insert([
      { user_id: uid, kind: "subscription", label: "Adobe Creative Cloud renews", amount_cents: 5999, vendor: "Adobe", due_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString().slice(0, 10), severity: "info", is_demo: true },
      { user_id: uid, kind: "invoice_overdue", label: "Invoice #2041 — Atlantic Records", amount_cents: 750000, vendor: "Atlantic Records", due_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4).toISOString().slice(0, 10), severity: "warning", is_demo: true },
      { user_id: uid, kind: "payment_failed", label: "Vercel Pro — card declined", amount_cents: 2000, vendor: "Vercel", severity: "critical", is_demo: true },
    ]);

    await sb.from("cc_content_items").insert([
      { user_id: uid, title: "Behind the scenes at Screwed Up Studios", hook: "24 hours in the studio that built Houston's sound.", format: "short_video", stage: "idea", platforms: ["instagram","tiktok","youtube"], is_demo: true },
      { user_id: uid, title: "5 lessons from 20 years in the game", format: "article", stage: "draft", platforms: ["substack","linkedin"], is_demo: true },
      { user_id: uid, title: "Weekly drop — Friday release", format: "social_post", stage: "scheduled", platforms: ["twitter","instagram"], scheduled_for: iso(48), is_demo: true },
    ]);

    await sb.from("cc_followups").insert([
      { user_id: uid, title: "Awaiting mastering files from engineer", waiting_on: "Mike @ Studio B", due_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10) },
      { user_id: uid, title: "Legal review of licensing agreement", waiting_on: "Attorney Reed", due_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().slice(0, 10) },
    ]);

    await sb.from("cc_activity").insert([
      { user_id: uid, kind: "system", summary: "C.A.P.I.S.M. Command Center initialized with demo data" },
      { user_id: uid, kind: "content", summary: "3 sample content opportunities added to pipeline" },
      { user_id: uid, kind: "inbox", summary: "5 sample communications loaded across categories" },
    ]);

    const starterRules = [
      { name: "Urgent client email → task + alert", description: "When an email from a known client scores urgent, create a task and push an alert." },
      { name: "Quote request → opportunity", description: "Detect quote/pricing questions and log as revenue opportunity." },
      { name: "Meeting ended → notes processing task", description: "After a calendar event ends, queue a summarization task." },
      { name: "Task overdue → escalate", description: "Overdue tasks surface on Command Overview as critical alerts." },
      { name: "No client reply in 5 days → follow-up", description: "Auto-create a follow-up when a client thread goes silent." },
      { name: "Content-tagged note → content opportunity", description: "Notes tagged #content become items in the content pipeline." },
      { name: "Friday → weekly closure review", description: "Every Friday, generate a weekly review brief." },
    ];
    await sb.from("cc_automation_rules").insert(
      starterRules.map((r) => ({ ...r, user_id: uid, status: "paused" as const, is_starter: true, trigger: {}, conditions: [], actions: [] })),
    );

    return { seeded: true };
  });

// ---------------- AI Chief of Staff ----------------

export const askChiefOfStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ prompt: z.string().min(1).max(4000), history: z.array(z.object({ role: z.enum(["user","assistant","system"]), content: z.string() })).default([]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [tasks, projects, clients, comms, followups] = await Promise.all([
      sb.from("tasks").select("title,status,priority,due_date").eq("user_id", context.userId).neq("status", "done").limit(30),
      sb.from("projects").select("name,status,priority,deadline,next_action,ai_summary").eq("user_id", context.userId).limit(30),
      sb.from("clients").select("name,company,follow_up_date,payment_status").eq("user_id", context.userId).eq("is_archived", false).limit(30),
      sb.from("cc_communications").select("source,sender,subject,category,urgency,received_at").eq("user_id", context.userId).eq("is_handled", false).order("urgency", { ascending: false }).limit(15),
      sb.from("cc_followups").select("title,waiting_on,due_date").eq("user_id", context.userId).eq("is_resolved", false).limit(15),
    ]);

    const grounding = {
      tasks: tasks.data,
      projects: projects.data,
      clients: clients.data,
      inbox: comms.data,
      followups: followups.data,
    };

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { text: "AI Chief of Staff is not configured — LOVABLE_API_KEY missing." };
    }
    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are C.A.P.I.S.M. Chief of Staff, an elite executive assistant for Mr. CAP.
Voice: sharp, calm, decisive, warm but not fluffy. Use short paragraphs and tight bullet lists.
Ground every answer in the grounding JSON below. If the answer requires connector data you do not have (Gmail, Google Calendar, Google Drive, Slack, Notion), say so plainly and suggest what to connect.
Never invent client names, amounts, deadlines, or emails that aren't in the grounding data.

GROUNDING:
${JSON.stringify(grounding).slice(0, 8000)}`;

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      messages: [
        ...data.history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
        { role: "user" as const, content: data.prompt },
      ],
    });

    return { text };
  });

// need this import last so the file is a module
import { generateText } from "ai";