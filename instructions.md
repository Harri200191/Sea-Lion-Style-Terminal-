# Build, Package & Publish

Everything you need, in order. Run all commands from the project root:

```bash
cd c:/Users/Haris/coding/seal-lion-extension
```

---

## 1. One-time setup

```bash
npm install
```

That's it — the extension has no runtime dependencies, only build tools.

---

## 2. Build and test

```bash
npm run compile     # type-check + bundle to dist/extension.js
npm test            # 62 unit tests, no sound is produced
npm run lint        # eslint
```

While developing, leave this running in a terminal so every save rebuilds:

```bash
npm run watch
```

### Try it live

```bash
code .
```

Then press **F5**. A second window opens (the *Extension Development Host*) with the extension loaded.

- Look for `🦭 Sea Lions: ON` in the bottom-right status bar.
- Type in any file → typing bark.
- Run `echo hello` in its terminal → success bark.
- Run `node -e "process.exit(1)"` → failure growl.
- Logs: **View → Output**, pick **Sea Lion Sounds** from the dropdown.

After changing code, press **Ctrl+R** in that window to reload it.

---

## 3. Package a VSIX

```bash
npm run package
```

Produces `sea-lion-sounds-0.1.0.vsix`. This runs the type-check, lint and a production build first, so if it fails, fix that before shipping.

Check what went in:

```bash
npx vsce ls
```

`media/*.wav`, `dist/extension.js`, `images/icon.png`, README, CHANGELOG and LICENSE must be present. `node_modules`, `src/` and `.map` files must not.

---

## 4. Install it locally

```bash
code --install-extension sea-lion-sounds-0.1.0.vsix
```

Reload VS Code afterwards. To remove it:

```bash
code --uninstall-extension harisrehman.sea-lion-sounds
```

This is also how you share it with someone without publishing — just send them the `.vsix`.

---

## 5. Publish to the Marketplace

### First time only

1. **Create a publisher.** Go to <https://marketplace.visualstudio.com/manage>, sign in with a Microsoft account, and create a publisher. Its **ID** must exactly match the `"publisher"` field in `package.json` (currently `harisrehman`).

2. **Create a Personal Access Token.** Go to <https://dev.azure.com>, then *User settings → Personal access tokens → New Token*:
   - **Organization:** `All accessible organizations` ← easy to get wrong
   - **Scopes:** *Custom defined* → **Marketplace → Manage**
   - Copy the token now; it is shown only once.

3. **Log in:**

   ```bash
   npx vsce login harisrehman
   ```

   Paste the token when prompted.

### Every release

```bash
npm run package     # sanity-check the VSIX first
npx vsce publish
```

The extension appears on the Marketplace within a few minutes. Verification for a brand-new publisher can take longer.

---

## 6. Shipping a new version

Let `vsce` bump the version, tag it and publish in one step:

```bash
npx vsce publish patch    # 0.1.0 -> 0.1.1   bug fixes
npx vsce publish minor    # 0.1.0 -> 0.2.0   new features
npx vsce publish major    # 0.1.0 -> 1.0.0   breaking changes
```

Before you do, add a section to `CHANGELOG.md` — it is shown on the Marketplace listing.

To publish without touching git:

```bash
npx vsce publish --no-git-tag-version
```

---

## 7. Regenerating assets

```bash
npm run sounds      # re-synthesise media/*.wav
npm run icon        # re-render images/icon.png
```

To use real recordings instead, drop `typing.mp3`, `success.mp3` or `failure.mp3` into `media/` — `.mp3` takes priority over the bundled `.wav`, so nothing else needs changing. Only ship audio you have the right to redistribute.

---

## 8. Troubleshooting

| Problem | Fix |
| --- | --- |
| `vsce` fails: publisher not found | The `"publisher"` in `package.json` must match a real publisher ID you own. |
| `vsce` fails: 401 / unauthorized | PAT expired, or it was not created with **All accessible organizations** + **Marketplace → Manage**. Make a new one and `vsce login` again. |
| `vsce` warns about `repository` | Update the GitHub URL in `package.json` or delete the field. |
| F5 opens nothing | Check the **Terminal** panel for a failed `npm: watch` task. |
| No sound, no `🦭` in status bar | Extension did not activate — check **Output → Extension Host** for errors. |
| No sound, but `🦭` is showing | Run `Sea Lion Sounds: Show Output Log` and look for `ERROR` lines. Raise `seaLionSounds.masterVolume`. |
| Typing sound feels sluggish | Lower `seaLionSounds.typing.cooldownMs` (default `60`, minimum useful ~`30`). |

---

## Quick reference

```bash
npm install                    # setup
npm run watch                  # develop (then press F5)
npm test                       # verify
npm run package                # build the .vsix
code --install-extension sea-lion-sounds-0.1.0.vsix
npx vsce login harisrehman     # once
npx vsce publish               # ship it
```
