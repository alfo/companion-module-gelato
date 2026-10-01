## Gelato

Controls [Gelato](https://github.com/alfo/Gelato) from a Stream Deck or any Companion surface: type a gel code from keys, confirm or cancel what is pending, lock the show, see which palettes were edited on the console, build new types, and step through preview options.

### Setting up

1. In Gelato, open Settings, then **Remote Control**, and turn the listener on.
2. Note its **port** (8100 unless changed) and the Mac's address.
3. Here, set **Gelato host** to that address and **Port** to the port. Leave **Protocol** on TCP: feedback comes back on the same connection and nothing else needs setting.
4. If Gelato has an allowed-senders list, add the computer Companion runs on.

The connection status follows `/gelato/ping`: Ok once Gelato answers, a failure with **No reply to /gelato/ping** when it does not.

### UDP

UDP also works. Set **Feedback port** here, then in Gelato's Remote Control settings set the feedback host to the computer Companion runs on and the feedback port to the same number.

### Presets

Gels (the keypad, Confirm and Cancel), Show (lock, console, readback, edited palettes, build) and Preview. Buttons show display words and variables from Gelato, such as `$(gelato:pending_gel)` and `$(gelato:status_text)`.

### Confirmation and the lock

Gelato asks for a confirm before a remote command writes, unless **Remote commands skip confirmation** is on in its Settings. While the show-mode lock is on, only `Lock off` and `Ping` are accepted.
