package worker

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
)

type AESGCMTokenCodec struct {
	key []byte
}

func NewAESGCMTokenCodec(encodedKey string) (*AESGCMTokenCodec, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("decode calendar token encryption key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("calendar token encryption key must decode to 32 bytes")
	}

	return &AESGCMTokenCodec{key: key}, nil
}

func (codec *AESGCMTokenCodec) Encrypt(value string) (string, error) {
	block, err := aes.NewCipher(codec.key)
	if err != nil {
		return "", fmt.Errorf("create token cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create token gcm: %w", err)
	}

	iv := make([]byte, aead.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", fmt.Errorf("create token nonce: %w", err)
	}

	sealed := aead.Seal(nil, iv, []byte(value), nil)
	tagSize := 16
	ciphertext := sealed[:len(sealed)-tagSize]
	tag := sealed[len(sealed)-tagSize:]

	return strings.Join([]string{
		base64.RawURLEncoding.EncodeToString(iv),
		base64.RawURLEncoding.EncodeToString(tag),
		base64.RawURLEncoding.EncodeToString(ciphertext),
	}, "."), nil
}

func (codec *AESGCMTokenCodec) Decrypt(value string) (string, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid encrypted token format")
	}

	iv, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode token iv: %w", err)
	}
	tag, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode token tag: %w", err)
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", fmt.Errorf("decode token ciphertext: %w", err)
	}

	block, err := aes.NewCipher(codec.key)
	if err != nil {
		return "", fmt.Errorf("create token cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create token gcm: %w", err)
	}

	opened, err := aead.Open(nil, iv, append(ciphertext, tag...), nil)
	if err != nil {
		return "", fmt.Errorf("decrypt token: %w", err)
	}

	return string(opened), nil
}
