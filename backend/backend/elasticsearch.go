package backend

import (
	"context"
	"fmt"

	"socialai/constants"
	"socialai/util"

	"github.com/olivere/elastic/v7"
)

var (
	ESBackend *ElasticsearchBackend
)

type ElasticsearchBackend struct {
	client *elastic.Client
}

func InitElasticsearchBackend(config *util.ElasticsearchInfo) {
	// 1. initialize ESBackend -> initialize elastic search client
	client, err := elastic.NewClient(
		elastic.SetSniff(false),
		elastic.SetURL(config.Address),
		elastic.SetBasicAuth(config.Username, config.Password))
	if err != nil {
		panic(err)
	}

	//2. create post and user index

	// Create the post index if it does not exist yet.
	exists, err := client.IndexExists(constants.POST_INDEX).Do(context.Background())
	if err != nil {
		panic(err)
	}

	// type: keyword must be exactly matched
	// "index": false means the field is STORED but NOT INDEXED for search.
	// Elasticsearch builds no inverted index for it, so it cannot be
	// queried or filtered; the original value is still kept and returned
	// with the document. This saves disk space and speeds up writes.
	// Here "url" and "type" are only retrieved, never searched.
	//
	// "created_at" is the exception: it IS indexed, because GET /search sorts
	// on it to make pagination stable. Sorting on a field with no mapping
	// fails with "No mapping found for [created_at] in order to sort on",
	// so the field has to be a real mapped date.

	if !exists {
		mapping := `{
			"mappings": {
				"properties": {
					"id":         { "type": "keyword" },
					"user":       { "type": "keyword" },
					"message":    { "type": "text" },
					"url":        { "type": "keyword", "index": false },
					"type":       { "type": "keyword", "index": false },
					"created_at": { "type": "date" }
					,"embedding": { "type": "dense_vector", "dims": 768 }
				}
			}
		}`
		_, err := client.CreateIndex(constants.POST_INDEX).Body(mapping).Do(context.Background())
		if err != nil {
			panic(err)
		}
	}

	// Existing installations already have a post index. Add the vector field
	// without deleting or recreating that index, so old posts remain intact.
	vectorMapping := `{"properties":{"embedding":{"type":"dense_vector","dims":768}}}`
	if _, err := client.PutMapping().Index(constants.POST_INDEX).BodyString(vectorMapping).Do(context.Background()); err != nil {
		panic(fmt.Errorf("add semantic-search mapping: %w", err))
	}

	// Create the user index if it does not exist yet.
	// "age" and "gender" also use "index": false: stored but not
	// searchable. Saves space and skips inverted indexes we never query.

	exists, err = client.IndexExists(constants.USER_INDEX).Do(context.Background())
	if err != nil {
		panic(err)
	}

	if !exists {
		mapping := `{
			"mappings": {
				"properties": {
					"username": { "type": "keyword" },
					"password": { "type": "keyword" },
					"age":      { "type": "long", "index": false },
					"gender":   { "type": "keyword", "index": false }
				}
			}
		}`
		_, err := client.CreateIndex(constants.USER_INDEX).Body(mapping).Do(context.Background())
		if err != nil {
			panic(err)
		}
	}
	fmt.Println("Indexes are created.")

	ESBackend = &ElasticsearchBackend{client: client}
}

// ReadFromES runs one search request and returns the raw Elasticsearch result.
//
// from / size describe the pagination window:
//
//	from = (page - 1) * size
//	size = how many documents this page holds
//
// size = 0 is a special case: Elasticsearch returns no hits but still reports
// the total, which is exactly what "does this user exist?" needs.
//
// mediaType filters by post type ("image" or "video"). An empty string means
// "all types".
//
// sorters is variadic because the two indexes do not share a sortable field:
// the post index sorts on created_at, while the user index has no such field
// and must not try to sort on it.
func (backend *ElasticsearchBackend) ReadFromES(query elastic.Query, index string, from int, size int, mediaType string, sorters ...elastic.Sorter) (*elastic.SearchResult, error) {
	searchService := backend.client.Search().
		Index(index).
		From(from).
		Size(size).
		Pretty(true).
		FetchSourceContext(elastic.NewFetchSourceContext(true).Exclude(constants.EMBEDDING_FIELD))

	searchQuery := query

	// Why a script instead of a plain term query? "type" is mapped with
	// "index": false, so Elasticsearch keeps the value but builds no inverted
	// index for it. A term query on it fails with:
	//
	//   Cannot search on field [type] since it is not indexed.
	//
	// doc_values are still written for keyword fields though, and a painless
	// script reads the value straight out of doc_values. That lets us filter
	// server side without rebuilding the index.
	if mediaType != "" {
		script := elastic.NewScript("doc['type'].value == params.mediaType").
			Param("mediaType", mediaType)
		searchQuery = elastic.NewBoolQuery().
			Must(query).
			Filter(elastic.NewScriptQuery(script))
	}
	searchService = searchService.Query(searchQuery)

	if len(sorters) > 0 {
		searchService = searchService.SortBy(sorters...)
	}

	searchResult, err := searchService.Do(context.Background())
	if err != nil {
		return nil, err
	}
	return searchResult, nil
}

// SearchMissingEmbeddings returns old post documents that have not yet been
// embedded. It always reads from the first page because each successful
// backfill removes that document from this result set.
func (backend *ElasticsearchBackend) SearchMissingEmbeddings(size int) (*elastic.SearchResult, error) {
	query := elastic.NewBoolQuery().MustNot(elastic.NewExistsQuery(constants.EMBEDDING_FIELD))
	return backend.client.Search().Index(constants.POST_INDEX).Query(query).Size(size).Do(context.Background())
}

// PostSorters is the sort order used by GET /search: newest post first.
//
// Missing("_last") matters for backfill: documents written before created_at
// existed have no value at all, and without this setting Elasticsearch would
// try to sort them and the whole request can fail. "_last" parks them at the
// bottom of a descending sort instead.
//
// The "id" tie-break makes the order deterministic when timestamps are equal
// (for example rows backfilled in a single batch). Deterministic order is what
// keeps page 2 from repeating or skipping rows that page 1 already returned.
func PostSorters() []elastic.Sorter {
	return []elastic.Sorter{
		elastic.NewFieldSort(constants.TIMESTAMP_FIELD).Desc().Missing("_last"),
		elastic.NewFieldSort("id").Asc(),
	}
}

// SaveToES stores a document in the requested Elasticsearch index.
func (backend *ElasticsearchBackend) SaveToES(value interface{}, index string, id string) error {
	_, err := backend.client.Index().
		Index(index).
		Id(id).
		BodyJson(value).
		Refresh("wait_for").
		Do(context.Background())
	return err
}

// DeleteFromES removes documents matching the query and reports whether any
// document was actually deleted. DeleteByQuery does not return an error when
// the query matches zero documents, so callers must check the deleted count.
func (backend *ElasticsearchBackend) DeleteFromES(query elastic.Query, index string) (bool, error) {
	result, err := backend.client.DeleteByQuery().
		Index(index).
		Query(query).
		Pretty(true).
		Do(context.Background())
	if err != nil {
		return false, err
	}
	return result.Deleted > 0, nil
}
