package api

import (
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
	"github.com/muhammedsarisoy/trading-journal/api/internal/store"
)

// ------------------------------------------------------- Prop harcamaları

// Uygulamanın para birimi listesinde USDT gibi 4 harfli kodlar da var.
var currencyRe = regexp.MustCompile("^[A-Z]{3,5}$")

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func validateProp(in *model.PropTransactionInput) error {
	in.Kind = strings.TrimSpace(in.Kind)
	if !allowed(in.Kind, "fee", "payout", "refund") {
		return httpx.BadRequest("Tür ücret, payout ya da iade olmalı", nil)
	}
	in.Firm = strings.TrimSpace(in.Firm)
	if in.Firm == "" {
		return httpx.BadRequest("Firma adı zorunlu", nil)
	}
	if utf8.RuneCountInString(in.Firm) > 80 {
		return httpx.BadRequest("Firma adı en çok 80 karakter olabilir", nil)
	}
	// Kuruşa yuvarlanır; yuvarlanınca sıfıra düşen tutar da reddedilir.
	in.Amount = math.Round(in.Amount*100) / 100
	if math.IsNaN(in.Amount) || in.Amount <= 0 || in.Amount > 1e9 {
		return httpx.BadRequest("Tutar sıfırdan büyük olmalı", nil)
	}

	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.Currency == "" {
		in.Currency = "USD"
	}
	if !currencyRe.MatchString(in.Currency) {
		return httpx.BadRequest("Para birimi 3–5 harfli bir kod olmalı (USD, USDT gibi)", nil)
	}

	in.OccurredOn = strings.TrimSpace(in.OccurredOn)
	if in.OccurredOn == "" {
		in.OccurredOn = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", in.OccurredOn); err != nil {
		return httpx.BadRequest("Tarih YYYY-AA-GG biçiminde olmalı", nil)
	}

	if in.AccountSize != nil && (math.IsNaN(*in.AccountSize) || *in.AccountSize <= 0 || *in.AccountSize > 1e10) {
		return httpx.BadRequest("Hesap büyüklüğü sıfırdan büyük olmalı", nil)
	}
	trimPtr(&in.FundID)
	if in.FundID != nil && !uuidRe.MatchString(*in.FundID) {
		return httpx.BadRequest("Hesap kimliği geçersiz", nil)
	}
	trimPtr(&in.Note)
	return nil
}

func (s *Server) listProp(w http.ResponseWriter, r *http.Request) error {
	list, err := s.store.ListPropTransactions(r.Context(), auth.UserID(r.Context()), store.PropFilter{
		Firm: httpx.QueryStr(r, "firm"),
		Kind: httpx.QueryStr(r, "kind"),
	})
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, list)
	return nil
}

func (s *Server) createProp(w http.ResponseWriter, r *http.Request) error {
	var in model.PropTransactionInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateProp(&in); err != nil {
		return err
	}
	t, err := s.store.CreatePropTransaction(r.Context(), auth.UserID(r.Context()), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusCreated, t)
	return nil
}

func (s *Server) updateProp(w http.ResponseWriter, r *http.Request) error {
	var in model.PropTransactionInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validateProp(&in); err != nil {
		return err
	}
	t, err := s.store.UpdatePropTransaction(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in)
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, t)
	return nil
}

func (s *Server) deleteProp(w http.ResponseWriter, r *http.Request) error {
	if err := s.store.DeletePropTransaction(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id")); err != nil {
		return storeErr(err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) propSummary(w http.ResponseWriter, r *http.Request) error {
	sum, err := s.store.PropSummary(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		return storeErr(err)
	}
	httpx.JSON(w, http.StatusOK, sum)
	return nil
}
