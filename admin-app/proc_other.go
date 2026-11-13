//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func hideWindow(cmd *exec.Cmd) {}

func openURL(u string) error { return exec.Command("xdg-open", u).Start() }

func revealFile(p string) error { return exec.Command("xdg-open", filepath.Dir(p)).Start() }

func fatalBox(msg string) { fmt.Fprintln(os.Stderr, msg) }
