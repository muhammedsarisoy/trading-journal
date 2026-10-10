"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, LayoutDashboard, List, LogOut, Plus, Settings, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { authApi } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/trades", label: "İşlemler", icon: List },
  { href: "/prop", label: "Prop", icon: Wallet },
  { href: "/learn", label: "Eğitim", icon: GraduationCap },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Masaüstü: başlıkta yatay sekmeler. */
function TopNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Ana menü" className="hidden items-center gap-1 md:flex">
      {NAV.map(({ href, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobil: başparmak erişiminde alt sekme çubuğu. */
function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Ana menü"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[11px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

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

  async function signOut() {
    try {
      await authApi.logout();
    } catch {
      // Oturum zaten düşmüşse de giriş ekranına dönülür.
    }
    router.push("/login");
    router.refresh();
  }

  const initial = (displayName.trim()[0] ?? "?").toLocaleUpperCase("tr");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 md:px-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm font-medium tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Ticks className="text-long" />
            <span translate="no">Trading Journal</span>
          </Link>

          <TopNav />

          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/trades/new">
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Yeni işlem</span>
                <span className="sr-only sm:hidden">Yeni işlem</span>
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-accent text-sm font-medium"
                  aria-label={`Hesap menüsü: ${displayName}`}
                >
                  {initial}
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
                  Çıkış yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobilde alt menü içeriğin üstüne binmesin. */}
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-10">
        {children}
      </main>

      <BottomNav />
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
