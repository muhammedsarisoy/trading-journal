"use client";

import { useState } from "react";

import { CalendarView } from "@/components/views/calendar-view";
import { TradesListView } from "@/components/views/trades-list-view";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TradesView = "list" | "calendar";

/**
 * İşlemler: aynı defterin iki okuması. Seçim adres satırında durur
 * (?view=calendar), böylece yenilemede ve eski /calendar bağlantısında korunur.
 */
export function TradesViews({ initialView }: { initialView: TradesView }) {
  const [view, setView] = useState<TradesView>(initialView);

  function change(next: TradesView) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-6">
      {/* "Yeni işlem" üst çubukta her sayfada var; burada tekrarlanmaz. */}
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-medium">İşlemler</h1>
        <Tabs value={view} onValueChange={(v) => change(v as TradesView)}>
          <TabsList>
            <TabsTrigger value="list">Liste</TabsTrigger>
            <TabsTrigger value="calendar">Takvim</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {view === "list" ? <TradesListView /> : <CalendarView />}
    </div>
  );
}
