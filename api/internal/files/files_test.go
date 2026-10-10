package files

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Gerçek dosya imzaları: tür, uzantıya değil bu baytlara bakılarak belirlenir.
var (
	pngHead  = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
	jpegHead = []byte("\xff\xd8\xff\xe0\x00\x10JFIF\x00")
	gifHead  = []byte("GIF89a\x01\x00\x01\x00")
	webpHead = []byte("RIFF\x24\x00\x00\x00WEBPVP8 ")
)

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestSaveDetectsTypeFromBytes(t *testing.T) {
	s := newStore(t)
	cases := map[string]struct {
		body []byte
		ext  string
	}{
		"png":  {pngHead, ".png"},
		"jpeg": {jpegHead, ".jpg"},
		"gif":  {gifHead, ".gif"},
		"webp": {webpHead, ".webp"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			path, err := s.Save(Screenshots, "u1/t1", bytes.NewReader(c.body))
			if err != nil {
				t.Fatalf("Save: %v", err)
			}
			if !strings.HasPrefix(path, "u1/t1/") || !strings.HasSuffix(path, c.ext) {
				t.Fatalf("beklenmeyen yol %q", path)
			}
			got, err := os.ReadFile(filepath.Join(s.Root(), Screenshots, filepath.FromSlash(path)))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, c.body) {
				t.Fatal("diske yazılan içerik farklı")
			}
		})
	}
}

func TestSaveRejectsNonImages(t *testing.T) {
	s := newStore(t)
	for name, body := range map[string][]byte{
		"metin": []byte("merhaba"),
		"html":  []byte("<html><script>alert(1)</script></html>"),
		"svg":   []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		"boş":   nil,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := s.Save(Screenshots, "u1/t1", bytes.NewReader(body))
			if !errors.Is(err, ErrUnsupported) {
				t.Fatalf("ErrUnsupported bekleniyordu, gelen %v", err)
			}
		})
	}
	assertNoFiles(t, s)
}

func TestSaveEnforcesSizeLimit(t *testing.T) {
	s := newStore(t)

	exact := append(append([]byte{}, pngHead...), make([]byte, MaxBytes-len(pngHead))...)
	if _, err := s.Save(Screenshots, "u1/t1", bytes.NewReader(exact)); err != nil {
		t.Fatalf("tam sınırdaki dosya kabul edilmeli: %v", err)
	}

	over := append(exact, 0)
	if _, err := s.Save(Screenshots, "u1/t2", bytes.NewReader(over)); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("ErrTooLarge bekleniyordu, gelen %v", err)
	}
	// Sınırı aşan yüklemeden geriye ne asıl ne geçici dosya kalmalı.
	entries, _ := os.ReadDir(filepath.Join(s.Root(), Screenshots, "u1", "t2"))
	if len(entries) != 0 {
		t.Fatalf("yarım kalan yükleme diskte iz bıraktı: %v", entries)
	}
}

func TestPathsCannotEscapeRoot(t *testing.T) {
	s := newStore(t)
	bad := []string{
		"", "../x", "u1/../../x", "/etc/passwd", "u1//x", `u1\..\x`, "u1/..", "..",
	}
	for _, p := range bad {
		if _, _, err := s.Open(Screenshots, p); !errors.Is(err, ErrBadPath) {
			t.Errorf("Open(%q): ErrBadPath bekleniyordu, gelen %v", p, err)
		}
		if _, err := s.Write(Screenshots, p, strings.NewReader("x")); !errors.Is(err, ErrBadPath) {
			t.Errorf("Write(%q): ErrBadPath bekleniyordu, gelen %v", p, err)
		}
	}
	if _, _, err := s.Open("baska-bucket", "u1/x.png"); !errors.Is(err, ErrBadPath) {
		t.Errorf("bilinmeyen bucket kabul edildi: %v", err)
	}
	if _, err := s.Save(Screenshots, "../kacak", bytes.NewReader(pngHead)); !errors.Is(err, ErrBadPath) {
		t.Errorf("Save prefix ile kökten çıkabildi: %v", err)
	}
}

func TestOpenReportsRealContentType(t *testing.T) {
	s := newStore(t)
	path, err := s.Save(LessonImages, "u1/l1", bytes.NewReader(pngHead))
	if err != nil {
		t.Fatal(err)
	}
	f, ctype, err := s.Open(LessonImages, path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if ctype != "image/png" {
		t.Fatalf("içerik türü %q", ctype)
	}
	got, _ := io.ReadAll(f)
	if !bytes.Equal(got, pngHead) {
		t.Fatal("Open baştan okumuyor")
	}

	// Taşıma aracıyla gelen, görsel olmayan bir dosya tarayıcıya
	// yorumlanabilir türle sunulmamalı.
	if _, err := s.Write(LessonImages, "u1/l1/x.png", strings.NewReader("<html>")); err != nil {
		t.Fatal(err)
	}
	f2, ctype2, err := s.Open(LessonImages, "u1/l1/x.png")
	if err != nil {
		t.Fatal(err)
	}
	f2.Close()
	if ctype2 != "application/octet-stream" {
		t.Fatalf("görsel olmayan içerik %q olarak sunuluyor", ctype2)
	}
}

func TestWriteSkipsExisting(t *testing.T) {
	s := newStore(t)
	wrote, err := s.Write(Screenshots, "u1/t1/a.png", bytes.NewReader(pngHead))
	if err != nil || !wrote {
		t.Fatalf("ilk yazım: wrote=%v err=%v", wrote, err)
	}
	wrote, err = s.Write(Screenshots, "u1/t1/a.png", strings.NewReader("başka"))
	if err != nil || wrote {
		t.Fatalf("ikinci yazım dosyaya dokunmamalı: wrote=%v err=%v", wrote, err)
	}
	f, _, _ := s.Open(Screenshots, "u1/t1/a.png")
	defer f.Close()
	got, _ := io.ReadAll(f)
	if !bytes.Equal(got, pngHead) {
		t.Fatal("var olan dosya ezildi")
	}
}

func TestRemoveIsBestEffort(t *testing.T) {
	s := newStore(t)
	path, _ := s.Save(Screenshots, "u1/t1", bytes.NewReader(pngHead))
	// Geçersiz ve olmayan yollar sessizce atlanır, geçerli olan silinir.
	s.Remove(Screenshots, "", "../x", "u1/t1/yok.png", path)
	if _, _, err := s.Open(Screenshots, path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("dosya silinmedi: %v", err)
	}
}

func TestNewIDIsUUIDv4(t *testing.T) {
	seen := map[string]bool{}
	for range 100 {
		id := newID()
		if len(id) != 36 || id[14] != '4' || !strings.ContainsRune("89ab", rune(id[19])) {
			t.Fatalf("geçersiz UUIDv4: %s", id)
		}
		if seen[id] {
			t.Fatalf("tekrarlayan kimlik: %s", id)
		}
		seen[id] = true
	}
}

func assertNoFiles(t *testing.T, s *Store) {
	t.Helper()
	_ = filepath.WalkDir(s.Root(), func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			t.Errorf("beklenmeyen dosya: %s", p)
		}
		return nil
	})
}
