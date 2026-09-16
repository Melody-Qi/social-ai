package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"time"

	"socialai/backend"
	"socialai/constants"
	"socialai/model"
	"socialai/util"

	"cloud.google.com/go/compute/metadata"
	"github.com/olivere/elastic/v7"
	"golang.org/x/oauth2/google"
)

const (
	retrievalDocument = "RETRIEVAL_DOCUMENT"
	retrievalQuery    = "RETRIEVAL_QUERY"
)

var ErrSemanticSearchDisabled = errors.New("semantic search is not configured")

// EmbeddingProvider makes semantic search testable and keeps the rest of the
// application independent from a specific embedding vendor.
type EmbeddingProvider interface {
	Embed(ctx context.Context, text, taskType string) ([]float64, error)
}

var embeddingProvider EmbeddingProvider

type geminiEmbeddingProvider struct {
	apiKey     string
	model      string
	endpoint   string
	dimensions int
	client     *http.Client
}

type vertexEmbeddingProvider struct {
	projectID  string
	location   string
	model      string
	dimensions int
	client     *http.Client
}

type vertexEmbeddingRequest struct {
	Instances []struct {
		Content  string `json:"content"`
		TaskType string `json:"task_type,omitempty"`
	} `json:"instances"`
	Parameters struct {
		OutputDimensionality int `json:"outputDimensionality"`
	} `json:"parameters"`
}

type vertexEmbeddingResponse struct {
	Predictions []struct {
		Embeddings struct {
			Values []float64 `json:"values"`
		} `json:"embeddings"`
	} `json:"predictions"`
}

type geminiEmbeddingRequest struct {
	Model                string        `json:"model"`
	Content              geminiContent `json:"content"`
	TaskType             string        `json:"taskType"`
	OutputDimensionality int           `json:"outputDimensionality"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiEmbeddingResponse struct {
	Embedding struct {
		Values []float64 `json:"values"`
	} `json:"embedding"`
}

// InitSemanticSearch configures one server-side embedding provider. Vertex AI
// is preferred on Google Cloud because Application Default Credentials avoid
// storing an API key. Gemini API-key mode remains available for local use.
func InitSemanticSearch(config *util.SemanticSearchInfo) bool {
	if config == nil {
		embeddingProvider = nil
		return false
	}
	provider := strings.ToLower(strings.TrimSpace(config.Provider))
	projectID := strings.TrimSpace(config.ProjectID)
	if projectID == "" && metadata.OnGCE() {
		projectID, _ = metadata.ProjectID()
	}
	if provider == "vertex" || (provider == "" && projectID != "" && strings.TrimSpace(config.APIKey) == "") {
		client, err := google.DefaultClient(context.Background(), "https://www.googleapis.com/auth/cloud-platform")
		if err != nil {
			embeddingProvider = nil
			return false
		}
		location := strings.TrimSpace(config.Location)
		if location == "" {
			location = "us-central1"
		}
		model := strings.TrimSpace(config.Model)
		if model == "" || model == "gemini-embedding-001" {
			model = "text-embedding-005"
		}
		dimensions := config.Dimensions
		if dimensions == 0 {
			dimensions = constants.EMBEDDING_DIMENSIONS
		}
		embeddingProvider = &vertexEmbeddingProvider{
			projectID: projectID, location: location, model: model,
			dimensions: dimensions, client: client,
		}
		return true
	}
	if strings.TrimSpace(config.APIKey) == "" {
		embeddingProvider = nil
		return false
	}
	model := strings.TrimSpace(config.Model)
	if model == "" {
		model = "gemini-embedding-001"
	}
	endpoint := strings.TrimRight(strings.TrimSpace(config.Endpoint), "/")
	if endpoint == "" {
		endpoint = "https://generativelanguage.googleapis.com/v1beta"
	}
	dimensions := config.Dimensions
	if dimensions == 0 {
		dimensions = constants.EMBEDDING_DIMENSIONS
	}
	embeddingProvider = &geminiEmbeddingProvider{
		apiKey: config.APIKey, model: model, endpoint: endpoint,
		dimensions: dimensions, client: &http.Client{Timeout: 20 * time.Second},
	}
	return true
}

func (p *vertexEmbeddingProvider) Embed(ctx context.Context, text, taskType string) ([]float64, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errors.New("cannot embed empty text")
	}
	var payload vertexEmbeddingRequest
	payload.Instances = append(payload.Instances, struct {
		Content  string `json:"content"`
		TaskType string `json:"task_type,omitempty"`
	}{Content: text, TaskType: taskType})
	payload.Parameters.OutputDimensionality = p.dimensions
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	endpoint := fmt.Sprintf(
		"https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:predict",
		p.location, url.PathEscape(p.projectID), url.PathEscape(p.location), url.PathEscape(p.model),
	)
	// Vertex quotas can be temporarily exhausted during a historical backfill.
	// Retry 429 responses with bounded exponential backoff instead of failing the
	// whole startup job after one burst. A fresh request is built on every try
	// because an HTTP request body cannot be reused after it has been consumed.
	backoffs := []time.Duration{0, 10 * time.Second, 20 * time.Second, 30 * time.Second}
	for attempt, delay := range backoffs {
		if delay > 0 {
			timer := time.NewTimer(delay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			case <-timer.C:
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := p.client.Do(req)
		if err != nil {
			if attempt < len(backoffs)-1 {
				fmt.Printf("Vertex embedding request failed; retrying in %s: %v\n", backoffs[attempt+1], err)
				continue
			}
			return nil, err
		}
		// A 768-dimensional embedding response is much larger than 4 KB. Read the
		// complete successful JSON document (with a generous safety cap); truncating
		// it produces "unexpected end of JSON input" during unmarshalling.
		message, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if readErr != nil {
			if attempt < len(backoffs)-1 {
				fmt.Printf("Vertex embedding response could not be read; retrying in %s: %v\n", backoffs[attempt+1], readErr)
				continue
			}
			return nil, readErr
		}
		if (resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500) && attempt < len(backoffs)-1 {
			fmt.Printf("Vertex embedding API returned %s; retrying in %s\n", resp.Status, backoffs[attempt+1])
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("Vertex embedding API returned %s: %s", resp.Status, strings.TrimSpace(string(message)))
		}
		var decoded vertexEmbeddingResponse
		if err := json.Unmarshal(message, &decoded); err != nil {
			if attempt < len(backoffs)-1 {
				fmt.Printf("Vertex embedding API returned malformed JSON; retrying in %s: %v\n", backoffs[attempt+1], err)
				continue
			}
			return nil, err
		}
		if len(decoded.Predictions) != 1 || len(decoded.Predictions[0].Embeddings.Values) != p.dimensions {
			if attempt < len(backoffs)-1 {
				fmt.Printf("Vertex embedding API returned an unexpected vector shape; retrying in %s\n", backoffs[attempt+1])
				continue
			}
			return nil, fmt.Errorf("Vertex embedding API returned an unexpected vector shape")
		}
		return decoded.Predictions[0].Embeddings.Values, nil
	}
	return nil, errors.New("Vertex embedding retry loop ended unexpectedly")
}

func (p *geminiEmbeddingProvider) Embed(ctx context.Context, text, taskType string) ([]float64, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errors.New("cannot embed empty text")
	}
	payload := geminiEmbeddingRequest{
		Model:    "models/" + p.model,
		Content:  geminiContent{Parts: []geminiPart{{Text: text}}},
		TaskType: taskType, OutputDimensionality: p.dimensions,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	endpoint := fmt.Sprintf("%s/models/%s:embedContent", p.endpoint, url.PathEscape(p.model))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", p.apiKey)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("embedding API returned %s: %s", resp.Status, strings.TrimSpace(string(message)))
	}
	var decoded geminiEmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, err
	}
	if len(decoded.Embedding.Values) != p.dimensions {
		return nil, fmt.Errorf("embedding API returned %d dimensions; expected %d", len(decoded.Embedding.Values), p.dimensions)
	}
	return decoded.Embedding.Values, nil
}

func embedText(ctx context.Context, text, taskType string) ([]float64, error) {
	if embeddingProvider == nil {
		return nil, ErrSemanticSearchDisabled
	}
	return embeddingProvider.Embed(ctx, text, taskType)
}

// SearchPostsByMeaning finds posts whose message has similar meaning even when
// it does not contain the same literal words.
func SearchPostsByMeaning(ctx context.Context, text, mediaType string, from, size int) ([]model.Post, int64, error) {
	vector, err := embedText(ctx, text, retrievalQuery)
	if err != nil {
		return nil, 0, err
	}
	baseQuery := elastic.NewBoolQuery().Filter(elastic.NewExistsQuery(constants.EMBEDDING_FIELD))
	script := elastic.NewScript("cosineSimilarity(params.query_vector, 'embedding') + 1.0").Param("query_vector", vector)
	query := elastic.NewScriptScoreQuery(baseQuery, script)
	// Do not apply the normal newest-first sort: semantic results must remain
	// ordered by their relevance score. Pagination and media filtering remain.
	return searchPostsByScore(query, mediaType, from, size)
}

// BackfillPostEmbeddings adds vectors to posts created before semantic search
// was introduced. It is idempotent because it selects only missing vectors.
func BackfillPostEmbeddings(ctx context.Context) (int, error) {
	if embeddingProvider == nil {
		return 0, ErrSemanticSearchDisabled
	}
	updated := 0
	for {
		result, err := backend.ESBackend.SearchMissingEmbeddings(100)
		if err != nil {
			return updated, err
		}
		posts := result.Each(reflect.TypeOf(model.Post{}))
		if len(posts) == 0 {
			return updated, nil
		}
		progress := 0
		for _, item := range posts {
			post := item.(model.Post)
			if strings.TrimSpace(post.Message) == "" {
				continue
			}
			vector, err := embedText(ctx, post.Message, retrievalDocument)
			if err != nil {
				return updated, fmt.Errorf("embed post %s: %w", post.Id, err)
			}
			post.Embedding = vector
			if err := backend.ESBackend.SaveToES(&post, constants.POST_INDEX, post.Id); err != nil {
				return updated, fmt.Errorf("save post %s embedding: %w", post.Id, err)
			}
			updated++
			progress++
			// Keep bulk backfill below small online-prediction quota limits. Normal
			// interactive searches are not delayed by this backfill-only throttle.
			timer := time.NewTimer(15 * time.Second)
			select {
			case <-ctx.Done():
				timer.Stop()
				return updated, ctx.Err()
			case <-timer.C:
			}
		}
		if progress == 0 {
			return updated, errors.New("backfill cannot progress because remaining posts have empty messages")
		}
	}
}
