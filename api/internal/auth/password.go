package auth

import (
	"sync"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost, yeni parolalar için maliyet. Supabase'ten taşınan hash'ler
// kendi maliyetleriyle (10) doğrulanmaya devam eder.
const bcryptCost = 12

// Parola sınırları. bcrypt 72 bayttan uzununu kabul etmiyor.
const (
	MinPasswordLen = 8
	MaxPasswordLen = 72
)

func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

var (
	dummyOnce sync.Once
	dummyHash []byte
)

// CheckPassword, parolayı hash'le karşılaştırır. Hash boşsa (kullanıcı yok ya
// da yalnız Google ile giriyor) yine de bir bcrypt karşılaştırması yapılır;
// böylece yanıt süresi e-postanın kayıtlı olup olmadığını ele vermez.
func CheckPassword(hash *string, password string) bool {
	if hash == nil || *hash == "" {
		dummyOnce.Do(func() {
			dummyHash, _ = bcrypt.GenerateFromPassword([]byte("zamanlama-esitleme"), bcryptCost)
		})
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(*hash), []byte(password)) == nil
}
