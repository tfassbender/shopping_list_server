import { useState } from 'react'
import { t } from '../i18n/messages'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

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

/**
 * A round swatch showing the current color; tapping it opens a dialog with the palette. A color that is not
 * in the palette (e.g. set via the API) is shown as an extra first choice, so it is never lost by accident.
 */
export function ColorPicker({ value, label, onChange, size = 'size-9' }: { value: string; label: string; onChange: (color: string) => void; size?: string }) {
  const [open, setOpen] = useState(false)
  const current = value.toLowerCase()
  const colors = PALETTE.includes(current) ? PALETTE : [current, ...PALETTE]

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
        <Dialog title={t('color.title')} onClose={() => setOpen(false)}>
          <div role="radiogroup" aria-label={label} className="grid grid-cols-4 justify-items-center gap-3 pb-2">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={color === current}
                aria-label={color}
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                }}
                className="flex size-14 items-center justify-center rounded-full text-xl text-white shadow-sm aria-checked:ring-3 aria-checked:ring-accent aria-checked:ring-offset-2"
                style={{ backgroundColor: color }}
              >
                {color === current && <Icon name="check" className="drop-shadow" />}
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  )
}
