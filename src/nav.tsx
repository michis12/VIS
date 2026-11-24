import { createContext, useContext } from 'react'
import type { Template } from './types'

export type Overlay =
  | { kind: 'workout'; id: string }
  | { kind: 'history' }
  | { kind: 'template'; template: Template | null }
  | { kind: 'measures' }
  | { kind: 'exercise'; id: string }
  | { kind: 'settings' }

export interface Nav {
  push: (o: Overlay) => void
  pop: () => void
}

export const NavCtx = createContext<Nav>({ push: () => {}, pop: () => {} })
export const useNav = () => useContext(NavCtx)
