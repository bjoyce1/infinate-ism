import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

function getKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY not configured");
  return k;
}

const ActionKind = z.enum(["summarize", "next_steps", "task_list", "email_draft", "sow"]);

const PROMPTS: Record<z.infer<typeof ActionKind>, string> = {
  summarize: "Summarize this project in 4-6 crisp bullet points. Focus on the goal, current state, and key blockers.",
  next_steps: "Given the project below, output the top 5 concrete next actions. Each action should be one short imperative sentence.",
  task_list: "Extract or invent a practical task list (max 10 items) to move this project forward. Format as a markdown checklist.",
  email_draft: "Draft a short, professional email the owner could send to their client to update them on this project. Use markdown with a subject line.",
  sow: "Write a lightweight Statement of Work in markdown for this project. Include: Overview, Scope, Deliverables, Timeline, Payment terms. Be concise.",
};

export const runProjectAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    project_id: z.string().uuid(),
    kind: ActionKind,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [proj, tasks, notes, captures] = await Promise.all([
      supabase.from("projects").select("*, area:areas(name), client:clients(name)").eq("id", data.project_id).eq("user_id", userId).single(),
      supabase.from("tasks").select("title,status,priority,due_date").eq("project_id", data.project_id).eq("user_id", userId),
      supabase.from("notes").select("title,content").eq("project_id", data.project_id).eq("user_id", userId),
      supabase.from("captures").select("title,body,type").eq("project_id", data.project_id).eq("user_id", userId),
    ]);
    if (proj.error) throw new Error(proj.error.message);
    const p = proj.data as { name: string; goal: string | null; status: string; priority: string; deadline: string | null; next_action: string | null; area: { name: string } | null; client: { name: string } | null };

    const context_str = [
      `Project: ${p.name}`,
      p.goal ? `Goal: ${p.goal}` : "",
      `Status: ${p.status} · Priority: ${p.priority}` + (p.deadline ? ` · Deadline: ${p.deadline}` : ""),
      p.area ? `Area: ${p.area.name}` : "",
      p.client ? `Client: ${p.client.name}` : "",
      p.next_action ? `Next action: ${p.next_action}` : "",
      "",
      tasks.data?.length ? "Tasks:\n" + tasks.data.map(t => `- [${t.status}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n") : "",
      notes.data?.length ? "Notes:\n" + notes.data.map(n => `- ${n.title ?? ""}: ${(n.content ?? "").slice(0, 400)}`).join("\n") : "",
      captures.data?.length ? "Captures:\n" + captures.data.map(c => `- (${c.type}) ${c.title}: ${(c.body ?? "").slice(0, 300)}`).join("\n") : "",
    ].filter(Boolean).join("\n");

    const gateway = createLovableAiGatewayProvider(getKey());
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: "You are the AI action panel of a premium Second Brain command center. Be concise, actionable, and formatted in markdown.",
      prompt: `${PROMPTS[data.kind]}\n\n---\n${context_str}`,
    });
    return { text, kind: data.kind };
  });

export const processCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cap, error } = await supabase.from("captures").select("*").eq("id", data.id).eq("user_id", userId).single();
    if (error) throw new Error(error.message);

    const gateway = createLovableAiGatewayProvider(getKey());
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: "You classify a raw capture from someone's inbox and suggest a next step. Respond as strict JSON with keys: title (short, punchy, <=80 chars), suggested_type (one of: note, idea, link, client_note, project_thought, lyrics, business_idea, ai_prompt), priority (low|medium|high|urgent), tags (array of 1-4 lowercase tags), next_action (one short imperative sentence).",
      prompt: `Capture:\nTitle: ${cap.title}\nBody: ${cap.body ?? ""}\nURL: ${cap.source_url ?? ""}\nCurrent type: ${cap.type}`,
    });
    let parsed: { title?: string; suggested_type?: string; priority?: string; tags?: string[]; next_action?: string } = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch { /* ignore */ }
    return parsed;
  });