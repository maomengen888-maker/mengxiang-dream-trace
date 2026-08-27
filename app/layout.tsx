import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const description = "从经过确认的梦境出发，查看可追溯、有边界的传统梦象解释。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: {
      default: "梦象｜记录昨夜的梦",
      template: "%s｜梦象",
    },
    description,
    openGraph: {
      title: "梦象｜记录昨夜的梦",
      description,
      type: "website",
      locale: "zh_CN",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "梦象：古井、蛇与远处人物构成的水墨梦境" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "梦象｜记录昨夜的梦",
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
