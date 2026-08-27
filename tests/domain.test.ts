import { describe, expect, it } from "vitest";
import {
  AppSession,
  CardSpecSchema,
  KnowledgeEntrySchema,
  P3908_KNOWLEDGE_ENTRIES,
  candidateEntriesFor,
  createCardSpec,
  createInterpretation,
  extractDreamStructure,
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
});

describe("梦境结构与修订", () => {
  it("用户把古镜改成古井后只使用最新内容", () => {
    const structure = extractDreamStructure(confirmedDream);
    expect(structure.objects).toContain("古井");
    expect(structure.objects).not.toContain("古镜");
    expect(structure.userEdits).toContainEqual({ field: "objects", from: "古镜", to: "古井" });
  });

  it("候选条目保持 pending，解释不会生成直接证据", () => {
    const structure = extractDreamStructure(confirmedDream);
    const candidates = candidateEntriesFor(structure);
    const result = createInterpretation(structure, "没有");
    expect(candidates.length).toBeGreaterThan(0);
    expect(result.evidenceEntryIds).toEqual([]);
    expect(result.uncertaintyNotes.join(" ")).toContain("尚未完成叶面与栏位核验");
  });

  it("记不清时不能得到较明确信号", () => {
    const result = createInterpretation(extractDreamStructure(confirmedDream), "记不清");
    expect(result.certaintyLevel).toBe("associative");
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
