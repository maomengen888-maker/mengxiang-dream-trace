import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import DreamApp from "../app/DreamApp";

class MockSpeechRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    this.onstart?.();
    this.onresult?.({ results: [{ isFinal: true, 0: { transcript: "我梦见一条蛇盘在古井边" } }] });
  }

  stop() { this.onend?.(); }
  abort() {}
}

describe("正常路径前半段", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });

  it("空输入不跳页并显示就地提示", () => {
    render(<DreamApp />);
    expect(screen.queryByRole("group", { name: "梦境输入方式" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始语音记录" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /开始寻象/ }));
    expect(screen.getByText("先写下一点梦里的内容，再继续。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeInTheDocument();
  });

  it("提交文字后跳过内容确认并直接生成梦象", () => {
    render(<DreamApp />);
    fireEvent.change(screen.getByLabelText("写下梦境"), { target: { value: "夜里我在一座旧宅里，看见一条蛇盘在古井边，旁边站着一位陌生老人。我有点害怕，又忍不住靠近。" } });
    fireEvent.click(screen.getByRole("button", { name: /开始寻象/ }));

    expect(screen.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "先确认梦被正确记下" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("完整转写内容")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("古井")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("古镜")).not.toBeInTheDocument();
  });

  it("语音先转写到输入框，确认后才进入梦象识别", () => {
    render(<DreamApp />);
    fireEvent.click(screen.getByRole("button", { name: "开始语音记录" }));
    expect(screen.getByLabelText("写下梦境")).toHaveValue("我梦见一条蛇盘在古井边");
    expect(screen.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "结束转写" }));
    expect(screen.getByText(/请先检查错字/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("写下梦境"), { target: { value: "我梦见一条蛇盘在古井旁边" } });
    fireEvent.click(screen.getByRole("button", { name: /开始寻象/ }));
    expect(screen.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeInTheDocument();
    expect(screen.getByText(/古井旁边/)).toBeInTheDocument();
  });

  it("展示四个常见梦境提示并可填入输入框", () => {
    render(<DreamApp />);
    const labels = ["掉入悬崖", "被蛇追", "牙齿掉落", "水中迷路"];
    labels.forEach((label) => expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /被蛇追/ }));
    expect((screen.getByLabelText("写下梦境") as HTMLTextAreaElement).value).toContain("蛇一直追着我");
  });

  it("损坏的会话快照会被清除并显示可恢复提示", async () => {
    sessionStorage.setItem("mengxiang:poc:session:v1", "{not-json");
    render(<DreamApp />);

    await waitFor(() => expect(screen.getByText("上次会话数据无法恢复，已为你安全地重新开始。")).toBeInTheDocument());
    expect(sessionStorage.getItem("mengxiang:poc:session:v1")).not.toBe("{not-json");
    expect(screen.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeInTheDocument();
  });

  it("模糊水面进入单轮位置澄清", () => {
    render(<DreamApp />);
    fireEvent.change(screen.getByLabelText("写下梦境"), { target: { value: "我梦见眼前是一片看不清的水面，四周很安静。" } });
    fireEvent.click(screen.getByRole("button", { name: /开始寻象/ }));
    fireEvent.click(screen.getByRole("button", { name: /看起来准确/ }));
    expect(screen.getByRole("heading", { name: "你在岸边，还是已经进入水中？" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^岸边/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^水中/ })).toBeInTheDocument();
  });
});
