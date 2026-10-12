package api

import (
	"strings"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	ok := map[string]string{
		"Ali@Example.com":   "ali@example.com",
		"  ali@example.com": "ali@example.com",
		"a.b+c@d.co":        "a.b+c@d.co",
	}
	for in, want := range ok {
		got, valid := normalizeEmail(in)
		if !valid || got != want {
			t.Errorf("normalizeEmail(%q) = %q, %v", in, got, valid)
		}
	}
	for _, in := range []string{"", "ali", "ali@", "@example.com", "Ali <ali@example.com>", "a b@c.d", strings.Repeat("a", 250) + "@b.co"} {
		if _, valid := normalizeEmail(in); valid {
			t.Errorf("normalizeEmail(%q) geçerli sayıldı", in)
		}
	}
}

func TestSafeNext(t *testing.T) {
	cases := map[string]string{
		"":                    "/dashboard",
		"/trades?x=1":         "/trades?x=1",
		"//evil.test":         "/dashboard",
		"/\\evil.test":        "/dashboard",
		"https://evil.test":   "/dashboard",
		"javascript:alert(1)": "/dashboard",
		"/\t/evil.test/x":     "/dashboard",
		"/\n/evil.test":       "/dashboard",
		"/\r/evil.test":       "/dashboard",
		"/x\\..\\\\evil.test": "/dashboard",
		"/\x7f/evil.test":     "/dashboard",
		"/notes/a%2Fb#top":    "/notes/a%2Fb#top",
	}
	for in, want := range cases {
		if got := safeNext(in); got != want {
			t.Errorf("safeNext(%q) = %q, beklenen %q", in, got, want)
		}
	}
}

func TestDefaultName(t *testing.T) {
	if got := defaultName("  ", "ali@example.com"); got != "ali" {
		t.Errorf("boş ad e-postadan türemeli: %q", got)
	}
	if got := defaultName(" Ali ", "x@y.z"); got != "Ali" {
		t.Errorf("ad kırpılmadı: %q", got)
	}
	long := strings.Repeat("ş", 100)
	if got := defaultName(long, "x@y.z"); len([]rune(got)) != 80 {
		t.Errorf("ad 80 karaktere (bayta değil) kısaltılmalı: %d", len([]rune(got)))
	}
}

func TestOwnedStoragePath(t *testing.T) {
	uid := "11111111-1111-1111-1111-111111111111"
	if ownedStoragePath(uid, uid+"/t/a.png") != nil {
		t.Error("kendi yolu reddedildi")
	}
	for _, p := range []string{
		"22222222-2222-2222-2222-222222222222/t/a.png",
		uid + "/../2222/a.png",
		uid + "//a.png",
		uid,
		"x" + uid + "/a.png",
	} {
		if ownedStoragePath(uid, p) == nil {
			t.Errorf("%q kabul edildi", p)
		}
	}
}
