import { useId, useState } from 'react'
import { t } from '../i18n/messages'
import { Dialog, DialogActions } from './Dialog'
import { Icon } from './Icon'
import { Button } from './ui'

/**
 * Soft colors that fit the light blue design and stay readable as small dots (includes the colors of the
 * default categories). A fixed palette keeps the category colors of a space looking like one set.
 */
export const PALETTE = [
  '#e57373', '#f06292', '#ba68c8', '#9575cd',
  '#7986cb', '#64b5f6', '#90caf9', '#4dd0e1',
  '#4db6ac', '#4caf50', '#aed581', '#fff176',
  '#ffb74d', '#d4a056', '#a1887f', '#78909c',
]

const HEX = /^#[0-9a-f]{6}$/

/**
 * A round swatch showing the current color; tapping it opens the color dialog. A color that is not in the
 * palette (e.g. set via the API) is shown as an extra first choice, so it is never lost by accident.
 */
export function ColorPicker({ value, label, onChange, size = 'size-9' }: { value: string; label: string; onChange: (color: string) => void; size?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`${size} shrink-0 rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--app-line)]`}
        style={{ backgroundColor: value }}
      />
      {open && (
        <ColorDialog
          initial={value.toLowerCase()}
          label={label}
          onSave={(color) => {
            onChange(color)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/**
 * Three ways to pick, all editing one draft color: a palette tap, the hue slider (soft colors like the
 * palette) or a hex code typed in. "Save" applies the draft.
 */
function ColorDialog({ initial, label, onSave, onClose }: { initial: string; label: string; onSave: (color: string) => void; onClose: () => void }) {
  const [color, setColor] = useState(initial)
  // The hex field keeps what the user types, even while it is incomplete ("#4d").
  const [hexText, setHexText] = useState(initial)
  const hexId = useId()
  const colors = PALETTE.includes(initial) ? PALETTE : [initial, ...PALETTE]
  const valid = HEX.test(color)

  function choose(next: string) {
    setColor(next)
    setHexText(next)
  }

  function typeHex(text: string) {
    setHexText(text)
    const normalized = (text.startsWith('#') ? text : `#${text}`).trim().toLowerCase()
    if (HEX.test(normalized)) setColor(normalized)
  }

  return (
    <Dialog title={t('color.title')} onClose={onClose} onSubmit={() => valid && onSave(color)}>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 justify-items-center gap-3">
        {colors.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={swatch === color}
            aria-label={swatch}
            onClick={() => choose(swatch)}
            className="flex size-13 items-center justify-center rounded-full text-xl text-white shadow-sm aria-checked:ring-3 aria-checked:ring-accent aria-checked:ring-offset-2"
            style={{ backgroundColor: swatch }}
          >
            {swatch === color && <Icon name="check" className="drop-shadow" />}
          </button>
        ))}
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <span className="block text-sm text-muted">{t('color.custom')}</span>
        {/* The track shows all hues; its thumb is styled in index.css (.hue-slider). */}
        <input
          type="range"
          min={0}
          max={359}
          aria-label={t('color.hue')}
          value={hueOf(color)}
          onChange={(e) => choose(softColor(Number(e.target.value)))}
          className="hue-slider block w-full"
        />
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="size-12 shrink-0 rounded-full shadow-[0_0_0_1px_var(--app-line)]" style={{ backgroundColor: valid ? color : 'transparent' }} />
          <label htmlFor={hexId} className="sr-only">
            {t('color.hex')}
          </label>
          <input
            id={hexId}
            value={hexText}
            maxLength={7}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => typeHex(e.target.value)}
            className="block min-h-12 w-36 rounded-lg border border-line bg-raised px-3 font-mono text-base uppercase focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          />
        </div>
      </div>

      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!valid}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Saturation and lightness of the slider colors: as soft as the palette, readable as dots and headers. */
const SATURATION = 0.6
const LIGHTNESS = 0.6

/** The color at hue [hue] (0-359°) with the soft saturation/lightness, as #rrggbb. */
export function softColor(hue: number): string {
  const a = SATURATION * Math.min(LIGHTNESS, 1 - LIGHTNESS)
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12
    const value = LIGHTNESS - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/** The hue (0-359°) of a #rrggbb color, so the slider starts where the current color is (0 for greys). */
export function hueOf(hex: string): number {
  if (!HEX.test(hex)) return 0
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  if (delta === 0) return 0
  const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return Math.round((sector * 60 + 360) % 360)
}
