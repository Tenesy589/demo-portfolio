// Package web embeds the dashboard into the binary — one file to deploy.
package web

import (
	"embed"
	"io/fs"
)

//go:embed static
var files embed.FS

func FS() fs.FS {
	sub, _ := fs.Sub(files, "static")
	return sub
}
