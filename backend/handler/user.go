package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"socialai/model"
	"socialai/service"

	jwt "github.com/form3tech-oss/jwt-go"
)

func signingKey() []byte {
	return mySigningKey
}

// validateTokenHandler is reached only after the JWT middleware has verified
// the token's signature and expiration time. A 200 response therefore tells
// the frontend that the stored token represents a valid authenticated session.
func validateTokenHandler(w http.ResponseWriter, r *http.Request) {
	token, ok := r.Context().Value("user").(*jwt.Token)
	if !ok || token == nil {
		http.Error(w, "Invalid authentication token", http.StatusUnauthorized)
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		http.Error(w, "Invalid authentication claims", http.StatusUnauthorized)
		return
	}

	username, ok := claims["username"].(string)
	if !ok || username == "" {
		http.Error(w, "Missing username claim", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"username": username})
}

func signinHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received one signin request")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	var user model.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		// 400 Bad Request: the client sent an empty body, malformed JSON, or
		// JSON values that cannot be decoded into the User model.
		http.Error(w, "Cannot decode user data from client", http.StatusBadRequest)
		return
	}

	success, err := service.CheckUser(user.Username, user.Password)
	if err != nil {
		// 500 Internal Server Error: the request format was valid, but the
		// server could not query Elasticsearch to verify the credentials.
		http.Error(w, "Failed to read user from Elasticsearch", http.StatusInternalServerError)
		return
	}
	if !success {
		// 401 Unauthorized: authentication failed because the username does
		// not exist or the supplied password is incorrect.
		http.Error(w, "User doesn't exist or wrong password", http.StatusUnauthorized)
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"username": user.Username,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})
	tokenString, err := token.SignedString(signingKey())
	if err != nil {
		// 500 Internal Server Error: the credentials were correct, but the
		// server failed to sign and generate the JWT.
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}
	// 200 OK: w.Write writes the JWT to the response body. Because no other
	// status was explicitly written, Go automatically sends 200 OK.
	_, _ = w.Write([]byte(tokenString))
}

func signupHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Received one signup request")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	var user model.User

	// 1. process request: JSON string -> user model.User
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		// 400 Bad Request: the request body is empty, contains malformed JSON,
		// or cannot be converted into the User model.
		http.Error(w, "Cannot decode user data from client", http.StatusBadRequest)
		return
	}

	// 2. call service to add user
	// Username rule: ^[a-z0-9]{5,}$
	//   ^        - start of the string
	//   [a-z0-9] - each character must be a lowercase letter (a-z) or digit (0-9)
	//   {5,}     - the allowed character must appear at least 5 times, with no maximum length
	//   $        - end of the string
	// Therefore, the entire username must contain only lowercase letters and digits
	// and must be at least five characters long. Examples: "alice" and "user123".
	validUsername := regexp.MustCompile(`^[a-z0-9]{5,}$`).MatchString(user.Username)
	if user.Username == "" || user.Password == "" || !validUsername {
		// 400 Bad Request: required input is missing or the username violates
		// the format rule. The client must correct the submitted data.
		http.Error(w, "Invalid username or password", http.StatusBadRequest)
		return
	}

	//3. response
	success, err := service.AddUser(&user)
	if err != nil {
		// 500 Internal Server Error: the input was valid, but Elasticsearch
		// failed while checking for or saving the user.
		http.Error(w, "Failed to save user to Elasticsearch", http.StatusInternalServerError)
		return
	}
	if !success {
		// 400 Bad Request: the username is already registered, so the server
		// refuses to overwrite the existing NoSQL document.
		http.Error(w, "User already exists", http.StatusBadRequest)
		return
	}
	// 200 OK: the user was created successfully.
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "User added successfully: %s\n", user.Username)
}
