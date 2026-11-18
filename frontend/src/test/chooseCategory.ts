import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Picks a category in the CategoryPicker inside `container` (a dialog). */
export async function chooseCategory(container: HTMLElement, name: string) {
  await userEvent.click(within(container).getByLabelText('Category'))
  await userEvent.click(within(within(container).getByRole('listbox', { name: 'Category' })).getByRole('option', { name }))
}
