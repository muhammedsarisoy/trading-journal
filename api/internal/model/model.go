package model

import "time"

// Fund, işlemin açıldığı hesap/fon.
type Fund struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Broker          *string   `json:"broker"`
	Currency        string    `json:"currency"`
	StartingBalance float64   `json:"starting_balance"`
	IsProp          bool      `json:"is_prop"`
	IsActive        bool      `json:"is_active"`
	Note            *string   `json:"note"`
	CreatedAt       time.Time `json:"created_at"`
}

// FundInput, fon oluşturma/güncelleme gövdesi.
type FundInput struct {
	Name            string  `json:"name"`
	Broker          *string `json:"broker"`
	Currency        string  `json:"currency"`
	StartingBalance float64 `json:"starting_balance"`
	IsProp          bool    `json:"is_prop"`
	IsActive        *bool   `json:"is_active"`
	Note            *string `json:"note"`
}

// Platform, işlemin girildiği aracı/terminal.
type Platform struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// Trade, tek bir işlem kaydı (trades_enriched görünümünden okunur).
type Trade struct {
	ID         string  `json:"id"`
	FundID     *string `json:"fund_id"`
	PlatformID *string `json:"platform_id"`

	Symbol     string `json:"symbol"`
	AssetClass string `json:"asset_class"`
	Direction  string `json:"direction"`
	Currency   string `json:"currency"`

	OpenedAt  time.Time  `json:"opened_at"`
	ClosedAt  *time.Time `json:"closed_at"`
	Timeframe *string    `json:"timeframe"`

	// Asıl sonuç kaynağı: ekstredeki net tutar ve riske edilen tutar.
	PnLOverride *float64 `json:"pnl_override"`
	RiskManual  *float64 `json:"risk_manual"`
	RManual     *float64 `json:"r_manual"` // kazanılan R; zarar için eksi

	// Fiyat/boyut alanları isteğe bağlı; doldurulursa K/Z bunlardan hesaplanır.
	EntryPrice   *float64 `json:"entry_price"`
	ExitPrice    *float64 `json:"exit_price"`
	StopLoss     *float64 `json:"stop_loss"`
	TakeProfit   *float64 `json:"take_profit"`
	Quantity     *float64 `json:"quantity"`
	QuantityUnit *string  `json:"quantity_unit"`
	ContractSize *float64 `json:"contract_size"`
	Leverage     *float64 `json:"leverage"`
	Fees         float64  `json:"fees"`
	Swap         float64  `json:"swap"`

	Setup       *string  `json:"setup"`
	Reason      *string  `json:"reason"`
	Confluences []string `json:"confluences"`
	Tags        []string `json:"tags"`

	EmotionBefore *string  `json:"emotion_before"`
	EmotionAfter  *string  `json:"emotion_after"`
	Confidence    *int16   `json:"confidence"`
	Stress        *int16   `json:"stress"`
	FollowedPlan  *bool    `json:"followed_plan"`
	Mistakes      []string `json:"mistakes"`
	Lesson        *string  `json:"lesson"`
	Notes         *string  `json:"notes"`

	Status     string   `json:"status"`
	PnL        *float64 `json:"pnl"`
	RiskAmount *float64 `json:"risk_amount"`
	RMultiple  *float64 `json:"r_multiple"`

	FundName     *string `json:"fund_name"`
	FundCurrency *string `json:"fund_currency"`
	PlatformName *string `json:"platform_name"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TradeInput, işlem oluşturma ve tam güncelleme gövdesi.
type TradeInput struct {
	FundID     *string `json:"fund_id"`
	PlatformID *string `json:"platform_id"`

	Symbol     string `json:"symbol"`
	AssetClass string `json:"asset_class"`
	Direction  string `json:"direction"`
	Currency   string `json:"currency"`

	OpenedAt  time.Time  `json:"opened_at"`
	ClosedAt  *time.Time `json:"closed_at"`
	Timeframe *string    `json:"timeframe"`

	PnLOverride *float64 `json:"pnl_override"`
	RiskManual  *float64 `json:"risk_manual"`
	RManual     *float64 `json:"r_manual"` // kazanılan R; zarar için eksi

	EntryPrice   *float64 `json:"entry_price"`
	ExitPrice    *float64 `json:"exit_price"`
	StopLoss     *float64 `json:"stop_loss"`
	TakeProfit   *float64 `json:"take_profit"`
	Quantity     *float64 `json:"quantity"`
	QuantityUnit *string  `json:"quantity_unit"`
	ContractSize *float64 `json:"contract_size"`
	Leverage     *float64 `json:"leverage"`
	Fees         float64  `json:"fees"`
	Swap         float64  `json:"swap"`

	Setup       *string  `json:"setup"`
	Reason      *string  `json:"reason"`
	Confluences []string `json:"confluences"`
	Tags        []string `json:"tags"`

	EmotionBefore *string  `json:"emotion_before"`
	EmotionAfter  *string  `json:"emotion_after"`
	Confidence    *int16   `json:"confidence"`
	Stress        *int16   `json:"stress"`
	FollowedPlan  *bool    `json:"followed_plan"`
	Mistakes      []string `json:"mistakes"`
	Lesson        *string  `json:"lesson"`
	Notes         *string  `json:"notes"`
}

// Screenshot, işleme bağlı ekran görüntüsü kaydı.
// Dosyanın kendisi Supabase Storage'ta; burada yalnız yolu tutulur.
type Screenshot struct {
	ID        string    `json:"id"`
	TradeID   string    `json:"trade_id"`
	Path      string    `json:"path"`
	Caption   *string   `json:"caption"`
	Phase     string    `json:"phase"`
	CreatedAt time.Time `json:"created_at"`
}

// ScreenshotInput, yüklenen dosyanın kaydını açar.
type ScreenshotInput struct {
	Path    string  `json:"path"`
	Caption *string `json:"caption"`
	Phase   string  `json:"phase"`
}

// TradeFilter, liste ve istatistik sorgularının ortak süzgeci.
type TradeFilter struct {
	From       *time.Time
	To         *time.Time
	FundID     *string
	PlatformID *string
	Status     *string
	Symbol     *string
	AssetClass *string
	Direction  *string
	Setup      *string
	Currency   *string
	Search     *string
	Limit      int
	Offset     int
}

// TradeList, sayfalı liste yanıtı.
type TradeList struct {
	Items  []Trade `json:"items"`
	Total  int     `json:"total"`
	Limit  int     `json:"limit"`
	Offset int     `json:"offset"`
}

// Summary, seçili aralığın özet performansı.
type Summary struct {
	Currency       string   `json:"currency"`
	TradeCount     int      `json:"trade_count"`
	ClosedCount    int      `json:"closed_count"`
	OpenCount      int      `json:"open_count"`
	WinCount       int      `json:"win_count"`
	LossCount      int      `json:"loss_count"`
	BreakevenCount int      `json:"breakeven_count"`
	NetPnL         float64  `json:"net_pnl"`
	GrossProfit    float64  `json:"gross_profit"`
	GrossLoss      float64  `json:"gross_loss"`
	WinRate        *float64 `json:"win_rate"`
	ProfitFactor   *float64 `json:"profit_factor"`
	Expectancy     *float64 `json:"expectancy"`
	AvgWin         *float64 `json:"avg_win"`
	AvgLoss        *float64 `json:"avg_loss"`
	LargestWin     *float64 `json:"largest_win"`
	LargestLoss    *float64 `json:"largest_loss"`
	AvgR           *float64 `json:"avg_r"`
	TotalR         float64  `json:"total_r"`
	MaxDrawdown    float64  `json:"max_drawdown"`
	MaxDrawdownR   float64  `json:"max_drawdown_r"`
	TotalFees      float64  `json:"total_fees"`
	AvgHoldMinutes *float64 `json:"avg_hold_minutes"`
}

// SeriesPoint, zaman kovası başına kâr/zarar.
type SeriesPoint struct {
	Bucket      time.Time `json:"bucket"`
	NetPnL      float64   `json:"net_pnl"`
	Profit      float64   `json:"profit"`
	Loss        float64   `json:"loss"`
	TradeCount  int       `json:"trade_count"`
	WinCount    int       `json:"win_count"`
	Cumulative  float64   `json:"cumulative"`
	NetR        float64   `json:"net_r"`
	CumulativeR float64   `json:"cumulative_r"`
}

// BreakdownRow, kırılım raporlarının tek satırı (strateji, sembol, duygu...).
type BreakdownRow struct {
	Key        string   `json:"key"`
	TradeCount int      `json:"trade_count"`
	WinCount   int      `json:"win_count"`
	NetPnL     float64  `json:"net_pnl"`
	WinRate    *float64 `json:"win_rate"`
	AvgR       *float64 `json:"avg_r"`
	TotalR     float64  `json:"total_r"`
}

// ---------------------------------------------------------------- Eğitim

// Course, bir eğitim serisi (courses_enriched görünümünden okunur).
type Course struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Instructor  *string `json:"instructor"`
	URL         *string `json:"url"`
	Description *string `json:"description"`
	Archived    bool    `json:"archived"`

	LessonCount    int        `json:"lesson_count"`
	CompletedCount int        `json:"completed_count"`
	NoteCount      int        `json:"note_count"`
	LastStudiedOn  *time.Time `json:"last_studied_on"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CourseInput, eğitim oluşturma/güncelleme gövdesi.
type CourseInput struct {
	Title       string  `json:"title"`
	Instructor  *string `json:"instructor"`
	URL         *string `json:"url"`
	Description *string `json:"description"`
	Archived    bool    `json:"archived"`
}

// Lesson, serinin bir günü.
type Lesson struct {
	ID          string     `json:"id"`
	CourseID    string     `json:"course_id"`
	DayNo       *int       `json:"day_no"`
	Title       string     `json:"title"`
	VideoURL    *string    `json:"video_url"`
	StudiedOn   *time.Time `json:"studied_on"`
	DurationMin *int       `json:"duration_min"`
	Summary     *string    `json:"summary"`
	Tags        []string   `json:"tags"`
	Completed   bool       `json:"completed"`
	NoteCount   int        `json:"note_count"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LessonInput, gün oluşturma/güncelleme gövdesi.
type LessonInput struct {
	DayNo       *int       `json:"day_no"`
	Title       string     `json:"title"`
	VideoURL    *string    `json:"video_url"`
	StudiedOn   *time.Time `json:"studied_on"`
	DurationMin *int       `json:"duration_min"`
	Summary     *string    `json:"summary"`
	Tags        []string   `json:"tags"`
	Completed   bool       `json:"completed"`
}

// LessonNote, gün içindeki tek not bloğu: bir yanda grafik, öbür yanda not.
// Görselin kendisi Supabase Storage'ta; burada yalnız yolu tutulur.
type LessonNote struct {
	ID           string  `json:"id"`
	LessonID     string  `json:"lesson_id"`
	SortOrder    int     `json:"sort_order"`
	Heading      *string `json:"heading"`
	Body         *string `json:"body"`
	ImagePath    *string `json:"image_path"`
	ImageSide    string  `json:"image_side"`
	TimestampSec *int    `json:"timestamp_sec"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LessonNoteInput, not bloğu oluşturma/güncelleme gövdesi.
type LessonNoteInput struct {
	SortOrder    *int    `json:"sort_order"`
	Heading      *string `json:"heading"`
	Body         *string `json:"body"`
	ImagePath    *string `json:"image_path"`
	ImageSide    string  `json:"image_side"`
	TimestampSec *int    `json:"timestamp_sec"`
}
