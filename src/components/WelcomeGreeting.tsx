import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getFirstName } from "@/lib/format";

interface ResumenOperativoProps {
  citasProximas: number;
  mantenimientosPendientes: number;
  stockBajo: number;
  proximosACaducar: number;
}

function saludoSegunHora(hora: number): string {
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

function ResumenOperativo({
  citasProximas,
  mantenimientosPendientes,
  stockBajo,
  proximosACaducar,
}: ResumenOperativoProps) {
  const partes: { valor: number; texto: string }[] = [];
  if (citasProximas > 0) {
    partes.push({ valor: citasProximas, texto: citasProximas === 1 ? "cita próxima" : "citas próximas" });
  }
  if (mantenimientosPendientes > 0) {
    partes.push({
      valor: mantenimientosPendientes,
      texto: mantenimientosPendientes === 1 ? "mantenimiento pendiente" : "mantenimientos pendientes",
    });
  }
  if (stockBajo > 0) {
    partes.push({ valor: stockBajo, texto: stockBajo === 1 ? "producto con stock bajo" : "productos con stock bajo" });
  }
  if (proximosACaducar > 0) {
    partes.push({
      valor: proximosACaducar,
      texto: proximosACaducar === 1 ? "producto próximo a caducar" : "productos próximos a caducar",
    });
  }

  if (partes.length === 0) {
    return <>No tienes alertas críticas pendientes. Tu operación está al día.</>;
  }

  return (
    <>
      Hoy tienes{" "}
      {partes.map((parte, i) => (
        <span key={parte.texto}>
          {i > 0 && (i === partes.length - 1 ? " y " : ", ")}
          <span className="font-semibold text-ink-900">{parte.valor}</span> {parte.texto}
        </span>
      ))}
      .
    </>
  );
}

export function WelcomeGreeting(props: ResumenOperativoProps) {
  const { data: perfil } = useQuery({
    queryKey: ["perfilUsuario"],
    queryFn: () => window.api.usuarios.obtenerActual(),
  });

  const ahora = new Date();
  const fechaTexto = format(ahora, "EEEE · d 'de' MMMM 'de' yyyy", { locale: es }).toUpperCase();
  const saludo = saludoSegunHora(ahora.getHours());
  const primerNombre = perfil?.nombre ? getFirstName(perfil.nombre) : "";

  return (
    <div className="px-8 pb-[21px] pt-[21px]">
      <p className="text-xs font-semibold tracking-wide text-ink-500">{fechaTexto}</p>
      <h1 className="font-display mt-1 text-[34px] font-medium leading-[1.1] tracking-tight text-jacaranda-700 lg:text-[42px]">
        {saludo}
        {primerNombre && `, ${primerNombre}`}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-700">
        <ResumenOperativo {...props} />
      </p>
    </div>
  );
}
