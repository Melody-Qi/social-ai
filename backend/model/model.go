package model

import "time"

type Post struct {
	Id      string `json:"id"`
	User    string `json:"user"`
	Message string `json:"message"`
	Url     string `json:"url"`
	Type    string `json:"type"`

	// Embedding is the numeric meaning of Message used only by Elasticsearch
	// for semantic search. The service clears it before returning posts to the
	// browser, so this large internal field never bloats the public API.
	Embedding []float64 `json:"embedding,omitempty"`

	// CreatedAt is stamped when the post is uploaded and is the field
	// GET /search sorts on.
	//
	// Why is it needed? Paging without a stable sort order is broken: on every
	// request Elasticsearch is free to return equally-scoring documents in a
	// different order, so page 2 can repeat a post that page 1 already showed
	// or skip one entirely. Sorting by a real timestamp makes the page windows
	// line up.
	//
	// time.Time marshals to an RFC3339 string, which Elasticsearch maps to the
	// "date" type without any extra parsing code.
	CreatedAt time.Time `json:"created_at"`
}

// User is the account document stored in the Elasticsearch user index.
// Password is kept here to match the lesson API. A production application
// should store a slow password hash (for example bcrypt), never plaintext.
type User struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Age      int64  `json:"age"`
	Gender   string `json:"gender"`
}
