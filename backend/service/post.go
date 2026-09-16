package service

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"reflect"

	"socialai/backend"
	"socialai/constants"
	"socialai/model"

	"github.com/olivere/elastic/v7"
)

// SavePost uploads the media file to GCS and indexes its metadata in Elasticsearch.
func SavePost(post *model.Post, file multipart.File) error {
	// Store the message embedding with the post so later semantic queries need
	// only Elasticsearch. Upload remains available when semantic search is not
	// configured; in that mode this post simply has no semantic vector yet.
	if vector, embedErr := embedText(context.Background(), post.Message, retrievalDocument); embedErr == nil {
		post.Embedding = vector
	} else if !errors.Is(embedErr, ErrSemanticSearchDisabled) {
		// Embeddings are an enhancement, not a prerequisite for posting. Keep the
		// core upload path available during an AI-provider outage; a later
		// backfill can add the missing vector.
		fmt.Printf("warning: post %s saved without semantic embedding: %v\n", post.Id, embedErr)
	}

	// Save the media after the best-effort embedding attempt.
	mediaLink, err := backend.GCSBackend.SaveToGCS(file, post.Id)
	if err != nil {
		return err
	}
	post.Url = mediaLink

	// 2. save post to ES + 3. response
	return backend.ESBackend.SaveToES(post, constants.POST_INDEX, post.Id)
}

// SearchPostsByUser returns ONE PAGE of posts written by a single user.
//
// The extra return value is the total number of matching documents, not just
// the ones on this page. The browser pager needs it: with 14 matches and 12
// per page it has to know there are 2 pages, otherwise it can only draw one.
func SearchPostsByUser(user string, mediaType string, from int, size int) ([]model.Post, int64, error) {
	// 1. business logic: search by user
	query := elastic.NewTermQuery("user", user)

	// 2+3. run the query and build the page
	return searchPosts(query, mediaType, from, size)
}

// "abc cde efg": example keyword input - a single string with multiple
// words separated by spaces. Elasticsearch tokenizes this string into the
// terms ["abc", "cde", "efg"], and with Operator("AND") below a document must
// contain ALL of those terms to match.
//
// Why not []string? We deliberately keep keywords as ONE string instead of a
// slice because:
//  1. It maps directly to the HTTP query param: /search?keywords=this+post
//  2. The ES MatchQuery API takes a raw string and tokenizes it automatically,
//     so we don't need to split the input ourselves
//  3. The space-separated terms combined with Operator("AND") already express
//     "match all words", so a []string would only add boilerplate
func SearchPostsByKeywords(keywords string, mediaType string, from int, size int) ([]model.Post, int64, error) {
	// 1. business logic: search by keywords & all keywords matched
	// if keywords is empty -> return all posts
	query := elastic.NewMatchQuery("message", keywords)
	query.Operator("AND")
	if keywords == "" {
		query.ZeroTermsQuery("all")
	}

	// 2+3. run the query and build the page
	return searchPosts(query, mediaType, from, size)
}

// searchPosts holds the logic shared by both search entry points:
// talk to Elasticsearch once, then return the page AND the grand total.
//
// The search itself is delegated to the backend layer, which is the only place
// that knows about Elasticsearch specifics such as the script filter used for
// the non-indexed "type" field.
func searchPosts(query elastic.Query, mediaType string, from int, size int) ([]model.Post, int64, error) {
	searchResult, err := backend.ESBackend.ReadFromES(
		query, constants.POST_INDEX, from, size, mediaType, backend.PostSorters()...)
	if err != nil {
		return nil, 0, err
	}

	return getPostFromSearchResult(searchResult), searchResult.TotalHits(), nil
}

// searchPostsByScore preserves Elasticsearch's default _score ordering. It is
// used for semantic search, where relevance matters more than upload time.
func searchPostsByScore(query elastic.Query, mediaType string, from int, size int) ([]model.Post, int64, error) {
	searchResult, err := backend.ESBackend.ReadFromES(
		query, constants.POST_INDEX, from, size, mediaType)
	if err != nil {
		return nil, 0, err
	}
	return getPostFromSearchResult(searchResult), searchResult.TotalHits(), nil
}

func getPostFromSearchResult(searchResult *elastic.SearchResult) []model.Post {
	var ptype model.Post
	// make([]model.Post, 0) instead of "var posts []model.Post":
	// a nil slice marshals to JSON null, while an empty slice marshals to [].
	// The browser renders "No data!" for both, but [] keeps the JSON shape
	// predictable for every caller.
	posts := make([]model.Post, 0)

	for _, item := range searchResult.Each(reflect.TypeOf(ptype)) {
		p := item.(model.Post)
		p.Embedding = nil
		posts = append(posts, p)
	}
	return posts
}

// DeletePost deletes a post only when both its ID and owner match and reports
// whether Elasticsearch actually found and deleted a matching document.
func DeletePost(id string, user string) (bool, error) {
	query := elastic.NewBoolQuery()
	query.Must(elastic.NewTermQuery("id", id))
	query.Must(elastic.NewTermQuery("user", user))
	return backend.ESBackend.DeleteFromES(query, constants.POST_INDEX)
}
