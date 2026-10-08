import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "نوب‌یار | پلتفرم نوبت‌دهی و صف زنده",
  description:
    "سامانه SaaS چندمستاجری نوبت‌دهی، مدیریت صف زنده و اطلاع‌رسانی پیامکی برای کلینیک‌ها، سالن‌ها، تعمیرگاه‌ها و مراکز خدمات.",
  keywords: ["نوبت‌دهی", "صف زنده", "مدیریت نوبت", "SaaS", "تقویم جلالی"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
