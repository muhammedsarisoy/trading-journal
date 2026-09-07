"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Course, CourseInput } from "@/lib/types";

/** Eğitim serisi ekleme/düzenleme. */
export function CourseDialog({
  open,
  onOpenChange,
  course,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: Course | null;
  onSubmit: (input: CourseInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [instructor, setInstructor] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [archived, setArchived] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(course?.title ?? "");
    setInstructor(course?.instructor ?? "");
    setUrl(course?.url ?? "");
    setDescription(course?.description ?? "");
    setArchived(course?.archived ?? false);
  }, [open, course]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        instructor: instructor.trim() || null,
        url: url.trim() || null,
        description: description.trim() || null,
        archived,
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
            <DialogTitle>{course ? "Eğitimi düzenle" : "Yeni eğitim"}</DialogTitle>
            <DialogDescription>
              Bir seri, bir eğitmen ya da tek bir konu. Günler bunun altına girer.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="course-title">Eğitim adı</Label>
              <Input
                id="course-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Smart Money Concepts"
                autoFocus
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="course-instructor">Eğitmen / kanal</Label>
                <Input
                  id="course-instructor"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="Kanal adı"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="course-url">Kaynak bağlantısı</Label>
                <Input
                  id="course-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="course-description">Açıklama</Label>
              <Textarea
                id="course-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Neyi öğrenmek için izliyorsun?"
                rows={3}
              />
            </div>

            {course && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <div>
                  <Label htmlFor="course-archived">Arşivle</Label>
                  <p className="text-xs text-muted-foreground">
                    Bitmiş eğitimler listenin sonuna iner.
                  </p>
                </div>
                <Switch id="course-archived" checked={archived} onCheckedChange={setArchived} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {course ? "Değişiklikleri kaydet" : "Eğitimi oluştur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
