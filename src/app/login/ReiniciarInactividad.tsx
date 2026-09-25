"use client";

import { useEffect } from "react";
import { reiniciarUltimaActividad } from "@/lib/inactividad";

// Un inicio de sesión nuevo arranca con el contador de inactividad en cero: si no,
// la marca vieja (ya vencida) cerraría la sesión apenas se entra.
export function ReiniciarInactividad() {
  useEffect(() => {
    reiniciarUltimaActividad();
  }, []);
  return null;
}
