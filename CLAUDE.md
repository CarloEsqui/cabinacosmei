<!-- BEGIN:atlas -->
## Atlas

Este proyecto está gobernado por Atlas. **`PROJECT.md` es el contrato — léelo antes de trabajar**
(rutas, comandos de verificación, reglas de PII, superficies críticas). Punto de entrada: `/atlas`.

Reglas universales (resumen; la fuente es Atlas core):
1. Nada se integra en una `critical_surfaces` sin auditoría respondida con evidencia.
2. La arquitectura precede a la implementación: los diseños con disparador de Gate 001 pasan por el agente architect.
3. Evidencia sobre suposiciones; el diagnóstico es de solo lectura; respeta las reglas de PII (el repo es público).
4. Los hallazgos llevan códigos estables (C/A/M/B) y nunca se renumeran.
5. Los comandos de `verification` deben pasar antes de dar algo por terminado.
6. La documentación refleja la realidad; lo descartado va a PROJECT.md → RETIRED.
7. Gana la simplicidad: el cambio más pequeño que cumple, sin refactors colados.
8. Los secretos nunca viajan por chat ni por archivos.
<!-- END:atlas -->
