import { redirect } from "next/navigation";

export default function CoinSymbolsPage() {
  redirect("/admin/settings?tab=symbols");
}
