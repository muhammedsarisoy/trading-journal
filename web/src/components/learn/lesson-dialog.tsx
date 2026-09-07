"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lesson, LessonInput } from "@/lib/types";

/** Gün ekleme/düzenleme. Gün numarası boş bırakılırsa sıradaki numara verilir. */
export function LessonDialog({
  open,
  onOpenChange,
  lesson,
  nextDayNo,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson?: Lesson | null;
  nextDayNo: number;
  onSubmit: (input: LessonInput) => Promise<void>;
}) {
  const [dayNo, setDayNo] = useState("");
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [studiedOn, setStudiedOn] = useState("");
  const [duration, setDuration] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDayNo(lesson?.day_no != null ? String(lesson.day_no) : String(nextDayNo));
    setTitle(lesson?.title ?? "");
    setVideoUrl(lesson?.video_url ?? "");
    setStudiedOn(lesson?.studied_on?.slice(0, 10) ?? today());
    setDuration(lesson?.duration_min != null ? String(lesson.duration_min) : "");
    setSummary(lesson?.summary ?? "");
    setTags(lesson?.tags ?? []);
  }, [open, lesson, nextDayNo]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        day_no: dayNo.trim() ? Number(dayNo) : null,
        title: title.trim(),
        video_url: videoUrl.trim() || null,
        // Gün, saat diliminden bağımsız olsun diye UTC gece yarısı gönderilir.
        studied_on: studiedOn ? `${studiedOn}T00:00:00Z` : null,
        duration_min: duration.trim() ? Number(duration) : null,
        summary: summary.trim() || null,
        tags,
        completed: lesson?.completed ?? false,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{lesson ? "Günü düzenle" : "Yeni gün"}</DialogTitle>
            <DialogDescription>
              Videonun adresini yapıştır; sayfada oynar, notları yanına alırsın.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-[5rem_1fr] gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lesson-day">Gün</Label>
                <Input
                  id="lesson-day"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={dayNo}
                  onChange={(e) => setDayNo(e.target.value)}
                  className="num"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lesson-title">Başlık</Label>
                <Input
                  id="lesson-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Likidite avı ve giriş modeli"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lesson-video">Video bağlantısı</Label>
              <Input
                id="lesson-video"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              <p className="text-xs text-muted-foreground">YouTube, Vimeo ya da mp4 adresi.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lesson-date">Çalıştığım gün</Label>
                <Input
                  id="lesson-date"
                  type="date"
                  value={studiedOn}
                  onChange={(e) => setStudiedOn(e.target.value)}
                  className="num"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lesson-duration">Süre (dakika)</Label>
                <Input
                  id="lesson-duration"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="45"
                  className="num"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lesson-summary">Özet</Label>
              <Textarea
                id="lesson-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Bu günün tek cümlelik çıkarımı."
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lesson-tags">Etiketler</Label>
              <TagInput id="lesson-tags" value={tags} onChange={setTags} placeholder="Konu ekle" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {lesson ? "Değişiklikleri kaydet" : "Günü ekle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
