package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// The app's window is Microsoft Edge (on every Windows 10/11 PC) in "app" mode: its own window and
// taskbar button, no address bar or tabs, and its own profile so it never touches your normal
// browser. Chrome is the fallback.
func findBrowser() string {
	var c []string
	if runtime.GOOS == "windows" {
		for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LocalAppData")} {
			if base == "" {
				continue
			}
			c = append(c, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
		for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData")} {
			if base == "" {
				continue
			}
			c = append(c, filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
		}
	} else {
		c = []string{"/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
	}
	for _, p := range c {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

// Opens the window. Returns the browser process (nil if it had to fall back to the default browser).
func openWindow(url, profileDir string) *exec.Cmd {
	b := findBrowser()
	if b == "" {
		logf("no Edge or Chrome found, using the default browser")
		_ = openURL(url)
		return nil
	}
	args := []string{
		"--app=" + url,
		"--user-data-dir=" + profileDir,
		"--window-size=1420,920",
		"--no-first-run", "--no-default-browser-check", "--disable-background-mode",
		"--disable-features=Translate,msEdgeTranslate", "--disable-sync",
	}
	if extra := os.Getenv("KODA_ADMIN_BROWSER_ARGS"); extra != "" { // testing only
		args = append(args, strings.Fields(extra)...)
	}
	cmd := exec.Command(b, args...)
	if err := cmd.Start(); err != nil {
		logf("couldn't start %s: %v", b, err)
		_ = openURL(url)
		return nil
	}
	return cmd
}
