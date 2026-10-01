# companion-module-gelato

A [Bitfocus Companion](https://bitfocus.io/companion) module for [Gelato](https://github.com/alfo/Gelato), the Mac app that puts gel colours onto Eos consoles. It talks to Gelato's Remote Control OSC server, so a Stream Deck can type gel codes, confirm or cancel what is pending, lock the show, and show what Gelato is doing.

This module is private and not in Companion's module list. Install it as a developer module.

## Install as a developer module

You need Companion 4.x (module API 2) and Node 22 with Corepack, which ships with Node.

1. Pick a folder for developer modules, such as `~/companion-modules`, and clone this repo into it:

   ```bash
   git clone https://github.com/alfo/companion-module-gelato.git ~/companion-modules/companion-module-gelato
   ```

2. Build it:

   ```bash
   cd ~/companion-modules/companion-module-gelato
   corepack enable
   yarn install
   yarn build
   ```

3. In Companion's launcher, set **Developer modules path** to `~/companion-modules` (the folder that holds the clone, not the clone itself) and restart Companion.
4. In Companion, open **Connections**, add a connection, and choose **Gelato**.

After a change, run `yarn build` again and restart the connection. `yarn dev` rebuilds on every save.

## Set up Gelato's Remote Control pane

In Gelato, open **Settings ▸ Remote Control**.

1. Turn the listener **on**. Note the **port** (8100 by default) and pick the network interface Companion can reach.
2. If you use the allowed-senders list, add the IP of the computer Companion runs on. Commands from any other address are refused.
3. Leave **Remote commands skip confirmation** off unless you want a Stream Deck button to write without Confirm. With it off, Add and Build wait for the Confirm button.
4. The pane lists every recent command with the sender's IP, which is the quickest way to see that a button reached Gelato.

Then in Companion, set the connection's:

| Setting     | Value                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Gelato host | The Mac's address, such as `192.168.1.20`                                                               |
| Port        | The port from Gelato                                                                                    |
| Protocol    | **TCP** (recommended). Gelato sends feedback back on the same connection, so nothing else needs setting |

### UDP instead

Choose UDP only when TCP is blocked. Gelato sends UDP feedback to a host and port you give it, so also:

1. In Companion, set **Feedback port** (default 8101). The module listens on it.
2. In Gelato's Remote Control pane, set the feedback host to the computer Companion runs on, and the feedback port to the same number.

### Connection status

The module pings Gelato (`/gelato/ping`) every few seconds. It shows **OK** once Gelato answers. **No reply to /gelato/ping** means the socket is up but Gelato is silent: Remote Control is off, the sender is not on the allow-list, or (UDP) the feedback host and port are wrong. While the module has no connection every variable reads empty and every feedback is off, so a button never shows the last thing Gelato said.

### The lock

While Gelato's show-mode lock is on, it accepts only **Lock off** and **Ping**. The Lock button toggles, and lights red while the lock is on.

## What is in the module

**Actions**: one for every `/gelato/...` command: add a colour (by code, or by brand and number), entry key, clear, enter, confirm, cancel, lock (on, off, toggle), apply a template, re-run the build, build new types, ping, and preview option, next, previous, choose and release.

**Feedbacks** (boolean): status is awaiting confirm, writing or error; lock on; console connected; readback waiting; edited palettes (any, or a slot); new types in the rig.

**Variables**: every value Gelato reports, including each slot of the edited-palettes and new-types lists (eight each; slots past the count are empty). Examples: `entry`, `status_text`, `pending_gel`, `pending_kind_text`, `last_result_text`, `locked`, `eos_connected`, `edited_count`, `edited_1_palette`, `edited_1_how_text`, `build_new_count`. The full list is on the connection's **Variables** page.

**Presets**: _Gels_ (gel keypad `L R G A 0–9 .` with Clear and Enter; Confirm and Cancel showing what is pending; status, progress and last result), _Show_ (Lock, console, readback, edited palettes 1–8, Build new, Re-run build), _Preview_ (previous, next, choose, release). Button text is display words and variables, never sentences.

Palette numbers are strings, so `0.10` survives. Nothing is `""` or `0`.

## Development

```bash
yarn install
yarn build     # type-check and compile to dist/
yarn lint      # eslint and prettier
yarn test      # build the tests, then run them with node:test
yarn format    # prettier -w
yarn package   # a tgz for Companion
```

Tests never talk to Gelato or a console. `src/__tests__/fake-gelato.ts` is a fake Gelato Remote Control server (UDP and TCP, SLIP-framed, answering `/gelato/ping` as Gelato does). The module's own tests connect to it, press actions and check variables and feedbacks:

| Spec                 | Covers                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `osc.spec.ts`        | OSC encode and decode, SLIP framing                                                                         |
| `state.spec.ts`      | Every feedback address into variables, including cleared list slots                                         |
| `commands.spec.ts`   | The OSC every action sends                                                                                  |
| `feedbacks.spec.ts`  | The boolean feedbacks                                                                                       |
| `presets.spec.ts`    | Presets only press real actions, ask real feedbacks, and name real variables                                |
| `connection.spec.ts` | TCP and UDP against the fake: connect, ping, no reply, reconnect                                            |
| `module.spec.ts`     | The whole module on a stand-in for Companion: connect, an action, feedback updating variables and feedbacks |

The OSC and SLIP codec is in `src/osc.ts`, so the module has no dependency beyond Companion's own template.

## Licence

MIT
