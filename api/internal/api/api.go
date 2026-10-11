package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/httprate"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/files"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
	"github.com/muhammedsarisoy/trading-journal/api/internal/store"
)

// Server, HTTP katmanını store'a, dosya deposuna ve oturumlara bağlar.
type Server struct {
	store        *store.Store
	files        *files.Store
	sessions     *auth.Sessions
	google       *auth.Google // nil: Google ile giriş kapalı
	allowSignup  bool
	loginLimiter *httprate.RateLimiter
}

// Options, Server'ın bağımlılıkları.
type Options struct {
	Store       *store.Store
	Files       *files.Store
	Sessions    *auth.Sessions
	Google      *auth.Google
	AllowSignup bool
}

func NewServer(o Options) *Server {
	return &Server{
		store:       o.Store,
		files:       o.Files,
		sessions:    o.Sessions,
		google:      o.Google,
		allowSignup: o.AllowSignup,
		// Aynı e-posta+IP için 15 dakikada en çok 10 hatalı deneme (bkz. login).
		loginLimiter: httprate.NewRateLimiter(loginFailLimit, 15*time.Minute,
			httprate.WithLimitHandler(tooManyRequests)),
	}
}

func tooManyRequests(w http.ResponseWriter, _ *http.Request) {
	httpx.Error(w, &httpx.StatusError{
		Status:  http.StatusTooManyRequests,
		Message: "Çok fazla deneme. Biraz bekleyip tekrar dene.",
	})
}

// ---------------------------------------------------------------- Yardımcılar

func (s *Server) filterFrom(r *http.Request) (model.TradeFilter, error) {
	f := model.TradeFilter{
		FundID:     httpx.QueryStr(r, "fund_id"),
		PlatformID: httpx.QueryStr(r, "platform_id"),
		Status:     httpx.QueryStr(r, "status"),
		Symbol:     httpx.QueryStr(r, "symbol"),
		AssetClass: httpx.QueryStr(r, "asset_class"),
		Direction:  httpx.QueryStr(r, "direction"),
		Setup:      httpx.QueryStr(r, "setup"),
		Currency:   httpx.QueryStr(r, "currency"),
		Search:     httpx.QueryStr(r, "q"),
		Limit:      httpx.QueryInt(r, "limit", 100),
		Offset:     httpx.QueryInt(r, "offset", 0),
	}

	from, err := httpx.QueryTime(r, "from")
	if err != nil {
		return f, err
	}
	to, err := httpx.QueryTime(r, "to")
	if err != nil {
		return f, err
	}
	f.From = from
	// "to" gün olarak verildiyse o günü de kapsasın diye bir gün eklenir.
	if to != nil {
		end := to.Add(24 * time.Hour)
		if len(r.URL.Query().Get("to")) > 10 {
			end = *to
		}
		f.To = &end
	}

	return f, nil
}

func storeErr(err error) error {
	if errors.Is(err, store.ErrNotFound) {
		return httpx.NotFound("Kayıt bulunamadı")
	}
	return httpx.Internal("İşlem tamamlanamadı", err)
}

// ---------------------------------------------------------------- Oturum

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	name, err := s.store.DisplayName(ctx, auth.UserID(ctx))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, map[string]string{
		"user_id":      auth.UserID(ctx),
		"email":        auth.Email(ctx),
		"display_name": name,
	})
	return nil
}

// ---------------------------------------------------------------- Fonlar

func (s *Server) listFunds(w http.ResponseWriter, r *http.Request) error {
	funds, err := s.store.ListFunds(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, funds)
	return nil
}

func (s *Server) createFund(w http.ResponseWriter, r *http.Request) error {
	var in model.FundInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateFund(&in); err != nil {
		return err
	}
	f, err := s.store.CreateFund(r.Context(), auth.UserID(r.Context()), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, f)
	return nil
}

func (s *Server) updateFund(w http.ResponseWriter, r *http.Request) error {
	var in model.FundInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateFund(&in); err != nil {
		return err
	}
	f, err := s.store.UpdateFund(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, f)
	return nil
}

func (s *Server) seedFunds(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Funds []model.FundInput `json:"funds"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	items := make([]model.FundInput, 0, len(in.Funds))
	for i := range in.Funds {
		if err := validateFund(&in.Funds[i]); err != nil {
			return err
		}
		items = append(items, in.Funds[i])
	}

	funds, err := s.store.SeedFunds(r.Context(), auth.UserID(r.Context()), items)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, funds)
	return nil
}

func (s *Server) deleteFund(w http.ResponseWriter, r *http.Request) error {
	if err := s.store.DeleteFund(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id")); err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusNoContent, nil)
	return nil
}

// ---------------------------------------------------------------- Platformlar

func (s *Server) listPlatforms(w http.ResponseWriter, r *http.Request) error {
	ps, err := s.store.ListPlatforms(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, ps)
	return nil
}

func (s *Server) createPlatform(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Name string `json:"name"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return httpx.BadRequest("Platform adı boş olamaz", nil)
	}
	p, err := s.store.CreatePlatform(r.Context(), auth.UserID(r.Context()), in.Name)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, p)
	return nil
}

func (s *Server) seedPlatforms(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Names []string `json:"names"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	names := make([]string, 0, len(in.Names))
	for _, n := range in.Names {
		if t := strings.TrimSpace(n); t != "" {
			names = append(names, t)
		}
	}
	ps, err := s.store.SeedPlatforms(r.Context(), auth.UserID(r.Context()), names)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, ps)
	return nil
}

func (s *Server) deletePlatform(w http.ResponseWriter, r *http.Request) error {
	if err := s.store.DeletePlatform(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id")); err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusNoContent, nil)
	return nil
}

// ---------------------------------------------------------------- İşlemler

func (s *Server) listTrades(w http.ResponseWriter, r *http.Request) error {
	f, err := s.filterFrom(r)
	if err != nil {
		return err
	}
	list, err := s.store.ListTrades(r.Context(), auth.UserID(r.Context()), f)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, list)
	return nil
}

func (s *Server) getTrade(w http.ResponseWriter, r *http.Request) error {
	t, err := s.store.GetTrade(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, t)
	return nil
}

func (s *Server) createTrade(w http.ResponseWriter, r *http.Request) error {
	var in model.TradeInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateTrade(&in); err != nil {
		return err
	}
	t, err := s.store.CreateTrade(r.Context(), auth.UserID(r.Context()), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, t)
	return nil
}

func (s *Server) updateTrade(w http.ResponseWriter, r *http.Request) error {
	var in model.TradeInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateTrade(&in); err != nil {
		return err
	}
	t, err := s.store.UpdateTrade(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, t)
	return nil
}

func (s *Server) deleteTrade(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	userID := auth.UserID(ctx)
	id := chi.URLParam(r, "id")

	// Kayıtlar cascade ile gider; dosya yolları silmeden önce alınır.
	paths, err := s.store.ScreenshotPathsForTrade(ctx, userID, id)
	if err != nil {
		return storeErr(err)
	}
	if err := s.store.DeleteTrade(ctx, userID, id); err != nil {
		return storeErr(err)
	}
	s.files.Remove(files.Screenshots, paths...)
	httpx.JSON(w, http.StatusOK, map[string]any{"removed_paths": paths})
	return nil
}

// ------------------------------------------------------- Ekran görüntüleri

func (s *Server) listScreenshots(w http.ResponseWriter, r *http.Request) error {
	shots, err := s.store.ListScreenshots(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, shots)
	return nil
}

// createScreenshot, multipart gövdedeki görseli diske yazar ve kaydını açar.
// Alanlar: phase, caption, file (zorunlu).
func (s *Server) createScreenshot(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	userID := auth.UserID(ctx)
	tradeID := chi.URLParam(r, "id")

	// Dosya diske yazılmadan önce işlemin bu kullanıcıya ait olduğu görülsün.
	if _, err := s.store.GetTrade(ctx, userID, tradeID); err != nil {
		return storeErr(err)
	}

	up, err := s.readUpload(w, r, files.Screenshots, userID+"/"+tradeID)
	if err != nil {
		return err
	}

	in := model.ScreenshotInput{Path: up.path, Phase: strings.TrimSpace(up.fields["phase"])}
	if c := strings.TrimSpace(up.fields["caption"]); c != "" {
		in.Caption = &c
	}
	if in.Phase == "" {
		in.Phase = "entry"
	}
	if !allowed(in.Phase, "entry", "exit", "analysis") {
		s.files.Remove(files.Screenshots, up.path)
		return httpx.BadRequest("Geçersiz aşama", nil)
	}

	sc, err := s.store.CreateScreenshot(ctx, userID, tradeID, in)
	if err != nil {
		// Kayıt açılamadıysa yüklenen dosyayı geride bırakma.
		s.files.Remove(files.Screenshots, up.path)
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, sc)
	return nil
}

func (s *Server) deleteScreenshot(w http.ResponseWriter, r *http.Request) error {
	path, err := s.store.DeleteScreenshot(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		return storeErr(err)
	}
	s.files.Remove(files.Screenshots, path)
	httpx.JSON(w, http.StatusOK, map[string]string{"removed_path": path})
	return nil
}

// ---------------------------------------------------------------- Raporlar

func (s *Server) statsSummary(w http.ResponseWriter, r *http.Request) error {
	f, err := s.filterFrom(r)
	if err != nil {
		return err
	}
	sum, err := s.store.Summary(r.Context(), auth.UserID(r.Context()), f)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, sum)
	return nil
}

func (s *Server) statsSeries(w http.ResponseWriter, r *http.Request) error {
	f, err := s.filterFrom(r)
	if err != nil {
		return err
	}
	bucket := r.URL.Query().Get("bucket")
	if bucket == "" {
		bucket = "day"
	}
	points, err := s.store.Series(r.Context(), auth.UserID(r.Context()), bucket, f)
	if err != nil {
		if strings.HasPrefix(err.Error(), "geçersiz kova") {
			return httpx.BadRequest(err.Error(), nil)
		}
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, points)
	return nil
}

func (s *Server) statsBreakdown(w http.ResponseWriter, r *http.Request) error {
	f, err := s.filterFrom(r)
	if err != nil {
		return err
	}
	dim := r.URL.Query().Get("by")
	if dim == "" {
		dim = "setup"
	}
	rows, err := s.store.Breakdown(r.Context(), auth.UserID(r.Context()), dim, f)
	if err != nil {
		if strings.HasPrefix(err.Error(), "geçersiz kırılım") {
			return httpx.BadRequest(err.Error(), nil)
		}
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, rows)
	return nil
}

func (s *Server) distinctValues(w http.ResponseWriter, r *http.Request) error {
	values, err := s.store.DistinctValues(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, values)
	return nil
}
