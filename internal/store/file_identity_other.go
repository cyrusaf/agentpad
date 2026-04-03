//go:build !darwin && !linux

package store

import "os"

func fileIdentityFromInfo(info os.FileInfo) fileIdentity {
	return fileIdentity{}
}
