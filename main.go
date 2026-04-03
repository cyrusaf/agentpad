package main

import (
	"log"

	"github.com/cyrusaf/agentpad/internal/cli"
)

func main() {
	if err := cli.NewRootCmd().Execute(); err != nil {
		log.Fatal(err)
	}
}
