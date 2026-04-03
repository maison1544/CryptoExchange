import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { DepositWithdrawalProvider } from "@/contexts/DepositWithdrawalContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ToastContainer } from "@/components/ui/ToastContainer";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NEXUS - 암호화폐 선물 거래소",
  description: "암호화폐 선물 거래 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className={notoSansKR.className}>
        <AuthProvider>
          <DepositWithdrawalProvider>
            <NotificationProvider>
              {children}
              <ToastContainer />
            </NotificationProvider>
          </DepositWithdrawalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
