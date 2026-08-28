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

  if (/(待|尚未|未核验)/.test(entry.sourceLocation)) {
    context.addIssue({ code: "custom", path: ["sourceLocation"], message: "已核验条目不能使用待核验位置" });
  }
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

export type ClarificationKind = "snake_attack" | "water_position";

export const InterpretationSchema = z.object({
  interpretationId: z.string().min(1),
  inputRevision: z.number().int().positive(),
  title: z.string().min(1),
  dreamSummary: z.string().min(1),
  coreStatement: z.string().min(1),
  detailedReading: z.string().min(1),
  oneLineSummary: z.string().min(1),
  focusPoints: z.array(z.string().min(1)).min(1),
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
  detailedReading: z.string().min(1),
  oneLineSummary: z.string().min(1),
  focusPoints: z.array(z.string().min(1)).min(1),
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

export const UNVERIFIED_RELATED_REFERENCES: KnowledgeEntry[] = [
  KnowledgeEntrySchema.parse({
    entryId: "related-falling-001",
    symbol: "从高处坠落",
    aliases: ["悬崖坠落", "从高坠地"],
    relatedSymbols: [],
    conditions: ["从高处坠落", "已经坠地"],
    originalText: "梦见从高坠地，大凶。",
    modernInterpretation: "仅作为网络整理文本中的相近占辞；在完成底本、页叶与原文核验前，不得据此确断吉凶。",
    sourceTitle: "网络整理文本（待与敦煌写本核验）",
    sourceLocation: "尚未确切归到 P.3908 的具体页叶",
    edition: "待与 BnF P.3908 原件或郑炳林《敦煌写本解梦书校录研究》核对",
    verificationStatus: "pending",
    verifiedBy: "",
    verifiedAt: "",
    notes: "梦境为落地前惊醒，不满足整理文本中“坠地”的完整条件；不得标为 P.3908 已核验。",
  }),
];

export function isDisplayVerifiedEntry(entry: KnowledgeEntry) {
  return entry.verificationStatus === "verified"
    && Boolean(entry.originalText.trim())
    && Boolean(entry.sourceTitle.trim())
    && Boolean(entry.sourceLocation.trim())
    && !/(待|尚未|未核验)/.test(entry.sourceLocation);
}

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
    ...(text.includes("悬崖") ? ["悬崖"] : []),
    ...(includesAny(text, ["牙齿", "牙"]) ? ["牙齿"] : []),
    ...(includesAny(text, ["手机", "屏幕"]) ? ["手机屏幕"] : []),
    ...(text.includes("水") ? ["水"] : []),
    ...(text.includes("雾") ? ["雾"] : []),
  ];

  const waterPositionIsAmbiguous = text.includes("水面")
    && !includesAny(text, ["岸边", "水中", "水里", "走进水", "进入水"]);

  return DreamStructureSchema.parse({
    dreamId,
    inputRevision,
    confirmedText: text,
    scene: [
      ...(includesAny(text, ["旧宅", "宅"] ) ? ["旧宅"] : []),
      ...(includesAny(text, ["夜里", "夜晚", "夜"] ) ? ["夜晚"] : []),
      ...(text.includes("悬崖边") ? ["悬崖边"] : []),
      ...(text.includes("水里") ? ["水中"] : []),
    ],
    characters: [
      "自己",
      ...(includesAny(text, ["陌生老人", "老人"] ) ? ["陌生老人"] : []),
    ],
    objects,
    actions: [
      ...(text.includes("盘") ? ["蛇盘在井边"] : []),
      ...(text.includes("靠近") ? ["自己主动靠近"] : []),
      ...(includesAny(text, ["追着我", "被蛇追", "蛇追"]) ? ["被蛇追赶"] : []),
      ...(includesAny(text, ["往下坠", "掉了下去", "坠落"]) ? ["从高处坠落"] : []),
      ...(includesAny(text, ["牙齿一颗颗", "牙齿掉落"]) ? ["牙齿掉落"] : []),
      ...(includesAny(text, ["屏幕碎", "手机碎", "手机屏幕裂"]) ? ["手机屏幕碎裂"] : []),
      ...(includesAny(text, ["迷路", "找不到回去"]) ? ["在水中迷路"] : []),
    ],
    emotions: [
      ...(text.includes("害怕") ? ["害怕"] : []),
      ...(includesAny(text, ["好奇", "忍不住"] ) ? ["好奇"] : []),
      ...(includesAny(text, ["惊醒", "拼命", "发不出声音", "找不到"]) ? ["紧张"] : []),
    ],
    relations: objects.includes("蛇") && objects.includes("古井") ? ["蛇靠近古井"] : [],
    uncertainFields: [
      ...(objects.includes("蛇") ? ["蛇是否具有攻击性"] : []),
      ...(waterPositionIsAmbiguous ? ["自己与水面的位置关系"] : []),
    ],
    userEdits: [],
  });
}

export function clarificationKindFor(structure: DreamStructure): ClarificationKind | null {
  if (structure.objects.includes("蛇")) return "snake_attack";
  if (structure.uncertainFields.includes("自己与水面的位置关系")) return "water_position";
  return null;
}

export function candidateEntriesFor(structure: DreamStructure) {
  const terms = new Set([
    ...structure.objects,
    ...structure.scene,
    ...structure.actions,
  ].flatMap((term) => term.includes("古井") ? [term, "井"] : term.includes("旧宅") ? [term, "宅"] : [term]));

  return [...P3908_KNOWLEDGE_ENTRIES, ...UNVERIFIED_RELATED_REFERENCES]
    .filter((entry) => terms.has(entry.symbol));
}

export function createInterpretation(
  structure: DreamStructure,
  clarificationAnswer: string,
): Interpretation {
  const candidates = candidateEntriesFor(structure);
  const verified = candidates.filter(isDisplayVerifiedEntry);
  const hasSnake = structure.objects.includes("蛇");
  const isChase = structure.actions.includes("被蛇追赶");
  const isFalling = structure.actions.includes("从高处坠落");
  const isTeeth = structure.actions.includes("牙齿掉落");
  const isPhone = structure.actions.includes("手机屏幕碎裂") || structure.objects.includes("手机屏幕");
  const isWater = structure.actions.includes("在水中迷路") || structure.objects.includes("水");
  const isAmbiguousWater = structure.uncertainFields.includes("自己与水面的位置关系");
  const uncertaintyNotes = [
    ...(hasSnake && (clarificationAnswer === "记不清" || !clarificationAnswer)
      ? ["蛇是否攻击仍不明确，因此不能给出较明确结论。"]
      : []),
    ...(candidates.length === 0
      ? ["演示知识库暂无直接记载；本次不强行类比，也不会伪造古籍原文。"]
      : isFalling
      ? ["相近占辞的底本归属与 P.3908 具体页叶尚未核验，且梦境没有满足“已经坠地”的条件，因此暂不确断吉凶。"]
      : verified.length === 0
      ? ["相关条目尚未完成来源、原文与页叶核验，本次不标记为直接记载，也不生成确定判词。"]
      : []),
  ];

  const nonSnakeReading = isPhone
    ? {
        title: "碎屏之梦",
        coreStatement: "演示知识库暂无“手机屏幕碎裂”的直接记载，这里只保留现代生活经验中的自我观察线索。",
        detailedReading: "手机与屏幕属于现代物件，不能伪装成 P.3908 的古籍条目，也不会为了得到一个好看的答案而强行关联到“镜”。如果只从你的梦境事实出发，碎裂的屏幕可以提醒你留意近期沟通、连接或边界是否让你感到脆弱；这只是联想，不是预言。",
        oneLineSummary: "一句话总结：古籍没有直接答案；把碎屏当作沟通与边界的自我观察线索即可。",
        focusPoints: ["最近哪段沟通让你感到脆弱", "区分真实发生与梦中联想", "不确定时保留没有答案的空间"],
      }
    : isFalling
    ? {
        title: "坠而未落，凶象未成",
        coreStatement: "传统判断：部分匹配，暂不确断吉凶。",
        detailedReading: "你梦见自己从悬崖坠下，但在落地前惊醒。敦煌梦书网络整理文本中有相近占辞：“梦见从高坠地，大凶。”关键差异在于：该条目描述的是“已经坠地”，而你的梦停在坠落途中。因此，本次只能识别为“从高处坠落”的相近梦象，不能直接套用“大凶”的结论。",
        oneLineSummary: "古籍有“从高坠地，大凶”之说；但此梦未曾落地，只属相近梦象，不作确断。",
        focusPoints: ["命中梦象：从高处坠落", "匹配类型：相近条目", "未满足条件：没有落地"],
      }
    : isTeeth
      ? {
          title: "齿落无声",
          coreStatement: "牙齿掉落和无法出声同时出现，梦的重心更像是表达、体面与无力感。",
          detailedReading: "牙齿在日常体验里与外观、表达和掌控有关；一颗颗松动，会把“某些事正在失去原有稳定”的感觉放大。想说却说不出，则值得留意近期是否有未表达的担心或需求。它不是身体诊断，也不预示会发生损失。",
          oneLineSummary: "一句话总结：牙落是稳定感在松动，无声是表达受阻；先说清一件真正在意的事。",
          focusPoints: ["最近有什么话一直没说出口", "你正在担心哪种评价或失去", "用一句简单的话提出需求"],
        }
      : isWater
        ? {
            title: isAmbiguousWater ? "水面未明" : "雾水迷途",
            coreStatement: isAmbiguousWater
              ? clarificationAnswer === "岸边"
                ? "你停在岸边观察水面，梦的重心更接近面对未知前的犹豫与判断。"
                : clarificationAnswer === "水中"
                  ? "你已经身处水中，梦的重心更接近被情绪或处境包围时寻找方向。"
                  : "你与水面的位置仍记不清，因此这次只保留多种可能，不替你补全梦境。"
              : "深水、雾和迷路共同指向一种“情绪很深，方向还不清楚”的体验。",
            detailedReading: isAmbiguousWater
              ? clarificationAnswer === "岸边"
                ? "站在岸边意味着你仍与水保持距离：可以看见变化，却还没有决定是否进入。它更适合用来观察近期某个尚在评估的选择。P.3908 的相关条目仍待逐页核验，因此这里只做有保留的综合说明。"
                : clarificationAnswer === "水中"
                  ? "身在水中会放大行动受阻和方向不清的感觉。它更适合用来观察近期是否已经卷入一件难以抽身的事，并提醒自己先寻找可返回的边界。P.3908 的相关条目仍待逐页核验。"
                  : "因为你记不清自己在岸边还是水中，我们同时保留“尚未进入”和“已经卷入”两种可能。与其追求唯一答案，不如先确认醒来后最明显的情绪。"
              : "水会让行动变慢，雾会缩短能看清的距离，找不到回路则把不确定感集中在一起。这个梦不必被解读成凶兆，它更像在提醒：当下不用一次看清整条路，先确认离自己最近的一个方向即可。",
            oneLineSummary: isAmbiguousWater
              ? clarificationAnswer === "岸边"
                ? "一句话总结：岸边是观望，水面是未知；先看清边界，再决定是否进入。"
                : clarificationAnswer === "水中"
                  ? "一句话总结：身在水中，先找边界；不用一次看清整条路。"
                  : "一句话总结：位置未明，解释也应留白；先辨认醒来后最真实的感受。"
              : "一句话总结：水是情绪深度，雾是信息不足；不求看清全程，先确认下一步。",
            focusPoints: ["当下最模糊的决定是什么", "哪个信息能让你多看清一点", "为自己留一个可以返回的边界"],
          }
        : {
            title: "昨夜之象",
            coreStatement: "这个梦更适合作为自我观察的线索，而不是对现实的预言。",
            detailedReading: "已确认的场景、动作和感受仍有空白，因此本次只保留联想性解释。可以先回想梦里最清晰的一帧，再对照近期生活中有没有相似的情绪。",
            oneLineSummary: "一句话总结：先记住画面，再辨认感受；不必急着为梦下结论。",
            focusPoints: ["梦里最清晰的画面", "醒来后留下的情绪", "近期是否有相似体验"],
          };

  const interpretation = {
    interpretationId: `interpretation-${structure.dreamId}-r${structure.inputRevision}`,
    inputRevision: structure.inputRevision,
    title: hasSnake ? (isChase ? "蛇影追逐" : structure.objects.includes("古井") ? "井畔之蛇" : "蛇影之梦") : nonSnakeReading.title,
    dreamSummary: structure.confirmedText,
    coreStatement: !hasSnake ? nonSnakeReading.coreStatement : isChase
      ? "被蛇追赶很容易让人带着恐惧醒来，它更像对持续压力或边界感的放大，不是现实危险的预告。" :
      clarificationAnswer === "有"
        ? "梦里的靠近伴随明确威胁，重点是重新确认边界，而不是预言现实会发生坏事。"
        : "别被井边的蛇吓到：它没有攻击，你仍愿意靠近，梦的重点更像是如何面对未知。",
    detailedReading: !hasSnake ? nonSnakeReading.detailedReading : isChase
      ? "追逐的关键不在蛇最终代表什么，而在你一直逃跑却无法拉开距离。它可以用来观察近期是否有一件反复逼近、又一直没有处理的事。梦不能预测凶吉；比起继续奔跑，更值得确认自己需要哪种距离、支持或明确边界。" :
      clarificationAnswer === "有"
        ? "蛇的主动靠近让这个梦带有更强的边界提醒。旧宅像熟悉却积压已久的生活背景，古井指向被保存的情绪或记忆，陌生老人则像一个让你放慢观察的角色。梦不能预测现实，但它可能在提醒你：最近若有一件事让你感到被逼近，不必马上对抗，也不要忽略不适；先拉开安全距离、说清界限，再决定是否继续。"
        : clarificationAnswer === "记不清" || !clarificationAnswer
          ? "你记得蛇、古井和靠近，却不确定蛇是否具有攻击性，因此不适合把它说成明确的吉凶。旧宅像熟悉的过去，古井像尚未说清的深层感受，蛇则保留着警觉与变化的双重意味。先把最近让你既担心又好奇的事情写下来，确认事实，再判断是否值得靠近。"
          : "蛇没有主动攻击，你却在害怕中仍愿意靠近，这让梦的重点从“危险”转向“如何面对未知”。旧宅像熟悉却沉积已久的生活背景，古井指向被保存的情绪或记忆，陌生老人更像一个提醒你放慢、观察的角色。真正值得留意的，不是它预示坏事，而是你最近是否正在接近一件既担心又好奇的事。蛇盘在井边而未攻击，说明紧张仍处在可观察、可设边界的阶段；先确认边界，再靠近答案。",
    oneLineSummary: !hasSnake ? nonSnakeReading.oneLineSummary : isChase
      ? "一句话总结：蛇影是压力，追逐是边界被逼近；先停下来辨认它，再选择如何拉开距离。" :
      clarificationAnswer === "有"
        ? "一句话总结：旧宅是积压，古井是深处，蛇的靠近是边界提醒；先退到安全处，再决定下一步。"
        : clarificationAnswer === "记不清" || !clarificationAnswer
          ? "一句话总结：梦意仍有空白；先分清事实与担心，再决定要不要靠近。"
          : "一句话总结：旧宅是过去，古井是深处，蛇是警觉；带着边界感靠近，答案会比恐惧更清楚。",
    focusPoints: !hasSnake ? nonSnakeReading.focusPoints : isChase
      ? ["最近哪件事让你感到一直被追着", "你真正需要的安全距离", "向可信任的人说清压力所在"] :
      clarificationAnswer === "有"
        ? ["最近是否有人或事情越过你的边界", "先恢复安全距离", "把拒绝或需求说清楚"]
        : ["最近那件既担心又想靠近的事", "先确认自己的边界与安全感", "把好奇变成一次小而可控的行动"],
    certaintyLevel: hasSnake
      ? clarificationAnswer === "记不清" || !clarificationAnswer ? "associative" : "reserved"
      : isFalling
        ? "reserved"
      : isAmbiguousWater
        ? clarificationAnswer === "岸边" || clarificationAnswer === "水中" ? "reserved" : "associative"
        : "associative",
    knowledgeBaseVersion: "p3908-bnf-poc-v1",
    workflowVersion: "fixture-workflow-v1",
    evidenceEntryIds: verified.map((entry) => entry.entryId),
    uncertaintyNotes,
    safetyNotice: isFalling
      ? "内容基于传统梦文化资料，仅供文化娱乐与个人记录，不预示现实危险。"
      : "内容基于传统文化资料生成，仅供文化娱乐与个人记录，不构成医疗、心理、法律或投资建议。",
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

  const isFalling = structure.actions.includes("从高处坠落");

  return CardSpecSchema.parse({
    inputRevision: interpretation.inputRevision,
    interpretationId: interpretation.interpretationId,
    title: interpretation.title,
    coreStatement: interpretation.coreStatement,
    detailedReading: isFalling
      ? "古籍有“从高坠地，大凶”之说；但此梦未曾落地，只属相近梦象，不作确断。"
      : interpretation.detailedReading,
    oneLineSummary: isFalling
      ? "相近条目 · 出处核验完成后展示原文页叶"
      : interpretation.oneLineSummary,
    focusPoints: interpretation.focusPoints,
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
