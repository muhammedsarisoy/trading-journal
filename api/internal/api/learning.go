package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/files"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// ---------------------------------------------------------------- Eğitimler

func (s *Server) listCourses(w http.ResponseWriter, r *http.Request) error {
	courses, err := s.store.ListCourses(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, courses)
	return nil
}

func (s *Server) getCourse(w http.ResponseWriter, r *http.Request) error {
	c, err := s.store.GetCourse(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, c)
	return nil
}

func (s *Server) createCourse(w http.ResponseWriter, r *http.Request) error {
	var in model.CourseInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateCourse(&in); err != nil {
		return err
	}
	c, err := s.store.CreateCourse(r.Context(), auth.UserID(r.Context()), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, c)
	return nil
}

func (s *Server) updateCourse(w http.ResponseWriter, r *http.Request) error {
	var in model.CourseInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateCourse(&in); err != nil {
		return err
	}
	c, err := s.store.UpdateCourse(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, c)
	return nil
}

func (s *Server) deleteCourse(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	userID := auth.UserID(ctx)
	id := chi.URLParam(r, "id")

	// Kayıtlar cascade ile gider; görsel yolları silmeden önce alınır.
	paths, err := s.store.NoteImagePathsForCourse(ctx, userID, id)
	if err != nil {
		return storeErr(err)
	}
	if err := s.store.DeleteCourse(ctx, userID, id); err != nil {
		return storeErr(err)
	}
	s.files.RemoveOwned(files.LessonImages, userID, paths...)
	httpx.JSON(w, http.StatusOK, map[string]any{"removed_paths": paths})
	return nil
}

// ---------------------------------------------------------------- Günler

func (s *Server) listLessons(w http.ResponseWriter, r *http.Request) error {
	lessons, err := s.store.ListLessons(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, lessons)
	return nil
}

func (s *Server) createLesson(w http.ResponseWriter, r *http.Request) error {
	var in model.LessonInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateLesson(&in); err != nil {
		return err
	}
	l, err := s.store.CreateLesson(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, l)
	return nil
}

func (s *Server) getLesson(w http.ResponseWriter, r *http.Request) error {
	l, err := s.store.GetLesson(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, l)
	return nil
}

func (s *Server) updateLesson(w http.ResponseWriter, r *http.Request) error {
	var in model.LessonInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateLesson(&in); err != nil {
		return err
	}
	l, err := s.store.UpdateLesson(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, l)
	return nil
}

func (s *Server) deleteLesson(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	userID := auth.UserID(ctx)
	id := chi.URLParam(r, "id")

	paths, err := s.store.NoteImagePathsForLesson(ctx, userID, id)
	if err != nil {
		return storeErr(err)
	}
	if err := s.store.DeleteLesson(ctx, userID, id); err != nil {
		return storeErr(err)
	}
	s.files.RemoveOwned(files.LessonImages, userID, paths...)
	httpx.JSON(w, http.StatusOK, map[string]any{"removed_paths": paths})
	return nil
}

// ---------------------------------------------------------------- Notlar

func (s *Server) listNotes(w http.ResponseWriter, r *http.Request) error {
	notes, err := s.store.ListNotes(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, notes)
	return nil
}

func (s *Server) createNote(w http.ResponseWriter, r *http.Request) error {
	var in model.LessonNoteInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	if err := validateNote(&in, userID); err != nil {
		return err
	}
	n, err := s.store.CreateNote(r.Context(), userID, chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, n)
	return nil
}

func (s *Server) updateNote(w http.ResponseWriter, r *http.Request) error {
	var in model.LessonNoteInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	userID := auth.UserID(ctx)
	id := chi.URLParam(r, "id")
	if err := validateNote(&in, userID); err != nil {
		return err
	}

	// Görsel değiştiyse ya da kaldırıldıysa eskisi diskten silinir.
	previous, err := s.store.NoteImagePath(ctx, userID, id)
	if err != nil {
		return storeErr(err)
	}
	n, err := s.store.UpdateNote(ctx, userID, id, in)
	if err != nil {
		return storeErr(err)
	}
	if previous != "" && (in.ImagePath == nil || *in.ImagePath != previous) {
		s.files.RemoveOwned(files.LessonImages, userID, previous)
	}
	httpx.JSON(w, http.StatusOK, n)
	return nil
}

// uploadLessonImage, not bloğu için grafik görselini diske yazar ve yolunu
// döner. Not, yolu ayrı bir güncellemeyle kaydeder.
func (s *Server) uploadLessonImage(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	userID := auth.UserID(ctx)
	lessonID := chi.URLParam(r, "id")

	if _, err := s.store.GetLesson(ctx, userID, lessonID); err != nil {
		return storeErr(err)
	}
	up, err := s.readUpload(w, r, files.LessonImages, userID+"/"+lessonID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"path": up.path})
	return nil
}

func (s *Server) deleteNote(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	path, err := s.store.DeleteNote(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	s.files.RemoveOwned(files.LessonImages, userID, path)
	httpx.JSON(w, http.StatusOK, map[string]string{"removed_path": path})
	return nil
}

func (s *Server) reorderNotes(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		IDs []string `json:"ids"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if len(in.IDs) == 0 {
		return httpx.BadRequest("Sıralanacak not yok", nil)
	}
	err := s.store.ReorderNotes(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in.IDs)
	if err != nil {
		return storeErr(err)
	}
	notes, err := s.store.ListNotes(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, notes)
	return nil
}
