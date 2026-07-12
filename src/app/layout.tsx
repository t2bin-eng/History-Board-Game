import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "역사 원정대 | 퀴즈 보드 레이스",
  description: "역사 퀴즈로 시대를 횡단하는 교실용 보드게임",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
