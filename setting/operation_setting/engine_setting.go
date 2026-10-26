package operation_setting

// EngineControlURL and EngineControlKey let the root dashboard read the
// subscription pool from corecode-engine's control API, for example
// http://gpt-load:3001 and the engine's AUTH_KEY. Empty disables the panel.
// corecode-infra's init-relay.sh writes both.
var (
	EngineControlURL = ""
	EngineControlKey = ""
)
