import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { auth } from "./api/client";
import Home from "./pages/Home";
import Login from "./pages/Login";
import StoryBiblePage from "./pages/StoryBible";
import ProgressPage from "./pages/Progress";
import ResultPage from "./pages/Result";
import SettingsPage from "./pages/Settings";

function Guard({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  return auth.token ? children : <Navigate to="/login" state={{ from: loc }} replace />;
}

export default function App() {
  return (
    <>
      <nav>
        <Link className="brand" to="/">LongForm</Link>
        <Link to="/">New</Link>
        <Link to="/projects">Projects</Link>
        <Link to="/settings">Settings</Link>
        {auth.token && <a href="/login" onClick={() => (auth.token = null)}>Sign out</a>}
      </nav>
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guard><Home /></Guard>} />
          <Route path="/projects" element={<Guard><Home list /></Guard>} />
          <Route path="/projects/:id/bible" element={<Guard><StoryBiblePage /></Guard>} />
          <Route path="/projects/:id/progress" element={<Guard><ProgressPage /></Guard>} />
          <Route path="/projects/:id/result" element={<Guard><ResultPage /></Guard>} />
          <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
        </Routes>
      </main>
    </>
  );
}
