import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Rental Watch — Your next home, in perspective",
  description:
    "Track rental inventory, compare prices, and catch the right moment to move.",
  icons: { icon: "/icon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
