import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeCraft 设计训练协作平台",
  description: "内部设计案例、评审、盲测与训练数据协作平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

