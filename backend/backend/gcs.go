package backend

import (
	"context"
	"fmt"
	"io"

	"socialai/util"

	"cloud.google.com/go/storage"
)

var GCSBackend *GoogleCloudStorageBackend

// GoogleCloudStorageBackend owns the reusable GCS client and bucket name.
type GoogleCloudStorageBackend struct {
	client *storage.Client
	bucket string
}

// InitGCSBackend uses Application Default Credentials from the GCE service account.
func InitGCSBackend(config *util.GCSInfo) {
	client, err := storage.NewClient(context.Background())
	if err != nil {
		panic(err)
	}

	GCSBackend = &GoogleCloudStorageBackend{
		client: client,
		bucket: config.Bucket,
	}
}

// SaveToGCS uploads the reader as a GCS object and returns its media link.
func (backend *GoogleCloudStorageBackend) SaveToGCS(r io.Reader, objectName string) (string, error) {
	// upload
	ctx := context.Background()
	object := backend.client.Bucket(backend.bucket).Object(objectName)
	wc := object.NewWriter(ctx)

	if _, err := io.Copy(wc, r); err != nil {
		_ = wc.Close()
		return "", err
	}
	if err := wc.Close(); err != nil {
		return "", err
	}

	// permission
	// ACL = Access Control List, i.e. "who may do what on THIS object".
	//
	// Set(scope, role) grants `role` to `scope`:
	//   storage.AllUsers  -> literally anyone on the internet (no Google account needed)
	//   storage.RoleReader -> read-only (download), they cannot overwrite or delete it
	//
	// Why we need it: objects are private by default. Without this line the browser
	// would get 403 on <img src="..."> / <video src="..."> because the request carries
	// no credential. This is what makes the public URL reachable anonymously.
	//
	// NOTE: this is an extra HTTP round trip (PATCH the object's ACL), and it is the
	// reason the object stays readable forever. For production, prefer a short-lived
	// pre-signed URL (object.SignedURL) and drop this line entirely.
	if err := object.ACL().Set(ctx, storage.AllUsers, storage.RoleReader); err != nil {
		// If this fails, the bytes are ALREADY in GCS but we return an error, so the
		// caller never learns the URL -> orphan object. Cleanup is left as an exercise.
		return "", err
	}

	// Fetch the object's metadata (size, generation, MediaLink, ...).
	// This is a SECOND network round trip: the Writer (wc) above only knows the bytes
	// it pushed, not the final attributes GCS assigned.
	// Tip: wc.Attrs() (available after wc.Close()) returns the same info for free,
	// which would save this request. Kept as-is to match the course handout.
	attrs, err := object.Attrs(ctx)
	if err != nil {
		return "", err
	}

	// Server-side log line only (ends up in Cloud Logging on App Engine).
	// The end user never sees this.
	fmt.Printf("File is saved to GCS: %s\n", attrs.MediaLink)

	// MediaLink looks like:
	//   https://storage.googleapis.com/download/storage/v1/b/<bucket>/o/<object>?generation=<n>&alt=media
	// The `generation=<n>` part pins this exact version of the object, so overwriting
	// the same object name later will NOT change what this URL returns.
	//
	// This string is what gets stored in Elasticsearch as Post.url, and what the
	// frontend uses as <img src> / <video src>.
	return attrs.MediaLink, nil
}
