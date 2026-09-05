"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, LayoutDashboard, List, LogOut, Menu, Plus, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/trades", label: "İşlemler", icon: List },
  { href: "/analytics", label: "Analiz", icon: BarChart3 },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 border-l-2 py-2 pl-3 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:border-rule-strong hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Şase: sabit üst şerit, ince kenar navigasyonu, geniş içerik alanı. */
export function AppShell({
  children,
  userEmail,
  displayName,
}: {
  children: React.ReactNode;
  userEmail: string;
  displayName: string;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menüyü aç">
              <Menu className="size-4" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-4">
            <SheetTitle className="mb-4 text-sm font-medium">Trading Journal</SheetTitle>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-medium tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Ticks className="text-long" />
          <span translate="no">Trading Journal</span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm" variant="outline">
            <Link href="/trades/new">
              <Plus className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Yeni İşlem</span>
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="num text-xs">
                {displayName}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-sm font-medium">{displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{userEmail}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="size-4" aria-hidden="true" />
                  Ayarlar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={signOut}>
                <LogOut className="size-4" aria-hidden="true" />
                Çıkış Yap
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-48 shrink-0 border-r border-border py-4 md:block">
          <NavLinks />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Üç mum: konunun kendi işareti, jenerik logo değil. */
function Ticks({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" fill="none">
        <path d="M3 11V5" />
        <path d="M8 13V3" />
        <path d="M13 9V6" />
      </g>
    </svg>
  );
}
