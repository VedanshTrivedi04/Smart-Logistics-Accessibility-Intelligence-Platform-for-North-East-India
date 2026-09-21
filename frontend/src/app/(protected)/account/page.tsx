import type { Metadata } from "next";
import { AccountView } from "@/features/session";

export const metadata: Metadata = { title: "Account and scope" };

export default function AccountPage() {
  return <AccountView />;
}
