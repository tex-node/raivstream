import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './styles/index.css'

import Shell from './components/Shell'
import Welcome from './screens/Welcome'
import Watch from './screens/Watch'
import Create from './screens/Create'
import Story from './screens/Story'
import Cast from './screens/Cast'
import Director from './screens/Director'
import Library from './screens/Library'
import Kids from './screens/Kids'
import Insights from './screens/Insights'
import Credits from './screens/Credits'
import Settings from './screens/Settings'
import Admin from './screens/Admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/kids" element={<Kids />} />
        <Route path="/admin" element={<Admin />} />
        <Route element={<Shell />}>
          <Route path="/watch" element={<Watch />} />
          <Route path="/create" element={<Create />} />
          <Route path="/library" element={<Library />} />
          <Route path="/project/:id/story" element={<Story />} />
          <Route path="/project/:id/cast" element={<Cast />} />
          <Route path="/project/:id/scenes" element={<Director />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
