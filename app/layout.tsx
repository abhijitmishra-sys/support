import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IRMA · Support Command Center",
  description: "Your workspace for support requests, real-time conversations, and service operations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
