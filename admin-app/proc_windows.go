//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"unsafe"
)

// Helper programs (git, node) must not flash a console window.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

func openURL(u string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}

func revealFile(p string) error {
	return exec.Command("explorer", "/select,"+p).Start()
}

// The app has no console, so a fatal problem is shown in a message box.
func fatalBox(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	t, _ := syscall.UTF16PtrFromString("designedbykoda admin")
	m, _ := syscall.UTF16PtrFromString(msg)
	user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
}
