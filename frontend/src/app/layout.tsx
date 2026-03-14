import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AscendKitProvider } from "@ascendkit/nextjs";
import AuthGate from "./components/AuthGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CedarBot — AI Chat with Sondera Harness",
  description: "Chatbot demo with Cedar policy guardrails powered by Sondera Harness",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AscendKitProvider>
          <AuthGate>{children}</AuthGate>
        </AscendKitProvider>
      </body>
    </html>
  );
}
