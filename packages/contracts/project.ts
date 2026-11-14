export const sectionOrder = ["problem", "impact", "solution", "proof", "value"] as const;
export type SectionId = (typeof sectionOrder)[number];
export const sectionNames = {
  problem: "问题",
  impact: "影响",
  solution: "方案",
  proof: "实证",
  value: "价值",
};
const shares = [15, 10, 15, 50, 10];

export type Draft = {
  title: string;
  introduction: string;
  repository: string;
  productUrl: string;
  targetDurationMs: number;
  language: string;
  stylePresetRef: "editorial" | "minimal";
  narration: Record<SectionId, string>;
};

export type Project = Draft & {
  schemaVersion: "1.0";
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  output: {
    targetDurationMs: number;
    competitionMaxDurationMs: number;
    width: number;
    height: number;
    timebase: { fpsNum: number; fpsDen: number };
    videoCodec: "h264";
    audioCodec: "aac";
    container: "mp4";
  };
  sections: { id: SectionId; revision: number; budgetMs: number; narrationText: string }[];
};
export type Job = {
  id: string;
  projectId: string;
  inputRevision: number;
  state: "queued" | "running" | "succeeded" | "failed";
  attempt: number;
  createdAt: string;
  error: string | null;
};
export const emptyDraft = (): Draft => ({
  title: "",
  introduction: "",
  repository: "",
  productUrl: "",
  targetDurationMs: 150000,
  language: "auto",
  stylePresetRef: "editorial",
  narration: { problem: "", impact: "", solution: "", proof: "", value: "" },
});
export function initialBudgets(ms: number) {
  let percent = 0,
    previous = 0;
  return shares.map((share) => {
    percent += share;
    const end = Math.round((ms * percent) / 100);
    const budget = end - previous;
    previous = end;
    return budget;
  });
}
export function editable(p: Draft): Draft {
  const {
    title,
    introduction,
    repository,
    productUrl,
    targetDurationMs,
    language,
    stylePresetRef,
    narration,
  } = p;
  return {
    title,
    introduction,
    repository,
    productUrl,
    targetDurationMs,
    language,
    stylePresetRef,
    narration,
  };
}

const string = (maxLength: number) => ({ type: "string", maxLength });
const properties = {
  title: { ...string(160), pattern: "\\S" },
  introduction: string(100000),
  repository: string(2048),
  productUrl: { ...string(2048), pattern: "^(?:$|https?://[^\\s]+$)" },
  targetDurationMs: { type: "integer", minimum: 120000, maximum: 180000 },
  language: { enum: ["auto", "zh", "en", "ja"] },
  stylePresetRef: { enum: ["editorial", "minimal"] },
  narration: {
    type: "object",
    additionalProperties: false,
    required: sectionOrder,
    properties: Object.fromEntries(sectionOrder.map((id) => [id, string(12000)])),
  },
};
export const draftSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
};
export const revisionSchema = { type: "integer", minimum: 1 };
export const editSchema = {
  type: "object",
  additionalProperties: false,
  required: ["expectedRevision", "draft"],
  properties: { expectedRevision: revisionSchema, draft: draftSchema },
};
