import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import './officium.css'
import { Officium } from './Officium'

// VIS-Officium: the owner's overview, a separate page of the same build (officium.html)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Officium />
  </StrictMode>,
)
