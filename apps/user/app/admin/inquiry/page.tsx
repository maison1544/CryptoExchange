import { redirect } from "next/navigation";

export default function InquiryPage() {
  redirect("/admin/content?tab=inquiry");
}
