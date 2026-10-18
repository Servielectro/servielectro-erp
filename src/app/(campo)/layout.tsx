// Layout de las pantallas de campo: sin el encabezado ni el cierre por inactividad del
// ERP. Letra base más grande en tablet, proporcional a la del celular.
export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100 text-[17px] text-slate-900 md:text-[20px]">{children}</div>;
}
