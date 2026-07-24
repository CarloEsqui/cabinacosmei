import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * ✨ MENSAJE SORPRESA — TEMPORAL ✨
 *
 * Pop-up de una sola pantalla que aparece al iniciar sesión, como regalito personal.
 * Es completamente autónomo: no depende de nada del resto de la app ni toca ningún otro archivo.
 *
 * PARA QUITARLO EN LA SIGUIENTE ACTUALIZACIÓN:
 *   1. Borra este archivo (src/components/MensajeSorpresa.tsx).
 *   2. En src/App.tsx elimina la línea de import y la línea <MensajeSorpresa />.
 * Eso es todo — no mueve ni afecta nada más.
 */
export function MensajeSorpresa() {
  const [abierto, setAbierto] = useState(true);

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.55, bounce: 0.35 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-jacaranda-200 bg-gradient-to-br from-beige-50 via-beige-50 to-jacaranda-50 p-8 text-center shadow-2xl"
          >
            <motion.div
              className="text-6xl"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            >
              🛑
            </motion.div>

            <h2 className="mt-3 font-display text-4xl font-bold tracking-wide text-jacaranda-700">
              ¡ALTO AHÍ!
            </h2>

            <p className="mt-6 font-display text-2xl text-ink-900">Flaquita guapa,</p>

            <div className="mt-4 flex flex-col gap-3 text-left text-sm leading-relaxed text-ink-700">
              <p>
                Este es un mensaje sorpresa para desearte mucha suerte en esta nueva etapa, te entrego este
                regalito como muestra de mi profundo amor y la gran admiración que siento por ti. Eres una gran
                mujer y estoy sumamente emocionado por verte convertirte en una gran profesionista.
              </p>
              <p>
                Sigue persiguiendo tu sueño y demuéstrale al mundo tu belleza y calidad como ser humano {"<3"}.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-jacaranda-600 px-6 py-2.5 text-sm font-semibold text-beige-50 shadow-sm transition-colors hover:bg-jacaranda-700"
            >
              Con todo mi amor 💛
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
