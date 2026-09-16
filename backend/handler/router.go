package handler

import (
	"net/http"
	"socialai/util"

	jwtmiddleware "github.com/auth0/go-jwt-middleware"
	jwt "github.com/form3tech-oss/jwt-go"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

var mySigningKey []byte

func InitRouter(config *util.TokenInfo) http.Handler {
	mySigningKey = []byte(config.Secret)
	jwtMiddleware := jwtmiddleware.New(jwtmiddleware.Options{
		ValidationKeyGetter: func(token *jwt.Token) (interface{}, error) {
			return signingKey(), nil
		},
		SigningMethod: jwt.SigningMethodHS256,
	})

	router := mux.NewRouter()
	router.Handle("/upload", jwtMiddleware.Handler(http.HandlerFunc(uploadHandler))).Methods("POST")
	router.Handle("/search", jwtMiddleware.Handler(http.HandlerFunc(searchHandler))).Methods("GET")
	router.Handle("/post/{id}", jwtMiddleware.Handler(http.HandlerFunc(deleteHandler))).Methods("DELETE")
	router.Handle("/auth/validate", jwtMiddleware.Handler(http.HandlerFunc(validateTokenHandler))).Methods("GET")
	router.Handle("/signup", http.HandlerFunc(signupHandler)).Methods("POST")
	router.Handle("/signin", http.HandlerFunc(signinHandler)).Methods("POST")
	originsOK := handlers.AllowedOrigins([]string{"*"})
	headersOK := handlers.AllowedHeaders([]string{"Authorization", "Content-Type"})
	methodsOK := handlers.AllowedMethods([]string{"GET", "POST", "DELETE"})
	return handlers.CORS(originsOK, headersOK, methodsOK)(router)
}
