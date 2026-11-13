package main

// Firmware releases. This does what firmware.bat's wizard does: run scripts/firmware-release.mjs in
// the project folder (it signs with the key on this PC), commit the release files, push, then wait
// until the live site is serving the change.

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const releaseScript = "scripts/firmware-release.mjs"
const releasesFile = "src/data/firmware-releases.json"

func isRepo(dir string) bool {
	st, err := os.Stat(filepath.Join(dir, filepath.FromSlash(releaseScript)))
	return err == nil && !st.IsDir()
}

// The project folder: the one in Settings, else wherever this program sits (or a folder above it),
// else the usual places a GitHub project lives.
func findRepo() string {
	cfgMu.Lock()
	saved := cfg.Repo
	cfgMu.Unlock()
	if saved != "" && isRepo(saved) {
		return saved
	}
	var tries []string
	if exe, err := os.Executable(); err == nil {
		d := filepath.Dir(exe)
		for i := 0; i < 4; i++ {
			tries = append(tries, d)
			d = filepath.Dir(d)
		}
	}
	if wd, err := os.Getwd(); err == nil {
		tries = append(tries, wd, filepath.Dir(wd))
	}
	if home, err := os.UserHomeDir(); err == nil {
		for _, sub := range []string{"", "Documents", "Documents/GitHub", "Desktop", "source/repos", "Projects", "dev", "code", "GitHub"} {
			tries = append(tries, filepath.Join(home, filepath.FromSlash(sub), "designedbykoda"))
		}
	}
	for _, d := range tries {
		if isRepo(d) {
			return d
		}
	}
	return ""
}

func runIn(dir string, timeout time.Duration, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0") // never wait on a hidden password prompt
	hideWindow(cmd)
	done := make(chan struct{})
	var out []byte
	var err error
	go func() { out, err = cmd.CombinedOutput(); close(done) }()
	select {
	case <-done:
	case <-time.After(timeout):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-done
		err = errors.New("timed out")
	}
	return strings.TrimSpace(string(out)), err
}

func signingKeyPath() string {
	if k := os.Getenv("FIRMWARE_KEY"); k != "" {
		return k
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".designedbykoda", "firmware-signing-key.pem")
}

type RepoInfo struct {
	Path       string `json:"path"`
	OK         bool   `json:"ok"`
	Git        bool   `json:"git"`
	Node       bool   `json:"node"`
	Key        bool   `json:"key"`
	Branch     string `json:"branch"`
	Dirty      string `json:"dirty"`      // uncommitted firmware changes
	LastCommit string `json:"lastCommit"` // subject of the newest commit
	LastAt     int64  `json:"lastAt"`
	Pulled     string `json:"pulled"` // problem from git pull, if any
}

var pullMu sync.Mutex

func repoInfo(pull bool) RepoInfo {
	r := RepoInfo{Path: findRepo()}
	_, e := os.Stat(signingKeyPath())
	r.Key = e == nil
	if _, err := runIn("", 8*time.Second, "node", "--version"); err == nil {
		r.Node = true
	}
	if r.Path == "" {
		return r
	}
	r.OK = true
	if _, err := runIn(r.Path, 8*time.Second, "git", "--version"); err != nil {
		return r
	}
	r.Git = true
	if pull {
		pullMu.Lock()
		if out, err := runIn(r.Path, 60*time.Second, "git", "pull", "--ff-only", "-q"); err != nil {
			r.Pulled = lastLine(out)
			logf("git pull: %v %s", err, out)
		}
		pullMu.Unlock()
	}
	r.Branch, _ = runIn(r.Path, 8*time.Second, "git", "rev-parse", "--abbrev-ref", "HEAD")
	r.Dirty, _ = runIn(r.Path, 8*time.Second, "git", "status", "--porcelain", "--", releasesFile, "public/fw")
	if out, err := runIn(r.Path, 8*time.Second, "git", "log", "-1", "--format=%ct|%s"); err == nil {
		if at, subj, ok := strings.Cut(out, "|"); ok {
			r.LastAt, _ = strconv.ParseInt(at, 10, 64)
			r.LastCommit = subj
		}
	}
	return r
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

// ---------------------------------------------------------------- versions

type Release struct {
	Version string `json:"version"`
	Size    int64  `json:"size"`
	Sha256  string `json:"sha256"`
	Sig     string `json:"sig"`
	Date    string `json:"date"`
	Notes   string `json:"notes,omitempty"`
}
type ChannelState struct {
	Version *string `json:"version"`
	Auto    bool    `json:"auto"`
}
type Releases struct {
	Channels map[string]ChannelState `json:"channels"`
	Releases []Release               `json:"releases"`
}

func loadReleases(repo string) (*Releases, error) {
	b, err := os.ReadFile(filepath.Join(repo, filepath.FromSlash(releasesFile)))
	if err != nil {
		return nil, err
	}
	var d Releases
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

var verRe = regexp.MustCompile(`^\d{1,3}\.\d{1,3}\.\d{1,3}$`)

func verParts(v string) [3]int {
	var p [3]int
	for i, s := range strings.SplitN(v, ".", 3) {
		p[i], _ = strconv.Atoi(s)
	}
	return p
}
func cmpVer(a, b string) int {
	x, y := verParts(a), verParts(b)
	for i := 0; i < 3; i++ {
		if x[i] != y[i] {
			return x[i] - y[i]
		}
	}
	return 0
}
func (d *Releases) latest() string {
	best := ""
	for _, r := range d.Releases {
		if best == "" || cmpVer(r.Version, best) > 0 {
			best = r.Version
		}
	}
	return best
}
func (d *Releases) has(v string) bool {
	for _, r := range d.Releases {
		if r.Version == v {
			return true
		}
	}
	return false
}
func (d *Releases) on(ch string) string {
	if c, ok := d.Channels[ch]; ok && c.Version != nil {
		return *c.Version
	}
	return ""
}

// ---------------------------------------------------------------- the compiled file

type BinInfo struct {
	Path     string `json:"path"`
	Exists   bool   `json:"exists"`
	Size     int64  `json:"size"`
	Modified int64  `json:"modified"`
	IsImage  bool   `json:"isImage"`  // starts like an ESP32 app
	Marker   bool   `json:"marker"`   // can update itself again
	Detected string `json:"detected"` // the version written inside, if it's clear
	Suggest  string `json:"suggest"`
}

var binVerRe = regexp.MustCompile(`\x00(\d{1,3}\.\d{1,3}\.\d{1,3})\x00`)

func inspectBin(path string, d *Releases) BinInfo {
	bi := BinInfo{Path: path}
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return bi
	}
	bi.Exists, bi.Size, bi.Modified = true, st.Size(), st.ModTime().Unix()
	if st.Size() > 8<<20 {
		return bi
	}
	b, err := os.ReadFile(path)
	if err != nil || len(b) == 0 {
		return bi
	}
	bi.IsImage = b[0] == 0xE9
	bi.Marker = strings.Contains(string(b), "DBK-EINK-OTA-1")
	latest := "1.0.0"
	if d != nil && d.latest() != "" {
		latest = d.latest()
	}
	// The file also holds other version numbers (the ESP32 core's, like 3.3.11), so only a number
	// just after the latest release counts.
	lp := verParts(latest)
	seen := map[string]bool{}
	var found []string
	for _, m := range binVerRe.FindAllSubmatch(b, -1) {
		v := string(m[1])
		p := verParts(v)
		if !seen[v] && cmpVer(v, latest) > 0 && p[0] == lp[0] && p[1] <= lp[1]+1 {
			seen[v] = true
			found = append(found, v)
		}
	}
	if len(found) == 1 {
		bi.Detected = found[0]
		bi.Suggest = found[0]
	} else {
		bi.Suggest = fmt.Sprintf("%d.%d.%d", lp[0], lp[1], lp[2]+1)
	}
	return bi
}

func wizardPrefsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".designedbykoda", "wizard.json")
}

// Where Arduino last exported to: what firmware.bat remembered, else the usual place.
func lastExportPath() string {
	var p struct{ Bin string }
	if b, err := os.ReadFile(wizardPrefsPath()); err == nil {
		_ = json.Unmarshal(b, &p)
	}
	if p.Bin != "" {
		return p.Bin
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Downloads", "main_partial", "build", "esp32.esp32.esp32c3", "main_partial.ino.bin")
}

func rememberExport(path string) {
	m := map[string]any{}
	if b, err := os.ReadFile(wizardPrefsPath()); err == nil {
		_ = json.Unmarshal(b, &m)
	}
	m["bin"] = path
	_ = os.MkdirAll(filepath.Dir(wizardPrefsPath()), 0o755)
	if b, err := json.MarshalIndent(m, "", "  "); err == nil {
		_ = os.WriteFile(wizardPrefsPath(), b, 0o644)
	}
}

// ---------------------------------------------------------------- jobs

type Step struct {
	Name  string `json:"name"`
	State string `json:"state"` // wait, run, ok, fail, skip
	Note  string `json:"note,omitempty"`
}
type Job struct {
	mu      sync.Mutex
	ID      int      `json:"id"`
	Title   string   `json:"title"`
	Steps   []Step   `json:"steps"`
	Log     []string `json:"log"`
	Done    bool     `json:"done"`
	OK      bool     `json:"ok"`
	Message string   `json:"message"`
}

var (
	jobMu  sync.Mutex
	curJob *Job
	jobSeq int
)

func jobRunning() bool {
	jobMu.Lock()
	defer jobMu.Unlock()
	return curJob != nil && !curJob.isDone()
}
func (j *Job) isDone() bool { j.mu.Lock(); defer j.mu.Unlock(); return j.Done }
func (j *Job) logLine(s string) {
	j.mu.Lock()
	j.Log = append(j.Log, s)
	j.mu.Unlock()
	logf("job: %s", s)
}
func (j *Job) set(i int, state, note string) {
	j.mu.Lock()
	j.Steps[i].State = state
	if note != "" {
		j.Steps[i].Note = note
	}
	j.mu.Unlock()
}
func (j *Job) finish(ok bool, msg string) {
	j.mu.Lock()
	for i := range j.Steps {
		if j.Steps[i].State == "wait" || j.Steps[i].State == "run" {
			if ok {
				j.Steps[i].State = "skip"
			} else if j.Steps[i].State == "run" {
				j.Steps[i].State = "fail"
			}
		}
	}
	j.Done, j.OK, j.Message = true, ok, msg
	j.mu.Unlock()
}
func (j *Job) snapshot() map[string]any {
	j.mu.Lock()
	defer j.mu.Unlock()
	return map[string]any{"ok": true, "id": j.ID, "title": j.Title, "steps": append([]Step{}, j.Steps...), "log": append([]string{}, j.Log...), "done": j.Done, "success": j.OK, "message": j.Message}
}

// Runs a program in the project folder, copying what it prints into the job's log.
func (j *Job) run(repo, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = repo
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0") // never wait on a hidden password prompt
	hideWindow(cmd)
	pr, pw := io.Pipe()
	cmd.Stdout, cmd.Stderr = pw, pw
	if err := cmd.Start(); err != nil {
		return err
	}
	stuck := time.AfterFunc(4*time.Minute, func() {
		j.logLine("That took too long, so it was stopped.")
		_ = cmd.Process.Kill()
	})
	defer stuck.Stop()
	done := make(chan struct{})
	go func() {
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 64*1024), 1<<20)
		for sc.Scan() {
			if t := strings.TrimRight(sc.Text(), " \r"); strings.TrimSpace(t) != "" {
				j.logLine(t)
			}
		}
		close(done)
	}()
	err := cmd.Wait()
	_ = pw.Close()
	<-done
	return err
}

func (j *Job) release(repo string, args ...string) error {
	return j.run(repo, "node", append([]string{filepath.FromSlash(releaseScript)}, args...)...)
}

// Commit the release files and push.
func (j *Job) publish(repo, message, version string) error {
	files := []string{releasesFile}
	if version != "" {
		if _, err := os.Stat(filepath.Join(repo, "public", "fw", version+".bin")); err == nil {
			files = append(files, "public/fw/"+version+".bin")
		}
	}
	if err := j.run(repo, "git", append([]string{"add", "--"}, files...)...); err != nil {
		return errors.New("Couldn't stage the files.")
	}
	if out, _ := runIn(repo, 10*time.Second, "git", "status", "--porcelain", "--", releasesFile, "public/fw"); out == "" {
		j.logLine("Nothing changed, so there is nothing to save.")
		return nil
	}
	if err := j.run(repo, "git", append([]string{"commit", "-q", "-m", message, "--"}, files...)...); err != nil {
		return errors.New("Couldn't commit. See the details below.")
	}
	j.logLine("Pushing to GitHub…")
	if err := j.run(repo, "git", "push", "-q"); err != nil {
		return errors.New(`The push failed, so nothing has reached the calendars. Fix the problem in the details, then run "git push" in the project folder.`)
	}
	return nil
}

// Wait until the live site serves what was just pushed (the Cloudflare deploy takes a minute or two).
func (j *Job) waitLive(want *Releases, newVersion string) bool {
	cfgMu.Lock()
	site := cfg.Site
	cfgMu.Unlock()
	wait := 10 * time.Minute
	if v, err := strconv.Atoi(os.Getenv("KODA_ADMIN_DEPLOY_WAIT")); err == nil && v > 0 {
		wait = time.Duration(v) * time.Second // testing only
	}
	deadline := time.Now().Add(wait)
	c := &http.Client{Timeout: 15 * time.Second}
	for time.Now().Before(deadline) {
		time.Sleep(8 * time.Second)
		fileOK := newVersion == ""
		if !fileOK {
			if res, err := c.Head(site + "/fw/" + newVersion + ".bin"); err == nil {
				res.Body.Close()
				fileOK = res.StatusCode == 200
			}
		}
		if !fileOK {
			continue
		}
		if !signedIn() {
			return true
		}
		res, err := siteRequest("GET", "/api/admin/app/data", nil)
		if err != nil {
			continue
		}
		var d struct{ Firmware Releases }
		err = json.NewDecoder(res.Body).Decode(&d)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 {
			continue
		}
		same := true
		for _, ch := range []string{"stable", "beta"} {
			if d.Firmware.on(ch) != want.on(ch) || d.Firmware.Channels[ch].Auto != want.Channels[ch].Auto {
				same = false
			}
		}
		if same {
			return true
		}
	}
	return false
}

type jobRequest struct {
	Kind     string // release | promote | move
	File     string
	Version  string
	Notes    string
	Everyone bool
	Manual   bool
	Channel  string // move: stable | beta
}

func who(ch string) string {
	if ch == "stable" {
		return "everyone"
	}
	return "beta"
}

func startJob(in jobRequest) (*Job, error) {
	jobMu.Lock()
	defer jobMu.Unlock()
	if curJob != nil && !curJob.isDone() {
		return nil, errors.New("Something is already running. Wait for it to finish.")
	}
	info := repoInfo(false)
	switch {
	case !info.OK:
		return nil, errors.New("Set the project folder in Settings first.")
	case !info.Git:
		return nil, errors.New("Git isn't installed, or isn't on this PC's PATH.")
	case !info.Node:
		return nil, errors.New("Node.js isn't installed, or isn't on this PC's PATH.")
	case info.Branch != "main":
		return nil, fmt.Errorf(`The project folder is on branch "%s". Releases only go live from main, so switch to main first.`, info.Branch)
	}
	repo := info.Path
	d, err := loadReleases(repo)
	if err != nil {
		return nil, errors.New("Couldn't read " + releasesFile + ".")
	}
	jobSeq++
	j := &Job{ID: jobSeq}
	step := func(name string) int {
		j.Steps = append(j.Steps, Step{Name: name, State: "wait"})
		return len(j.Steps) - 1
	}
	sPull := step("Get the latest from GitHub")
	var work func() (bool, string)

	switch in.Kind {
	case "release":
		v := strings.TrimSpace(in.Version)
		switch {
		case !verRe.MatchString(v):
			return nil, errors.New("The version should look like 1.0.4.")
		case d.has(v):
			return nil, fmt.Errorf("%s already exists. Versions can't be reused, so bump FW_VERSION.", v)
		case !info.Key:
			return nil, errors.New("The signing key isn't on this PC (" + signingKeyPath() + ").")
		}
		bi := inspectBin(in.File, d)
		if !bi.Exists {
			return nil, errors.New("That file doesn't exist.")
		}
		if !bi.IsImage {
			return nil, errors.New("That isn't an ESP32 app image. Use main_partial.ino.bin, not the merged or bootloader one.")
		}
		j.Title = "Release " + v
		sAdd := step("Check, sign and add " + v)
		sBeta := step("Send to beta")
		sAll := -1
		if in.Everyone {
			sAll = step("Send to everyone")
		}
		sPush := step("Save to GitHub")
		sLive := step("Wait for the site to deploy")
		extra := []string{}
		if in.Manual {
			extra = []string{"--manual"}
		}
		work = func() (bool, string) {
			j.set(sAdd, "run", "")
			if err := j.release(repo, "add", in.File, "--version", v, "--notes", strings.TrimSpace(in.Notes)); err != nil {
				return false, "Nothing was sent. " + j.stopReason()
			}
			j.set(sAdd, "ok", "")
			if !strings.HasPrefix(in.File, os.TempDir()) {
				rememberExport(in.File)
			}
			sent := true
			// "Everyone" also moves beta, so beta is never behind everyone.
			if now, e := loadReleases(repo); e == nil && cmpVer(v, orZero(now.on("beta"))) > 0 {
				j.set(sBeta, "run", "")
				if err := j.release(repo, append([]string{"send", v, "--channel", "beta"}, extra...)...); err != nil {
					j.set(sBeta, "fail", "")
					sent = false
				} else {
					j.set(sBeta, "ok", "")
				}
			} else {
				j.set(sBeta, "skip", "beta is already on a newer version")
			}
			if sent && sAll >= 0 {
				j.set(sAll, "run", "")
				if err := j.release(repo, append([]string{"send", v, "--channel", "stable"}, extra...)...); err != nil {
					j.set(sAll, "fail", "")
					sent = false
				} else {
					j.set(sAll, "ok", "")
				}
			}
			msg := fmt.Sprintf("Firmware %s to %s", v, map[bool]string{true: "everyone", false: "beta"}[in.Everyone])
			if !sent {
				msg = fmt.Sprintf("Firmware %s (added)", v)
			}
			j.set(sPush, "run", "")
			if err := j.publish(repo, msg, v); err != nil {
				return false, err.Error()
			}
			j.set(sPush, "ok", "")
			if !sent {
				return false, v + " was added but not sent: " + j.stopReason() + " Use Change version to send it."
			}
			j.set(sLive, "run", "usually a minute or two")
			want, _ := loadReleases(repo)
			if !j.waitLive(want, v) {
				j.set(sLive, "fail", "")
				return false, "It's pushed, but the site still isn't serving it after 10 minutes. Check the deploy in Cloudflare."
			}
			j.set(sLive, "ok", "")
			when := "on their next wake"
			if in.Manual {
				when = "when Update now is clicked"
			}
			return true, fmt.Sprintf("%s is live for %s. Calendars install it %s.", v, map[bool]string{true: "everyone", false: "beta calendars"}[in.Everyone], when)
		}

	case "promote":
		b, s := d.on("beta"), d.on("stable")
		if b == "" || (s != "" && cmpVer(b, s) <= 0) {
			return nil, errors.New("Beta isn't ahead of everyone, so there's nothing to send.")
		}
		j.Title = "Send " + b + " to everyone"
		sSend := step("Send " + b + " to everyone")
		sPush := step("Save to GitHub")
		sLive := step("Wait for the site to deploy")
		work = func() (bool, string) {
			j.set(sSend, "run", "")
			args := []string{"send", b, "--channel", "stable"}
			if in.Manual {
				args = append(args, "--manual")
			}
			if err := j.release(repo, args...); err != nil {
				return false, "Nothing was sent. " + j.stopReason()
			}
			j.set(sSend, "ok", "")
			j.set(sPush, "run", "")
			if err := j.publish(repo, fmt.Sprintf("Firmware %s to everyone", b), b); err != nil {
				return false, err.Error()
			}
			j.set(sPush, "ok", "")
			j.set(sLive, "run", "usually a minute or two")
			want, _ := loadReleases(repo)
			if !j.waitLive(want, "") {
				j.set(sLive, "fail", "")
				return false, "It's pushed, but the site hasn't picked it up after 10 minutes. Check the deploy in Cloudflare."
			}
			j.set(sLive, "ok", "")
			return true, b + " is live for everyone."
		}

	case "move":
		ch := in.Channel
		if ch != "stable" && ch != "beta" {
			return nil, errors.New("Pick everyone or beta.")
		}
		v := in.Version
		cur := d.on(ch)
		if !d.has(v) || v == cur {
			return nil, errors.New("Pick a different version that has already been added.")
		}
		back := cur != "" && cmpVer(v, cur) < 0
		dir := map[bool]string{true: "back", false: "forward"}[back]
		j.Title = fmt.Sprintf("Move %s %s to %s", who(ch), dir, v)
		sMove := step(fmt.Sprintf("Move %s %s to %s", who(ch), dir, v))
		sPush := step("Save to GitHub")
		sLive := step("Wait for the site to deploy")
		work = func() (bool, string) {
			j.set(sMove, "run", "")
			var err error
			if back {
				err = j.release(repo, "revert", v, "--channel", ch)
			} else {
				// forward: beta first, so everyone never runs something beta hasn't
				if bv := d.on("beta"); ch == "stable" && bv != "" && cmpVer(v, bv) > 0 {
					err = j.release(repo, "send", v, "--channel", "beta")
				}
				if err == nil {
					err = j.release(repo, "send", v, "--channel", ch)
				}
			}
			if err != nil {
				return false, "Nothing was changed. " + j.stopReason()
			}
			j.set(sMove, "ok", "")
			j.set(sPush, "run", "")
			if err := j.publish(repo, fmt.Sprintf("Move %s to %s", who(ch), v), v); err != nil {
				return false, err.Error()
			}
			j.set(sPush, "ok", "")
			j.set(sLive, "run", "usually a minute or two")
			want, _ := loadReleases(repo)
			if !j.waitLive(want, "") {
				j.set(sLive, "fail", "")
				return false, "It's pushed, but the site hasn't picked it up after 10 minutes. Check the deploy in Cloudflare."
			}
			j.set(sLive, "ok", "")
			return true, fmt.Sprintf("%s calendars move %s to %s on their next wake.", map[string]string{"stable": "Everyone's", "beta": "Beta"}[ch], dir, v)
		}
	default:
		return nil, errors.New("Unknown job.")
	}

	curJob = j
	go func() {
		defer func() {
			if e := recover(); e != nil {
				j.finish(false, fmt.Sprint("Something went wrong: ", e))
			}
		}()
		j.set(sPull, "run", "")
		pullMu.Lock()
		out, err := runIn(repo, 90*time.Second, "git", "pull", "--ff-only", "-q")
		pullMu.Unlock()
		if err != nil {
			j.logLine(out)
			j.set(sPull, "fail", "")
			j.finish(false, "Couldn't get the latest from GitHub, so nothing was done. "+lastLine(out))
			return
		}
		j.set(sPull, "ok", "")
		ok, msg := work()
		j.finish(ok, msg)
	}()
	return j, nil
}

func orZero(v string) string {
	if v == "" {
		return "0.0.0"
	}
	return v
}

// The release script explains itself with a line starting "Stopped:".
func (j *Job) stopReason() string {
	j.mu.Lock()
	defer j.mu.Unlock()
	for i := len(j.Log) - 1; i >= 0; i-- {
		if s, ok := strings.CutPrefix(strings.TrimSpace(j.Log[i]), "Stopped: "); ok {
			return strings.ToUpper(s[:1]) + s[1:]
		}
	}
	if len(j.Log) > 0 {
		return j.Log[len(j.Log)-1]
	}
	return "See the details."
}

func firmwareRoutes(api func(string, http.HandlerFunc)) {
	api("/api/fw/info", func(w http.ResponseWriter, r *http.Request) {
		info := repoInfo(r.URL.Query().Get("pull") == "1")
		out := map[string]any{"ok": true, "repo": info, "keyPath": signingKeyPath()}
		if info.OK {
			if d, err := loadReleases(info.Path); err == nil {
				out["releases"] = d
				out["lastExport"] = inspectBin(lastExportPath(), d)
			}
		}
		writeJSON(w, 200, out)
	})
	api("/api/fw/inspect", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Path string }
		_ = readJSON(r, &in)
		p := strings.Trim(strings.TrimSpace(in.Path), `"'`)
		var d *Releases
		if repo := findRepo(); repo != "" {
			d, _ = loadReleases(repo)
		}
		writeJSON(w, 200, map[string]any{"ok": true, "file": inspectBin(p, d)})
	})
	// a file dropped onto the window: keep a copy to release from
	api("/api/fw/upload", func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || len(b) == 0 {
			fail(w, 400, "That file is empty.")
			return
		}
		dir := filepath.Join(os.TempDir(), appName)
		_ = os.MkdirAll(dir, 0o700)
		p := filepath.Join(dir, fmt.Sprintf("dropped-%d.bin", time.Now().UnixNano()))
		if err := os.WriteFile(p, b, 0o600); err != nil {
			fail(w, 500, "Couldn't keep a copy of the file.")
			return
		}
		var d *Releases
		if repo := findRepo(); repo != "" {
			d, _ = loadReleases(repo)
		}
		bi := inspectBin(p, d)
		bi.Modified = 0
		writeJSON(w, 200, map[string]any{"ok": true, "file": bi})
	})
	api("/api/fw/job", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			var in jobRequest
			if readJSON(r, &in) != nil {
				fail(w, 400, "Bad request.")
				return
			}
			j, err := startJob(in)
			if err != nil {
				fail(w, 400, err.Error())
				return
			}
			writeJSON(w, 200, j.snapshot())
			return
		}
		jobMu.Lock()
		j := curJob
		jobMu.Unlock()
		if j == nil {
			writeJSON(w, 200, map[string]any{"ok": true, "id": 0})
			return
		}
		writeJSON(w, 200, j.snapshot())
	})
}
