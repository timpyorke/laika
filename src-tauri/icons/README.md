# Laika app icon — 2a Capsule

Master artwork: `laika.svg` (256 grid). `laika-small.svg` is the reduced
construction used at 32px and below: muzzle plate, antenna and collar removed,
helmet ring thickened so it survives one-pixel strokes.

## Files

| file | use |
| --- | --- |
| `laika.ico` | Windows executable + installer + favicon (16/24/32/48/64/128/256) |
| `laika.icns` | macOS .app bundle (16 → 1024, incl. @2x variants) |
| `laika-1024.png` … `laika-16.png` | Linux hicolor theme, web, stores |
| `laika.svg` | vector master — regenerate any size from this |

`tauri.conf.json > bundle.icon` points at
`["icons/laika-32.png","icons/laika-128.png","icons/laika-256.png","icons/laika.ico","icons/laika.icns"]`.
The web favicon is a copy of the master at `public/laika.svg`.

## Notes

- Artwork is square and full-bleed. macOS applies no mask of its own, so if you
  want the standard squircle inset for the Dock, add ~10% padding and a 22.4%
  corner radius before generating the `.icns`.
- Windows and Linux use the square artwork as-is.
- Colours: ground `#073349`, visor `#0B4A66`, ring/collar/antenna `#C36E36`,
  ears `#B95827`, head `#D9D6CA`, muzzle `#BFB784`, features `#0A120C`.
