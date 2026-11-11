import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import { ColorPicker, hueOf, PALETTE, softColor } from './ColorPicker'

/**
 * The picker as it is used on the categories page: inside a form (regression: the dialog was a form
 * inside that form, so it didn't work) and controlled by its parent.
 */
function Harness({ initial = '#78909c', onOuterSubmit = () => {} }: { initial?: string; onOuterSubmit?: () => void }) {
  const [color, setColor] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onOuterSubmit()
      }}
    >
      <ColorPicker label="Category color" value={color} onChange={setColor} />
      <output aria-label="chosen">{color}</output>
    </form>
  )
}

const chosen = () => screen.getByLabelText('chosen').textContent
const openDialog = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Category color' }))
  return screen.getByRole('dialog')
}

describe('ColorPicker', () => {
  it('shows the current color on the swatch and marks it in the palette', async () => {
    render(<Harness initial="#4caf50" />)
    expect(screen.getByRole('button', { name: 'Category color' })).toHaveStyle({ backgroundColor: '#4caf50' })

    const dialog = await openDialog()
    expect(within(dialog).getAllByRole('radio')).toHaveLength(PALETTE.length)
    expect(within(dialog).getByRole('radio', { name: '#4caf50' })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByLabelText('Hex code')).toHaveValue('#4caf50')
  })

  it('applies a palette color only with Apply, without submitting the surrounding form', async () => {
    const outerSubmit = vi.fn()
    render(<Harness onOuterSubmit={outerSubmit} />)
    const dialog = await openDialog()

    // the dialog is rendered into <body>, not inside the page's form
    expect(dialog.closest('form')?.parentElement?.closest('form')).toBeNull()

    await userEvent.click(within(dialog).getByRole('radio', { name: '#ba68c8' }))
    expect(chosen()).toBe('#78909c') // not yet applied
    expect(within(dialog).getByRole('radio', { name: '#ba68c8' })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(chosen()).toBe('#ba68c8')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(outerSubmit).not.toHaveBeenCalled()
  })

  it('discards the choice with Cancel and with Escape', async () => {
    render(<Harness />)
    let dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: '#ba68c8' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(chosen()).toBe('#78909c')

    dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: '#ba68c8' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chosen()).toBe('#78909c')
  })

  it('takes the color from the hue slider', async () => {
    render(<Harness />)
    const dialog = await openDialog()

    fireEvent.change(within(dialog).getByRole('slider', { name: 'Hue' }), { target: { value: '300' } })
    expect(within(dialog).getByLabelText('Hex code')).toHaveValue(softColor(300))
    expect(within(dialog).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(chosen()).toBe(softColor(300))
  })

  it('takes a typed hex code with or without #, applies with Enter, rejects incomplete codes', async () => {
    render(<Harness />)
    const dialog = await openDialog()
    const hex = within(dialog).getByLabelText('Hex code')

    await userEvent.clear(hex)
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeEnabled() // still the last valid color
    await userEvent.type(hex, '12AB9')
    expect(within(dialog).getByRole('slider', { name: 'Hue' })).toHaveValue(String(hueOf('#78909c')))
    await userEvent.type(hex, 'F{Enter}')

    expect(chosen()).toBe('#12ab9f')
  })

  it('keeps a color that is not in the palette as an extra first choice', async () => {
    render(<Harness initial="#123456" />)
    const radios = within(await openDialog()).getAllByRole('radio')

    expect(radios).toHaveLength(PALETTE.length + 1)
    expect(radios[0]).toHaveAccessibleName('#123456')
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
  })
})

describe('color helpers', () => {
  it('convert between hue and soft colors', () => {
    expect(hueOf('#ff0000')).toBe(0)
    expect(hueOf('#00ff00')).toBe(120)
    expect(hueOf('#0000ff')).toBe(240)
    expect(hueOf('#808080')).toBe(0) // grey has no hue
    expect(hueOf('not a color')).toBe(0)
    for (const hue of [0, 45, 120, 200, 300]) expect(hueOf(softColor(hue))).toBeCloseTo(hue, -1)
    expect(softColor(0)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
