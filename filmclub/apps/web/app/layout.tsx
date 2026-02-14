import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Filmclub",
  description: "Companion app for shared movie nights"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
