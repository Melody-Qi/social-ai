package util

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"gopkg.in/yaml.v2"
)

type ElasticsearchInfo struct {
	Address  string `yaml:"address"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type GCSInfo struct {
	Bucket string `yaml:"bucket"`
}

type TokenInfo struct {
	Secret string `yaml:"secret"`
}

// SemanticSearchInfo configures the server-side text embedding provider.
// The API key should normally come from GEMINI_API_KEY, not source control.
type SemanticSearchInfo struct {
	Provider          string `yaml:"provider"`
	APIKey            string `yaml:"api_key"`
	ProjectID         string `yaml:"project_id"`
	Location          string `yaml:"location"`
	Model             string `yaml:"model"`
	Endpoint          string `yaml:"endpoint"`
	Dimensions        int    `yaml:"dimensions"`
	BackfillOnStartup bool   `yaml:"backfill_on_startup"`
}

type ApplicationConfig struct {
	ElasticsearchConfig  *ElasticsearchInfo  `yaml:"elasticsearch"`
	GCSConfig            *GCSInfo            `yaml:"gcs"`
	TokenConfig          *TokenInfo          `yaml:"token"`
	SemanticSearchConfig *SemanticSearchInfo `yaml:"semantic_search"`
}

// LoadApplicationConfig reads deploy.yml and converts its YAML structure into
// strongly typed Go configuration objects used by the backend and router.
func LoadApplicationConfig(configDir, configFile string) (*ApplicationConfig, error) {
	content, err := os.ReadFile(filepath.Join(configDir, configFile))
	if err != nil {
		return nil, err
	}

	var config ApplicationConfig
	if err := yaml.Unmarshal(content, &config); err != nil {
		return nil, err
	}
	if config.ElasticsearchConfig == nil || config.GCSConfig == nil || config.TokenConfig == nil {
		return nil, fmt.Errorf("deploy configuration must contain elasticsearch, gcs, and token sections")
	}
	if config.ElasticsearchConfig.Address == "" || config.GCSConfig.Bucket == "" || config.TokenConfig.Secret == "" {
		return nil, fmt.Errorf("deploy configuration contains an empty required value")
	}
	if config.SemanticSearchConfig == nil {
		config.SemanticSearchConfig = &SemanticSearchInfo{}
	}
	// Environment variables keep secrets out of deploy.yml and work in GCE,
	// Cloud Shell, local development, and Google App Engine.
	if apiKey := os.Getenv("GEMINI_API_KEY"); apiKey != "" {
		config.SemanticSearchConfig.APIKey = apiKey
	}
	if projectID := os.Getenv("GOOGLE_CLOUD_PROJECT"); projectID != "" {
		config.SemanticSearchConfig.ProjectID = projectID
	}
	if raw := os.Getenv("SEMANTIC_BACKFILL_ON_STARTUP"); raw != "" {
		backfill, err := strconv.ParseBool(raw)
		if err != nil {
			return nil, fmt.Errorf("SEMANTIC_BACKFILL_ON_STARTUP must be true or false: %w", err)
		}
		config.SemanticSearchConfig.BackfillOnStartup = backfill
	}
	return &config, nil
}
