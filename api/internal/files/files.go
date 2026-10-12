// Package files, yüklenen görselleri sunucu diskinde tutar.
//
// Yerleşim Supabase Storage ile aynı: <kök>/<bucket>/<user_id>/<sahip_id>/<dosya>.
// Böylece taşınan kayıtlardaki yollar değişmeden çalışır.
package files

import (
	"bytes"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Bilinen klasörler. Başka bir ad diske hiç dokunmadan reddedilir.
const (
	Screenshots  = "trade-screenshots"
	LessonImages = "lesson-images"
)

// MaxBytes, tek dosya için üst sınır.
const MaxBytes = 10 << 20 // 10 MiB

// allowedTypes, kabul edilen içerik türleri ve diske yazılacak uzantıları.
// Tür, istemcinin söylediğine değil dosyanın ilk baytlarına bakılarak belirlenir.
var allowedTypes = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

var (
	ErrTooLarge    = errors.New("dosya 10 MB sınırını aşıyor")
	ErrUnsupported = errors.New("yalnız PNG, JPEG, WebP ya da GIF yüklenebilir")
	ErrBadPath     = errors.New("dosya yolu geçersiz")
)

// Store, dosyaların kök klasörü.
type Store struct {
	root string
}

func New(root string) (*Store, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("UPLOAD_DIR çözümlenemedi: %w", err)
	}
	for _, b := range []string{Screenshots, LessonImages} {
		if err := os.MkdirAll(filepath.Join(abs, b), 0o750); err != nil {
			return nil, fmt.Errorf("yükleme klasörü açılamadı: %w", err)
		}
	}
	return &Store{root: abs}, nil
}

// Root, kök klasörün mutlak yolu.
func (s *Store) Root() string { return s.root }

// full, bucket + göreli yolu diskteki mutlak yola çevirir ve kökten dışarı
// çıkmadığını doğrular.
func (s *Store) full(bucket, path string) (string, error) {
	if bucket != Screenshots && bucket != LessonImages {
		return "", ErrBadPath
	}
	if path == "" || strings.HasPrefix(path, "/") || strings.Contains(path, "\\") ||
		strings.Contains(path, "..") || strings.Contains(path, "//") {
		return "", ErrBadPath
	}
	base := filepath.Join(s.root, bucket)
	p := filepath.Join(base, filepath.FromSlash(path))
	if !strings.HasPrefix(p, base+string(filepath.Separator)) {
		return "", ErrBadPath
	}
	return p, nil
}

// Save, okuyucudaki görseli <prefix>/<rastgele>.<uzantı> yoluna yazar ve
// bucket içindeki göreli yolu döner. prefix "<user_id>/<sahip_id>" biçiminde.
func (s *Store) Save(bucket, prefix string, r io.Reader) (string, error) {
	head := make([]byte, 512)
	n, err := io.ReadFull(r, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		if errors.Is(err, io.EOF) {
			return "", ErrUnsupported
		}
		return "", fmt.Errorf("dosya okunamadı: %w", err)
	}
	head = head[:n]

	ext, ok := allowedTypes[http.DetectContentType(head)]
	if !ok {
		return "", ErrUnsupported
	}

	rel := prefix + "/" + newID() + ext
	dst, err := s.full(bucket, rel)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o750); err != nil {
		return "", fmt.Errorf("klasör açılamadı: %w", err)
	}

	// Önce geçici dosyaya yaz, sonra taşı: yarım kalan yükleme asıl yolda
	// bozuk bir dosya bırakmasın.
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".upload-*")
	if err != nil {
		return "", fmt.Errorf("geçici dosya açılamadı: %w", err)
	}
	defer os.Remove(tmp.Name()) // taşındıysa etkisiz

	written, err := io.Copy(tmp, io.MultiReader(
		bytes.NewReader(head),
		io.LimitReader(r, MaxBytes+1-int64(len(head))),
	))
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return "", ErrTooLarge
		}
		return "", fmt.Errorf("dosya yazılamadı: %w", err)
	}
	if written > MaxBytes {
		return "", ErrTooLarge
	}
	if err := os.Rename(tmp.Name(), dst); err != nil {
		return "", fmt.Errorf("dosya yerine taşınamadı: %w", err)
	}
	return rel, nil
}

// Write, taşıma aracı için: içeriği olduğu gibi verilen yola yazar.
// Dosya zaten varsa dokunmaz ve false döner.
func (s *Store) Write(bucket, path string, r io.Reader) (bool, error) {
	dst, err := s.full(bucket, path)
	if err != nil {
		return false, err
	}
	if _, err := os.Stat(dst); err == nil {
		return false, nil
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o750); err != nil {
		return false, err
	}
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".import-*")
	if err != nil {
		return false, err
	}
	defer os.Remove(tmp.Name())
	_, err = io.Copy(tmp, r)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return false, err
	}
	return true, os.Rename(tmp.Name(), dst)
}

// Exists, dosya diskte varsa true döner. Geçersiz yol için false.
func (s *Store) Exists(bucket, path string) bool {
	p, err := s.full(bucket, path)
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

// Open, sunmak için dosyayı açar ve gerçek içerik türünü döner.
func (s *Store) Open(bucket, path string) (*os.File, string, error) {
	p, err := s.full(bucket, path)
	if err != nil {
		return nil, "", err
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, "", err
	}
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		f.Close()
		return nil, "", err
	}
	ctype := http.DetectContentType(head[:n])
	if _, ok := allowedTypes[ctype]; !ok {
		ctype = "application/octet-stream"
	}
	return f, ctype, nil
}

// Remove, dosyaları siler. Kayıt zaten silindiği için hata yalnız loglanır:
// diskte kalan bir dosya kullanıcı akışını bozmamalı.
func (s *Store) Remove(bucket string, paths ...string) {
	for _, path := range paths {
		if path == "" {
			continue
		}
		p, err := s.full(bucket, path)
		if err != nil {
			slog.Warn("geçersiz dosya yolu silinmedi", "bucket", bucket, "path", path)
			continue
		}
		if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			slog.Warn("dosya silinemedi", "bucket", bucket, "path", path, "err", err)
		}
	}
}

// RemoveOwned, yalnız kullanıcının kendi klasöründeki (<user_id>/...)
// dosyaları siler. Yol veritabanından gelir; Supabase'ten taşınan bir kayıt
// başka kullanıcının dosyasını gösterse bile o dosya silinmez.
func (s *Store) RemoveOwned(bucket, userID string, paths ...string) {
	owned := paths[:0:0]
	for _, path := range paths {
		if path == "" {
			continue
		}
		if userID == "" || !strings.HasPrefix(path, userID+"/") {
			slog.Warn("başka kullanıcıya ait dosya silinmedi", "bucket", bucket, "path", path)
			continue
		}
		owned = append(owned, path)
	}
	s.Remove(bucket, owned...)
}

// newID, rastgele bir UUIDv4 dizesi üretir.
func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
