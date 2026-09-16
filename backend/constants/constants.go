package constants

const (
	USER_INDEX  = "user"
	POST_INDEX  = "post"
	ES_URL      = "http://10.138.0.2:9200"
	ES_USERNAME = "melody"
	ES_PASSWORD = "***REDACTED***"
	GCS_BUCKET  = "socialai-490687497643"

	// Pagination defaults for GET /search.
	//
	// Why does pagination exist at all? Because Elasticsearch returns only the
	// FIRST 10 hits when a request does not set "size". That default is exactly
	// the bug this change fixes: once the index held more than 10 posts the
	// browser silently lost everything past hit #10, so the Videos tab kept
	// saying "No videos!" even though the video was in Elasticsearch.
	//
	// DEFAULT_PAGE_SIZE is how many posts one page holds. 12 divides evenly
	// into 2, 3 and 4 column grids, which suits the photo wall layout.
	// MAX_PAGE_SIZE caps a single request so a client cannot ask for a million
	// rows and force Elasticsearch to build a huge response.
	DEFAULT_PAGE_SIZE = 12
	MAX_PAGE_SIZE     = 100

	// TIMESTAMP_FIELD is the field GET /search sorts on.
	// It is a "date" in the post mapping. Documents written before this field
	// existed have no value and are sorted last (see Missing("_last")).
	TIMESTAMP_FIELD = "created_at"

	// Gemini embedding-001 supports configurable output dimensions. 768 keeps
	// vectors compact and stays within Elasticsearch 7's dense_vector limit.
	EMBEDDING_FIELD      = "embedding"
	EMBEDDING_DIMENSIONS = 768
)
