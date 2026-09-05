package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// jwk, Supabase'in yayımladığı JSON Web Key'in ihtiyaç duyduğumuz alanları.
type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	Crv string `json:"crv"`
	N   string `json:"n"`
	E   string `json:"e"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

type jwkSet struct {
	Keys []jwk `json:"keys"`
}

// keyCache, JWKS uç noktasını önbellekler; bilinmeyen kid görülünce yeniler.
type keyCache struct {
	url       string
	client    *http.Client
	mu        sync.RWMutex
	keys      map[string]any
	fetchedAt time.Time
}

const jwksMinRefreshInterval = time.Minute

func newKeyCache(url string) *keyCache {
	return &keyCache{
		url:    url,
		client: &http.Client{Timeout: 10 * time.Second},
		keys:   map[string]any{},
	}
}

// publicKey, kid için ortak anahtarı döner; bulunamazsa bir kez JWKS'i tazeler.
func (c *keyCache) publicKey(kid string) (any, error) {
	c.mu.RLock()
	key, ok := c.keys[kid]
	stale := time.Since(c.fetchedAt) > jwksMinRefreshInterval
	c.mu.RUnlock()

	if ok {
		return key, nil
	}
	if !stale && !c.fetchedAt.IsZero() {
		return nil, fmt.Errorf("bilinmeyen anahtar kimliği: %s", kid)
	}

	if err := c.refresh(); err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	if key, ok := c.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("bilinmeyen anahtar kimliği: %s", kid)
}

func (c *keyCache) refresh() error {
	resp, err := c.client.Get(c.url)
	if err != nil {
		return fmt.Errorf("JWKS indirilemedi: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS yanıtı %d", resp.StatusCode)
	}

	var set jwkSet
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return fmt.Errorf("JWKS çözümlenemedi: %w", err)
	}

	parsed := make(map[string]any, len(set.Keys))
	for _, k := range set.Keys {
		pub, err := k.publicKey()
		if err != nil {
			// Desteklenmeyen anahtar türünü atla, diğerleri çalışsın.
			continue
		}
		parsed[k.Kid] = pub
	}

	c.mu.Lock()
	c.keys = parsed
	c.fetchedAt = time.Now()
	c.mu.Unlock()
	return nil
}

func (k jwk) publicKey() (any, error) {
	switch k.Kty {
	case "RSA":
		n, err := decodeBigInt(k.N)
		if err != nil {
			return nil, err
		}
		e, err := decodeBigInt(k.E)
		if err != nil {
			return nil, err
		}
		return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil

	case "EC":
		var curve elliptic.Curve
		switch k.Crv {
		case "P-256":
			curve = elliptic.P256()
		case "P-384":
			curve = elliptic.P384()
		case "P-521":
			curve = elliptic.P521()
		default:
			return nil, fmt.Errorf("desteklenmeyen eğri: %s", k.Crv)
		}
		x, err := decodeBigInt(k.X)
		if err != nil {
			return nil, err
		}
		y, err := decodeBigInt(k.Y)
		if err != nil {
			return nil, err
		}
		return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil

	default:
		return nil, fmt.Errorf("desteklenmeyen anahtar türü: %s", k.Kty)
	}
}

func decodeBigInt(s string) (*big.Int, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("base64url çözülemedi: %w", err)
	}
	return new(big.Int).SetBytes(b), nil
}
