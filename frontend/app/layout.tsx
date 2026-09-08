import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AI SOC ANALYSIS SYSTEM | Enterprise Security Operations",
  description:
    "AI-powered cybersecurity operations assistant for cloud and enterprise security teams",
  icons: {
    icon: "/brand/soc-icon.png",
    apple: "/brand/soc-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
