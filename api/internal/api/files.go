package api

import (
	"errors"
	"io"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/files"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
)

// upload, multipart gövdeden okunan dosyanın yolu ve yanındaki metin alanları.
type upload struct {
	path   string
	fields map[string]string
}

// readUpload, gövdeyi belleğe almadan akış halinde okur: "file" parçası
// doğrudan diske yazılır, diğer parçalar kısa metin alanı sayılır.
func (s *Server) readUpload(w http.ResponseWriter, r *http.Request, bucket, prefix string) (*upload, error) {
	r.Body = http.MaxBytesReader(w, r.Body, files.MaxBytes+64<<10)

	mr, err := r.MultipartReader()
	if err != nil {
		return nil, httpx.BadRequest("multipart/form-data gövdesi bekleniyor", err)
	}

	up := &upload{fields: map[string]string{}}
	fail := func(err error) (*upload, error) {
		if up.path != "" {
			s.files.Remove(bucket, up.path)
		}
		return nil, uploadErr(err)
	}

	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fail(err)
		}

		switch name := part.FormName(); {
		case name == "file":
			if up.path != "" {
				part.Close()
				return fail(httpx.BadRequest("Tek seferde bir dosya yüklenebilir", nil))
			}
			path, err := s.files.Save(bucket, prefix, part)
			part.Close()
			if err != nil {
				return fail(err)
			}
			up.path = path

		case name != "" && len(up.fields) < 8:
			b, err := io.ReadAll(io.LimitReader(part, 4<<10))
			part.Close()
			if err != nil {
				return fail(err)
			}
			up.fields[name] = string(b)

		default:
			part.Close()
		}
	}

	if up.path == "" {
		return nil, httpx.BadRequest("Dosya eksik", nil)
	}
	return up, nil
}

func uploadErr(err error) error {
	var se *httpx.StatusError
	var maxErr *http.MaxBytesError
	switch {
	case errors.As(err, &se):
		return se
	case errors.Is(err, files.ErrTooLarge), errors.As(err, &maxErr):
		return &httpx.StatusError{Status: http.StatusRequestEntityTooLarge, Message: "Dosya 10 MB sınırını aşıyor"}
	case errors.Is(err, files.ErrUnsupported):
		return &httpx.StatusError{Status: http.StatusUnsupportedMediaType, Message: files.ErrUnsupported.Error()}
	default:
		return httpx.Internal("Dosya kaydedilemedi", err)
	}
}

// serveFile, kullanıcının kendi klasöründeki görseli döner. Başkasına ait
// ya da olmayan dosya için aynı yanıt (404) verilir.
func (s *Server) serveFile(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	bucket := chi.URLParam(r, "bucket")
	path := chi.URLParam(r, "*")

	if ownedStoragePath(userID, path) != nil {
		return httpx.NotFound("Dosya bulunamadı")
	}
	f, ctype, err := s.files.Open(bucket, path)
	if errors.Is(err, os.ErrNotExist) || errors.Is(err, files.ErrBadPath) {
		return httpx.NotFound("Dosya bulunamadı")
	}
	if err != nil {
		return httpx.Internal("Dosya açılamadı", err)
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return httpx.Internal("Dosya okunamadı", err)
	}

	h := w.Header()
	h.Set("Content-Type", ctype)
	// Dosya adları rastgele ve değişmez; tarayıcı önbellekte tutabilir.
	h.Set("Cache-Control", "private, max-age=86400, immutable")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, "", st.ModTime(), f)
	return nil
}
