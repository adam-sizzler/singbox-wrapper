//go:build windows

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"path"
	"strings"
	"time"
)

type uiAssetServer struct {
	server *http.Server
	url    string
	debug  func(string, ...any)
}

func startUIAssetServer(debugf func(string, ...any), apiHandler func(uiBridgeRequest) (any, error)) (*uiAssetServer, error) {
	assets, err := fs.Sub(uiAssets, "web/ui")
	if err != nil {
		return nil, fmt.Errorf("open embedded ui assets: %w", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen local ui server: %w", err)
	}

	assetServer := &uiAssetServer{
		url:   "http://" + listener.Addr().String() + "/",
		debug: debugf,
	}

	mux := http.NewServeMux()
	if apiHandler != nil {
		mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			var body json.RawMessage
			if r.Method == http.MethodPost {
				b, err := io.ReadAll(r.Body)
				if err != nil {
					w.WriteHeader(http.StatusBadRequest)
					_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
					return
				}
				body = b
			}

			res, err := apiHandler(uiBridgeRequest{
				Method: r.Method,
				Path:   r.URL.RequestURI(),
				Body:   body,
			})
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			_ = json.NewEncoder(w).Encode(res)
		})
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		cleanPath := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
		name := strings.TrimPrefix(cleanPath, "/")
		if name == "" || name == "." {
			name = "index.html"
		}

		data, err := fs.ReadFile(assets, name)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		} else if strings.HasSuffix(name, ".js") {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		} else if strings.HasSuffix(name, ".svg") {
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
	})

	assetServer.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		if debugf != nil {
			debugf("ui: local asset server listening at %s", assetServer.url)
		}
		if err := assetServer.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			if debugf != nil {
				debugf("ui: local asset server failed: %v", err)
			}
		}
	}()

	return assetServer, nil
}

func (s *uiAssetServer) URL() string {
	if s == nil {
		return ""
	}
	return s.url
}

func (s *uiAssetServer) stop() {
	if s == nil || s.server == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = s.server.Shutdown(ctx)
}
