import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
const uuid = z.string().uuid();
const priority = z.enum(["low", "medium", "high", "urgent"]);
const projectStatus = z.enum(["active", "paused", "completed", "archived"]);
const taskStatus = z.enum(["todo", "doing", "done", "blocked"]);
const captureType = z.enum([
  "note", "idea", "voice", "link", "client_note", "project_thought",
  "lyrics", "business_idea", "file", "ai_prompt", "screenshot",
]);
const captureStatus = z.enum(["inbox", "processed", "archived"]);

// ---------- dashboard snapshot ----------
export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [projects, tasks, captures, clients, areas, notes] = await Promise.all([
      supabase.from("projects").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
      supabase.from("tasks").select("*").eq("user_id", userId).in("status", ["todo", "doing"]).order("due_date", { ascending: true, nullsFirst: false }).limit(50),
      supabase.from("captures").select("*").eq("user_id", userId).eq("status", "inbox").order("created_at", { ascending: false }).limit(10),
      supabase.from("clients").select("*").eq("user_id", userId).eq("is_archived", false),
      supabase.from("areas").select("*").eq("user_id", userId).eq("is_archived", false),
      supabase.from("notes").select("*").eq("user_id", userId).eq("is_archived", false).order("updated_at", { ascending: false }).limit(100),
    ]);
    return {
      projects: projects.data ?? [],
      tasks: tasks.data ?? [],
      captures: captures.data ?? [],
      clients: clients.data ?? [],
      areas: areas.data ?? [],
      notes: notes.data ?? [],
    };
  });

// ---------- captures ----------
export const listCaptures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: captureStatus.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("captures").select("*").eq("user_id", context.userId).order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const createCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().max(500).default(""),
    body: z.string().max(20000).optional(),
    type: captureType.default("note"),
    priority: priority.default("medium"),
    tags: z.array(z.string()).default([]),
    source_url: z.string().url().optional().nullable(),
    project_id: uuid.optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("captures")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid,
    patch: z.object({
      title: z.string().max(500).optional(),
      body: z.string().max(20000).optional().nullable(),
      status: captureStatus.optional(),
      priority: priority.optional(),
      next_action: z.string().max(1000).optional().nullable(),
      project_id: uuid.optional().nullable(),
      type: captureType.optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("captures")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("captures").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- projects ----------
export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects").select("*, area:areas(id,name,color), client:clients(id,name)")
      .eq("user_id", context.userId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [proj, tasks, notes, captures] = await Promise.all([
      supabase.from("projects").select("*, area:areas(id,name,color), client:clients(id,name)").eq("id", data.id).eq("user_id", userId).single(),
      supabase.from("tasks").select("*").eq("project_id", data.id).eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("notes").select("*").eq("project_id", data.id).eq("user_id", userId).order("updated_at", { ascending: false }),
      supabase.from("captures").select("*").eq("project_id", data.id).eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    if (proj.error) throw new Error(proj.error.message);
    return { project: proj.data, tasks: tasks.data ?? [], notes: notes.data ?? [], captures: captures.data ?? [] };
  });

export const upsertProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(200),
    goal: z.string().max(2000).optional().nullable(),
    status: projectStatus.default("active"),
    priority: priority.default("medium"),
    deadline: z.string().optional().nullable(),
    next_action: z.string().max(1000).optional().nullable(),
    area_id: uuid.optional().nullable(),
    client_id: uuid.optional().nullable(),
    revenue_potential_cents: z.number().int().optional().nullable(),
    color: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    const q = data.id
      ? context.supabase.from("projects").update(payload).eq("id", data.id).eq("user_id", context.userId).select().single()
      : context.supabase.from("projects").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- tasks ----------
export const upsertTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    project_id: uuid.optional().nullable(),
    title: z.string().min(1).max(500),
    description: z.string().max(4000).optional().nullable(),
    status: taskStatus.default("todo"),
    priority: priority.default("medium"),
    due_date: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      ...data,
      user_id: context.userId,
      completed_at: data.status === "done" ? new Date().toISOString() : null,
    };
    const q = data.id
      ? context.supabase.from("tasks").update(payload).eq("id", data.id).eq("user_id", context.userId).select().single()
      : context.supabase.from("tasks").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: taskStatus }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .update({ status: data.status, completed_at: data.status === "done" ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- areas ----------
export const listAreas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("areas").select("*").eq("user_id", context.userId).order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    color: z.string().max(20).optional().nullable(),
    icon: z.string().max(40).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    const q = data.id
      ? context.supabase.from("areas").update(payload).eq("id", data.id).eq("user_id", context.userId).select().single()
      : context.supabase.from("areas").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("areas").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- clients ----------
export const listClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("clients").select("*").eq("user_id", context.userId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    name: z.string().min(1).max(200),
    company: z.string().max(200).optional().nullable(),
    website: z.string().max(500).optional().nullable(),
    email: z.string().max(200).optional().nullable(),
    phone: z.string().max(100).optional().nullable(),
    budget_cents: z.number().int().optional().nullable(),
    payment_status: z.enum(["none","unpaid","partial","paid","overdue"]).default("none"),
    deliverables: z.string().max(4000).optional().nullable(),
    follow_up_date: z.string().optional().nullable(),
    notes: z.string().max(8000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    const q = data.id
      ? context.supabase.from("clients").update(payload).eq("id", data.id).eq("user_id", context.userId).select().single()
      : context.supabase.from("clients").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- notes ----------
export const upsertNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    title: z.string().min(1).max(300),
    content: z.string().max(20000).optional().nullable(),
    project_id: uuid.optional().nullable(),
    area_id: uuid.optional().nullable(),
    tags: z.array(z.string()).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    const q = data.id
      ? context.supabase.from("notes").update(payload).eq("id", data.id).eq("user_id", context.userId).select().single()
      : context.supabase.from("notes").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notes").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- prompts ----------
export const listPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("prompts").select("*").eq("user_id", context.userId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: uuid.optional(),
    title: z.string().min(1).max(200),
    category: z.string().max(80).optional().nullable(),
    platform: z.string().max(80).optional().nullable(),
    prompt: z.string().min(1).max(20000),
    use_case: z.string().max(2000).optional().nullable(),
    rating: z.number().int().min(1).max(5).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    const q = data.id
      ? context.supabase.from("prompts").update(payload).eq("id", data.id).eq("user_id", context.userId).select().single()
      : context.supabase.from("prompts").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("prompts").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });