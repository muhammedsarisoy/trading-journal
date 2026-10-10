package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrConflict, benzersizlik kısıtı ihlal edildiğinde döner (ör. aynı e-posta).
var ErrConflict = errors.New("kayıt zaten var")

// User, kimlik doğrulamanın ihtiyaç duyduğu kullanıcı alanları.
type User struct {
	ID           string
	Email        string
	PasswordHash *string
	GoogleSub    *string
}

// NewUser, kayıt sırasında verilen alanlar.
type NewUser struct {
	Email        string
	PasswordHash *string
	GoogleSub    *string
	DisplayName  string
}

const userColumns = "id, email, password_hash, google_sub"

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.GoogleSub)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("kullanıcı okunamadı: %w", err)
	}
	return &u, nil
}

// CreateUser, kullanıcıyı ve profil satırını tek işlemde açar.
func (s *Store) CreateUser(ctx context.Context, in NewUser) (*User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	u, err := scanUser(tx.QueryRow(ctx,
		`insert into public.users (email, password_hash, google_sub, last_login_at)
		 values ($1, $2, $3, now())
		 returning `+userColumns,
		in.Email, in.PasswordHash, in.GoogleSub))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrConflict
		}
		return nil, err
	}

	if _, err := tx.Exec(ctx,
		"insert into public.profiles (id, display_name) values ($1, $2)",
		u.ID, in.DisplayName); err != nil {
		return nil, fmt.Errorf("profil açılamadı: %w", err)
	}
	return u, tx.Commit(ctx)
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		"select "+userColumns+" from public.users where email = $1", email))
}

func (s *Store) UserByGoogleSub(ctx context.Context, sub string) (*User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		"select "+userColumns+" from public.users where google_sub = $1", sub))
}

// LinkGoogle, mevcut hesaba Google kimliğini bağlar.
func (s *Store) LinkGoogle(ctx context.Context, userID, sub string) error {
	_, err := s.pool.Exec(ctx,
		"update public.users set google_sub = $2 where id = $1 and google_sub is null", userID, sub)
	return err
}

// TouchLogin, son giriş zamanını günceller.
func (s *Store) TouchLogin(ctx context.Context, userID string) {
	_, _ = s.pool.Exec(ctx, "update public.users set last_login_at = now() where id = $1", userID)
}

// DisplayName, profildeki görünen adı döner; yoksa boş dize.
func (s *Store) DisplayName(ctx context.Context, userID string) (string, error) {
	var name *string
	err := s.pool.QueryRow(ctx,
		"select display_name from public.profiles where id = $1", userID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && name == nil) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("profil okunamadı: %w", err)
	}
	return *name, nil
}
