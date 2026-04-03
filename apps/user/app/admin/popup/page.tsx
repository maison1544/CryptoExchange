import { redirect } from "next/navigation";

export default function PopupPage() {
  redirect("/admin/content?tab=popup");
}
