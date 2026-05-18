import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wechat-oa",
  description: "本地微信公众号经营工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
