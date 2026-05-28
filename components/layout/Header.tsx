"use client";

import { Bell, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  /**
   * Called when the user taps the hamburger button on narrow viewports.
   * The button is only rendered when this handler is supplied.
   */
  onOpenMobileNav?: () => void;
}

export function Header({
  title = "Dashboard",
  subtitle = "Overview of your multi-driver transport operations.",
  onOpenMobileNav,
}: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="h-20 flex items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          {onOpenMobileNav && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Open navigation"
              onClick={onOpenMobileNav}
              className="lg:hidden shrink-0"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold tracking-tight leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden sm:block text-sm text-muted-foreground mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {mounted ? (
              isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Notifications (coming soon)"
            title="Notifications coming soon"
            disabled
            className="hidden sm:inline-flex"
          >
            <Bell className="h-4 w-4" />
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
