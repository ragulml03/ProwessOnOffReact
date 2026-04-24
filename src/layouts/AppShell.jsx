import { Link } from "react-router-dom";

export default function AppShell({ children }) {
  const mvcBaseUrl = import.meta.env.VITE_MVC_BASE_URL ?? "http://localhost:5080";

  return (
    <div className="min-h-screen bg-[#001E41] text-white antialiased">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#001E41]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a href={`${mvcBaseUrl}/`} className="select-none text-xl font-bold tracking-tight">
            Off<span className="text-[#405BFF]">On</span>
          </a>
          <nav className="flex items-center gap-6">
            <a href={`${mvcBaseUrl}/`} className="text-sm text-white/60 transition-colors duration-150 hover:text-white">
              Home
            </a>
            <a href={`${mvcBaseUrl}/Home/About`} className="text-sm text-white/60 transition-colors duration-150 hover:text-white">
              About
            </a>
            <Link to="/app/careers" className="text-sm text-white/60 transition-colors duration-150 hover:text-white">
              Careers
            </Link>
            <Link
              to="/app/profile"
              className="rounded-lg bg-[#405BFF] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#3350EE]"
            >
              Profile
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
