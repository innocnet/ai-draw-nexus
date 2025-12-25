import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TooltipProvider, Toaster } from '@/components/ui'
import { HomePage, ProjectsPage, EditorPage, ProfilePage, AboutPage } from '@/pages'

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/editor/:projectId" element={<EditorPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
