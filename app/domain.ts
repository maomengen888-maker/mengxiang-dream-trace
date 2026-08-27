import { z } from "zod";

export const pageStates = [
  "drafting",
  "transcript_review",
  "symbol_review",
  "clarifying",
  "processing",
  "result",
  "card",
] as const;

export const PageStateSchema = z.enum(pageStates);
export type PageState = z.infer<typeof PageStateSchema>;

export const VerificationStatusSchema = z.enum(["verified", "pending", "disputed"]);

export const KnowledgeEntrySchema = z.object({
  entryId: z.string().min(1),
  symbol: z.string().min(1),
  aliases: z.array(z.string()),
  relatedSymbols: z.array(z.object({ symbol: z.string(), reason: z.string().min(1) })),
  conditions: z.array(z.string()),
  originalText: z.string(),
  modernInterpretation: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceLocation: z.string(),
  edition: z.string().min(1),
  verificationStatus: VerificationStatusSchema,
  verifiedBy: z.string(),
  verifiedAt: z.string(),
  notes: z.string(),
}).superRefine((entry, context) => {
  if (entry.verificationStatus !== "verified") return;

  const required: Array<[keyof typeof entry, string]> = [
    ["originalText", "已核验条目必须有原文"],
    ["sourceLocation", "已核验条目必须记录具体叶面与栏位"],
    ["verifiedBy", "已核验条目必须记录核验人"],
    ["verifiedAt", "已核验条目必须记录核验日期"],
  ];

  required.forEach(([field, message]) => {
    if (!String(entry[field]).trim()) {
      context.addIssue({ code: "custom", path: [field], message });
    }
  });
});

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

const StringArraySchema = z.array(z.string());

export const DreamStructureSchema = z.object({
  dreamId: z.string().min(1),
  inputRevision: z.number().int().positive(),
  confirmedText: z.string().min(1).max(1000),
  scene: StringArraySchema,
  characters: StringArraySchema,
  objects: StringArraySchema,
  actions: StringArraySchema,
  emotions: StringArraySchema,
  relations: StringArraySchema,
  uncertainFields: StringArraySchema,
  userEdits: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })),
});

export type DreamStructure = z.infer<typeof DreamStructureSchema>;

export const InterpretationSchema = z.object({
  interpretationId: z.string().min(1),
  inputRevision: z.number().int().positive(),
  title: z.string().min(1),
  dreamSummary: z.string().min(1),
  coreStatement: z.string().min(1),
  certaintyLevel: z.enum(["clear", "reserved", "associative"]),
  knowledgeBaseVersion: z.string().min(1),
  workflowVersion: z.string().min(1),
  evidenceEntryIds: z.array(z.string()),
  uncertaintyNotes: z.array(z.string()),
  safetyNotice: z.string().min(1),
});

export type Interpretation = z.infer<typeof InterpretationSchema>;

export const CardSpecSchema = z.object({
  inputRevision: z.number().int().positive(),
  interpretationId: z.string().min(1),
  title: z.string().min(1),
  coreStatement: z.string().min(1),
  visualElements: z.array(z.string()),
  style: z.literal("幽暗水墨"),
  excludedContent: z.array(z.string()),
  fallbackTemplate: z.literal("ink-texture-01"),
});

export type CardSpec = z.infer<typeof CardSpecSchema>;

export const AppSessionSchema = z.object({
  schemaVersion: z.literal(1),
  step: PageStateSchema,
  draftText: z.string().max(1000),
  transcriptText: z.string().max(1000),
  inputRevision: z.number().int().positive(),
  structure: DreamStructureSchema.nullable(),
  clarificationAnswer: z.string(),
  interpretation: InterpretationSchema.nullable(),
  card: CardSpecSchema.nullable(),
  updatedAt: z.string(),
});

export type AppSession = z.infer<typeof AppSessionSchema>;

export const P3908_SOURCE = {
  sourceId: "bnf-pelliot-chinois-3908",
  title: "新集周公解梦书",
  shelfmark: "Pelliot chinois 3908 (P.3908)",
  holdingInstitution: "法国国家图书馆 · 手稿部",
  catalogUrl: "https://archivesetmanuscrits.bnf.fr/ark:/12148/cc1205597",
  digitizationUrl: "https://gallica.bnf.fr/ark:/12148/btv1b8300230n",
  verificationStatus: "source_selected" as const,
};

function pendingEntry(entryId: string, symbol: string, modernInterpretation: string): KnowledgeEntry {
  return KnowledgeEntrySchema.parse({
    entryId,
    symbol,
    aliases: [],
    relatedSymbols: [],
    conditions: [],
    originalText: "",
    modernInterpretation,
    sourceTitle: "敦煌写本 P.3908《新集周公解梦书》",
    sourceLocation: "待逐页核验",
    edition: "Pelliot chinois 3908 · BnF 数字影像",
    verificationStatus: "pending",
    verifiedBy: "",
    verifiedAt: "",
    notes: "主版本已确认；尚未完成具体叶面、栏位与原文核验，不得展示为直接记载。",
  });
}

export const P3908_KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  pendingEntry("p3908-snake-001", "蛇", "待对照写本确认与蛇相关条目的原文和适用条件。"),
  pendingEntry("p3908-well-001", "井", "待对照写本确认与井相关条目的原文和适用条件。"),
  pendingEntry("p3908-water-001", "水", "待对照写本确认与水相关条目的原文和适用条件。"),
  pendingEntry("p3908-mirror-001", "镜", "待对照写本确认与镜相关条目的原文和适用条件。"),
  pendingEntry("p3908-house-001", "宅", "待对照写本确认与家宅相关条目的原文和适用条件。"),
  pendingEntry("p3908-fire-001", "火", "待对照写本确认与火相关条目的原文和适用条件。"),
  pendingEntry("p3908-sun-001", "日", "待对照写本确认与日相关条目的原文和适用条件。"),
  pendingEntry("p3908-moon-001", "月", "待对照写本确认与月相关条目的原文和适用条件。"),
  pendingEntry("p3908-tree-001", "树", "待对照写本确认与树木相关条目的原文和适用条件。"),
  pendingEntry("p3908-flight-001", "飞", "待对照写本确认与飞行相关条目的原文和适用条件。"),
];

function includesAny(text: string, candidates: string[]) {
  return candidates.some((candidate) => text.includes(candidate));
}

export function extractDreamStructure(
  confirmedText: string,
  inputRevision = 1,
  dreamId = "demo-normal-001",
): DreamStructure {
  const text = confirmedText.trim();
  const objects = [
    ...(text.includes("蛇") ? ["蛇"] : []),
    ...(text.includes("古井") ? ["古井"] : text.includes("古镜") ? ["古镜"] : []),
  ];

  return DreamStructureSchema.parse({
    dreamId,
    inputRevision,
    confirmedText: text,
    scene: [
      ...(includesAny(text, ["旧宅", "宅"] ) ? ["旧宅"] : []),
      ...(includesAny(text, ["夜里", "夜晚", "夜"] ) ? ["夜晚"] : []),
    ],
    characters: [
      "自己",
      ...(includesAny(text, ["陌生老人", "老人"] ) ? ["陌生老人"] : []),
    ],
    objects,
    actions: [
      ...(text.includes("盘") ? ["蛇盘在井边"] : []),
      ...(text.includes("靠近") ? ["自己主动靠近"] : []),
    ],
    emotions: [
      ...(text.includes("害怕") ? ["害怕"] : []),
      ...(includesAny(text, ["好奇", "忍不住"] ) ? ["好奇"] : []),
    ],
    relations: objects.includes("蛇") && objects.includes("古井") ? ["蛇靠近古井"] : [],
    uncertainFields: objects.includes("蛇") ? ["蛇是否具有攻击性"] : [],
    userEdits: confirmedText.includes("古井") ? [{ field: "objects", from: "古镜", to: "古井" }] : [],
  });
}

export function candidateEntriesFor(structure: DreamStructure) {
  const terms = new Set([
    ...structure.objects,
    ...structure.scene,
    ...structure.actions,
  ].flatMap((term) => term.includes("古井") ? [term, "井"] : term.includes("旧宅") ? [term, "宅"] : [term]));

  return P3908_KNOWLEDGE_ENTRIES.filter((entry) => terms.has(entry.symbol));
}

export function createInterpretation(
  structure: DreamStructure,
  clarificationAnswer: string,
): Interpretation {
  const candidates = candidateEntriesFor(structure);
  const verified = candidates.filter((entry) => entry.verificationStatus === "verified");
  const uncertaintyNotes = [
    ...(clarificationAnswer === "记不清" || !clarificationAnswer
      ? ["蛇是否攻击仍不明确，因此不能给出较明确结论。"]
      : []),
    ...(verified.length === 0
      ? ["P.3908 主版本已经确定，但相关条目尚未完成叶面与栏位核验，本次不标记为直接记载。"]
      : []),
  ];

  const interpretation = {
    interpretationId: `interpretation-${structure.dreamId}-r${structure.inputRevision}`,
    inputRevision: structure.inputRevision,
    title: structure.objects.includes("古井") && structure.objects.includes("蛇") ? "井畔之蛇" : "昨夜之象",
    dreamSummary: structure.confirmedText,
    coreStatement:
      clarificationAnswer === "有"
        ? "梦里的靠近伴随明确威胁，传统意象只能提供警醒式联想，不代表现实事件将会发生。"
        : "恐惧与好奇同时出现，像是在邀请你重新看清一件尚未靠近的事。",
    certaintyLevel: clarificationAnswer === "记不清" || !clarificationAnswer ? "associative" : "reserved",
    knowledgeBaseVersion: "p3908-bnf-poc-v1",
    workflowVersion: "fixture-workflow-v1",
    evidenceEntryIds: verified.map((entry) => entry.entryId),
    uncertaintyNotes,
    safetyNotice: "内容基于传统文化资料生成，仅供文化娱乐与个人记录，不构成医疗、心理、法律或投资建议。",
  } satisfies Interpretation;

  return InterpretationSchema.parse(interpretation);
}

const sensitivePattern = /(1\d{10}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|身份证|住址|姓名)/i;

export function createCardSpec(
  structure: DreamStructure,
  interpretation: Interpretation,
): CardSpec {
  const visualElements = [...structure.scene, ...structure.objects]
    .filter((element) => !sensitivePattern.test(element))
    .slice(0, 4);

  return CardSpecSchema.parse({
    inputRevision: interpretation.inputRevision,
    interpretationId: interpretation.interpretationId,
    title: interpretation.title,
    coreStatement: interpretation.coreStatement,
    visualElements,
    style: "幽暗水墨",
    excludedContent: ["真实姓名", "联系方式", "精确位置", "完整梦境文本"],
    fallbackTemplate: "ink-texture-01",
  });
}

export function reviseSession(session: AppSession, structure: DreamStructure): AppSession {
  const inputRevision = session.inputRevision + 1;
  return AppSessionSchema.parse({
    ...session,
    step: "symbol_review",
    inputRevision,
    structure: { ...structure, inputRevision },
    clarificationAnswer: "",
    interpretation: null,
    card: null,
    updatedAt: new Date().toISOString(),
  });
}

const allowedTelemetryProperties = new Set([
  "input_mode",
  "was_edited",
  "low_confidence_count",
  "edited_count",
  "deleted_count",
  "question_id",
  "answer_type",
  "certainty_level",
  "direct_count",
  "similar_count",
  "conflict_count",
  "entry_id",
  "verification_status",
  "style",
  "used_fallback",
  "action_type",
]);

export function safeTelemetry(name: string, properties: Record<string, string | number | boolean>) {
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowedTelemetryProperties.has(key)),
  );
  return { name, properties: safeProperties };
}
