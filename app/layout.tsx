import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { BottomNav } from "@/components/bottom-nav";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nutri",
  description: "Assistente de alimentacao para a casa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background antialiased font-sans">
        <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">{children}</main>
        <BottomNav />
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
