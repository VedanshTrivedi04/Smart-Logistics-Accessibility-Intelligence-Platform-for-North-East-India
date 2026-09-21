import type { Metadata } from "next";
import { FieldProfile } from "@/features/field";
import { PageHeader } from "@/shared/ui";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile and assignments" />
      <FieldProfile />
    </>
  );
}
