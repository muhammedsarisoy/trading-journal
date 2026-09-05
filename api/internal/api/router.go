package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
)

// Router, tüm uçları kurar. Kimlik doğrulama /api/v1 altındaki her uçta zorunludur.
func Router(s *Server, verifier *auth.Verifier, allowedOrigins []string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(verifier.Middleware)

		// Sınır kullanıcı kimliğine göre: IP'ye göre olsaydı X-Forwarded-For
		// döndürülerek atlatılabilirdi (RealIP başlığa koşulsuz güveniyor).
		// Kimlik jetondan geldiği için sahtelenemez.
		r.Use(httprate.Limit(
			240, time.Minute,
			httprate.WithKeyFuncs(func(r *http.Request) (string, error) {
				return auth.UserID(r.Context()), nil
			}),
			httprate.WithLimitHandler(func(w http.ResponseWriter, _ *http.Request) {
				httpx.Error(w, &httpx.StatusError{
					Status:  http.StatusTooManyRequests,
					Message: "Çok fazla istek. Biraz bekleyip tekrar dene.",
				})
			}),
		))

		r.Method("GET", "/me", httpx.Handler(s.handleMe))
		r.Method("GET", "/meta/distinct", httpx.Handler(s.distinctValues))

		r.Route("/funds", func(r chi.Router) {
			r.Method("GET", "/", httpx.Handler(s.listFunds))
			r.Method("POST", "/", httpx.Handler(s.createFund))
			r.Method("POST", "/seed", httpx.Handler(s.seedFunds))
			r.Method("PUT", "/{id}", httpx.Handler(s.updateFund))
			r.Method("DELETE", "/{id}", httpx.Handler(s.deleteFund))
		})

		r.Route("/platforms", func(r chi.Router) {
			r.Method("GET", "/", httpx.Handler(s.listPlatforms))
			r.Method("POST", "/", httpx.Handler(s.createPlatform))
			r.Method("POST", "/seed", httpx.Handler(s.seedPlatforms))
			r.Method("DELETE", "/{id}", httpx.Handler(s.deletePlatform))
		})

		r.Route("/trades", func(r chi.Router) {
			r.Method("GET", "/", httpx.Handler(s.listTrades))
			r.Method("POST", "/", httpx.Handler(s.createTrade))
			r.Method("GET", "/{id}", httpx.Handler(s.getTrade))
			r.Method("PUT", "/{id}", httpx.Handler(s.updateTrade))
			r.Method("DELETE", "/{id}", httpx.Handler(s.deleteTrade))
			r.Method("GET", "/{id}/screenshots", httpx.Handler(s.listScreenshots))
			r.Method("POST", "/{id}/screenshots", httpx.Handler(s.createScreenshot))
		})

		r.Method("DELETE", "/screenshots/{id}", httpx.Handler(s.deleteScreenshot))

		r.Route("/stats", func(r chi.Router) {
			r.Method("GET", "/summary", httpx.Handler(s.statsSummary))
			r.Method("GET", "/series", httpx.Handler(s.statsSeries))
			r.Method("GET", "/breakdown", httpx.Handler(s.statsBreakdown))
		})
	})

	return r
}
