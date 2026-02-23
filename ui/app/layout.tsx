import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AegisX — Next-Gen Firewall Platform",
  description: "Open-source NGFW + Load Balancer management console",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#090e1a] text-slate-300 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
