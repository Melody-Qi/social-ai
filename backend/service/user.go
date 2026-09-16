package service

import (
	"socialai/backend"
	"socialai/constants"
	"socialai/model"

	"github.com/olivere/elastic/v7"
)

// CheckUser validates a username/password pair against the user index.
func CheckUser(username string, password string) (bool, error) {
	// 1. search ES by username + password
	query := elastic.NewBoolQuery()
	query.Must(elastic.NewTermQuery("username", username))
	query.Must(elastic.NewTermQuery("password", password))

	// 2. call backend to search
	// from=0, size=0 -> "count only". Elasticsearch still reports TotalHits
	// but skips building the hit list, which is all this check needs.
	// No sorters are passed: the user index has no created_at field, and
	// sorting on an unmapped field fails with
	// "No mapping found for [created_at] in order to sort on".
	searchResult, err := backend.ESBackend.ReadFromES(query, constants.USER_INDEX, 0, 0, "")
	if err != nil {
		return false, err
	}

	// 3. response
	return searchResult.TotalHits() > 0, nil
}

// AddUser creates a user only when the username is not already present.
//
// The bool and error report two different outcomes:
//   - true, nil: a new user was created successfully.
//   - false, nil: the username already exists, so nothing was created.
//   - false, err: an Elasticsearch read or write operation failed.
//
// The bool is necessary because "user already exists" is a valid business
// result, not a backend error. Elasticsearch is a NoSQL document store, and
// indexing another document with the same index and document ID can overwrite
// the existing document. We therefore check for the username first and return
// false instead of silently replacing the existing user's data.
func AddUser(user *model.User) (bool, error) {
	// 1. whether user existed
	query := elastic.NewTermQuery("username", user.Username)
	searchResult, err := backend.ESBackend.ReadFromES(query, constants.USER_INDEX, 0, 0, "")
	if err != nil {
		return false, err
	}
	if searchResult.TotalHits() > 0 {
		return false, nil
	}

	// 2. if not, add user
	if err := backend.ESBackend.SaveToES(user, constants.USER_INDEX, user.Username); err != nil {
		return false, err
	}
	return true, nil
}
