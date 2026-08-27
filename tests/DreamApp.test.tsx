import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import DreamApp from "../app/DreamApp";

describe("正常路径前半段", () => {
  beforeEach(() => sessionStorage.clear());

  it("空输入不跳页并显示就地提示", () => {
    render(<DreamApp />);
    fireEvent.click(screen.getByRole("button", { name: /记下这个梦/ }));
    expect(screen.getByText("先写下一点梦里的内容，再继续。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /记录昨夜的梦/ })).toBeInTheDocument();
  });

  it("示例转写先出现古镜，纠正后梦象只包含古井", () => {
    render(<DreamApp />);
    fireEvent.click(screen.getByRole("button", { name: "填入示例梦境" }));
    fireEvent.click(screen.getByRole("button", { name: /记下这个梦/ }));

    const transcript = screen.getByLabelText("完整转写内容");
    expect((transcript as HTMLTextAreaElement).value).toContain("古镜");
    fireEvent.change(transcript, { target: { value: (transcript as HTMLTextAreaElement).value.replace("古镜", "古井") } });
    fireEvent.click(screen.getByRole("button", { name: /确认内容/ }));

    expect(screen.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("古井")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("古镜")).not.toBeInTheDocument();
  });

  it("损坏的会话快照会被清除并显示可恢复提示", async () => {
    sessionStorage.setItem("mengxiang:poc:session:v1", "{not-json");
    render(<DreamApp />);

    await waitFor(() => expect(screen.getByText("上次会话数据无法恢复，已为你安全地重新开始。")).toBeInTheDocument());
    expect(sessionStorage.getItem("mengxiang:poc:session:v1")).not.toBe("{not-json");
    expect(screen.getByRole("heading", { name: /记录昨夜的梦/ })).toBeInTheDocument();
  });
});
