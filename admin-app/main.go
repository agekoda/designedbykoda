// designedbykoda admin: the owner's desktop app.
//
// One .exe. It runs a small private server on this PC (127.0.0.1 only) and opens the screens in
// its own window. Orders, calendars and the status page are read from and changed on the live site
// through its owner-only API (the same password as /admin). Firmware releases run the scripts in
// the project folder (scripts/firmware-release.mjs), then commit and push, like firmware.bat.
//
// Build (from this folder):  GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui -s -w" -o designedbykoda-admin.exe
package main

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	appVersion  = "1.1.0"
	appName     = "designedbykoda-admin"
	defaultSite = "https://designedbykoda.com"
	defaultPort = 47615
	adminCookie = "admin_session"
)

//go:embed ui
var uiFiles embed.FS

// ---------------------------------------------------------------- settings kept on this PC

type Config struct {
	Site     string `json:"site"`
	Repo     string `json:"repo"`
	Token    string `json:"token"`    // the site's sign-in token (like a browser cookie), not the password
	TokenExp int64  `json:"tokenExp"` // unix seconds
}

var (
	cfg     Config
	cfgMu   sync.Mutex
	cfgDir  string
	logFile *os.File
)

func logf(format string, a ...any) {
	line := time.Now().Format("2006-01-02 15:04:05 ") + fmt.Sprintf(format, a...) + "\n"
	if logFile != nil {
		_, _ = logFile.WriteString(line)
	}
	fmt.Fprint(os.Stderr, line)
}

func loadConfig() {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	cfgDir = filepath.Join(base, appName)
	_ = os.MkdirAll(cfgDir, 0o700)
	logFile, _ = os.OpenFile(filepath.Join(cfgDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if b, err := os.ReadFile(filepath.Join(cfgDir, "config.json")); err == nil {
		_ = json.Unmarshal(b, &cfg)
	}
	if cfg.Site == "" {
		cfg.Site = defaultSite
	}
	if s := os.Getenv("KODA_ADMIN_SITE"); s != "" {
		cfg.Site = s
	}
	cfg.Site = strings.TrimRight(cfg.Site, "/")
}

func saveConfig() {
	b, _ := json.MarshalIndent(cfg, "", "  ")
	_ = os.WriteFile(filepath.Join(cfgDir, "config.json"), b, 0o600)
}

func signedIn() bool {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	return cfg.Token != "" && cfg.TokenExp > time.Now().Unix()+60
}

// ---------------------------------------------------------------- talking to the site

var httpc = &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func siteRequest(method, path string, body []byte) (*http.Response, error) {
	cfgMu.Lock()
	site, token := cfg.Site, cfg.Token
	cfgMu.Unlock()
	req, err := http.NewRequest(method, site+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Cookie", adminCookie+"="+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Origin", site)
	req.Header.Set("User-Agent", appName+"/"+appVersion)
	return httpc.Do(req)
}

// ---------------------------------------------------------------- the private server

type server struct {
	token    string // every /api call from the window must carry this
	host     string // 127.0.0.1:port
	lastBeat time.Time
	byeAt    time.Time
	beatMu   sync.Mutex
	exports  map[string]bool
	expMu    sync.Mutex
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"ok": false, "error": msg})
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
}

// Site paths the window may reach through this app. Nothing else is passed on.
var sitePaths = map[string]string{
	"/api/admin/app/data":     "GET",
	"/api/admin/app/device":   "GET POST",
	"/api/admin/app/incident": "POST",
	"/api/admin/app/email":    "POST",
	"/api/admin/app/stats":    "POST",
	"/api/admin/orders":       "POST",
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	ui, _ := fs.Sub(uiFiles, "ui")

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		b, err := fs.ReadFile(ui, p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Scripts only ever come from the app itself: nothing typed into an order can run as code.
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		switch filepath.Ext(p) {
		case ".html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			b = bytes.Replace(b, []byte("{{TOKEN}}"), []byte(s.token), 1)
		case ".js":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".woff":
			w.Header().Set("Content-Type", "font/woff")
		case ".ico":
			w.Header().Set("Content-Type", "image/x-icon")
		case ".svg":
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		_, _ = w.Write(b)
	})

	// no token: lets a second launch find the one already running
	mux.HandleFunc("/api/hello", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(appName)) })

	api := func(path string, h http.HandlerFunc) {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-App-Token") != s.token && r.URL.Query().Get("k") != s.token {
				fail(w, 403, "Not allowed.")
				return
			}
			h(w, r)
		})
	}

	api("/api/alive", func(w http.ResponseWriter, r *http.Request) {
		s.beatMu.Lock()
		s.lastBeat, s.byeAt = time.Now(), time.Time{}
		s.beatMu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true})
	})
	api("/api/bye", func(w http.ResponseWriter, r *http.Request) {
		s.beatMu.Lock()
		s.byeAt = time.Now()
		s.beatMu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	api("/api/state", func(w http.ResponseWriter, r *http.Request) {
		cfgMu.Lock()
		site, exp := cfg.Site, cfg.TokenExp
		cfgMu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true, "version": appVersion, "site": site, "signedIn": signedIn(), "signedInUntil": exp, "repo": repoInfo(false)})
	})

	api("/api/login", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Password string }
		if readJSON(r, &in) != nil || in.Password == "" {
			fail(w, 400, "Type the owner password.")
			return
		}
		body, _ := json.Marshal(map[string]string{"password": in.Password})
		res, err := siteRequest("POST", "/api/admin/app/login", body)
		if err != nil {
			fail(w, 502, "Couldn't reach the site. Check your internet connection.")
			return
		}
		defer res.Body.Close()
		var out struct {
			OK      bool
			Token   string
			Expires int64
			Error   string
		}
		_ = json.NewDecoder(res.Body).Decode(&out)
		switch {
		case res.StatusCode == 404 || res.StatusCode == 405:
			fail(w, 502, "The site doesn't have the app's endpoints yet. Merge the pull request and wait for the deploy, then try again.")
		case !out.OK || out.Token == "":
			if out.Error == "" {
				out.Error = fmt.Sprintf("The site answered %d.", res.StatusCode)
			}
			fail(w, 401, out.Error)
		default:
			cfgMu.Lock()
			cfg.Token, cfg.TokenExp = out.Token, out.Expires
			saveConfig()
			cfgMu.Unlock()
			writeJSON(w, 200, map[string]any{"ok": true})
		}
	})
	api("/api/logout", func(w http.ResponseWriter, r *http.Request) {
		cfgMu.Lock()
		cfg.Token, cfg.TokenExp = "", 0
		saveConfig()
		cfgMu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	api("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Site *string
			Repo *string
		}
		if readJSON(r, &in) != nil {
			fail(w, 400, "Bad request.")
			return
		}
		cfgMu.Lock()
		if in.Site != nil {
			v := strings.TrimRight(strings.TrimSpace(*in.Site), "/")
			if v == "" {
				v = defaultSite
			}
			if u, err := url.Parse(v); err != nil || (u.Scheme != "https" && !strings.HasPrefix(u.Host, "127.0.0.1") && !strings.HasPrefix(u.Host, "localhost")) {
				cfgMu.Unlock()
				fail(w, 400, "The site address should start with https://")
				return
			}
			if v != cfg.Site {
				cfg.Site, cfg.Token, cfg.TokenExp = v, "", 0
			}
		}
		if in.Repo != nil {
			v := strings.Trim(strings.TrimSpace(*in.Repo), `"`)
			if v != "" && !isRepo(v) {
				cfgMu.Unlock()
				fail(w, 400, "That folder doesn't look like the designedbykoda project (no scripts/firmware-release.mjs in it).")
				return
			}
			cfg.Repo = v
		}
		saveConfig()
		cfgMu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	// pass a request on to the site's owner API
	api("/api/site", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		u, err := url.Parse(p)
		if err != nil || !strings.Contains(sitePaths[u.Path], r.Method) {
			fail(w, 400, "Not allowed.")
			return
		}
		if !signedIn() {
			fail(w, 401, "Sign in first.")
			return
		}
		var body []byte
		if r.Method == "POST" {
			body, _ = io.ReadAll(io.LimitReader(r.Body, 4<<20))
		}
		res, err := siteRequest(r.Method, p, body)
		if err != nil {
			fail(w, 502, "Couldn't reach the site. Check your internet connection.")
			return
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(res.Body, 64<<20))
		code := res.StatusCode
		if code == 403 {
			code = 401 // the site's way of saying the sign-in ran out
		}
		if code == 401 {
			cfgMu.Lock()
			cfg.Token, cfg.TokenExp = "", 0
			saveConfig()
			cfgMu.Unlock()
		}
		if !json.Valid(b) {
			if code < 400 {
				code = 502
			}
			fail(w, code, fmt.Sprintf("The site answered %d. If you only just merged, wait for the deploy to finish.", res.StatusCode))
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(code)
		_, _ = w.Write(b)
	})

	// save a CSV from the site into Downloads
	api("/api/export", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Kind string
			IDs  []string
		}
		if readJSON(r, &in) != nil {
			fail(w, 400, "Bad request.")
			return
		}
		path, name := "/api/admin/orders", "orders"
		if in.Kind == "auspost" {
			path, name = "/api/admin/auspost", "auspost"
			if len(in.IDs) > 0 {
				path += "?ids=" + url.QueryEscape(strings.Join(in.IDs, ","))
			}
		}
		res, err := siteRequest("GET", path, nil)
		if err != nil {
			fail(w, 502, "Couldn't reach the site.")
			return
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(res.Body, 64<<20))
		if res.StatusCode != 200 {
			msg := strings.TrimSpace(string(b))
			if res.StatusCode == 404 || len(msg) > 300 || msg == "" {
				msg = fmt.Sprintf("The site answered %d.", res.StatusCode)
			}
			fail(w, 400, msg)
			return
		}
		home, _ := os.UserHomeDir()
		dir := filepath.Join(home, "Downloads")
		if st, err := os.Stat(dir); err != nil || !st.IsDir() {
			dir = home
		}
		base := name + "-" + time.Now().Format("2006-01-02")
		out := filepath.Join(dir, base+".csv")
		for i := 2; ; i++ {
			if _, err := os.Stat(out); err != nil {
				break
			}
			out = filepath.Join(dir, fmt.Sprintf("%s-%d.csv", base, i))
		}
		if err := os.WriteFile(out, b, 0o644); err != nil {
			fail(w, 500, "Couldn't save the file: "+err.Error())
			return
		}
		s.expMu.Lock()
		s.exports[out] = true
		s.expMu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true, "path": out, "rows": max(0, bytes.Count(bytes.TrimSpace(b), []byte("\n")))})
	})
	api("/api/reveal", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Path string }
		_ = readJSON(r, &in)
		s.expMu.Lock()
		ok := s.exports[in.Path]
		s.expMu.Unlock()
		if !ok {
			fail(w, 400, "Not allowed.")
			return
		}
		_ = revealFile(in.Path)
		writeJSON(w, 200, map[string]any{"ok": true})
	})
	api("/api/open", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ URL string }
		_ = readJSON(r, &in)
		u, err := url.Parse(in.URL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http" && u.Scheme != "mailto") {
			fail(w, 400, "Not a web link.")
			return
		}
		_ = openURL(u.String())
		writeJSON(w, 200, map[string]any{"ok": true})
	})

	// how fast the site answers from this PC, right now
	api("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		cfgMu.Lock()
		site := cfg.Site
		cfgMu.Unlock()
		targets := [][2]string{{"Home page", "/"}, {"Pre-order page", "/preorder/eink-calendar"}, {"Dashboard", "/dashboard"}, {"Order tracking", "/track"}, {"Status page", "/status"}, {"Status feed", "/api/status.json"}}
		type hit struct {
			Name string `json:"name"`
			Path string `json:"path"`
			OK   bool   `json:"ok"`
			Code int    `json:"code"`
			Ms   int64  `json:"ms"`
		}
		out := make([]hit, len(targets))
		var wg sync.WaitGroup
		c := &http.Client{Timeout: 12 * time.Second}
		for i, t := range targets {
			wg.Add(1)
			go func(i int, name, path string) {
				defer wg.Done()
				t0 := time.Now()
				res, err := c.Get(site + path)
				h := hit{Name: name, Path: path, Ms: time.Since(t0).Milliseconds()}
				if err == nil {
					_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
					res.Body.Close()
					h.Code, h.OK = res.StatusCode, res.StatusCode < 400
				}
				out[i] = h
			}(i, t[0], t[1])
		}
		wg.Wait()
		writeJSON(w, 200, map[string]any{"ok": true, "hits": out})
	})

	firmwareRoutes(api)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// only this PC's own window: refuses other sites pointing a name at 127.0.0.1
		if r.Host != s.host && r.Host != strings.Replace(s.host, "127.0.0.1", "localhost", 1) {
			http.Error(w, "forbidden", 403)
			return
		}
		if o := r.Header.Get("Origin"); o != "" && o != "http://"+r.Host {
			http.Error(w, "forbidden", 403)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func main() {
	port := flag.Int("port", defaultPort, "port on 127.0.0.1")
	noWindow := flag.Bool("no-window", false, "run the server without opening a window (for testing)")
	flag.Parse()
	loadConfig()
	defer func() {
		if e := recover(); e != nil {
			logf("crashed: %v", e)
			fatalBox(fmt.Sprintf("Something went wrong:\n%v\n\nDetails are in %s", e, filepath.Join(cfgDir, "app.log")))
		}
	}()

	profile := filepath.Join(cfgDir, "window")
	if d, err := os.UserCacheDir(); err == nil {
		profile = filepath.Join(d, appName, "window")
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		// Already running? Then just bring up another window on it.
		c := &http.Client{Timeout: 2 * time.Second}
		if res, e := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/hello", *port)); e == nil {
			b, _ := io.ReadAll(res.Body)
			res.Body.Close()
			if string(b) == appName {
				if !*noWindow {
					openWindow(fmt.Sprintf("http://127.0.0.1:%d/", *port), profile)
				}
				return
			}
		}
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fatalBox("Couldn't start: " + err.Error())
			return
		}
	}
	tok := make([]byte, 24)
	_, _ = rand.Read(tok)
	s := &server{token: hex.EncodeToString(tok), host: ln.Addr().String(), lastBeat: time.Now(), exports: map[string]bool{}}
	if t := os.Getenv("KODA_ADMIN_TOKEN"); t != "" {
		s.token = t // testing only
	}
	go func() {
		if err := http.Serve(ln, s.routes()); err != nil {
			logf("server stopped: %v", err)
		}
	}()
	appURL := "http://" + s.host + "/"
	logf("%s %s on %s, site %s", appName, appVersion, appURL, cfg.Site)
	if *noWindow {
		select {}
	}

	started := time.Now()
	win := openWindow(appURL, profile)
	closed := make(chan struct{})
	if win != nil {
		go func() {
			_ = win.Wait()
			// A browser that hands the window to an already-running copy of itself exits at once:
			// that isn't the window closing, so fall back to the window's own heartbeat.
			if time.Since(started) > 6*time.Second {
				close(closed)
			}
		}()
	}
	tick := time.NewTicker(2 * time.Second)
	for {
		select {
		case <-closed:
			for jobRunning() { // never quit halfway through a firmware release
				time.Sleep(time.Second)
			}
			return
		case <-tick.C:
			s.beatMu.Lock()
			last, bye := s.lastBeat, s.byeAt
			s.beatMu.Unlock()
			// the window said goodbye and didn't come back (a reload comes back within seconds),
			// or it has been silent for a long time (a hidden window still checks in every minute)
			if (!bye.IsZero() && time.Since(bye) > 6*time.Second) || time.Since(last) > 4*time.Minute {
				if jobRunning() {
					continue // never quit halfway through a firmware release
				}
				return
			}
		}
	}
}
