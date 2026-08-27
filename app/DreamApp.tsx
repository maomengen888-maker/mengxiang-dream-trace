"use client";

import { useEffect, useReducer, useRef } from "react";
import {
  AppSession,
  AppSessionSchema,
  DreamStructure,
  P3908_SOURCE,
  PageState,
  candidateEntriesFor,
  createCardSpec,
  createInterpretation,
  extractDreamStructure,
  reviseSession,
  safeTelemetry,
} from "./domain";

const NORMAL_DREAM =
  "夜里我在一座旧宅里，看见一条蛇盘在古井边，旁边站着一位陌生老人。我有点害怕，又忍不住靠近。";
const SESSION_KEY = "mengxiang:poc:session:v1";

const stepLabels: Record<PageState, string> = {
  drafting: "记录",
  transcript_review: "转写",
  symbol_review: "梦象",
  clarifying: "澄清",
  processing: "解析",
  result: "结果",
  card: "卡片",
};

const progressOrder: PageState[] = [
  "drafting",
  "transcript_review",
  "symbol_review",
  "clarifying",
  "processing",
  "result",
  "card",
];

const processingStages = [
  ["理解梦境", "整理你已经确认的人物、场景与感受"],
  ["检索条目", "在演示知识条目中寻找主体与条件"],
  ["核验来源", "检查版本、位置和人工核验状态"],
  ["组织解释", "把证据与综合说明清楚分开"],
];

const initialSession = (): AppSession => ({
  schemaVersion: 1,
  step: "drafting",
  draftText: "",
  transcriptText: "",
  inputRevision: 1,
  structure: null,
  clarificationAnswer: "",
  interpretation: null,
  card: null,
  updatedAt: new Date().toISOString(),
});

type RecordingState = "idle" | "recording" | "paused";

interface UiState {
  session: AppSession;
  recordingState: RecordingState;
  recordingSeconds: number;
  processingIndex: number;
  sourceOpen: boolean;
  fallbackCard: boolean;
  notice: string;
}

type SymbolField = "scene" | "characters" | "objects" | "actions" | "emotions" | "relations";

type Action =
  | { type: "hydrate"; session: AppSession }
  | { type: "hydrateError" }
  | { type: "setDraft"; value: string }
  | { type: "fillSample" }
  | { type: "submitDraft" }
  | { type: "startRecording" }
  | { type: "pauseRecording" }
  | { type: "resumeRecording" }
  | { type: "tickRecording" }
  | { type: "endRecording" }
  | { type: "setTranscript"; value: string }
  | { type: "confirmTranscript" }
  | { type: "updateSymbol"; field: SymbolField; index: number; value: string }
  | { type: "deleteSymbol"; field: SymbolField; index: number }
  | { type: "confirmSymbols" }
  | { type: "answerClarification"; answer: string }
  | { type: "nextProcessing" }
  | { type: "finishProcessing" }
  | { type: "toggleSource" }
  | { type: "createCard" }
  | { type: "toggleFallback" }
  | { type: "cardAction"; message: string }
  | { type: "reviseResult" }
  | { type: "goBack" }
  | { type: "clear" };

function withSession(state: UiState, session: AppSession, notice = ""): UiState {
  return { ...state, session: { ...session, updatedAt: new Date().toISOString() }, notice };
}

function reducer(state: UiState, action: Action): UiState {
  const session = state.session;

  switch (action.type) {
    case "hydrate":
      return { ...state, session: action.session };
    case "hydrateError":
      return { ...state, notice: "上次会话数据无法恢复，已为你安全地重新开始。" };
    case "setDraft":
      return withSession(state, { ...session, draftText: action.value }, "");
    case "fillSample":
      return withSession(state, { ...session, draftText: NORMAL_DREAM }, "示例梦境已填入，你仍可自由修改。");
    case "submitDraft": {
      if (!session.draftText.trim()) return { ...state, notice: "先写下一点梦里的内容，再继续。" };
      const transcriptText = session.draftText.replace("古井", "古镜");
      return withSession(state, { ...session, transcriptText, step: "transcript_review" }, "");
    }
    case "startRecording":
      return { ...state, recordingState: "recording", recordingSeconds: 0, notice: "模拟录音已开始。" };
    case "pauseRecording":
      return { ...state, recordingState: "paused", notice: "录音已暂停。" };
    case "resumeRecording":
      return { ...state, recordingState: "recording", notice: "继续记录中。" };
    case "tickRecording":
      return { ...state, recordingSeconds: state.recordingSeconds + 1 };
    case "endRecording":
      return {
        ...withSession(state, {
          ...session,
          draftText: NORMAL_DREAM,
          transcriptText: NORMAL_DREAM.replace("古井", "古镜"),
          step: "transcript_review",
        }, "模拟转写已经完成，请先检查低置信词。"),
        recordingState: "idle",
      };
    case "setTranscript":
      return withSession(state, { ...session, transcriptText: action.value }, "");
    case "confirmTranscript": {
      if (!session.transcriptText.trim()) return { ...state, notice: "转写内容不能为空。" };
      const structure = extractDreamStructure(session.transcriptText, session.inputRevision);
      return withSession(state, { ...session, structure, step: "symbol_review" }, "转写内容已人工确认。");
    }
    case "updateSymbol": {
      if (!session.structure) return state;
      const previous = session.structure[action.field][action.index];
      const nextStructure: DreamStructure = {
        ...session.structure,
        [action.field]: session.structure[action.field].map((item, index) => index === action.index ? action.value : item),
        userEdits: [...session.structure.userEdits, { field: action.field, from: previous, to: action.value }],
      };
      return withSession(state, { ...session, structure: nextStructure }, "梦象修改已记录。");
    }
    case "deleteSymbol": {
      if (!session.structure) return state;
      const previous = session.structure[action.field][action.index];
      const nextStructure: DreamStructure = {
        ...session.structure,
        [action.field]: session.structure[action.field].filter((_, index) => index !== action.index),
        userEdits: [...session.structure.userEdits, { field: action.field, from: previous, to: "" }],
      };
      return withSession(state, { ...session, structure: nextStructure }, `已删除“${previous}”，后续不再使用。`);
    }
    case "confirmSymbols": {
      if (!session.structure) return state;
      const needsClarification = session.structure.objects.includes("蛇");
      return withSession(state, {
        ...session,
        step: needsClarification ? "clarifying" : "processing",
      }, "梦象已确认。");
    }
    case "answerClarification":
      return {
        ...withSession(state, {
          ...session,
          clarificationAnswer: action.answer,
          step: "processing",
        }),
        processingIndex: 0,
      };
    case "nextProcessing":
      return { ...state, processingIndex: Math.min(state.processingIndex + 1, processingStages.length - 1) };
    case "finishProcessing": {
      if (!session.structure) return state;
      const interpretation = createInterpretation(session.structure, session.clarificationAnswer);
      return {
        ...withSession(state, { ...session, interpretation, card: null, step: "result" }),
        processingIndex: 0,
      };
    }
    case "toggleSource":
      return { ...state, sourceOpen: !state.sourceOpen };
    case "createCard": {
      if (!session.structure || !session.interpretation) return state;
      const card = createCardSpec(session.structure, session.interpretation);
      return { ...withSession(state, { ...session, card, step: "card" }), fallbackCard: false };
    }
    case "toggleFallback":
      return { ...state, fallbackCard: !state.fallbackCard, notice: !state.fallbackCard ? "已切换到图片失败降级卡片。" : "已恢复水墨画面。" };
    case "cardAction":
      return { ...state, notice: action.message };
    case "reviseResult": {
      if (!session.structure) return state;
      return { ...withSession(state, reviseSession(session, session.structure), "旧解释与旧卡片已失效，请确认最新梦象。"), sourceOpen: false };
    }
    case "goBack": {
      const backMap: Partial<Record<PageState, PageState>> = {
        transcript_review: "drafting",
        symbol_review: "transcript_review",
        clarifying: "symbol_review",
        processing: "symbol_review",
        card: "result",
      };
      const previous = backMap[session.step];
      return previous ? withSession(state, { ...session, step: previous }, "") : state;
    }
    case "clear":
      return {
        session: initialSession(),
        recordingState: "idle",
        recordingSeconds: 0,
        processingIndex: 0,
        sourceOpen: false,
        fallbackCard: false,
        notice: "本次梦境已清除。",
      };
  }
}

function track(name: string, properties: Record<string, string | number | boolean>) {
  const event = safeTelemetry(name, properties);
  console.info("[梦象演示事件]", event);
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function AppHeader({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const currentIndex = progressOrder.indexOf(state.session.step);
  const canGoBack = !["drafting", "result"].includes(state.session.step);

  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          className={`back-button ${canGoBack ? "" : "back-hidden"}`}
          onClick={() => dispatch({ type: "goBack" })}
          aria-hidden={!canGoBack}
          tabIndex={canGoBack ? 0 : -1}
        >
          <span aria-hidden="true">←</span> 返回
        </button>
        <button type="button" className="brand brand-button" onClick={() => {
          if (window.confirm("清除本次梦境并回到首页？")) dispatch({ type: "clear" });
        }} aria-label="清除本次梦境并回到首页">
          <span className="brand-seal">梦</span>
          <span><strong>梦象</strong><small>DREAM TRACE</small></span>
        </button>
        <div className="revision-chip">修订 R{state.session.inputRevision}</div>
      </div>

      <nav className="progress-nav" aria-label="解梦进度">
        {progressOrder.map((step, index) => (
          <span key={step} className={index === currentIndex ? "active" : index < currentIndex ? "done" : ""}>
            <i>{index < currentIndex ? "✓" : index + 1}</i>{stepLabels[step]}
          </span>
        ))}
      </nav>
    </header>
  );
}

function DraftPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const recording = state.recordingState;

  return (
    <section className="hero page-enter" aria-labelledby="draft-title">
      <p className="eyebrow"><span /> 昨夜 · 一场未解的梦</p>
      <h1 id="draft-title">记录昨夜的梦，<br />从传统梦象中寻找它的来处。</h1>
      <p className="hero-copy">我们会先请你确认梦境，再呈现出处与不确定性。传统文化解释不等于现实预言。</p>

      <div className="dream-entry" aria-labelledby="entry-title">
        <div className="entry-heading">
          <div><p className="step-kicker">第一步</p><h2 id="entry-title">你还记得什么？</h2></div>
          <span className="demo-badge">演示原型</span>
        </div>
        <label className="sr-only" htmlFor="dream-text">写下梦境</label>
        <textarea
          id="dream-text"
          value={state.session.draftText}
          maxLength={1000}
          onChange={(event) => dispatch({ type: "setDraft", value: event.target.value })}
          placeholder="比如：我站在一座旧宅里，井边盘着一条蛇……"
        />
        <div className="entry-meta">
          <span>{state.session.draftText.length} / 1000</span>
          <button type="button" className="sample-link" onClick={() => dispatch({ type: "fillSample" })}>填入示例梦境</button>
        </div>

        {recording !== "idle" ? (
          <div className="recording-panel" role="status">
            <span className={recording === "recording" ? "pulse-dot" : "pause-dot"} aria-hidden="true" />
            <strong>{recording === "recording" ? "正在记录" : "录音已暂停"}</strong>
            <time>{formatDuration(state.recordingSeconds)}</time>
            <button type="button" onClick={() => dispatch({ type: recording === "recording" ? "pauseRecording" : "resumeRecording" })}>
              {recording === "recording" ? "暂停" : "继续"}
            </button>
            <button type="button" onClick={() => dispatch({ type: "endRecording" })}>结束并转写</button>
          </div>
        ) : null}

        {state.notice ? <p className="entry-message" role="status">{state.notice}</p> : null}
        <div className="entry-actions">
          <button className="record-button" type="button" onClick={() => dispatch({ type: "startRecording" })} disabled={recording !== "idle"}>
            <span className="record-dot" aria-hidden="true" />语音记录<small>模拟</small>
          </button>
          <button className="primary-button" type="button" onClick={() => {
            dispatch({ type: "submitDraft" });
            if (state.session.draftText.trim()) track("dream_input_started", { input_mode: "text" });
          }}>
            记下这个梦 <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <div className="trust-row" aria-label="产品原则">
        <p><span aria-hidden="true">01</span> 先确认，再解释</p>
        <p><span aria-hidden="true">02</span> 原文与综合分层</p>
        <p><span aria-hidden="true">03</span> 无出处，明确说明</p>
      </div>
    </section>
  );
}

function FlowHeading({ kicker, title, copy }: { kicker: string; title: string; copy: string }) {
  return (
    <div className="flow-heading">
      <p className="eyebrow"><span /> {kicker}</p>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
  );
}

function TranscriptPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const hasLowConfidence = state.session.transcriptText.includes("古镜");
  return (
    <section className="flow-page page-enter">
      <FlowHeading kicker="内容确认 · 01" title="先确认梦被正确记下" copy="低置信词会同时使用文字与下划线提示。修改后的内容优先于模拟转写。" />
      <div className="panel transcript-panel">
        <div className="panel-topline"><span>模拟转写 · 00:26</span><span className="demo-badge">语音能力为模拟</span></div>
        {hasLowConfidence ? (
          <p className="confidence-note"><span>低置信词</span> 系统不确定“<strong>古镜</strong>”，请结合记忆修改。</p>
        ) : (
          <p className="confirmed-note">✓ 低置信词已处理，内容等待你的最终确认。</p>
        )}
        <label htmlFor="transcript-text">完整转写内容</label>
        <textarea id="transcript-text" value={state.session.transcriptText} onChange={(event) => dispatch({ type: "setTranscript", value: event.target.value })} />
        {state.notice ? <p className="entry-message" role="status">{state.notice}</p> : null}
        <div className="panel-actions">
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: "goBack" })}>返回重录</button>
          <button className="primary-button" type="button" onClick={() => {
            dispatch({ type: "confirmTranscript" });
            track("transcript_confirmed", { was_edited: !hasLowConfidence, low_confidence_count: hasLowConfidence ? 1 : 0 });
          }}>确认内容 <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </section>
  );
}

const symbolGroups: Array<{ field: SymbolField; label: string; hint: string }> = [
  { field: "scene", label: "场景", hint: "决定条目的语境" },
  { field: "characters", label: "人物", hint: "区分谁在经历梦境" },
  { field: "objects", label: "物体", hint: "用于寻找主体条目" },
  { field: "actions", label: "行为", hint: "动作会改变适用条件" },
  { field: "emotions", label: "情绪", hint: "帮助组织综合解释" },
  { field: "relations", label: "关系", hint: "说明意象如何共同出现" },
];

function SymbolsPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const structure = state.session.structure;
  if (!structure) return null;

  return (
    <section className="flow-page page-enter">
      <FlowHeading kicker="梦象确认 · 02" title="这是我们理解到的梦象" copy="你可以修改或删除任何一项。被删除的内容不会继续进入检索与解释。" />
      <div className="summary-strip"><span>已确认梦境</span><p>{structure.confirmedText}</p></div>
      <div className="symbol-grid">
        {symbolGroups.map((group) => (
          <section className="symbol-group" key={group.field}>
            <div><h2>{group.label}</h2><p>{group.hint}</p></div>
            <div className="symbol-list">
              {structure[group.field].length ? structure[group.field].map((item, index) => (
                <div className="editable-symbol" key={`${group.field}-${index}`}>
                  <label className="sr-only" htmlFor={`${group.field}-${index}`}>编辑{group.label}{item}</label>
                  <input id={`${group.field}-${index}`} value={item} onChange={(event) => dispatch({ type: "updateSymbol", field: group.field, index, value: event.target.value })} />
                  <button type="button" onClick={() => dispatch({ type: "deleteSymbol", field: group.field, index })} aria-label={`删除${item}`}>×</button>
                </div>
              )) : <span className="empty-symbol">未识别 · 不会自动补全</span>}
            </div>
          </section>
        ))}
      </div>
      <aside className="why-card"><span>为什么“害怕又好奇”很重要？</span><p>名词告诉我们梦里出现了什么，行为和情绪帮助说明这些意象以怎样的关系出现；它们不会被当作古籍原文。</p></aside>
      {structure.uncertainFields.length ? <p className="uncertain-line">待确认：{structure.uncertainFields.join("、")}</p> : null}
      {state.notice ? <p className="entry-message" role="status">{state.notice}</p> : null}
      <div className="bottom-actions">
        <button className="secondary-button" type="button" onClick={() => dispatch({ type: "goBack" })}>返回转写</button>
        <button className="primary-button" type="button" onClick={() => {
          dispatch({ type: "confirmSymbols" });
          track("symbols_confirmed", {
            edited_count: structure.userEdits.filter((edit) => edit.to).length,
            deleted_count: structure.userEdits.filter((edit) => !edit.to).length,
          });
        }}>看起来准确，继续 <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}

function ClarifyingPage({ dispatch }: { dispatch: React.Dispatch<Action> }) {
  const options = [
    ["没有", "蛇只是盘在井边，没有靠近我"],
    ["有", "蛇主动靠近，或者试图攻击"],
    ["记不清", "这个细节已经模糊了"],
  ];
  return (
    <section className="flow-page narrow-flow page-enter">
      <FlowHeading kicker="最后确认一个细节 · 03" title="蛇有主动攻击你吗？" copy="这个细节会改变适用条件，也会影响结果能否说得更明确。一次解梦只问一个真正影响结果的问题。" />
      <div className="question-panel">
        <p className="why-question"><span>为何要问</span> “出现蛇”与“被蛇攻击”不是同一条件，我们不会替你补全。</p>
        <div className="choice-list">
          {options.map(([value, copy]) => (
            <button type="button" key={value} onClick={() => {
              dispatch({ type: "answerClarification", answer: value });
              track("clarification_answered", { question_id: "snake_attack", answer_type: value });
            }}>
              <strong>{value}</strong><span>{copy}</span><i aria-hidden="true">→</i>
            </button>
          ))}
        </div>
        <button className="skip-link" type="button" onClick={() => dispatch({ type: "answerClarification", answer: "记不清" })}>跳过这个问题（结果会保留不确定性）</button>
      </div>
    </section>
  );
}

function ProcessingPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  return (
    <section className="flow-page narrow-flow processing-page page-enter" aria-live="polite">
      <FlowHeading kicker="解析梦境 · 04" title="让证据先于解释" copy="以下只是可见的处理阶段，不展示模型内部推理。当前原型使用固定数据模拟处理。" />
      <ol className="processing-list">
        {processingStages.map(([title, copy], index) => (
          <li key={title} className={index < state.processingIndex ? "done" : index === state.processingIndex ? "active" : ""}>
            <span>{index < state.processingIndex ? "✓" : String(index + 1).padStart(2, "0")}</span>
            <div><strong>{title}</strong><p>{copy}</p></div>
          </li>
        ))}
      </ol>
      <p className="trust-message">我们不会把生成内容伪装成典籍原文。</p>
      <button className="skip-link" type="button" onClick={() => dispatch({ type: "finishProcessing" })}>跳过演示动效，直接查看结果</button>
    </section>
  );
}

function ResultPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const structure = state.session.structure;
  const result = state.session.interpretation;
  if (!structure || !result) return null;
  const candidates = candidateEntriesFor(structure);
  const certainty = result.certaintyLevel === "reserved" ? "有保留" : result.certaintyLevel === "associative" ? "仅供联想" : "较明确";

  return (
    <section className="result-page page-enter">
      <div className="result-hero">
        <div>
          <p className="eyebrow"><span /> 解梦结果 · 修订 R{result.inputRevision}</p>
          <div className="result-title-row"><h1>{result.title}</h1><span className="certainty-badge">{certainty}</span></div>
          <p className="dream-summary">{result.dreamSummary}</p>
        </div>
        <div className="result-actions-top">
          <button type="button" className="secondary-button" onClick={() => dispatch({ type: "reviseResult" })}>纠正梦象</button>
          <button type="button" className="primary-button" onClick={() => {
            dispatch({ type: "createCard" });
            track("card_generated", { style: "ink", used_fallback: false });
          }}>生成视觉卡片 <span aria-hidden="true">→</span></button>
        </div>
      </div>

      <div className="result-layout">
        <div className="result-main">
          <article className="core-statement">
            <span>综合解释 · 非典籍原文</span>
            <blockquote>“{result.coreStatement}”</blockquote>
          </article>

          <section className="result-section">
            <div className="section-heading"><p>梦象拆解</p><span>基于已确认内容</span></div>
            <div className="explanation-grid">
              <article><div><span className="evidence-tag pending">待核验来源</span><h2>蛇与古井</h2></div><p>主体与场景已确认，但 P.3908 中对应原文尚未完成叶面与栏位核验，本阶段不会展示成“直接记载”。</p></article>
              <article><div><span className="evidence-tag synthesis">综合解释</span><h2>主动靠近</h2></div><p>你在害怕的同时仍然靠近，这是一条来自确认梦境的上下文线索，不属于古籍原文。</p></article>
            </div>
          </section>

          <section className="source-section">
            <button type="button" className="source-toggle" onClick={() => {
              dispatch({ type: "toggleSource" });
              track("source_opened", { entry_id: candidates[0]?.entryId ?? "none", verification_status: "pending" });
            }} aria-expanded={state.sourceOpen}>
              <span><small>主版本来源</small><strong>敦煌写本 P.3908《新集周公解梦书》</strong></span>
              <i>{state.sourceOpen ? "收起" : "展开"} <b aria-hidden="true">{state.sourceOpen ? "−" : "+"}</b></i>
            </button>
            {state.sourceOpen ? (
              <div className="source-detail">
                <dl>
                  <div><dt>馆藏号</dt><dd>{P3908_SOURCE.shelfmark}</dd></div>
                  <div><dt>馆藏机构</dt><dd>{P3908_SOURCE.holdingInstitution}</dd></div>
                  <div><dt>条目状态</dt><dd><span className="pending-text">待逐页核验</span></dd></div>
                  <div><dt>具体位置</dt><dd>尚未记录叶面与栏位</dd></div>
                </dl>
                <div className="source-boundary">
                  <strong>为什么没有展示原文？</strong>
                  <p>选定主版本不等于具体条目已经核验。只有完成数字影像对照、位置记录和人工复核后，才能标记“直接记载”。</p>
                </div>
                <div className="source-links">
                  <a href={P3908_SOURCE.catalogUrl} target="_blank" rel="noreferrer">BnF 馆藏记录 ↗</a>
                  <a href={P3908_SOURCE.digitizationUrl} target="_blank" rel="noreferrer">Gallica 数字影像 ↗</a>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="result-aside">
          <div className="aside-card"><span>本次确定性</span><strong>{certainty}</strong><p>{result.uncertaintyNotes.join(" ")}</p></div>
          <div className="aside-card"><span>使用的梦象</span><div className="mini-tags">{[...structure.objects, ...structure.emotions].map((item) => <i key={item}>{item}</i>)}</div></div>
          <div className="safety-card"><strong>文化娱乐提示</strong><p>{result.safetyNotice}</p></div>
        </aside>
      </div>

      <div className="result-bottom-action">
        <button type="button" className="secondary-button" onClick={() => dispatch({ type: "reviseResult" })}>纠正梦象</button>
        <button className="primary-button" type="button" onClick={() => dispatch({ type: "createCard" })}>把这个梦做成卡片 <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}

function CardPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const card = state.session.card;
  if (!card) return null;
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <section className="card-page page-enter">
      <FlowHeading kicker="视觉卡片 · 07" title="让梦停在一幅画里" copy="卡片只使用最终确认的摘要和脱敏视觉元素；画面不会反过来改变解梦结论。" />
      <div className="card-workspace">
        <article className={`dream-card ${state.fallbackCard ? "fallback" : ""}`} aria-label="梦象视觉卡片预览">
          <div className="card-noise" aria-hidden="true" />
          <div className="card-brand"><span>梦</span><strong>梦象</strong></div>
          <div className="card-copy"><p>{date}</p><h2>{card.title}</h2><blockquote>{card.coreStatement}</blockquote></div>
          <div className="card-elements">{card.visualElements.map((element) => <span key={element}>{element}</span>)}</div>
          <small>传统文化资料 · 仅供文化娱乐与个人记录</small>
        </article>

        <aside className="card-controls">
          <div><span>卡片使用了这些已确认元素</span><div className="mini-tags">{card.visualElements.map((element) => <i key={element}>{element}</i>)}</div></div>
          <div className="privacy-box"><strong>已自动排除</strong><p>{card.excludedContent.join("、")}</p></div>
          <button className="secondary-button full-button" type="button" onClick={() => dispatch({ type: "cardAction", message: "已重新组织画面；解释内容保持不变。" })}>重新生成画面</button>
          <button className="secondary-button full-button" type="button" onClick={() => dispatch({ type: "toggleFallback" })}>{state.fallbackCard ? "恢复水墨画面" : "模拟图片生成失败"}</button>
          <div className="card-action-row">
            <button type="button" onClick={() => {
              dispatch({ type: "cardAction", message: "保存演示完成：PoC 未写入你的照片库。" });
              track("card_action_clicked", { action_type: "save" });
            }}>保存</button>
            <button type="button" onClick={() => {
              dispatch({ type: "cardAction", message: "分享面板为演示状态，未向外部发送内容。" });
              track("card_action_clicked", { action_type: "share" });
            }}>分享</button>
          </div>
          {state.notice ? <p className="entry-message" role="status">{state.notice}</p> : null}
          <button className="text-button" type="button" onClick={() => dispatch({ type: "goBack" })}>← 返回解梦结果</button>
        </aside>
      </div>
    </section>
  );
}

export default function DreamApp() {
  const [state, dispatch] = useReducer(reducer, {
    session: initialSession(),
    recordingState: "idle",
    recordingSeconds: 0,
    processingIndex: 0,
    sourceOpen: false,
    fallbackCard: false,
    notice: "",
  });
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) dispatch({ type: "hydrate", session: AppSessionSchema.parse(JSON.parse(raw)) });
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      dispatch({ type: "hydrateError" });
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  }, [state.session]);

  useEffect(() => {
    if (state.recordingState !== "recording") return;
    const timer = window.setInterval(() => dispatch({ type: "tickRecording" }), 1000);
    return () => window.clearInterval(timer);
  }, [state.recordingState]);

  useEffect(() => {
    if (state.session.step !== "processing") return;
    const timer = window.setTimeout(() => {
      if (state.processingIndex >= processingStages.length - 1) dispatch({ type: "finishProcessing" });
      else dispatch({ type: "nextProcessing" });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.processingIndex, state.session.step]);

  const page = (() => {
    switch (state.session.step) {
      case "drafting": return <DraftPage state={state} dispatch={dispatch} />;
      case "transcript_review": return <TranscriptPage state={state} dispatch={dispatch} />;
      case "symbol_review": return <SymbolsPage state={state} dispatch={dispatch} />;
      case "clarifying": return <ClarifyingPage dispatch={dispatch} />;
      case "processing": return <ProcessingPage state={state} dispatch={dispatch} />;
      case "result": return <ResultPage state={state} dispatch={dispatch} />;
      case "card": return <CardPage state={state} dispatch={dispatch} />;
    }
  })();

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <AppHeader state={state} dispatch={dispatch} />
      {page}
      <footer><p>梦境默认只在本次体验中使用，不会自动公开。</p><p>内容仅供文化娱乐与个人记录。</p></footer>
    </main>
  );
}
