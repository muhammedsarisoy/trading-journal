"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { CourseDialog } from "@/components/learn/course-dialog";
import { Button } from "@/components/ui/button";
import { coursesApi } from "@/lib/api";
import { dateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Course, CourseInput } from "@/lib/types";

export default function LearnPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCourses(await coursesApi.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eğitimler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(input: CourseInput) {
    try {
      const course = await coursesApi.create(input);
      toast.success("Eğitim oluşturuldu.");
      router.push(`/learn/${course.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eğitim kaydedilemedi");
      throw err;
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-pretty">Eğitim</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            İzlediğin videolar, günlere bölünmüş notlar ve grafikler.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Eğitim ekle
        </Button>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      ) : courses.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-16 text-center">
          <GraduationCap className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            Henüz eğitim yok. Bir seri aç, günlerini ekle, videoyu izlerken notunu yanına yaz.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            İlk eğitimi ekle
          </Button>
        </div>
      ) : (
        <div className="border-b border-border">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/learn/${course.id}`}
              className={cn(
                "flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-1 py-4 transition-colors",
                "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                course.archived && "opacity-60",
              )}
            >
              <div className="min-w-56 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {course.title}
                  {course.archived && (
                    <span className="border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                      arşiv
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    course.instructor,
                    course.last_studied_on
                      ? `son çalışma ${dateShort(course.last_studied_on)}`
                      : "henüz çalışılmadı",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="flex items-center gap-6">
                <Count value={course.lesson_count} label="gün" />
                <Count value={course.note_count} label="not" />
                <Progress done={course.completed_count} total={course.lesson_count} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <CourseDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={create} />
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-right">
      <div className="num text-sm">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

/** Tamamlanan gün oranı — renk taşımaz, yalnız doluluk gösterir. */
function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? done / total : 0;
  return (
    <div className="w-24">
      <div className="h-[3px] w-full bg-muted">
        <div className="h-full bg-foreground" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        <span className="num">{done}</span>/<span className="num">{total}</span> tamamlandı
      </div>
    </div>
  );
}
