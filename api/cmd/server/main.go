package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/muhammedsarisoy/trading-journal/api/internal/api"
	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/config"
	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
	"github.com/muhammedsarisoy/trading-journal/api/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := run(); err != nil {
		slog.Error("sunucu başlatılamadı", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	slog.Info("veritabanı bağlantısı hazır")

	verifier, err := auth.NewVerifier(cfg.JWTSecret, cfg.JWKSURL)
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Router(api.NewServer(store.New(pool, cfg.Timezone)), verifier, cfg.AllowedOrigins),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("API dinlemede", "port", cfg.Port, "timezone", cfg.Timezone)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		slog.Info("kapatma sinyali alındı")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
