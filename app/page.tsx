import type { Metadata } from "next";
import DreamApp from "./DreamApp";

export const metadata: Metadata = {
  title: "记录昨夜的梦",
  description: "从经过确认的梦境出发，查看可追溯、有边界的传统梦象解释。",
};

export default function Home() {
  return <DreamApp />;
}
