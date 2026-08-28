import { describe, expect, it } from "vitest";
import {
  AppSession,
  CardSpecSchema,
  KnowledgeEntrySchema,
  P3908_KNOWLEDGE_ENTRIES,
  UNVERIFIED_RELATED_REFERENCES,
  candidateEntriesFor,
  clarificationKindFor,
  createCardSpec,
  createInterpretation,
  extractDreamStructure,
  isDisplayVerifiedEntry,
  reviseSession,
  safeTelemetry,
} from "../app/domain";

const confirmedDream =
  "夜里我在一座旧宅里，看见一条蛇盘在古井边，旁边站着一位陌生老人。我有点害怕，又忍不住靠近。";

describe("P.3908 知识条目边界", () => {
  it("提供至少十条待核验模板且不冒充直接记载", () => {
    expect(P3908_KNOWLEDGE_ENTRIES).toHaveLength(10);
    expect(P3908_KNOWLEDGE_ENTRIES.every((entry) => entry.verificationStatus === "pending")).toBe(true);
    expect(P3908_KNOWLEDGE_ENTRIES.every((entry) => entry.originalText === "")).toBe(true);
  });

  it("拒绝缺少原文和具体位置的 verified 条目", () => {
    const invalid = { ...P3908_KNOWLEDGE_ENTRIES[0], verificationStatus: "verified" };
    expect(() => KnowledgeEntrySchema.parse(invalid)).toThrow();
  });

  it("来源、原文或页叶未齐全时不允许显示为已核验", () => {
    const pendingLocation = {
      ...UNVERIFIED_RELATED_REFERENCES[0],
      verificationStatus: "verified" as const,
      verifiedBy: "tester",
      verifiedAt: "2026-08-28",
    };
    expect(() => KnowledgeEntrySchema.parse(pendingLocation)).toThrow();
    expect(isDisplayVerifiedEntry(UNVERIFIED_RELATED_REFERENCES[0])).toBe(false);
  });
});

describe("梦境结构与修订", () => {
  it("直接使用用户提交的古井且不伪造转写纠错", () => {
    const structure = extractDreamStructure(confirmedDream);
    expect(structure.objects).toContain("古井");
    expect(structure.objects).not.toContain("古镜");
    expect(structure.userEdits).toEqual([]);
  });

  it("候选条目保持 pending，解释不会生成直接证据", () => {
    const structure = extractDreamStructure(confirmedDream);
    const candidates = candidateEntriesFor(structure);
    const result = createInterpretation(structure, "没有");
    expect(candidates.length).toBeGreaterThan(0);
    expect(result.evidenceEntryIds).toEqual([]);
    expect(result.uncertaintyNotes.join(" ")).toContain("尚未完成来源、原文与页叶核验");
  });

  it("记不清时不能得到较明确信号", () => {
    const result = createInterpretation(extractDreamStructure(confirmedDream), "记不清");
    expect(result.certaintyLevel).toBe("associative");
  });

  it("快捷梦境使用各自的结构与解释，不套用蛇与古井", () => {
    const falling = extractDreamStructure("我梦见自己从悬崖边掉了下去，一直往下坠，快落地时惊醒了。");
    const teeth = extractDreamStructure("我梦见自己的牙齿一颗颗松动掉落，想说话却发不出声音。");
    const water = extractDreamStructure("我梦见自己走进很深的水里，四周起雾，怎么也找不到回去的方向。");
    expect(createInterpretation(falling, "").title).toBe("坠而未落，凶象未成");
    expect(createInterpretation(teeth, "").title).toBe("齿落无声");
    expect(createInterpretation(water, "").title).toBe("雾水迷途");
    expect(createInterpretation(falling, "").detailedReading).not.toContain("蛇");
  });

  it("落地前惊醒只匹配相近条目且不套用大凶结论", () => {
    const structure = extractDreamStructure("我梦见自己从悬崖边掉了下去，一直往下坠，快落地时惊醒了。");
    const result = createInterpretation(structure, "");
    const card = createCardSpec(structure, result);
    expect(candidateEntriesFor(structure)[0].verificationStatus).toBe("pending");
    expect(result.coreStatement).toBe("传统判断：部分匹配，暂不确断吉凶。");
    expect(result.evidenceEntryIds).toEqual([]);
    expect(result.detailedReading).toContain("不能直接套用“大凶”的结论");
    expect(card.detailedReading).toContain("此梦未曾落地");
    expect(card.oneLineSummary).toBe("相近条目 · 出处核验完成后展示原文页叶");
  });

  it("模糊水面只追问一个位置问题，并让明确回答改变确定性", () => {
    const structure = extractDreamStructure("我梦见眼前是一片看不清的水面，四周很安静。");
    expect(clarificationKindFor(structure)).toBe("water_position");
    expect(structure.uncertainFields).toContain("自己与水面的位置关系");

    const shore = createInterpretation(structure, "岸边");
    const water = createInterpretation(structure, "水中");
    const unknown = createInterpretation(structure, "记不清");
    expect(shore.certaintyLevel).toBe("reserved");
    expect(water.certaintyLevel).toBe("reserved");
    expect(unknown.certaintyLevel).toBe("associative");
    expect(shore.coreStatement).not.toBe(water.coreStatement);
  });

  it("现代手机碎屏路径返回无直接出处，不强行关联古镜", () => {
    const structure = extractDreamStructure("我梦见手机屏幕突然碎裂，所有消息都看不清了。");
    const result = createInterpretation(structure, "");
    expect(structure.objects).toContain("手机屏幕");
    expect(candidateEntriesFor(structure)).toEqual([]);
    expect(result.title).toBe("碎屏之梦");
    expect(result.uncertaintyNotes.join(" ")).toContain("暂无直接记载");
    expect(result.detailedReading).not.toContain("古镜");
  });

  it("返回纠正会递增修订号并清除旧解释与卡片", () => {
    const structure = extractDreamStructure(confirmedDream);
    const interpretation = createInterpretation(structure, "没有");
    const card = createCardSpec(structure, interpretation);
    const session: AppSession = {
      schemaVersion: 1,
      step: "result",
      draftText: confirmedDream,
      transcriptText: confirmedDream,
      inputRevision: 1,
      structure,
      clarificationAnswer: "没有",
      interpretation,
      card,
      updatedAt: new Date().toISOString(),
    };

    const revised = reviseSession(session, structure);
    expect(revised.inputRevision).toBe(2);
    expect(revised.structure?.inputRevision).toBe(2);
    expect(revised.interpretation).toBeNull();
    expect(revised.card).toBeNull();
  });
});

describe("卡片与埋点隐私", () => {
  it("卡片只消费脱敏元素并记录排除内容", () => {
    const structure = extractDreamStructure(confirmedDream);
    const card = createCardSpec(structure, createInterpretation(structure, "没有"));
    expect(() => CardSpecSchema.parse(card)).not.toThrow();
    expect(card.excludedContent).toContain("完整梦境文本");
    expect(JSON.stringify(card)).not.toContain(confirmedDream);
  });

  it("埋点丢弃自由文本字段", () => {
    const event = safeTelemetry("dream_input_started", {
      input_mode: "text",
      full_dream: confirmedDream,
    });
    expect(event.properties).toEqual({ input_mode: "text" });
  });
});
