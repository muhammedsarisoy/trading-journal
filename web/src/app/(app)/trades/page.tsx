import { TradesViews } from "@/components/views/trades-views";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <TradesViews initialView={view === "calendar" ? "calendar" : "list"} />;
}
