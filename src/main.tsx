import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProfileProvider } from './features/profiles/ProfileProvider'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider><ProfileProvider><RouterProvider router={router} /></ProfileProvider></AuthProvider>
  </React.StrictMode>,
)
