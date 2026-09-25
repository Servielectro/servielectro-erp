import { AppHeader } from "@/components/AppHeader";

// Layout compartido por toda la app autenticada (todo menos /login) — el menú
// de navegación global vive acá una sola vez, no repetido por pantalla.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
