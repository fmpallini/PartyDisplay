import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'

// Central render wrapper. Add app-wide providers here as the app grows (theme, query client, etc).
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options)
}

export * from '@testing-library/react'
