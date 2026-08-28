"use client";

import { useEffect, useReducer, useRef } from "react";
import {
  AppSession,
  AppSessionSchema,
  DreamStructure,
  P3908_SOURCE,
  PageState,
  candidateEntriesFor,
  clarificationKindFor,
  createCardSpec,
  createInterpretation,
  extractDreamStructure,
  reviseSession,
  safeTelemetry,
} from "./domain";

const NORMAL_DREAM =
  "夜里我在一座旧宅里，看见一条蛇盘在古井边，旁边站着一位陌生老人。我有点害怕，又忍不住靠近。";
const DREAM_PROMPTS = [
  { label: "掉入悬崖", text: "我梦见自己从悬崖边掉了下去，一直往下坠，快落地时惊醒了。" },
  { label: "被蛇追", text: "我梦见一条蛇一直追着我，我拼命往前跑，却怎么也甩不掉它。" },
  { label: "牙齿掉落", text: "我梦见自己的牙齿一颗颗松动掉落，想说话却发不出声音。" },
  { label: "水中迷路", text: "我梦见自己走进很深的水里，四周起雾，怎么也找不到回去的方向。" },
] as const;
const SESSION_KEY = "mengxiang:poc:session:v1";

const stepLabels: Record<PageState, string> = {
  drafting: "记录",
  transcript_review: "记录",
  symbol_review: "梦象",
  clarifying: "澄清",
  processing: "解析",
  result: "结果",
  card: "卡片",
};

const progressOrder: PageState[] = [
  "drafting",
  "symbol_review",
  "clarifying",
  "processing",
  "result",
];

const processingStages = [
  ["正在重现梦境", "把你确认过的人物、场景与动作编排成梦境分镜"],
  ["正在辨认梦象", "聚焦蛇、古井、旧宅以及害怕与好奇的关系"],
  ["正在核验出处", "检查 P.3908 的版本、位置与人工核验状态"],
  ["正在组织解释", "把梦境事实、传统资料与综合说明清楚分开"],
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
type InputMode = "voice" | "text";

interface UiState {
  session: AppSession;
  inputMode: InputMode;
  recordingState: RecordingState;
  recordingSeconds: number;
  processingIndex: number;
  sourceOpen: boolean;
  notice: string;
}

type SymbolField = "scene" | "characters" | "objects" | "actions" | "emotions" | "relations";

type Action =
  | { type: "hydrate"; session: AppSession }
  | { type: "hydrateError" }
  | { type: "setInputMode"; mode: InputMode }
  | { type: "setDraft"; value: string }
  | { type: "fillSample" }
  | { type: "submitDraft" }
  | { type: "startRecording" }
  | { type: "pauseRecording" }
  | { type: "resumeRecording" }
  | { type: "tickRecording" }
  | { type: "endRecording" }
  | { type: "updateSymbol"; field: SymbolField; index: number; value: string }
  | { type: "deleteSymbol"; field: SymbolField; index: number }
  | { type: "confirmSymbols" }
  | { type: "answerClarification"; answer: string }
  | { type: "nextProcessing" }
  | { type: "finishProcessing" }
  | { type: "toggleSource" }
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
    case "hydrate": {
      if (action.session.step === "transcript_review") {
        const confirmedText = (action.session.transcriptText || action.session.draftText).trim();
        const structure = confirmedText ? extractDreamStructure(confirmedText, action.session.inputRevision) : null;
        return {
          ...state,
          session: {
            ...action.session,
            draftText: confirmedText,
            transcriptText: confirmedText,
            structure,
            step: structure ? "symbol_review" : "drafting",
          },
        };
      }
      return { ...state, session: { ...action.session, step: action.session.step === "card" ? "result" : action.session.step } };
    }
    case "hydrateError":
      return { ...state, notice: "上次会话数据无法恢复，已为你安全地重新开始。" };
    case "setInputMode":
      return { ...state, inputMode: action.mode, notice: "" };
    case "setDraft":
      return withSession(state, { ...session, draftText: action.value }, "");
    case "fillSample":
      return withSession(state, { ...session, draftText: NORMAL_DREAM }, "示例梦境已填入，你仍可自由修改。");
    case "submitDraft": {
      if (!session.draftText.trim()) return { ...state, notice: "先写下一点梦里的内容，再继续。" };
      const transcriptText = session.draftText.trim();
      const structure = extractDreamStructure(transcriptText, session.inputRevision);
      return withSession(state, { ...session, transcriptText, structure, step: "symbol_review" }, "梦境已记下，请直接确认识别到的梦象。");
    }
    case "startRecording":
      return { ...state, recordingState: "recording", recordingSeconds: 0, notice: "模拟录音已开始。" };
    case "pauseRecording":
      return { ...state, recordingState: "paused", notice: "录音已暂停。" };
    case "resumeRecording":
      return { ...state, recordingState: "recording", notice: "继续记录中。" };
    case "tickRecording":
      return { ...state, recordingSeconds: state.recordingSeconds + 1 };
    case "endRecording": {
      const structure = extractDreamStructure(NORMAL_DREAM, session.inputRevision);
      return {
        ...withSession(state, {
          ...session,
          draftText: NORMAL_DREAM,
          transcriptText: NORMAL_DREAM,
          structure,
          step: "symbol_review",
        }, "模拟转写已完成，请直接确认识别到的梦象。"),
        recordingState: "idle",
      };
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
      const needsClarification = clarificationKindFor(session.structure) !== null;
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
      if (session.interpretation?.inputRevision === session.inputRevision && session.card?.inputRevision === session.inputRevision) return state;
      const interpretation = createInterpretation(session.structure, session.clarificationAnswer);
      const card = createCardSpec(session.structure, interpretation);
      return {
        ...withSession(
          state,
          { ...session, interpretation, card, step: "result" },
          "结果卡片已根据本次确认内容生成；纠正梦象后才会生成新的修订版。",
        ),
        processingIndex: 0,
      };
    }
    case "toggleSource":
      return { ...state, sourceOpen: !state.sourceOpen };
    case "cardAction":
      return { ...state, notice: action.message };
    case "reviseResult": {
      if (!session.structure) return state;
      return { ...withSession(state, reviseSession(session, session.structure), "旧解释与旧卡片已失效，请确认最新梦象。"), sourceOpen: false };
    }
    case "goBack": {
      if (session.step === "result" && session.structure) {
        return {
          ...withSession(state, reviseSession(session, session.structure), "已返回梦象确认；修改或直接重新确认后，会生成新修订版结果。"),
          sourceOpen: false,
        };
      }
      const backMap: Partial<Record<PageState, PageState>> = {
        transcript_review: "drafting",
        symbol_review: "drafting",
        clarifying: "symbol_review",
        processing: "symbol_review",
      };
      const previous = backMap[session.step];
      return previous ? withSession(state, { ...session, step: previous }, "") : state;
    }
    case "clear":
      return {
        session: initialSession(),
        inputMode: "voice",
        recordingState: "idle",
        recordingSeconds: 0,
        processingIndex: 0,
        sourceOpen: false,
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
  if (state.session.step === "drafting") {
    return (
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <button type="button" className="brand brand-button" onClick={() => dispatch({ type: "clear" })} aria-label="梦象首页">
            <span className="brand-seal">梦</span>
            <span><strong>梦象</strong><small>DREAM TRACE</small></span>
          </button>
          <nav aria-label="首页导航">
            <button type="button" onClick={() => dispatch({ type: "cardAction", message: "历史梦境将在接入账户系统后开放；当前梦境只保存在本次会话。" })}>历史梦境</button>
            <a href={P3908_SOURCE.digitizationUrl} target="_blank" rel="noreferrer">关于来源</a>
            <span>演示版</span>
          </nav>
        </div>
      </header>
    );
  }

  const currentIndex = progressOrder.indexOf(state.session.step);
  const backLabel = state.session.step === "result" ? "返回梦象确认" : "返回";

  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          type="button"
          className="back-button"
          onClick={() => dispatch({ type: "goBack" })}
        >
          <span aria-hidden="true">←</span> {backLabel}
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
    <section className="hero dream-home page-enter" aria-labelledby="draft-title">
      <div className="home-atmosphere" aria-hidden="true">
        <span className="moon-mark" />
        <i className="mist-ring mist-ring-one" />
        <i className="mist-ring mist-ring-two" />
      </div>
      <p className="eyebrow"><span /> TRACEABLE DREAM INTERPRETATION · 可追溯传统梦象 <span /></p>
      <div className="home-title-line">
        <h1 id="draft-title">昨夜有梦，<br /><em>今朝见象</em></h1>
      </div>
      <p className="hero-copy">记录梦境，从传统梦象中寻找它的来处。</p>

      <div className="dream-entry mystery-entry" aria-labelledby="entry-title">
        <div className="entry-heading">
          <div><p className="step-kicker">DREAM NOTE · 01</p><h2 id="entry-title">写下昨夜的梦</h2></div>
          <button className="sample-link" type="button" onClick={() => dispatch({ type: "fillSample" })}>使用示例梦境</button>
        </div>

        <div className="text-compose primary-compose selected">
          <div className="text-compose-heading"><span>梦里发生了什么？</span><small>不用写得完整</small></div>
          <label className="sr-only" htmlFor="dream-text">写下梦境</label>
          <textarea id="dream-text" value={state.session.draftText} maxLength={1000} onChange={(event) => {
            dispatch({ type: "setDraft", value: event.target.value });
            dispatch({ type: "setInputMode", mode: "text" });
          }} placeholder="比如：我站在一座旧宅里，井边盘着一条蛇……" />
          <div className="compose-footer">
            <div className="entry-meta"><span>{state.session.draftText.length} / 1000</span><span>文字或语音都可以</span></div>
            <button className="voice-corner" type="button" onClick={() => {
              dispatch({ type: "setInputMode", mode: "voice" });
              dispatch({ type: "startRecording" });
            }} disabled={recording !== "idle"} aria-label="开始语音记录"><span aria-hidden="true" /></button>
          </div>
        </div>

        <div className="dream-suggestions" aria-label="常见梦境提示">
          <span>从一个画面开始</span>
          <div>{DREAM_PROMPTS.map((prompt) => <button type="button" key={prompt.label} onClick={() => dispatch({ type: "setDraft", value: prompt.text })}>{prompt.label}<i aria-hidden="true">↗</i></button>)}</div>
        </div>

        {recording !== "idle" ? <div className="recording-panel" role="status">
          <span className={recording === "recording" ? "pulse-dot" : "pause-dot"} aria-hidden="true" />
          <strong>{recording === "recording" ? "正在记录" : "录音已暂停"}</strong>
          <time>{formatDuration(state.recordingSeconds)}</time>
          <button type="button" onClick={() => dispatch({ type: recording === "recording" ? "pauseRecording" : "resumeRecording" })}>{recording === "recording" ? "暂停" : "继续"}</button>
          <button type="button" onClick={() => dispatch({ type: "endRecording" })}>结束并转写</button>
        </div> : null}

        {state.notice ? <p className="entry-message" role="status">{state.notice}</p> : null}
        <div className="entry-actions home-entry-actions">
          <p><span aria-hidden="true">◉</span> 梦境默认不会公开，录音仅为本地演示。</p>
          <button className="primary-button" type="button" onClick={() => {
            dispatch({ type: "submitDraft" });
            if (state.session.draftText.trim()) track("dream_input_started", { input_mode: state.inputMode });
          }}>
            开始寻象 <span aria-hidden="true">→</span>
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
        <button className="secondary-button" type="button" onClick={() => dispatch({ type: "goBack" })}>返回修改梦境</button>
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

function ClarifyingPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const structure = state.session.structure;
  if (!structure) return null;
  const clarificationKind = clarificationKindFor(structure);
  const isChase = structure.actions.includes("被蛇追赶");
  const isWaterPosition = clarificationKind === "water_position";
  const options = isWaterPosition ? [
    ["岸边", "我站在岸边，只能看见模糊的水面"],
    ["水中", "我已经在水里，水面或方向看不清"],
    ["记不清", "只记得水面，位置已经模糊了"],
  ] : isChase ? [
    ["没有", "蛇一直在追，但没有追上或碰到我"],
    ["有", "蛇追上了，或者已经和我有接触"],
    ["记不清", "追逐的结果已经模糊了"],
  ] : [
    ["没有", "蛇只是盘在井边，没有靠近我"],
    ["有", "蛇主动靠近，或者试图攻击"],
    ["记不清", "这个细节已经模糊了"],
  ];
  return (
    <section className="flow-page narrow-flow page-enter">
      <FlowHeading kicker="最后确认一个细节 · 03" title={isWaterPosition ? "你在岸边，还是已经进入水中？" : isChase ? "蛇有追上或伤到你吗？" : "蛇有主动攻击你吗？"} copy="这个细节会改变适用条件，也会影响结果能否说得更明确。一次解梦只问一个真正影响结果的问题。" />
      <div className="question-panel">
        <p className="why-question"><span>为何要问</span> {isWaterPosition ? "站在岸边观察，与已经身处水中，不是同一种梦境关系；我们不会替你补全。" : "“出现蛇”与“被蛇攻击”不是同一条件，我们不会替你补全。"}</p>
        <div className="choice-list">
          {options.map(([value, copy]) => (
            <button type="button" key={value} onClick={() => {
              dispatch({ type: "answerClarification", answer: value });
              track("clarification_answered", { question_id: clarificationKind ?? "unknown", answer_type: value });
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
  const structure = state.session.structure;
  const dreamElements = structure
    ? [...structure.scene, ...structure.objects, ...structure.actions].slice(0, 4).join("、")
    : "已确认的梦象";
  const contextualStages = processingStages.map((stage, index) => index === 1
    ? [stage[0], `聚焦${dreamElements || "已确认的梦象"}之间的关系`]
    : stage);
  const stage = contextualStages[state.processingIndex];
  const progress = [24, 49, 74, 96][state.processingIndex];
  const hasSnake = state.session.structure?.objects.includes("蛇");
  const isChase = state.session.structure?.actions.includes("被蛇追赶");

  return (
    <section className={`immersive-processing page-enter stage-${state.processingIndex + 1}`} aria-live="polite">
      <div className="processing-intro">
        <p className="eyebrow"><span /> 梦境解析 · 深入第 {state.processingIndex + 1} 层</p>
        <h1>让梦境慢慢显影。</h1>
        <p>画面只复现你已经确认的梦象；以下为预生成漫画演示，不代表正在调用实时生图模型。</p>
      </div>

      <div className="immersive-stage">
        <figure className="comic-stage">
          {hasSnake ? <>
            {/* 静态分镜在本地演示包内，避免解析过程依赖外部图片服务。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dream-comic-snake-well.png" alt={isChase ? "三格水墨漫画：梦中人在夜色中面对追来的蛇" : "三格水墨漫画：梦中人走近古井，蛇从井边游来，梦中人在远处停下观察"} />
          </> : <div className="abstract-dream-frame" role="img" aria-label="抽象水墨梦境正在显影"><i /><i /><i /></div>}
          <div className="comic-veil" aria-hidden="true" />
          <div className="comic-scan" aria-hidden="true" />
          <figcaption>
            <span>梦境分镜 · 演示生成</span>
            <strong>{isChase ? "追逐 / 蛇 / 逃离 / 紧张" : hasSnake ? "旧宅 / 古井 / 蛇 / 陌生老人" : "根据已确认梦象组织抽象画面"}</strong>
          </figcaption>
          <div className="panel-depth" aria-hidden="true">
            {["场景", "动作", "关系"].map((label, index) => <span className={index <= state.processingIndex ? "visible" : ""} key={label}>{label}</span>)}
          </div>
        </figure>

        <aside className="analysis-console">
          <div className="analysis-progress"><span>解析深度</span><b>{progress}%</b></div>
          <div className="progress-track" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
          <div className="current-analysis" key={stage[0]}>
            <small>0{state.processingIndex + 1} / 04</small>
            <h2>{stage[0]}</h2>
            <p>{stage[1]}</p>
          </div>
          <ol className="processing-list immersive-list">
            {contextualStages.map(([title], index) => <li key={title} className={index < state.processingIndex ? "done" : index === state.processingIndex ? "active" : ""}>
              <span>{index < state.processingIndex ? "✓" : String(index + 1).padStart(2, "0")}</span><strong>{title.replace("正在", "")}</strong>
            </li>)}
          </ol>
          <p className="trust-message">解释会在最后一次性生成；我们不会展示隐藏推理，也不会把生成内容伪装成典籍原文。</p>
        </aside>
      </div>

      <button className="skip-link immersive-skip" type="button" onClick={() => dispatch({ type: "finishProcessing" })}>跳过沉浸过程，直接查看结果</button>
    </section>
  );
}

function ResultPage({ state, dispatch }: { state: UiState; dispatch: React.Dispatch<Action> }) {
  const structure = state.session.structure;
  const result = state.session.interpretation;
  const card = state.session.card;
  if (!structure || !result || !card) return null;
  const candidates = candidateEntriesFor(structure);
  const hasCandidateSource = candidates.length > 0;
  const hasSnake = structure.objects.includes("蛇");
  const primarySymbol = structure.objects[0] ?? structure.scene[0] ?? "主要梦象";
  const personalClue = structure.actions[0] ?? structure.emotions[0] ?? "你确认的梦境细节";
  const certainty = result.certaintyLevel === "reserved" ? "有保留" : result.certaintyLevel === "associative" ? "仅供联想" : "较明确";
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <section className="result-page page-enter">
      <div className="result-hero">
        <div>
          <p className="eyebrow"><span /> 已完成 · 修订 R{result.inputRevision}</p>
          <div className="result-title-row"><h1>{result.title}</h1><span className="certainty-badge">{certainty}</span></div>
          <p className="dream-summary">你的解释与结果卡片已经同时生成。卡片基于本次确认内容，只生成一次。</p>
        </div>
        <div className="result-actions-top">
          <button type="button" className="secondary-button" onClick={() => dispatch({ type: "reviseResult" })}>纠正梦象</button>
        </div>
      </div>

      {state.notice ? <p className="result-notice" role="status">✓ {state.notice}</p> : null}

      <div className="result-feature-grid">
        <article className="reading-panel">
          <div className="reading-label"><span>梦境解释</span><small>综合说明 · 非典籍原文</small></div>
          <h2>{result.coreStatement}</h2>
          <p>{result.detailedReading}</p>
          <blockquote>{result.oneLineSummary}</blockquote>
          <div className="focus-list">
            <span>你可以留意</span>
            <ol>{result.focusPoints.map((point, index) => <li key={point}><i>{String(index + 1).padStart(2, "0")}</i>{point}</li>)}</ol>
          </div>
        </article>

        <article className="result-card" aria-label="梦象结果卡片">
          <div className={`result-card-art ${hasSnake ? "" : "result-card-art-abstract"}`} aria-hidden="true"><span>梦象</span></div>
          <div className="result-card-body">
            <div className="result-card-meta"><span>{date}</span><b>自动生成 · 仅一次</b></div>
            <h2>{card.title}</h2>
            <p>{card.detailedReading}</p>
            <blockquote>{card.oneLineSummary}</blockquote>
            <div className="card-elements">{card.visualElements.map((element) => <span key={element}>{element}</span>)}</div>
            <small>P.3908 主版本已确认 · 具体条目待核验 · 仅供文化娱乐与个人记录</small>
          </div>
          <div className="result-card-actions">
            <button type="button" onClick={() => {
              dispatch({ type: "cardAction", message: "保存演示完成：PoC 未写入你的照片库。" });
              track("card_action_clicked", { action_type: "save" });
            }}>保存卡片</button>
            <button type="button" onClick={() => {
              dispatch({ type: "cardAction", message: "摘要已准备好；演示环境不会向外部发送内容。" });
              track("card_action_clicked", { action_type: "share" });
            }}>复制摘要</button>
          </div>
        </article>
      </div>

      <section className="result-section">
        <div className="section-heading"><p>这份解释从哪里来</p><span>梦境事实与来源分开呈现</span></div>
        <div className="explanation-grid">
          <article><div><span className={`evidence-tag ${hasCandidateSource ? "pending" : "empty"}`}>{hasCandidateSource ? "待核验来源" : "暂无直接记载"}</span><h2>{primarySymbol}</h2></div><p>{hasCandidateSource ? "主要梦象已由你确认，但 P.3908 中对应原文尚未完成叶面与栏位核验，不会展示成“直接记载”。" : "演示知识库没有找到可核验的直接条目。本次不会强行类比，也不会把现代物件伪装成古籍原文。"}</p></article>
          <article><div><span className="evidence-tag synthesis">模型综合</span><h2>{personalClue}</h2></div><p>这段综合只使用你确认过的情绪或行为组织解释；它不属于古籍原文，也不构成现实预测。</p></article>
        </div>
      </section>

      <section className="source-section">
        <button type="button" className="source-toggle" onClick={() => {
          dispatch({ type: "toggleSource" });
          track("source_opened", { entry_id: candidates[0]?.entryId ?? "none", verification_status: "pending" });
        }} aria-expanded={state.sourceOpen}>
          <span><small>主版本来源</small><strong>敦煌写本 P.3908《新集周公解梦书》</strong></span>
          <i>{state.sourceOpen ? "收起" : "查看来源边界"} <b aria-hidden="true">{state.sourceOpen ? "−" : "+"}</b></i>
        </button>
        {state.sourceOpen ? <div className="source-detail">
          <dl>
            <div><dt>馆藏号</dt><dd>{P3908_SOURCE.shelfmark}</dd></div>
            <div><dt>馆藏机构</dt><dd>{P3908_SOURCE.holdingInstitution}</dd></div>
            <div><dt>条目状态</dt><dd><span className="pending-text">{hasCandidateSource ? "待逐页核验" : "暂无候选条目"}</span></dd></div>
            <div><dt>具体位置</dt><dd>{hasCandidateSource ? "尚未记录叶面与栏位" : "本次未找到可核验位置"}</dd></div>
          </dl>
          <div className="source-boundary"><strong>为什么没有展示原文？</strong><p>{hasCandidateSource ? "选定主版本不等于具体条目已经核验。只有完成数字影像对照、位置记录和人工复核后，才能标记“直接记载”。" : "当前梦象没有直接候选。无出处时保留空结果，比为了完整感伪造一条古籍解释更可靠。"}</p></div>
          <div className="source-links"><a href={P3908_SOURCE.catalogUrl} target="_blank" rel="noreferrer">BnF 馆藏记录 ↗</a><a href={P3908_SOURCE.digitizationUrl} target="_blank" rel="noreferrer">Gallica 数字影像 ↗</a></div>
        </div> : null}
      </section>

      <div className="result-footer-line"><p>{result.safetyNotice}</p><button type="button" className="secondary-button" onClick={() => dispatch({ type: "reviseResult" })}>纠正梦象，生成新修订</button></div>
    </section>
  );
}

export default function DreamApp() {
  const [state, dispatch] = useReducer(reducer, {
    session: initialSession(),
    inputMode: "voice",
    recordingState: "idle",
    recordingSeconds: 0,
    processingIndex: 0,
    sourceOpen: false,
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
    }, 1700);
    return () => window.clearTimeout(timer);
  }, [state.processingIndex, state.session.step]);

  const page = (() => {
    switch (state.session.step) {
      case "drafting": return <DraftPage state={state} dispatch={dispatch} />;
      case "transcript_review": return <DraftPage state={state} dispatch={dispatch} />;
      case "symbol_review": return <SymbolsPage state={state} dispatch={dispatch} />;
      case "clarifying": return <ClarifyingPage state={state} dispatch={dispatch} />;
      case "processing": return <ProcessingPage state={state} dispatch={dispatch} />;
      case "result": return <ResultPage state={state} dispatch={dispatch} />;
      case "card": return <ResultPage state={state} dispatch={dispatch} />;
    }
  })();

  return (
    <main className={`site-shell ${state.session.step === "drafting" ? "home-shell" : "flow-shell"} ${state.session.step === "result" || state.session.step === "card" ? "result-shell" : ""}`}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <AppHeader state={state} dispatch={dispatch} />
      {page}
      <footer><p>梦境默认只在本次体验中使用，不会自动公开。</p><p>内容仅供文化娱乐与个人记录。</p></footer>
    </main>
  );
}
