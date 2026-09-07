"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CourseDialog } from "@/components/learn/course-dialog";
import { LessonDialog } from "@/components/learn/lesson-dialog";
import { NoteRow, type NotePatch } from "@/components/learn/note-row";
import { VideoFrame, type VideoHandle } from "@/components/learn/video-frame";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { coursesApi, lessonsApi, notesApi, removeLessonImages } from "@/lib/api";
import { dateShort, minutesToText } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  Course,
  CourseInput,
  Lesson,
  LessonInput,
  LessonNote,
  LessonNoteInput,
} from "@/lib/types";

interface Confirm {
  title: string;
  description: string;
  action: () => Promise<void>;
}

export default function CoursePage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const courseId = params?.courseId;
  const videoRef = useRef<VideoHandle>(null);

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const [courseDialog, setCourseDialog] = useState(false);
  const [lessonDialog, setLessonDialog] = useState<{ open: boolean; lesson: Lesson | null }>({
    open: false,
    lesson: null,
  });
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const lesson = useMemo(
    () => lessons.find((l) => l.id === selectedId) ?? null,
    [lessons, selectedId],
  );

  // -------------------------------------------------------------- yükleme

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const [c, ls] = await Promise.all([coursesApi.get(courseId), lessonsApi.list(courseId)]);
      setCourse(c);
      setLessons(ls);
      setSelectedId((current) =>
        current && ls.some((l) => l.id === current) ? current : (ls[0]?.id ?? null),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eğitim yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadNotes = useCallback(async (lessonId: string) => {
    setNotesLoading(true);
    try {
      setNotes(await notesApi.list(lessonId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Notlar okunamadı");
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setNotes([]);
      return;
    }
    void loadNotes(selectedId);
  }, [selectedId, loadNotes]);

  // Özel bucket: her görsel için imzalı adres alınır, sonuç önbelleğe yazılır.
  useEffect(() => {
    const missing = notes
      .map((n) => n.image_path)
      .filter((p): p is string => Boolean(p) && !imageUrls[p!]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(missing.map(async (p) => [p, await notesApi.signedUrl(p)] as const))
      .then((entries) => {
        if (!cancelled) setImageUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      })
      .catch(() => toast.error("Görseller okunamadı"));

    return () => {
      cancelled = true;
    };
  }, [notes, imageUrls]);

  // --------------------------------------------------------------- eğitim

  async function saveCourse(input: CourseInput) {
    if (!courseId) return;
    try {
      setCourse(await coursesApi.update(courseId, input));
      toast.success("Eğitim güncellendi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eğitim kaydedilemedi");
      throw err;
    }
  }

  function askDeleteCourse() {
    if (!course) return;
    setConfirm({
      title: "Eğitimi sil",
      description: `"${course.title}" ile birlikte ${course.lesson_count} gün ve ${course.note_count} not kalıcı olarak silinir.`,
      action: async () => {
        await coursesApi.remove(course.id);
        toast.success("Eğitim silindi.");
        router.push("/learn");
      },
    });
  }

  // ----------------------------------------------------------------- gün

  async function saveLesson(input: LessonInput) {
    if (!courseId) return;
    try {
      if (lessonDialog.lesson) {
        const updated = await lessonsApi.update(lessonDialog.lesson.id, input);
        setLessons((prev) => sortLessons(prev.map((l) => (l.id === updated.id ? updated : l))));
      } else {
        const created = await lessonsApi.create(courseId, input);
        setLessons((prev) => sortLessons([...prev, created]));
        setSelectedId(created.id);
      }
      toast.success("Gün kaydedildi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gün kaydedilemedi");
      throw err;
    }
  }

  async function toggleCompleted() {
    if (!lesson) return;
    const next = { ...lessonInput(lesson), completed: !lesson.completed };
    setLessons((prev) =>
      prev.map((l) => (l.id === lesson.id ? { ...l, completed: !l.completed } : l)),
    );
    try {
      const updated = await lessonsApi.update(lesson.id, next);
      setLessons((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gün güncellenemedi");
      void load();
    }
  }

  function askDeleteLesson() {
    if (!lesson) return;
    setConfirm({
      title: "Günü sil",
      description: `"${lesson.title}" ve içindeki ${lesson.note_count} not kalıcı olarak silinir.`,
      action: async () => {
        await lessonsApi.remove(lesson.id);
        setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
        setSelectedId((prev) => (prev === lesson.id ? null : prev));
        toast.success("Gün silindi.");
      },
    });
  }

  // ---------------------------------------------------------------- notlar

  async function addNote() {
    if (!selectedId) return;
    try {
      const created = await notesApi.create(selectedId, {
        sort_order: null,
        heading: null,
        body: null,
        image_path: null,
        image_side: "right",
        timestamp_sec: null,
      });
      setNotes((prev) => [...prev, created]);
      bumpNoteCount(selectedId, 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not eklenemedi");
    }
  }

  async function patchNote(note: LessonNote, patch: NotePatch) {
    const optimistic = { ...note, ...patch } as LessonNote;
    setNotes((prev) => prev.map((n) => (n.id === note.id ? optimistic : n)));
    try {
      const saved = await notesApi.update(note.id, { ...noteInput(note), ...patch });
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Not kaydedilemedi");
      if (selectedId) void loadNotes(selectedId);
    }
  }

  async function uploadImage(note: LessonNote, file: File) {
    if (!selectedId) return;
    setUploadingId(note.id);
    const previous = note.image_path;
    try {
      const path = await notesApi.uploadImage(selectedId, file);
      await patchNote(note, { image_path: path });
      if (previous) await removeLessonImages([previous]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel yüklenemedi");
    } finally {
      setUploadingId(null);
    }
  }

  async function removeImage(note: LessonNote) {
    const previous = note.image_path;
    await patchNote(note, { image_path: null });
    if (previous) await removeLessonImages([previous]);
  }

  function askDeleteNote(note: LessonNote) {
    setConfirm({
      title: "Notu sil",
      description: "Bu blok ve içindeki grafik kalıcı olarak silinir.",
      action: async () => {
        await notesApi.remove(note.id);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        if (selectedId) bumpNoteCount(selectedId, -1);
      },
    });
  }

  async function moveNote(note: LessonNote, direction: -1 | 1) {
    if (!selectedId) return;
    const index = notes.findIndex((n) => n.id === note.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= notes.length) return;

    const next = [...notes];
    [next[index], next[target]] = [next[target], next[index]];
    setNotes(next);

    try {
      setNotes(await notesApi.reorder(selectedId, next.map((n) => n.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sıra değiştirilemedi");
      void loadNotes(selectedId);
    }
  }

  function bumpNoteCount(lessonId: string, delta: number) {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId ? { ...l, note_count: Math.max(0, l.note_count + delta) } : l,
      ),
    );
  }

  // ---------------------------------------------------------------- görünüm

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Eğitim bulunamadı.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/learn">Eğitim listesine dön</Link>
        </Button>
      </div>
    );
  }

  const nextDayNo = lessons.reduce((max, l) => Math.max(max, l.day_no ?? 0), 0) + 1;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------ eğitim başlığı */}
      <header className="space-y-2">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Eğitim
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-medium text-pretty">{course.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[
                course.instructor,
                `${course.lesson_count} gün`,
                `${course.note_count} not`,
                `${course.completed_count} tamamlandı`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {course.url && (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <a href={course.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Kaynak
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eğitimi düzenle"
              onClick={() => setCourseDialog(true)}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eğitimi sil"
              className="text-muted-foreground hover:text-destructive"
              onClick={askDeleteCourse}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLessonDialog({ open: true, lesson: null })}
            >
              <Plus className="size-4" aria-hidden="true" />
              Gün ekle
            </Button>
          </div>
        </div>

        {course.description && (
          <p className="max-w-[68ch] text-sm text-muted-foreground">{course.description}</p>
        )}
      </header>

      {lessons.length === 0 ? (
        <div className="border border-dashed border-border px-6 py-16 text-center">
          <StickyNote className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            Bu eğitimde henüz gün yok. İlk günü ekle, videonun adresini yapıştır.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => setLessonDialog({ open: true, lesson: null })}
          >
            <Plus className="size-4" aria-hidden="true" />
            İlk günü ekle
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          {/* --------------------------------------------------- gün şeridi */}
          <aside className="md:border-r md:border-border md:pr-4">
            <div className="flex gap-2 overflow-x-auto pb-2 md:block md:overflow-visible md:pb-0">
              {lessons.map((l) => {
                const active = l.id === selectedId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "shrink-0 border-b-2 px-3 py-2 text-left transition-colors md:w-full md:shrink md:border-b-0 md:border-l-2 md:px-0 md:pl-3",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:border-rule-strong hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="num text-xs">
                        {l.day_no != null ? `Gün ${String(l.day_no).padStart(2, "0")}` : "—"}
                      </span>
                      {l.completed && <Check className="size-3" aria-label="tamamlandı" />}
                    </div>
                    <div className="mt-0.5 truncate text-sm md:whitespace-normal">{l.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="num">{l.note_count}</span> not
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ------------------------------------------------------ gün içi */}
          <section className="min-w-0 space-y-4">
            {lesson ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-medium text-pretty">
                      {lesson.day_no != null && (
                        <span className="num mr-2 text-muted-foreground">
                          {String(lesson.day_no).padStart(2, "0")}
                        </span>
                      )}
                      {lesson.title}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        lesson.studied_on ? dateShort(lesson.studied_on) : null,
                        lesson.duration_min ? minutesToText(lesson.duration_min) : null,
                        `${notes.length} not`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleCompleted}
                      aria-pressed={lesson.completed}
                      className={cn("text-xs", !lesson.completed && "text-muted-foreground")}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      {lesson.completed ? "Tamamlandı" : "Tamamlandı işaretle"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Günü düzenle"
                      onClick={() => setLessonDialog({ open: true, lesson })}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Günü sil"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={askDeleteLesson}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {lesson.summary && (
                  <p className="max-w-[68ch] text-sm text-muted-foreground">{lesson.summary}</p>
                )}

                {lesson.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {lesson.tags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <VideoFrame ref={videoRef} url={lesson.video_url} title={lesson.title} />

                {/* ------------------------------------------------- notlar */}
                {notesLoading ? (
                  <div className="flex h-32 items-center justify-center text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  </div>
                ) : notes.length === 0 ? (
                  <div className="border-t border-border py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Bu günün notu yok. Bir blok aç: bir yanda grafik, öbür yanda not.
                    </p>
                  </div>
                ) : (
                  <div>
                    {notes.map((note, index) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        index={index}
                        count={notes.length}
                        imageUrl={note.image_path ? imageUrls[note.image_path] : undefined}
                        busy={uploadingId === note.id}
                        hasVideo={Boolean(lesson.video_url)}
                        onPatch={(patch) =>
                          patch.image_path === null && note.image_path
                            ? void removeImage(note)
                            : void patchNote(note, patch)
                        }
                        onDelete={() => askDeleteNote(note)}
                        onMove={(direction) => void moveNote(note, direction)}
                        onSeek={(seconds) => videoRef.current?.seek(seconds)}
                        onUpload={(file) => void uploadImage(note, file)}
                      />
                    ))}
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <Button variant="outline" size="sm" onClick={() => void addNote()}>
                    <Plus className="size-4" aria-hidden="true" />
                    Not ekle
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Soldan bir gün seç.</p>
            )}
          </section>
        </div>
      )}

      <CourseDialog
        open={courseDialog}
        onOpenChange={setCourseDialog}
        course={course}
        onSubmit={saveCourse}
      />

      <LessonDialog
        open={lessonDialog.open}
        onOpenChange={(open) => setLessonDialog((prev) => ({ ...prev, open }))}
        lesson={lessonDialog.lesson}
        nextDayNo={nextDayNo}
        onSubmit={saveLesson}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const pending = confirm;
                setConfirm(null);
                try {
                  await pending?.action();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Silinemedi");
                }
              }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Gün listesi: numaraya göre, numarasızlar sona. */
function sortLessons(items: Lesson[]) {
  return [...items].sort((a, b) => {
    if (a.day_no === b.day_no) return a.created_at.localeCompare(b.created_at);
    if (a.day_no === null) return 1;
    if (b.day_no === null) return -1;
    return a.day_no - b.day_no;
  });
}

function lessonInput(lesson: Lesson): LessonInput {
  return {
    day_no: lesson.day_no,
    title: lesson.title,
    video_url: lesson.video_url,
    studied_on: lesson.studied_on,
    duration_min: lesson.duration_min,
    summary: lesson.summary,
    tags: lesson.tags,
    completed: lesson.completed,
  };
}

function noteInput(note: LessonNote): LessonNoteInput {
  return {
    sort_order: null,
    heading: note.heading,
    body: note.body,
    image_path: note.image_path,
    image_side: note.image_side,
    timestamp_sec: note.timestamp_sec,
  };
}
