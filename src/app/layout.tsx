import type { Metadata, Viewport } from "next";

import { SessionProvider } from "@/components/SessionProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ganpati CHS — Member Portal",
    template: "%s · Ganpati CHS",
  },
  description:
    "Document and notice portal for members of Ganpati Co-operative Housing Society Ltd., Sector 19, Nerul, Navi Mumbai, during redevelopment.",
  robots: {
    // The portal holds confidential society records; keep it out of search.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
