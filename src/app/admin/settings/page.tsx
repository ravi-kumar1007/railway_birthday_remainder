import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Health checks and message options." />
      <ComingSoon phase={6}>Health checks for the database, Meta token and active template, plus the name format setting.</ComingSoon>
    </>
  );
}
