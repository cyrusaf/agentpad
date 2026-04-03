//go:build darwin || linux

package store

import (
	"os"
	"syscall"
)

func fileIdentityFromInfo(info os.FileInfo) fileIdentity {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat == nil {
		return fileIdentity{}
	}
	return fileIdentity{
		Available: true,
		Device:    uint64(stat.Dev),
		Inode:     uint64(stat.Ino),
	}
}
