package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"socialai/constants"
	"socialai/model"
	"socialai/service"

	jwt "github.com/form3tech-oss/jwt-go"
	"github.com/gorilla/mux"
	"github.com/pborman/uuid"
)

var mediaTypes = map[string]string{
	".jpeg": "image",
	".jpg":  "image",
	".gif":  "image",
	".png":  "image",
	".mov":  "video",
	".mp4":  "video",
	".avi":  "video",
	".flv":  "video",
	".wmv":  "video",
}

// SearchResponse is the JSON body of GET /search.
//
// The old handler returned a bare JSON array of posts. That is not enough once
// the results are paged: the browser also needs to know HOW MANY posts match
// the query, otherwise it cannot decide whether to draw a second page. So the
// array is wrapped in an object that carries the total alongside it.
type SearchResponse struct {
	Posts []model.Post `json:"posts"`
	Total int64        `json:"total"`
	Page  int          `json:"page"`
	Size  int          `json:"size"`
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	// Defer a panic recovery so a malformed request won't crash the whole server.
	defer func() {
		if err := recover(); err != nil {
			// A panic happened: return a 500 error instead of crashing.
			http.Error(w, "internal server error", http.StatusInternalServerError)
			// Print the real error on the server terminal for debugging.
			fmt.Println("panic recovered:", err)
		}
	}()

	fmt.Println("Received one upload request")

	username, ok := authenticatedUsername(r)
	if !ok {
		http.Error(w, "Invalid authentication token", http.StatusUnauthorized)
		return
	}

	// 1. process request: multipart(File, text) -> post model.POST + file ?
	p := model.Post{
		Id:      uuid.New(),
		User:    username,
		Message: r.FormValue("message"),
		// Stamp the upload time here rather than in the service layer so the
		// value is fixed at the moment the request is handled. GET /search
		// sorts on it, which is what makes paging stable.
		CreatedAt: time.Now(),
	}
	// file -> type
	file, header, err := r.FormFile("media_file")
	if err != nil {
		http.Error(w, "Media file is not available", http.StatusBadRequest)
		fmt.Printf("Media file is not available %v\n", err)
		return
	}
	defer file.Close()

	suffix := strings.ToLower(filepath.Ext(header.Filename))
	if mediaType, ok := mediaTypes[suffix]; ok {
		p.Type = mediaType
	} else {
		p.Type = "unknown" // error
	}

	// 2. call service
	if err := service.SavePost(&p, file); err != nil {
		http.Error(w, "Failed to save post to backend", http.StatusInternalServerError) // 500
		fmt.Printf("Failed to save post to backend %v\n", err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	fmt.Fprintln(w, "Post is saved successfully.")
}

func authenticatedUsername(r *http.Request) (string, bool) {
	token, ok := r.Context().Value("user").(*jwt.Token)
	if !ok || token == nil || !token.Valid {
		return "", false
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", false
	}
	username, ok := claims["username"].(string)
	return username, ok && username != ""
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received one request for delete")
	username, ok := authenticatedUsername(r)
	if !ok {
		http.Error(w, "Invalid authentication token", http.StatusUnauthorized)
		return
	}

	id := mux.Vars(r)["id"]
	if id == "" {
		http.Error(w, "Post ID is required", http.StatusBadRequest)
		return
	}
	// Reject malformed path parameters before querying Elasticsearch. The
	// pborman/uuid Parse function returns nil when the string is not a UUID.
	if uuid.Parse(id) == nil {
		http.Error(w, "Invalid post ID format", http.StatusBadRequest)
		return
	}
	deleted, err := service.DeletePost(id, username)
	if err != nil {
		http.Error(w, "Failed to delete post", http.StatusInternalServerError)
		fmt.Printf("Failed to delete post %v\n", err)
		return
	}
	if !deleted {
		http.Error(w, "Post not found or not owned by current user", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "Post is deleted successfully")
}

func searchHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received one request for search")
	w.Header().Set("Content-Type", "application/json")

	// 1. process request: URL -> user + keyword + media type + page
	// Read query parameters: /search?user=xxx, /search?keywords=xxx,
	// /search?mediaType=video, /search?page=2&size=12
	user := r.URL.Query().Get("user")
	keywords := r.URL.Query().Get("keywords")
	semantic := strings.TrimSpace(r.URL.Query().Get("semantic"))

	// mediaType is "image", "video", or empty for "all types".
	// It is spelled "mediaType" and not "type" because "type" would collide
	// with the front end's own search-mode concept (all / keyword / user).
	mediaType := r.URL.Query().Get("mediaType")
	page, size := parsePagination(r)

	// The page window is expressed as "from" (how many to skip) + "size"
	// (how many to take), which is the shape Elasticsearch expects:
	//   page 1 -> from 0,  page 2 -> from 12,  page 3 -> from 24 ...
	from := (page - 1) * size

	// 2. call service
	var posts []model.Post
	var total int64
	var err error
	if semantic != "" {
		posts, total, err = service.SearchPostsByMeaning(r.Context(), semantic, mediaType, from, size)
	} else if user != "" {
		posts, total, err = service.SearchPostsByUser(user, mediaType, from, size)
	} else {
		posts, total, err = service.SearchPostsByKeywords(keywords, mediaType, from, size)
	}

	// 3. construct response:[]model.Post -> json
	if err != nil {
		if errors.Is(err, service.ErrSemanticSearchDisabled) {
			http.Error(w, "Semantic search is not configured on the server", http.StatusServiceUnavailable)
			return
		}
		http.Error(w, "Failed to read post from backend", http.StatusInternalServerError)
		fmt.Printf("Failed to read post from backend %v.\n", err)
		return
	}

	js, err := json.Marshal(SearchResponse{
		Posts: posts,
		Total: total,
		Page:  page,
		Size:  size,
	})
	if err != nil {
		http.Error(w, "Failed to parse posts into JSON format", http.StatusInternalServerError)
		fmt.Printf("Failed to parse posts into JSON format %v.\n", err)
		return
	}
	w.Write(js)
}

// parsePagination reads ?page= and ?size= and falls back to sane defaults.
//
// Anything that is not a positive integer is ignored rather than rejected, so
// a stray "?page=abc" quietly degrades to page 1 instead of returning a 400
// the user has to decode. A "size" above MAX_PAGE_SIZE is clamped instead of
// refused for the same reason.
func parsePagination(r *http.Request) (page int, size int) {
	page = 1
	size = constants.DEFAULT_PAGE_SIZE

	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("size")); err == nil && v > 0 {
		if v > constants.MAX_PAGE_SIZE {
			v = constants.MAX_PAGE_SIZE
		}
		size = v
	}
	return page, size
}
