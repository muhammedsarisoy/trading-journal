"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Çoklu etiket girişi: Enter ile ekler, öneri rozetlerine tıklanarak da seçilir.
 * "Nelere baktım", "hangi hatayı yaptım" gibi listeler için kullanılır.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Yaz ve Enter'a bas",
  tone = "default",
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  tone?: "default" | "warning";
  id?: string;
}) {
  const [draft, setDraft] = useState("");

  const remaining = useMemo(
    () => suggestions.filter((s) => !value.includes(s)),
    [suggestions, value],
  );

  function add(raw: string) {
    const item = raw.trim();
    if (!item || value.includes(item)) {
      setDraft("");
      return;
    }
    onChange([...value, item]);
    setDraft("");
  }

  function remove(item: string) {
    onChange(value.filter((v) => v !== item));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className={cn(
                "gap-1 pr-1",
                tone === "warning" && "bg-loss-muted text-loss",
              )}
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="rounded-sm opacity-60 hover:opacity-100"
                aria-label={`${item} etiketini kaldır`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={() => add(draft)}
      />

      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remaining.slice(0, 14).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
