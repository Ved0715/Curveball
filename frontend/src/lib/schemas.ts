import { z } from "zod";

/* Setup options (must match backend/app/schemas.py) */
export const LEVELS = [
  "Intern / fresher",
  "Junior (1–3 yrs)",
  "Mid-level (3–6 yrs)",
  "Senior (6+ yrs)",
  "Lead / manager",
] as const;

export const ROUNDS = [
  "Mixed (like a real first round)",
  "Behavioral",
  "Technical concepts",
  "Coding (talk through your approach)",
  "System design",
  "HR and culture fit",
  "Product sense / case",
] as const;

export const STYLES = ["Friendly", "Neutral", "Tough"] as const;
export const COUNTS = [4, 7, 10] as const;

export const SetupSchema = z.object({
  role: z.string().trim().min(1, "Add the role you're interviewing for.").max(200),
  company: z.string().max(200),
  level: z.enum(LEVELS),
  round: z.enum(ROUNDS),
  style: z.enum(STYLES),
  question_count: z.union([z.literal(4), z.literal(7), z.literal(10)]),
  jd: z.string().max(60000),
  resume: z.string().max(60000),
});
export type Setup = z.infer<typeof SetupSchema>;

export const DEFAULT_SETUP: Setup = {
  role: "",
  company: "",
  level: "Junior (1–3 yrs)",
  round: "Mixed (like a real first round)",
  style: "Neutral",
  question_count: 7,
  jd: "",
  resume: "",
};

/* Model outputs, validated again on the client before we render them */
export const BriefSchema = z.object({
  company: z.object({
    summary: z.string(),
    values: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  focus: z.array(z.string()),
  strengths: z.array(z.object({ point: z.string(), evidence: z.string() })),
  gaps: z.array(z.object({ point: z.string(), how: z.string() })),
  questions: z.array(z.object({ q: z.string(), why: z.string(), tip: z.string() })),
  stories: z.array(z.object({ theme: z.string(), use: z.string() })),
  askThem: z.array(z.string()),
});
export type Brief = z.infer<typeof BriefSchema>;

export const TurnKindSchema = z.enum(["question", "followup", "clarify", "closing"]);
export type TurnKind = z.infer<typeof TurnKindSchema>;

export const InterviewStateSchema = z.object({
  main_asked: z.number().int().min(0),
  followup_used: z.boolean(),
  done: z.boolean(),
});
export type InterviewState = z.infer<typeof InterviewStateSchema>;

export const TurnResultSchema = z.object({
  kind: TurnKindSchema,
  say: z.string().min(1),
  state: InterviewStateSchema,
});
export type TurnResult = z.infer<typeof TurnResultSchema>;

export const TurnSchema = z.object({
  speaker: z.enum(["interviewer", "candidate"]),
  text: z.string(),
  kind: TurnKindSchema.nullish(),
  answer_seconds: z.number().int().nullish(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const HintResultSchema = z.object({ text: z.string() });

const score10 = z.number().min(0).max(10);

export const SCORE_KEYS = ["Content", "Structure", "Specificity", "Communication", "Role fit"] as const;

export const ReportSchema = z.object({
  overall: z.number().min(0).max(100),
  verdict: z.enum(["Strong hire", "Hire", "Borderline", "Not yet"]),
  summary: z.string(),
  scores: z.object({
    Content: score10,
    Structure: score10,
    Specificity: score10,
    Communication: score10,
    "Role fit": score10,
  }),
  strengths: z.array(z.string()),
  fixes: z.array(z.object({ issue: z.string(), how: z.string() })),
  answers: z.array(
    z.object({
      question: z.string(),
      score: score10,
      worked: z.string(),
      missing: z.string(),
      better: z.string(),
    }),
  ),
  drills: z.array(z.string()),
});
export type Report = z.infer<typeof ReportSchema>;

/* What the server read from the resume (every fact is grounded in the resume text) */
export const ResumeProfileSchema = z.object({
  headline: z.string(),
  years_experience: z.number().nullable(),
  experience: z.array(
    z.object({ company: z.string(), title: z.string(), period: z.string(), highlights: z.array(z.string()) }),
  ),
  projects: z.array(z.object({ name: z.string(), summary: z.string(), tech: z.array(z.string()), impact: z.string() })),
  skills: z.array(z.string()),
  metrics: z.array(z.object({ value: z.string(), context: z.string() })),
  education: z.array(z.string()),
});
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

/* Server resources */
export const SessionSchema = z.object({
  id: z.string(),
  setup: SetupSchema,
  interviewer: z.string(),
  status: z.enum(["setup", "brief", "live", "done"]),
  state: InterviewStateSchema,
  brief: BriefSchema.nullable(),
  resume_profile: ResumeProfileSchema.nullable(),
  turns: z.array(TurnSchema),
  report: ReportSchema.nullable(),
  created_at: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const HistoryItemSchema = z.object({
  id: z.string(),
  role: z.string(),
  company: z.string(),
  round: z.string(),
  level: z.string(),
  style: z.string(),
  interviewer: z.string(),
  date: z.string(),
  overall: z.number(),
  verdict: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

/* ---------- Accounts ---------- */
export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  timezone: z.string(),
  created_at: z.string(),
  /** False for accounts made with Google that haven't set a password. */
  has_password: z.boolean().default(true),
});
export type User = z.infer<typeof UserSchema>;

/* ---------- Learning ---------- */
export const LessonSchema = z.object({
  tldr: z.string(),
  explanation: z.array(z.string()),
  key_points: z.array(z.string()),
  example: z.object({ title: z.string(), body: z.string() }),
  pitfalls: z.array(z.string()),
  check: z.array(z.object({ question: z.string(), answer: z.string() })),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const AssignmentSchema = z.object({
  id: z.string(),
  date: z.string(),
  topic_id: z.string().nullable(),
  category: z.string(),
  title: z.string(),
  blurb: z.string(),
  explore: z.array(z.string()),
  source: z.string(),
  completed: z.boolean(),
  assigned_at: z.string(),
  completed_at: z.string().nullable(),
  note: z.string().nullable(),
  lesson: LessonSchema.nullable(),
  check_done: z.boolean(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const TodaySchema = z.object({
  today: z.string(),
  assignment: AssignmentSchema.nullable(),
  streak: z.number(),
  longest: z.number(),
  queue_count: z.number(),
});
export type Today = z.infer<typeof TodaySchema>;

export const QueueItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  blurb: z.string(),
  source: z.string(),
  session_id: z.string().nullable(),
  created_at: z.string(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const PrefsSchema = z.object({ focus_areas: z.array(z.string()) });

export const LevelSchema = z.object({
  level: z.number(),
  title: z.string(),
  xp: z.number(),
  level_start: z.number(),
  next_level: z.number(),
  progress: z.number(),
});

export const ProgressSchema = z.object({
  today: z.string(),
  level: LevelSchema,
  streak: z.number(),
  longest: z.number(),
  learned_total: z.number(),
  interviews_total: z.number(),
  shipped_total: z.number().default(0),
  avg_score: z.number().nullable(),
  best_score: z.number().nullable(),
  rate_30: z.number(),
  calendar: z.array(
    z.object({
      date: z.string(),
      learned: z.boolean(),
      title: z.string().nullable(),
      category: z.string().nullable(),
      interviews: z.number(),
    }),
  ),
  balance_30: z.record(z.string(), z.number()),
  balance_all: z.record(z.string(), z.number()),
  score_trend: z.array(z.object({ date: z.string(), overall: z.number() })),
});
export type Progress = z.infer<typeof ProgressSchema>;

/* ---------- Bullpen (Work world) ---------- */
export const WORK_STATUSES = [
  "open",
  "in_progress",
  "partial",
  "decision_needed",
  "blocked",
  "done",
  "not_an_issue",
] as const;
export const WorkStatusSchema = z.enum(WORK_STATUSES);
export type WorkStatus = z.infer<typeof WorkStatusSchema>;

export const WorkProgressSchema = z.object({
  leaves: z.number(),
  done: z.number(),
  in_progress: z.number(),
  blocked: z.number(),
  decision_needed: z.number(),
  nodes: z.number(),
});
export type WorkProgress = z.infer<typeof WorkProgressSchema>;

export const WorkSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  repo: z.string(),
  status: z.enum(["active", "resolved", "archived"]),
  node_budget: z.number(),
  max_depth: z.number(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  progress: WorkProgressSchema.optional(),
});
export type WorkSession = z.infer<typeof WorkSessionSchema>;

export const WorkNodeSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  position: z.number(),
  depth: z.number(),
  title: z.string(),
  problem_statement: z.string(),
  root_cause: z.string(),
  code_description: z.string(),
  solution_description: z.string(),
  files: z.array(z.string()),
  status: WorkStatusSchema,
  is_leaf: z.boolean(),
  depends_on: z.array(z.string()),
  owner: z.string().nullable(),
  claimed_at: z.string().nullable(),
  tags: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"]).nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  acceptance_criteria: z.array(z.string()),
  artifacts: z.record(z.string(), z.string()),
  notes: z.array(z.object({ at: z.string(), actor: z.string(), text: z.string() })),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
});
export type WorkNode = z.infer<typeof WorkNodeSchema>;

export const WorkTreeSchema = z.object({
  session: WorkSessionSchema,
  nodes: z.array(WorkNodeSchema),
  ready: z.array(z.string()),
  last_event_id: z.number(),
});
export type WorkTree = z.infer<typeof WorkTreeSchema>;

export const WorkEventSchema = z.object({
  id: z.number(),
  node_id: z.string().nullable(),
  actor: z.string(),
  kind: z.string(),
  detail: z.record(z.string(), z.unknown()),
  created_at: z.string().nullable(),
});
export type WorkEvent = z.infer<typeof WorkEventSchema>;

export const ApiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  /** Present only in the create response: the one time the raw token is shown. */
  token: z.string().optional(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;
