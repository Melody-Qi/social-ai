package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"socialai/backend"
	"socialai/handler"
	"socialai/service"
	"socialai/util"
)

func main() {
	fmt.Println("started-service")

	config, err := util.LoadApplicationConfig("conf", "deploy.yml")
	if err != nil {
		log.Fatal(err)
	}

	backend.InitElasticsearchBackend(config.ElasticsearchConfig)
	backend.InitGCSBackend(config.GCSConfig)
	if service.InitSemanticSearch(config.SemanticSearchConfig) {
		fmt.Println("semantic search is enabled")
		if config.SemanticSearchConfig.BackfillOnStartup {
			// Historical maintenance must not delay opening the HTTP port. Run it in
			// the background while login, upload and search remain available.
			go func() {
				count, err := service.BackfillPostEmbeddings(context.Background())
				if err != nil {
					// Backfill is optional maintenance work. A temporary embedding API
					// failure must not take down login, keyword search, or uploads.
					log.Printf("warning: semantic embedding backfill stopped: %v", err)
					return
				}
				fmt.Printf("semantic embedding backfill updated %d posts\n", count)
			}()
		}
	} else {
		fmt.Println("semantic search is disabled: configure Vertex AI or GEMINI_API_KEY")
	}

	log.Fatal(http.ListenAndServe(":8080", handler.InitRouter(config.TokenConfig)))
}
