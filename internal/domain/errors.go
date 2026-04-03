package domain

import (
	"errors"
	"fmt"
	"net/http"
)

const (
	ErrCodeDocumentNotFound  = "DOCUMENT_NOT_FOUND"
	ErrCodeInvalidAnchor     = "INVALID_ANCHOR"
	ErrCodeInvalidSuggestion = "INVALID_SUGGESTION"
	ErrCodeUnsupportedImport = "UNSUPPORTED_IMPORT_FORMAT"
	ErrCodeExportFailure     = "EXPORT_FAILED"
	ErrCodeStaleVersion      = "STALE_VERSION"
	ErrCodeInvalidRequest    = "INVALID_REQUEST"
	ErrCodeConflict          = "CONFLICT"
	ErrCodeInternal          = "INTERNAL"
)

type Error struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	StatusCode int    `json:"-"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func NewError(code, message string, status int) *Error {
	return &Error{Code: code, Message: message, StatusCode: status}
}

func Wrap(code string, status int, err error) *Error {
	if err == nil {
		return nil
	}
	return &Error{Code: code, Message: err.Error(), StatusCode: status}
}

func AsError(err error) *Error {
	if err == nil {
		return nil
	}
	var appErr *Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return NewError(ErrCodeInternal, err.Error(), http.StatusInternalServerError)
}
