package main

import (
	"fmt"
	"log"
	"os"

	"github.com/cyrusaf/agentpad/internal/cli"
)

func main() {
	fmt.Fprintln(os.Stderr, "agentpad-server is deprecated; use `agentpad serve` instead.")
	os.Args = append([]string{os.Args[0], "serve"}, os.Args[1:]...)
	if err := cli.NewRootCmd().Execute(); err != nil {
		log.Fatal(err)
	}
}
