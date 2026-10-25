import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Send logs" };

export default function LogsPage() {
  return (
    <>
      <PageHeader title="Send logs" description="Every birthday message and its delivery status." />
      <ComingSoon phase={6}>Filter sends by date and status, and retry failed messages.</ComingSoon>
    </>
  );
}
