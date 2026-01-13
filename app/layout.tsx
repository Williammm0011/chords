import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chord Clip Looper",
  description: "Download YouTube audio and loop specific regions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

