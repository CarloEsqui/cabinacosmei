import { z } from "zod";

export const configSchema = z.object({
  umbralStockCritico: z.number().nonnegative().default(3),
  umbralStockBajo: z.number().nonnegative().default(8),
  diasAlertaCaducidad: z.number().int().nonnegative().default(30),
  criterioSalidaLotes: z.enum(["FEFO", "FIFO"]).default("FEFO"),
  moneda: z.string().default("MXN"),
  metodosPago: z.array(z.string()).default(["Efectivo", "Tarjeta", "Transferencia"]),
  tiposSalida: z
    .array(z.string())
    .default(["venta", "consumo_servicio", "merma", "devolucion", "uso_interno", "ajuste"]),
  carpetaRaiz: z.string().default(""),
  nombreNegocio: z.string().default("Bellora"),
  horaCorte: z.string().default("20:00"),
  // Formato "HH:MM" estricto: un valor vacío o mal formado aquí rompe el cálculo interno de
  // FullCalendar en las vistas de semana/día (slotMinTime/slotMaxTime), causando pantalla en
  // blanco o el boundary de error. Validar en el esquema evita que un guardado a medias (ej. el
  // campo se vació momentáneamente al editarlo) llegue a persistirse.
  agendaHoraInicio: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")
    .default("06:00"),
  agendaHoraFin: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")
    .default("22:00"),
  agendaMostrarFraccionesHora: z.boolean().default(false),
  // Escala general de la interfaz (texto, íconos y espaciados): 0.9 = pequeño, 1 = normal,
  // 1.1 = grande, 1.25 = muy grande. Se aplica como factor de zoom de la ventana.
  escalaTexto: z.number().min(0.85).max(1.3).default(1),

  // --- Horario de atención (necesario para calcular la OCUPACIÓN real de la agenda) ---
  // Días laborales como números de día de la semana: 0 = domingo … 6 = sábado.
  diasLaborales: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5, 6]),
  horarioApertura: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")
    .default("10:00"),
  horarioCierre: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")
    .default("19:00"),
  // Descanso opcional (comida). Cadenas vacías = sin descanso.
  descansoInicio: z.string().default(""),
  descansoFin: z.string().default(""),
  // Cuántas clientas se pueden atender a la vez (estaciones / profesionales simultáneas).
  capacidadSimultanea: z.number().int().positive().default(1),
});

export type ConfigValues = z.infer<typeof configSchema>;

export const CONFIG_DEFAULTS: ConfigValues = configSchema.parse({});
