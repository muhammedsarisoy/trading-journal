package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// ---------------------------------------------------------------- Eğitimler

const courseColumns = `c.id, c.title, c.instructor, c.url, c.description, c.archived,
	c.lesson_count, c.completed_count, c.note_count, c.last_studied_on,
	c.created_at, c.updated_at`

func scanCourse(row pgx.Row) (model.Course, error) {
	var c model.Course
	err := row.Scan(
		&c.ID, &c.Title, &c.Instructor, &c.URL, &c.Description, &c.Archived,
		&c.LessonCount, &c.CompletedCount, &c.NoteCount, &c.LastStudiedOn,
		&c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func (s *Store) ListCourses(ctx context.Context, userID string) ([]model.Course, error) {
	rows, err := s.pool.Query(ctx,
		"select "+courseColumns+`
		 from public.courses_enriched c
		 where c.user_id = $1
		 order by c.archived, c.created_at desc`, userID)
	if err != nil {
		return nil, fmt.Errorf("eğitimler okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.Course{}
	for rows.Next() {
		c, err := scanCourse(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) GetCourse(ctx context.Context, userID, id string) (*model.Course, error) {
	c, err := scanCourse(s.pool.QueryRow(ctx,
		"select "+courseColumns+`
		 from public.courses_enriched c
		 where c.user_id = $1 and c.id = $2`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("eğitim okunamadı: %w", err)
	}
	return &c, nil
}

func (s *Store) CreateCourse(ctx context.Context, userID string, in model.CourseInput) (*model.Course, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`insert into public.courses (user_id, title, instructor, url, description, archived)
		 values ($1,$2,$3,$4,$5,$6) returning id`,
		userID, in.Title, in.Instructor, in.URL, in.Description, in.Archived).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("eğitim kaydedilemedi: %w", err)
	}
	return s.GetCourse(ctx, userID, id)
}

func (s *Store) UpdateCourse(ctx context.Context, userID, id string, in model.CourseInput) (*model.Course, error) {
	tag, err := s.pool.Exec(ctx,
		`update public.courses
		 set title = $3, instructor = $4, url = $5, description = $6, archived = $7
		 where id = $1 and user_id = $2`,
		id, userID, in.Title, in.Instructor, in.URL, in.Description, in.Archived)
	if err != nil {
		return nil, fmt.Errorf("eğitim güncellenemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.GetCourse(ctx, userID, id)
}

func (s *Store) DeleteCourse(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx,
		"delete from public.courses where id = $1 and user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("eğitim silinemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------- Günler

const lessonColumns = `l.id, l.course_id, l.day_no, l.title, l.video_url, l.studied_on,
	l.duration_min, l.summary, l.tags, l.completed,
	(select count(*)::int from public.lesson_notes n where n.lesson_id = l.id),
	l.created_at, l.updated_at`

func scanLesson(row pgx.Row) (model.Lesson, error) {
	var l model.Lesson
	err := row.Scan(
		&l.ID, &l.CourseID, &l.DayNo, &l.Title, &l.VideoURL, &l.StudiedOn,
		&l.DurationMin, &l.Summary, &l.Tags, &l.Completed, &l.NoteCount,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if l.Tags == nil {
		l.Tags = []string{}
	}
	return l, err
}

func (s *Store) ListLessons(ctx context.Context, userID, courseID string) ([]model.Lesson, error) {
	rows, err := s.pool.Query(ctx,
		"select "+lessonColumns+`
		 from public.lessons l
		 where l.user_id = $1 and l.course_id = $2
		 order by l.day_no nulls last, l.created_at`, userID, courseID)
	if err != nil {
		return nil, fmt.Errorf("günler okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.Lesson{}
	for rows.Next() {
		l, err := scanLesson(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) GetLesson(ctx context.Context, userID, id string) (*model.Lesson, error) {
	l, err := scanLesson(s.pool.QueryRow(ctx,
		"select "+lessonColumns+`
		 from public.lessons l
		 where l.user_id = $1 and l.id = $2`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gün okunamadı: %w", err)
	}
	return &l, nil
}

// CreateLesson, günü açar. day_no boş bırakılırsa serideki sıradaki numara verilir.
func (s *Store) CreateLesson(ctx context.Context, userID, courseID string, in model.LessonInput) (*model.Lesson, error) {
	var owns bool
	if err := s.pool.QueryRow(ctx,
		"select exists(select 1 from public.courses where id = $1 and user_id = $2)",
		courseID, userID).Scan(&owns); err != nil {
		return nil, fmt.Errorf("eğitim doğrulanamadı: %w", err)
	}
	if !owns {
		return nil, ErrNotFound
	}

	var id string
	err := s.pool.QueryRow(ctx,
		`insert into public.lessons
		   (user_id, course_id, day_no, title, video_url, studied_on, duration_min, summary, tags, completed)
		 values (
		   $1, $2,
		   coalesce($3, (select coalesce(max(day_no), 0) + 1 from public.lessons where course_id = $2)),
		   $4, $5, $6, $7, $8, $9, $10)
		 returning id`,
		userID, courseID, in.DayNo, in.Title, in.VideoURL, in.StudiedOn,
		in.DurationMin, in.Summary, in.Tags, in.Completed).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("gün kaydedilemedi: %w", err)
	}
	return s.GetLesson(ctx, userID, id)
}

func (s *Store) UpdateLesson(ctx context.Context, userID, id string, in model.LessonInput) (*model.Lesson, error) {
	tag, err := s.pool.Exec(ctx,
		`update public.lessons
		 set day_no = $3, title = $4, video_url = $5, studied_on = $6,
		     duration_min = $7, summary = $8, tags = $9, completed = $10
		 where id = $1 and user_id = $2`,
		id, userID, in.DayNo, in.Title, in.VideoURL, in.StudiedOn,
		in.DurationMin, in.Summary, in.Tags, in.Completed)
	if err != nil {
		return nil, fmt.Errorf("gün güncellenemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.GetLesson(ctx, userID, id)
}

func (s *Store) DeleteLesson(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx,
		"delete from public.lessons where id = $1 and user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("gün silinemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------- Notlar

const noteColumns = `id, lesson_id, sort_order, heading, body, image_path, image_side,
	timestamp_sec, created_at, updated_at`

func scanNote(row pgx.Row) (model.LessonNote, error) {
	var n model.LessonNote
	err := row.Scan(
		&n.ID, &n.LessonID, &n.SortOrder, &n.Heading, &n.Body, &n.ImagePath,
		&n.ImageSide, &n.TimestampSec, &n.CreatedAt, &n.UpdatedAt,
	)
	return n, err
}

func (s *Store) ListNotes(ctx context.Context, userID, lessonID string) ([]model.LessonNote, error) {
	rows, err := s.pool.Query(ctx,
		"select "+noteColumns+`
		 from public.lesson_notes
		 where user_id = $1 and lesson_id = $2
		 order by sort_order, created_at`, userID, lessonID)
	if err != nil {
		return nil, fmt.Errorf("notlar okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.LessonNote{}
	for rows.Next() {
		n, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// CreateNote, bloğu ekler. Sıra verilmezse günün sonuna yazılır.
func (s *Store) CreateNote(ctx context.Context, userID, lessonID string, in model.LessonNoteInput) (*model.LessonNote, error) {
	var owns bool
	if err := s.pool.QueryRow(ctx,
		"select exists(select 1 from public.lessons where id = $1 and user_id = $2)",
		lessonID, userID).Scan(&owns); err != nil {
		return nil, fmt.Errorf("gün doğrulanamadı: %w", err)
	}
	if !owns {
		return nil, ErrNotFound
	}

	n, err := scanNote(s.pool.QueryRow(ctx,
		`insert into public.lesson_notes
		   (user_id, lesson_id, sort_order, heading, body, image_path, image_side, timestamp_sec)
		 values (
		   $1, $2,
		   coalesce($3, (select coalesce(max(sort_order), -1) + 1 from public.lesson_notes where lesson_id = $2)),
		   $4, $5, $6, $7, $8)
		 returning `+noteColumns,
		userID, lessonID, in.SortOrder, in.Heading, in.Body, in.ImagePath, in.ImageSide, in.TimestampSec))
	if err != nil {
		return nil, fmt.Errorf("not kaydedilemedi: %w", err)
	}
	return &n, nil
}

func (s *Store) UpdateNote(ctx context.Context, userID, id string, in model.LessonNoteInput) (*model.LessonNote, error) {
	n, err := scanNote(s.pool.QueryRow(ctx,
		`update public.lesson_notes
		 set sort_order = coalesce($3, sort_order), heading = $4, body = $5,
		     image_path = $6, image_side = $7, timestamp_sec = $8
		 where id = $1 and user_id = $2
		 returning `+noteColumns,
		id, userID, in.SortOrder, in.Heading, in.Body, in.ImagePath, in.ImageSide, in.TimestampSec))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("not güncellenemedi: %w", err)
	}
	return &n, nil
}

// DeleteNote, kaydı siler ve Storage temizliği için görsel yolunu döner.
func (s *Store) DeleteNote(ctx context.Context, userID, id string) (string, error) {
	var path *string
	err := s.pool.QueryRow(ctx,
		"delete from public.lesson_notes where id = $1 and user_id = $2 returning image_path",
		id, userID).Scan(&path)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("not silinemedi: %w", err)
	}
	if path == nil {
		return "", nil
	}
	return *path, nil
}

// ReorderNotes, verilen kimlik sırasını sort_order'a yazar. Listede olmayan
// ya da başka kullanıcıya ait kimlikler sessizce atlanır.
func (s *Store) ReorderNotes(ctx context.Context, userID, lessonID string, ids []string) error {
	_, err := s.pool.Exec(ctx,
		`update public.lesson_notes n
		 set sort_order = v.ord
		 from unnest($3::text[]) with ordinality as v(id, ord)
		 where n.id = v.id::uuid and n.user_id = $1 and n.lesson_id = $2`,
		userID, lessonID, ids)
	if err != nil {
		return fmt.Errorf("sıra güncellenemedi: %w", err)
	}
	return nil
}

// ---------------------------------------------- Storage yolu toplayıcıları

func (s *Store) collectPaths(ctx context.Context, sql string, args ...any) ([]string, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths = append(paths, p)
	}
	return paths, rows.Err()
}

// NoteImagePathsForLesson, gün silinmeden önce kaldırılacak görselleri verir.
func (s *Store) NoteImagePathsForLesson(ctx context.Context, userID, lessonID string) ([]string, error) {
	return s.collectPaths(ctx,
		`select image_path from public.lesson_notes
		 where user_id = $1 and lesson_id = $2 and image_path is not null`, userID, lessonID)
}

// NoteImagePathsForCourse, eğitim silinmeden önce kaldırılacak görselleri verir.
func (s *Store) NoteImagePathsForCourse(ctx context.Context, userID, courseID string) ([]string, error) {
	return s.collectPaths(ctx,
		`select n.image_path
		 from public.lesson_notes n
		 join public.lessons l on l.id = n.lesson_id
		 where n.user_id = $1 and l.course_id = $2 and n.image_path is not null`, userID, courseID)
}
