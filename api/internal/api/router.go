package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
)

// Router, tüm uçları kurar.
//
// Tarayıcı API'ye doğrudan değil, web uygulamasının /api yolu üzerinden
// ulaşır; istekler aynı origin'den geldiği için CORS gerekmez. Oturum
// HttpOnly çerezde taşınır.
func Router(s *Server, allowedOrigins []string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(auth.RequireOrigin(allowedOrigins))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		// ------------------------------------------------ Oturum açmadan
		r.Route("/auth", func(r chi.Router) {
			r.Method("GET", "/providers", httpx.Handler(s.authProviders))
			r.Method("POST", "/logout", httpx.Handler(s.logout))

			r.Group(func(r chi.Router) {
				// IP başına kaba sınır. Asıl parola koruması e-posta başına
				// sınırda (login içinde): RealIP başlığa güvendiği için IP
				// tek başına yeterli değil.
				r.Use(httprate.Limit(30, time.Minute,
					httprate.WithKeyFuncs(httprate.KeyByRealIP),
					httprate.WithLimitHandler(tooManyRequests)))

				r.Method("POST", "/signup", httpx.Handler(s.signup))
				r.Method("POST", "/login", httpx.Handler(s.login))
				r.Method("GET", "/google/start", httpx.Handler(s.googleStart))
				r.Method("GET", "/google/callback", httpx.Handler(s.googleCallback))
			})
		})

		// ------------------------------------------------ Oturum gerekli
		r.Group(func(r chi.Router) {
			r.Use(s.sessions.Middleware)

			// Sınır kullanıcı kimliğine göre: IP'ye göre olsaydı X-Forwarded-For
			// döndürülerek atlatılabilirdi (RealIP başlığa koşulsuz güveniyor).
			// Kimlik oturumdan geldiği için sahtelenemez.
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

			// Yüklenen görseller: /files/<bucket>/<user_id>/<sahip_id>/<dosya>
			r.Method("GET", "/files/{bucket}/*", httpx.Handler(s.serveFile))

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

			// Eğitim defteri: eğitim > gün > not bloğu
			r.Route("/courses", func(r chi.Router) {
				r.Method("GET", "/", httpx.Handler(s.listCourses))
				r.Method("POST", "/", httpx.Handler(s.createCourse))
				r.Method("GET", "/{id}", httpx.Handler(s.getCourse))
				r.Method("PUT", "/{id}", httpx.Handler(s.updateCourse))
				r.Method("DELETE", "/{id}", httpx.Handler(s.deleteCourse))
				r.Method("GET", "/{id}/lessons", httpx.Handler(s.listLessons))
				r.Method("POST", "/{id}/lessons", httpx.Handler(s.createLesson))
			})

			r.Route("/lessons", func(r chi.Router) {
				r.Method("GET", "/{id}", httpx.Handler(s.getLesson))
				r.Method("PUT", "/{id}", httpx.Handler(s.updateLesson))
				r.Method("DELETE", "/{id}", httpx.Handler(s.deleteLesson))
				r.Method("GET", "/{id}/notes", httpx.Handler(s.listNotes))
				r.Method("POST", "/{id}/notes", httpx.Handler(s.createNote))
				r.Method("POST", "/{id}/notes/reorder", httpx.Handler(s.reorderNotes))
				r.Method("POST", "/{id}/images", httpx.Handler(s.uploadLessonImage))
			})

			r.Route("/notes", func(r chi.Router) {
				r.Method("PUT", "/{id}", httpx.Handler(s.updateNote))
				r.Method("DELETE", "/{id}", httpx.Handler(s.deleteNote))
			})

			// Prop firma harcamaları: ücret, payout, iade
			r.Route("/prop", func(r chi.Router) {
				r.Method("GET", "/summary", httpx.Handler(s.propSummary))
				r.Method("GET", "/transactions", httpx.Handler(s.listProp))
				r.Method("POST", "/transactions", httpx.Handler(s.createProp))
				r.Method("PUT", "/transactions/{id}", httpx.Handler(s.updateProp))
				r.Method("DELETE", "/transactions/{id}", httpx.Handler(s.deleteProp))
			})

			r.Route("/stats", func(r chi.Router) {
				r.Method("GET", "/summary", httpx.Handler(s.statsSummary))
				r.Method("GET", "/series", httpx.Handler(s.statsSeries))
				r.Method("GET", "/breakdown", httpx.Handler(s.statsBreakdown))
			})
		})
	})

	return r
}
