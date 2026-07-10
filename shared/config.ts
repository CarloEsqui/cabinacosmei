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
  nombreNegocio: z.string().default("Cabina"),
  horaCorte: z.string().default("20:00"),
});

export type ConfigValues = z.infer<typeof configSchema>;

export const CONFIG_DEFAULTS: ConfigValues = configSchema.parse({});
