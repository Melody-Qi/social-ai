package util

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadApplicationConfigReadsSemanticSearchAndEnvironmentKey(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`
elasticsearch:
  address: http://localhost:9200
  username: user
  password: password
gcs:
  bucket: bucket
token:
  secret: secret
semantic_search:
  model: gemini-embedding-001
  dimensions: 768
  backfill_on_startup: true
`)
	if err := os.WriteFile(filepath.Join(dir, "deploy.yml"), content, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GEMINI_API_KEY", "environment-key")
	t.Setenv("SEMANTIC_BACKFILL_ON_STARTUP", "false")

	config, err := LoadApplicationConfig(dir, "deploy.yml")
	if err != nil {
		t.Fatalf("LoadApplicationConfig returned error: %v", err)
	}
	semantic := config.SemanticSearchConfig
	if semantic.APIKey != "environment-key" || semantic.Model != "gemini-embedding-001" ||
		semantic.Dimensions != 768 || semantic.BackfillOnStartup {
		t.Fatalf("unexpected semantic config: %+v", semantic)
	}
}

func TestLoadApplicationConfigRejectsInvalidBackfillEnvironmentValue(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`
elasticsearch:
  address: http://localhost:9200
gcs:
  bucket: bucket
token:
  secret: secret
`)
	if err := os.WriteFile(filepath.Join(dir, "deploy.yml"), content, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SEMANTIC_BACKFILL_ON_STARTUP", "sometimes")

	if _, err := LoadApplicationConfig(dir, "deploy.yml"); err == nil {
		t.Fatal("expected invalid SEMANTIC_BACKFILL_ON_STARTUP to fail")
	}
}

func TestLoadApplicationConfigKeepsSemanticSearchOptional(t *testing.T) {
	dir := t.TempDir()
	content := []byte(`
elasticsearch:
  address: http://localhost:9200
gcs:
  bucket: bucket
token:
  secret: secret
`)
	if err := os.WriteFile(filepath.Join(dir, "deploy.yml"), content, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GEMINI_API_KEY", "")

	config, err := LoadApplicationConfig(dir, "deploy.yml")
	if err != nil {
		t.Fatalf("LoadApplicationConfig returned error: %v", err)
	}
	if config.SemanticSearchConfig == nil || config.SemanticSearchConfig.APIKey != "" {
		t.Fatalf("semantic config should be present but disabled: %+v", config.SemanticSearchConfig)
	}
}
