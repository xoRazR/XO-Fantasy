
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XO FANTASY | Trade Center",
  description: "Submit your fantasy football trades to XO FANTASY."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
