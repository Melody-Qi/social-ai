package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"socialai/util"
)

type fakeEmbeddingProvider struct {
	vector []float64
	err    error
	task   string
	text   string
}

func (f *fakeEmbeddingProvider) Embed(_ context.Context, text, task string) ([]float64, error) {
	f.text = text
	f.task = task
	return f.vector, f.err
}

func TestEmbedTextUsesConfiguredProvider(t *testing.T) {
	previous := embeddingProvider
	t.Cleanup(func() { embeddingProvider = previous })
	fake := &fakeEmbeddingProvider{vector: []float64{0.1, 0.2}}
	embeddingProvider = fake

	vector, err := embedText(context.Background(), "a mountain trail", retrievalQuery)
	if err != nil {
		t.Fatalf("embedText returned error: %v", err)
	}
	if len(vector) != 2 || fake.text != "a mountain trail" || fake.task != retrievalQuery {
		t.Fatalf("unexpected provider call/result: vector=%v text=%q task=%q", vector, fake.text, fake.task)
	}
}

func TestEmbedTextReportsDisabledProvider(t *testing.T) {
	previous := embeddingProvider
	t.Cleanup(func() { embeddingProvider = previous })
	embeddingProvider = nil

	_, err := embedText(context.Background(), "query", retrievalQuery)
	if !errors.Is(err, ErrSemanticSearchDisabled) {
		t.Fatalf("expected ErrSemanticSearchDisabled, got %v", err)
	}
}

func TestInitSemanticSearchDefaults(t *testing.T) {
	previous := embeddingProvider
	t.Cleanup(func() { embeddingProvider = previous })

	if InitSemanticSearch(nil) {
		t.Fatal("nil configuration should leave semantic search disabled")
	}
}

func TestGeminiEmbeddingProviderSendsExpectedRequest(t *testing.T) {
	var gotKey string
	var gotRequest geminiEmbeddingRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("x-goog-api-key")
		if r.URL.Path != "/models/test-model:embedContent" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotRequest); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"embedding":{"values":[0.1,0.2,0.3]}}`))
	}))
	defer server.Close()

	provider := &geminiEmbeddingProvider{
		apiKey: "server-only-key", model: "test-model", endpoint: server.URL,
		dimensions: 3, client: server.Client(),
	}
	vector, err := provider.Embed(context.Background(), "mountain trail", retrievalQuery)
	if err != nil {
		t.Fatalf("Embed returned error: %v", err)
	}
	if len(vector) != 3 || gotKey != "server-only-key" {
		t.Fatalf("unexpected response/key: vector=%v key=%q", vector, gotKey)
	}
	if gotRequest.Model != "models/test-model" || gotRequest.TaskType != retrievalQuery ||
		gotRequest.OutputDimensionality != 3 || gotRequest.Content.Parts[0].Text != "mountain trail" {
		t.Fatalf("unexpected embedding request: %+v", gotRequest)
	}
}

func TestGeminiEmbeddingProviderRejectsWrongDimensions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"embedding":{"values":[0.1]}}`))
	}))
	defer server.Close()

	provider := &geminiEmbeddingProvider{
		apiKey: "key", model: "model", endpoint: server.URL,
		dimensions: 2, client: server.Client(),
	}
	_, err := provider.Embed(context.Background(), "text", retrievalDocument)
	if err == nil {
		t.Fatal("expected an error for a vector with the wrong dimensions")
	}
}

func TestInitSemanticSearchUsesConfiguredValues(t *testing.T) {
	previous := embeddingProvider
	t.Cleanup(func() { embeddingProvider = previous })

	config := &util.SemanticSearchInfo{
		APIKey: "key", Model: "custom-model", Endpoint: "https://example.com/", Dimensions: 256,
	}
	if !InitSemanticSearch(config) {
		t.Fatal("configuration with an API key should enable semantic search")
	}
	provider, ok := embeddingProvider.(*geminiEmbeddingProvider)
	if !ok {
		t.Fatalf("unexpected provider type: %T", embeddingProvider)
	}
	if provider.model != "custom-model" || provider.endpoint != "https://example.com" || provider.dimensions != 256 {
		t.Fatalf("configuration was not applied: %+v", provider)
	}
}
