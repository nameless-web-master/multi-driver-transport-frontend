"use client";

import Link from "next/link";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { userInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";

interface UserMenuProps {
  compact?: boolean;
}

export function UserMenu({ compact }: UserMenuProps) {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = userInitials(user.full_name);

  if (compact) {
    return (
      <div className="border-t border-border px-4 py-4 flex items-center gap-3">
        <Link
          href="/settings"
          aria-label="Open settings"
          className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0 hover:bg-primary/25 transition-colors"
        >
          {initials}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{user.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Log out"
          onClick={() => logout()}
          className="shrink-0"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border px-2 py-1.5">
      <Link
        href="/settings"
        aria-label="Open settings"
        className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold hover:opacity-90 transition-opacity"
      >
        {initials}
      </Link>
      <div className="hidden md:flex flex-col leading-tight">
        <span className="text-sm font-medium max-w-[120px] truncate">
          {user.full_name.split(" ")[0]}
        </span>
        <RoleBadge role={user.role} className="-ml-0.5" />
      </div>
      <Link
        href="/settings"
        aria-label="Account settings"
        className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <SettingsIcon className="h-4 w-4" />
      </Link>
      <Button variant="ghost" size="sm" aria-label="Log out" onClick={() => logout()}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
